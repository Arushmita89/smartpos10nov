"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Database } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import {
  Calendar,
  Package,
  CreditCard,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Filter,
  Truck,
} from "lucide-react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

type Restaurant = Database["public"]["Tables"]["parameters"]["Row"];
type Order = Database["public"]["Tables"]["orders"]["Row"];
type Assignment = Database["public"]["Tables"]["delivery_assignments"]["Row"];

interface RiderOption {
  id: string;
  name: string;
  phone: string | null;
  rider_status: string | null;
}

const DELIVERY_STEPS = [
  { key: "assigned", label: "Assigned" },
  { key: "accepted", label: "Accepted" },
  { key: "picked_up", label: "Picked Up" },
  { key: "delivered", label: "Delivered" },
] as const;

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting Assignment",
  assigned: "Assigned",
  accepted: "Accepted",
  picked_up: "Picked Up",
  out_for_delivery: "Out for Delivery",
  arrived: "Arrived",
  delivered: "Delivered",
  cancelled: "Cancelled",
  failed: "Failed",
  returned: "Returned",
};

function DeliveryTimeline({
  order,
  assignment,
  riderName,
  riderPhone,
}: {
  order: Order;
  assignment?: Assignment;
  riderName?: string | null;
  riderPhone?: string | null;
}) {
  const rawStatus = assignment?.status || order.delivery_status || "pending";
  const cancelled = ["cancelled", "failed", "returned"].includes(rawStatus);
  const statusIndex: Record<string, number> = {
    assigned: 0,
    accepted: 1,
    picked_up: 2,
    out_for_delivery: 2,
    arrived: 2,
    delivered: 3,
  };
  const currentIndex = statusIndex[rawStatus] ?? -1;
  const times: Record<string, string | null | undefined> = {
    assigned: assignment?.assigned_at,
    accepted: assignment?.accepted_at,
    picked_up: assignment?.picked_up_at,
    delivered: assignment?.delivered_at,
  };
  const isInhouse = order.delivery_partner === "inhouse";
  const statusLabel =
    DELIVERY_STATUS_LABELS[rawStatus] || rawStatus.replace(/_/g, " ");

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h5 className="flex items-center font-medium text-gray-900">
          <Truck className="mr-2 h-4 w-4 text-emerald-600" />
          Delivery Status
          <span className="ml-2 text-xs font-normal text-gray-500">
            {isInhouse
              ? "Own Rider"
              : order.delivery_partner === "shadowfax"
              ? "Shadowfax"
              : "Not assigned"}
          </span>
        </h5>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            cancelled
              ? "bg-red-100 text-red-800"
              : rawStatus === "delivered"
              ? "bg-green-100 text-green-800"
              : currentIndex >= 0
              ? "bg-blue-100 text-blue-800"
              : "bg-yellow-100 text-yellow-800"
          }`}
        >
          {statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}
        </span>
      </div>

      {(riderName || riderPhone) && (
        <div className="mb-3 text-xs text-gray-600">
          Rider:{" "}
          <span className="font-medium text-gray-900">
            {riderName || "Assigned rider"}
          </span>
          {riderPhone && (
            <>
              {" · "}
              <a href={`tel:${riderPhone}`} className="text-emerald-600 hover:underline">
                {riderPhone}
              </a>
            </>
          )}
        </div>
      )}

      <ol className="relative ml-2 border-l-2 border-gray-200">
        {DELIVERY_STEPS.map((step, index) => {
          const time = times[step.key];
          const done = !!time || (!cancelled && currentIndex >= index);
          const active = !cancelled && currentIndex === index && currentIndex < 3;
          return (
            <li key={step.key} className="relative pb-3 pl-6 last:pb-0">
              <span
                className={`absolute -left-[9px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : active
                    ? "border-blue-500 bg-white"
                    : "border-gray-300 bg-white"
                }`}
              >
                {done && <CheckCircle className="h-3 w-3" />}
              </span>
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`text-sm ${
                    done || active ? "font-medium text-gray-900" : "text-gray-400"
                  }`}
                >
                  {step.label}
                  {active && (
                    <span className="ml-2 text-[11px] font-normal text-blue-600">
                      In progress
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-500">
                  {time ? formatDate(time) : done ? "Done" : "—"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {cancelled && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
          {statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}
          {assignment?.cancelled_at ? ` · ${formatDate(assignment.cancelled_at)}` : ""}
        </p>
      )}
    </div>
  );
}

interface OrderManagementProps {
  restaurant: Restaurant;
  onOrderUpdate?: () => void;
}

export default function OrderManagement({
  restaurant,
  onOrderUpdate,
}: OrderManagementProps) {
  const currency = restaurant.currency || 'INR';
  const [orders, setOrders] = useState<Order[]>([]);
  const [assignments, setAssignments] = useState<Record<number, Assignment>>({});
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);

  const fetchOrders = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurant.restaurant_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const orderRows = data || [];
      setOrders(orderRows);

      const deliveryOrderIds = orderRows
        .filter((order) => order.order_type === "delivery")
        .map((order) => order.id);

      if (deliveryOrderIds.length > 0) {
        const { data: assignmentRows } = await supabase
          .from("delivery_assignments")
          .select("*")
          .in("order_id", deliveryOrderIds);

        const byOrder: Record<number, Assignment> = {};
        (assignmentRows || []).forEach((assignment: Assignment) => {
          byOrder[assignment.order_id] = assignment;
        });
        setAssignments(byOrder);
      } else {
        setAssignments({});
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      if (!silent) toast.error("Failed to fetch orders");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [restaurant.restaurant_id]);

  const fetchRiders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, phone, rider_status")
        .eq("role", "rider")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      setRiders((data as RiderOption[]) || []);
    } catch (error) {
      console.error("Error fetching riders:", error);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchRiders();
    const interval = setInterval(() => fetchOrders(true), 20000);
    return () => clearInterval(interval);
  }, [fetchOrders, fetchRiders]);

  const riderName = (riderId?: string | null) => {
    if (!riderId) return null;
    return riders.find((r) => r.id === riderId)?.name || "Assigned rider";
  };

  const riderPhone = (riderId?: string | null) => {
    if (!riderId) return null;
    return riders.find((r) => r.id === riderId)?.phone || null;
  };

  const updateOrderStatus = async (orderId: number, newStatus: string) => {
    try {
      setUpdatingOrderId(orderId);
      const { error } = await supabase
        .from("orders")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", orderId);

      if (error) throw error;

      const iso = new Date().toISOString();
      const targetOrder = orders.find((order) => order.id === orderId);
      const deliveryClosed =
        targetOrder?.order_type === "delivery" &&
        (newStatus === "completed" || newStatus === "cancelled");

      setOrders(orders.map(order =>
        order.id === orderId
          ? {
              ...order,
              status: newStatus as any,
              delivery_status: deliveryClosed
                ? newStatus === "completed"
                  ? "delivered"
                  : "cancelled"
                : order.delivery_status,
              updated_at: iso,
            }
          : order
      ));

      if (deliveryClosed) {
        setAssignments((prev) => {
          const existing = prev[orderId];
          if (!existing) return prev;
          return {
            ...prev,
            [orderId]: {
              ...existing,
              status: newStatus === "completed" ? "delivered" : "cancelled",
              delivered_at:
                newStatus === "completed"
                  ? existing.delivered_at || iso
                  : existing.delivered_at,
              cancelled_at:
                newStatus === "cancelled"
                  ? existing.cancelled_at || iso
                  : existing.cancelled_at,
              updated_at: iso,
            },
          };
        });
      }

      toast.success(`Order marked as ${newStatus}`);
      if (onOrderUpdate) onOrderUpdate();
    } catch (error: any) {
      console.error("Error updating order status:", error);
      toast.error(`Failed to update order status: ${error?.message || 'Unknown error'}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-3 w-3 mr-1" />;
      case 'in_progress':
        return <RefreshCw className="h-3 w-3 mr-1" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 mr-1" />;
      case 'cancelled':
        return <XCircle className="h-3 w-3 mr-1" />;
      default:
        return <Package className="h-3 w-3 mr-1" />;
    }
  };

  const filteredOrders = orders.filter(order => {
    if (statusFilter === "all") return true;
    return order.status === statusFilter;
  });

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
        <h2 className="text-2xl font-bold text-gray-900">Order Management</h2>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">All Orders</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <button
            onClick={() => fetchOrders()}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh Orders</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Package className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Orders</p>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Pending Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {orders.filter(order => order.status === 'pending' || !order.status).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Completed Today</p>
              <p className="text-2xl font-bold text-gray-900">
                {orders.filter(order => {
                  const orderDate = new Date(order.created_at).toDateString();
                  const today = new Date().toDateString();
                  return orderDate === today && order.status === 'completed';
                }).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Orders</h3>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-6 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">
              {statusFilter === "all" ? "No orders found" : `No ${statusFilter} orders found`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredOrders.map((order) => (
              <div key={order.id} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-lg font-medium text-gray-900">
                        Order #{order.id}
                      </h4>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status || 'pending')}`}>
                        {getStatusIcon(order.status || 'pending')}
                        {(order.status || 'pending').charAt(0).toUpperCase() + (order.status || 'pending').slice(1).replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3 flex-wrap">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        {formatDate(order.created_at)}
                      </div>
                      <div className="flex items-center">
                        <CreditCard className="h-4 w-4 mr-1" />
                        {order.payment_method || 'online'}
                      </div>
                      {(order as any).order_type && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          (order as any).order_type === 'delivery' ? 'bg-purple-100 text-purple-800' :
                          (order as any).order_type === 'takeaway' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {(order as any).order_type}
                        </span>
                      )}
                      {(order as any).delivery_partner === 'shadowfax' && (order as any).delivery_awb && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800">
                          SF: {(order as any).delivery_awb} {(order as any).delivery_status ? `(${(order as any).delivery_status})` : ''}
                        </span>
                      )}
                      {(order as any).delivery_partner === 'inhouse' && (order as any).delivery_rider_id && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">
                          <Truck className="h-3 w-3 mr-1" />
                          {riderName((order as any).delivery_rider_id)}
                          {(order as any).delivery_status ? ` (${String((order as any).delivery_status).replace('_', ' ')})` : ''}
                        </span>
                      )}
                      {order.customer_name && (
                        <div className="flex items-center">
                          <span className="text-gray-500">Customer:</span>
                          <span className="ml-1 font-medium">{order.customer_name}</span>
                        </div>
                      )}
                    </div>

                    {order.order_type === 'delivery' && (
                      <>
                        {order.delivery_rider_id &&
                          !['delivered', 'cancelled'].includes(
                            String(order.delivery_status || '')
                          ) && (
                            <div className="mb-3 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <Truck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                              <div>
                                <p className="text-sm font-semibold text-emerald-900">
                                  Delivery rider assigned by SmartPOS
                                </p>
                                <p className="mt-0.5 text-xs text-emerald-800">
                                  {riderName(order.delivery_rider_id)}
                                  {riderPhone(order.delivery_rider_id)
                                    ? ` (${riderPhone(order.delivery_rider_id)})`
                                    : ''}{' '}
                                  will pick up Order #{order.id}. Please prepare
                                  the order and keep it ready.
                                </p>
                              </div>
                            </div>
                          )}
                        <DeliveryTimeline
                          order={order}
                          assignment={assignments[order.id]}
                          riderName={riderName(order.delivery_rider_id)}
                          riderPhone={riderPhone(order.delivery_rider_id)}
                        />
                      </>
                    )}

                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                      <h5 className="font-medium text-gray-900 mb-2">Order Items:</h5>
                      <div className="space-y-2">
                        {order.items.map((item: any, index: number) => (
                          <div key={index} className="text-sm">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-700">
                                {item.name} x {item.quantity}
                              </span>
                              <span className="font-medium text-gray-900">
                                {formatCurrency(item.price * item.quantity, currency)}
                              </span>
                            </div>
                            {item.options && item.options.length > 0 && (
                              <p className="text-xs text-blue-700 ml-2">{item.options.join(", ")}</p>
                            )}
                            {item.notes && (
                              <p className="text-xs text-gray-500 ml-2">{item.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Subtotal:</span>
                          <span className="text-gray-900">{formatCurrency(order.subtotal, currency)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Tax:</span>
                          <span className="text-gray-900">{formatCurrency(order.tax, currency)}</span>
                        </div>
                        {(order as any).delivery_fee > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Delivery Fee:</span>
                            <span className="text-gray-900">{formatCurrency((order as any).delivery_fee, currency)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-medium text-base border-t border-blue-200 pt-1">
                          <span className="text-gray-900">Total:</span>
                          <span className="text-gray-900">{formatCurrency(order.total, currency)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="text-xs text-gray-500">
                        {order.updated_at && order.updated_at !== order.created_at && (
                          <span>Last updated: {formatDate(order.updated_at)}</span>
                        )}
                        {(order as any).delivery_tracking_url && (
                          <a href={(order as any).delivery_tracking_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-indigo-600 hover:underline">
                            Track Delivery
                          </a>
                        )}
                        {(order as any).delivery_partner === 'inhouse' &&
                          (order as any).delivery_rider_id && (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch(
                                    `/api/delivery/inhouse/track?orderId=${order.id}`
                                  );
                                  const data = await res.json();
                                  if (data.location?.latitude != null) {
                                    window.open(
                                      `https://www.google.com/maps/search/?api=1&query=${data.location.latitude},${data.location.longitude}`,
                                      '_blank',
                                      'noopener,noreferrer'
                                    );
                                  } else {
                                    toast.error('Rider location not available yet');
                                  }
                                } catch {
                                  toast.error('Failed to load rider location');
                                }
                              }}
                              className="ml-2 text-emerald-600 hover:underline"
                            >
                              Track Rider
                            </button>
                          )}
                      </div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        {/*
                          Shadowfax booking disabled. Assign riders manually from
                          the admin Delivery tab instead.
                        {(order as any).order_type === 'delivery' &&
                          !(order as any).delivery_awb &&
                          !(order as any).delivery_rider_id && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/delivery/shadowfax/book', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ orderId: order.id, restaurantId: restaurant.restaurant_id }),
                                });
                                const data = await res.json();
                                if (data.success) {
                                  toast.success(`Delivery booked - AWB: ${data.awb_number}`);
                                  fetchOrders();
                                } else {
                                  toast.error(data.error || 'Failed to book');
                                }
                              } catch (e) {
                                toast.error('Failed to book delivery');
                              }
                            }}
                            className="px-3 py-1 bg-purple-600 text-white text-xs rounded-md hover:bg-purple-700 flex items-center"
                          >
                            Book Delivery (Shadowfax)
                          </button>
                        )}
                        */}
                        {(order.status === 'pending' || !order.status) && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'in_progress')}
                            disabled={updatingOrderId === order.id}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Start Preparing
                          </button>
                        )}
                        {order.status === 'in_progress' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'completed')}
                            disabled={updatingOrderId === order.id}
                            className="px-3 py-1 bg-green-600 text-white text-xs rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Mark Complete
                          </button>
                        )}
                        {(order.status === 'pending' || order.status === 'in_progress') && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'cancelled')}
                            disabled={updatingOrderId === order.id}
                            className="px-3 py-1 bg-red-600 text-white text-xs rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
