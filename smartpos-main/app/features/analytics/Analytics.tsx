"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Database } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import {
  BarChart3,
  Calendar,
  Download,
  TrendingUp,
  Package,
  DollarSign,
  Users,
  Filter,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

type Restaurant = Database["public"]["Tables"]["parameters"]["Row"];
type Order = Database["public"]["Tables"]["orders"]["Row"];

interface AnalyticsProps {
  restaurant: Restaurant;
}

interface AnalyticsData {
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  popularItems: { name: string; count: number; revenue: number }[];
  salesByDate: { date: string; sales: number; orders: number }[];
  allOrders: Order[];
}

type DateFilter = "today" | "week" | "month" | "year" | "all";
type ExportFormat = "csv" | "excel" | "pdf";

interface IngredientReport {
  id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  cost_per_unit: number | null;
  consumed: number;
  restocked: number;
  wasted: number;
  consumedCost: number;
  wastedCost: number;
}

export default function Analytics({ restaurant }: AnalyticsProps) {
  const currency = restaurant.currency || 'INR';
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("month");
  const [customDateRange, setCustomDateRange] = useState({ start: "", end: "" });
  const [inventoryReport, setInventoryReport] = useState<IngredientReport[] | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const getDateRange = useCallback(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateFilter) {
      case "today":
        return {
          start: today.toISOString(),
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        };
      case "week":
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        return { start: weekStart.toISOString(), end: now.toISOString() };
      case "month":
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: monthStart.toISOString(), end: now.toISOString() };
      case "year":
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return { start: yearStart.toISOString(), end: now.toISOString() };
      case "all":
        return { start: null, end: null };
      default:
        return { start: customDateRange.start || null, end: customDateRange.end || null };
    }
  }, [dateFilter, customDateRange]);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRange();

      let query = supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurant.restaurant_id)
        .order("created_at", { ascending: false });

      if (start) query = query.gte("created_at", start);
      if (end) query = query.lte("created_at", end);

      const { data: orders, error: ordersError } = await query;

      if (ordersError) throw ordersError;

      const totalSales = orders?.reduce((sum: number, order: Order) => sum + (order.total || 0), 0) || 0;
      const totalOrders = orders?.length || 0;
      const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

      const itemCounts: { [key: string]: { count: number; revenue: number } } = {};
      orders?.forEach((order: Order) => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach((item: any) => {
            const key = item.name || item.title || 'Unknown Item';
            if (!itemCounts[key]) itemCounts[key] = { count: 0, revenue: 0 };
            itemCounts[key].count += item.quantity || 1;
            itemCounts[key].revenue += (item.price || 0) * (item.quantity || 1);
          });
        }
      });

      const popularItems = Object.entries(itemCounts)
        .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const salesByDate: { [key: string]: { sales: number; orders: number } } = {};
      orders?.forEach((order: Order) => {
        const date = new Date(order.created_at).toISOString().split('T')[0];
        if (!salesByDate[date]) salesByDate[date] = { sales: 0, orders: 0 };
        salesByDate[date].sales += order.total || 0;
        salesByDate[date].orders += 1;
      });

      const salesByDateArray = Object.entries(salesByDate)
        .map(([date, data]) => ({ date, sales: data.sales, orders: data.orders }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setAnalytics({
        totalSales,
        totalOrders,
        averageOrderValue,
        popularItems,
        salesByDate: salesByDateArray,
        allOrders: orders || [],
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error("Failed to fetch analytics data");
    } finally {
      setLoading(false);
    }
  }, [restaurant, getDateRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const fetchInventoryReport = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const { start, end } = getDateRange();

      let query = supabase
        .from("stock_movements")
        .select("ingredient_id, type, quantity_change, created_at")
        .eq("restaurant_id", restaurant.restaurant_id);
      if (start) query = query.gte("created_at", start);
      if (end) query = query.lte("created_at", end);

      const { data: movements, error } = await query;
      if (error) throw error;

      const { data: ingredients, error: ingError } = await supabase
        .from("ingredients")
        .select("id, name, category, unit, current_stock, cost_per_unit")
        .eq("restaurant_id", restaurant.restaurant_id);
      if (ingError) throw ingError;

      const movementsByIngredient: Record<string, { consumed: number; restocked: number; wasted: number }> = {};
      (movements || []).forEach((m: any) => {
        const agg = movementsByIngredient[m.ingredient_id] || { consumed: 0, restocked: 0, wasted: 0 };
        const qty = Number(m.quantity_change || 0);
        if (m.type === "order") agg.consumed += Math.abs(qty);
        else if (m.type === "waste") agg.wasted += Math.abs(qty);
        else if (m.type === "restock" || m.type === "opening") agg.restocked += qty;
        movementsByIngredient[m.ingredient_id] = agg;
      });

      const report: IngredientReport[] = (ingredients || []).map((ing: any) => {
        const agg = movementsByIngredient[ing.id] || { consumed: 0, restocked: 0, wasted: 0 };
        const cost = ing.cost_per_unit != null ? Number(ing.cost_per_unit) : 0;
        return {
          id: ing.id,
          name: ing.name,
          category: ing.category,
          unit: ing.unit,
          current_stock: Number(ing.current_stock || 0),
          cost_per_unit: ing.cost_per_unit,
          consumed: agg.consumed,
          restocked: agg.restocked,
          wasted: agg.wasted,
          consumedCost: agg.consumed * cost,
          wastedCost: agg.wasted * cost,
        };
      });

      setInventoryReport(report);
    } catch (err) {
      console.error("Error fetching inventory report:", err);
      setInventoryReport(null);
    } finally {
      setInventoryLoading(false);
    }
  }, [restaurant.restaurant_id, getDateRange]);

  useEffect(() => {
    if (analytics) {
      fetchInventoryReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, analytics !== null]);

  const exportData = async (format: ExportFormat) => {
    if (!analytics) return;
    try {
      const data = analytics.allOrders.map(order => ({
        'Order ID': order.id,
        'Date': formatDate(order.created_at),
        'Customer': order.customer_name || 'Walk-in',
        'Status': order.status || 'pending',
        'Payment Method': order.payment_method || 'cash',
        'Subtotal': order.subtotal || 0,
        'Tax': order.tax || 0,
        'Total': order.total || 0,
        'Items': order.items ? order.items.map((item: any) => `${item.name} x${item.quantity}`).join(', ') : '',
      }));

      if (format === 'csv') {
        const csv = convertToCSV(data);
        downloadFile(csv, `analytics-${dateFilter}-${Date.now()}.csv`, 'text/csv');
      } else if (format === 'excel') {
        const csv = convertToCSV(data);
        downloadFile(csv, `analytics-${dateFilter}-${Date.now()}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else if (format === 'pdf') {
        const pdfContent = generatePDFContent(data);
        downloadFile(pdfContent, `analytics-${dateFilter}-${Date.now()}.txt`, 'text/plain');
      }
      toast.success(`Analytics exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  const convertToCSV = (data: any[]) => {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    return [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');
  };

  const generatePDFContent = (data: any[]) => {
    let content = `Analytics Report - ${dateFilter.toUpperCase()}\n`;
    content += `Generated on: ${new Date().toLocaleString()}\n\n`;
    if (analytics) {
      content += `Summary:\n`;
      content += `Total Orders: ${analytics.totalOrders}\n`;
      content += `Total Sales: ${formatCurrency(analytics.totalSales, currency)}\n`;
      content += `Average Order Value: ${formatCurrency(analytics.averageOrderValue, currency)}\n\n`;
    }
    content += `Detailed Orders:\n`;
    content += `${'='.repeat(80)}\n`;
    data.forEach(order => {
      content += `Order ID: ${order['Order ID']}\n`;
      content += `Date: ${order['Date']}\n`;
      content += `Customer: ${order['Customer']}\n`;
      content += `Status: ${order['Status']}\n`;
      content += `Total: ${formatCurrency(order['Total'], currency)}\n`;
      content += `Items: ${order['Items']}\n`;
      content += `${'-'.repeat(40)}\n`;
    });
    return content;
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="all">All Time</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={() => exportData('csv')} className="bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 transition-colors flex items-center space-x-1 text-sm">
              <FileText className="h-4 w-4" /><span>CSV</span>
            </button>
            <button onClick={() => exportData('excel')} className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-1 text-sm">
              <FileSpreadsheet className="h-4 w-4" /><span>Excel</span>
            </button>
            <button onClick={() => exportData('pdf')} className="bg-red-600 text-white px-3 py-2 rounded-md hover:bg-red-700 transition-colors flex items-center space-x-1 text-sm">
              <FileText className="h-4 w-4" /><span>PDF</span>
            </button>
          </div>
        </div>
      </div>

      {analytics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Sales</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.totalSales, currency)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Orders</p>
                  <p className="text-2xl font-bold text-gray-900">{analytics.totalOrders}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Avg Order Value</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.averageOrderValue, currency)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
                Popular Items
              </h3>
              <div className="space-y-3">
                {analytics.popularItems.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-sm font-medium text-gray-500 w-6">#{index + 1}</span>
                      <span className="text-sm text-gray-900 ml-2">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-blue-600">{item.count} orders</div>
                      <div className="text-xs text-gray-500">{formatCurrency(item.revenue, currency)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-green-600" />
                Sales by Date
              </h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {analytics.salesByDate.slice(-10).map((day) => (
                  <div key={day.date} className="flex items-center justify-between">
                    <span className="text-sm text-gray-900">{new Date(day.date).toLocaleDateString()}</span>
                    <div className="text-right">
                      <div className="text-sm font-medium text-green-600">{formatCurrency(day.sales, currency)}</div>
                      <div className="text-xs text-gray-500">{day.orders} orders</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">All Orders</h3>
              <p className="text-sm text-gray-500">Showing all {analytics.totalOrders} orders regardless of status</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analytics.allOrders.slice(0, 50).map((order) => (
                    <tr key={order.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">#{order.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(order.created_at)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.customer_name || 'Walk-in'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          order.status === 'completed' ? 'bg-green-100 text-green-800' :
                          order.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {order.status || 'pending'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{formatCurrency(order.total || 0, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {analytics.allOrders.length > 50 && (
              <div className="px-6 py-4 bg-gray-50 text-sm text-gray-500">
                Showing first 50 orders. Export data to see all {analytics.totalOrders} orders.
              </div>
            )}
          </div>
        </>
      )}

      {/* ============ Inventory / Consumption Report ============ */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Inventory Consumption</h3>
            <p className="text-sm text-gray-500">
              Ingredient usage for {dateFilter}. Shows order consumption, restock, and waste.
            </p>
          </div>
          {inventoryLoading && <LoadingSpinner size="sm" />}
        </div>
        {inventoryReport && inventoryReport.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 py-4">
              {(() => {
                const totalConsumedCost = inventoryReport.reduce((s, i) => s + i.consumedCost, 0);
                const totalWastedCost = inventoryReport.reduce((s, i) => s + i.wastedCost, 0);
                const wastePct = totalConsumedCost + totalWastedCost > 0
                  ? (totalWastedCost / (totalConsumedCost + totalWastedCost)) * 100
                  : 0;
                return (
                  <>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase">Food Cost (consumed)</p>
                      <p className="text-xl font-bold text-gray-900">{formatCurrency(totalConsumedCost, currency)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase">Waste Cost</p>
                      <p className="text-xl font-bold text-red-600">{formatCurrency(totalWastedCost, currency)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 uppercase">Waste %</p>
                      <p className="text-xl font-bold text-amber-600">{wastePct.toFixed(1)}%</p>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ingredient</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Consumed</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Restocked</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Wasted</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">On hand</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Consumed cost</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inventoryReport
                    .filter((i) => i.consumed > 0 || i.wasted > 0 || i.restocked > 0)
                    .sort((a, b) => b.consumed - a.consumed)
                    .map((i) => (
                      <tr key={i.id}>
                        <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{i.name}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">{i.category}</td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm text-blue-600 font-medium">
                          {i.consumed.toFixed(2)} {i.unit}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm text-green-600">
                          +{i.restocked.toFixed(2)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm text-red-600">
                          {i.wasted.toFixed(2)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm text-gray-500">
                          {i.current_stock.toFixed(2)} {i.unit}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          {formatCurrency(i.consumedCost, currency)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="px-6 py-10 text-center">
            <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {inventoryReport
                ? "No ingredient movement in this period. Add ingredients and stock movements to see consumption."
                : "Inventory report unavailable. Ensure the ingredients and stock_movements tables exist."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
