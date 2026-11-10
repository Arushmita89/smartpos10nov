"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Database } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  ChefHat,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  Package,
  CreditCard,
  User,
  MapPin,
  Flame,
  RotateCcw,
} from "lucide-react";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

type Restaurant = Database["public"]["Tables"]["parameters"]["Row"];
type Order = Database["public"]["Tables"]["orders"]["Row"];

interface KitchenModeProps {
  onBack: () => void;
}

type StatusFilter = "pending" | "in_progress" | "completed" | "cancelled";
type OrderStatus = "pending" | "in_progress" | "completed" | "cancelled";

const ACTIVE_STATUSES = ["pending", "in_progress", "settled"];

// A "settled" order means it has been PAID but still needs preparing in the
// kitchen. Map it to "pending" for kitchen display/status purposes so paid
// orders reach the kitchen display instead of disappearing.
const kitchenPrepStatus = (status: string | null | undefined) =>
  status === "settled" ? "pending" : (status || "pending");

const playChime = () => {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, now + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.25);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.3);
    });
  } catch {
    // Audio not available
  }
};

export default function KitchenMode({ onBack }: KitchenModeProps) {
  const { restaurant } = useAuth();
  const currency = restaurant?.currency || 'INR';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const seenOrderIds = useRef<Set<number>>(new Set());
  const restaurantName = restaurant?.restaurant_name || "Kitchen Mode";

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchOrders = useCallback(async () => {
    if (!restaurant?.restaurant_id) return;
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", restaurant.restaurant_id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const previousIds = seenOrderIds.current;
      seenOrderIds.current = new Set((data || []).map((o) => o.id));

      setOrders(data || []);

      const newActive = (data || []).filter(
        (o) =>
          !previousIds.has(o.id) &&
          ACTIVE_STATUSES.includes(o.status || "pending")
      );
      if (previousIds.size > 0 && newActive.length > 0) {
        playChime();
        toast.success(
          `${newActive.length} new order${newActive.length > 1 ? "s" : ""} received!`
        );
      }
    } catch (error) {
      console.error("Error fetching kitchen orders:", error);
      toast.error("Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, [restaurant?.restaurant_id]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const updateOrderStatus = async (orderId: number, newStatus: OrderStatus) => {
    try {
      setUpdatingOrderId(orderId);
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (error) throw error;

      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? { ...order, status: newStatus, updated_at: new Date().toISOString() }
            : order
        )
      );
      toast.success(`Order #${orderId} marked as ${newStatus.replace("_", " ")}`);
    } catch (error: any) {
      console.error("Error updating order status:", error);
      toast.error(`Failed to update order: ${error?.message || "Unknown error"}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: string) =>
    (status || "pending").charAt(0).toUpperCase() +
    (status || "pending").slice(1).replace("_", " ");

  const getElapsed = (createdAt: string) => {
    const diff = Math.max(0, now - new Date(createdAt).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  };

  const stats = useMemo(
    () => ({
      pending: orders.filter((o) => kitchenPrepStatus(o.status) === "pending").length,
      inProgress: orders.filter((o) => kitchenPrepStatus(o.status) === "in_progress").length,
      completed: orders.filter((o) => kitchenPrepStatus(o.status) === "completed").length,
      cancelled: orders.filter((o) => kitchenPrepStatus(o.status) === "cancelled").length,
    }),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    const status = statusFilter;
    const filtered = orders.filter((o) => kitchenPrepStatus(o.status) === status);
    if (status === "pending" || status === "in_progress") {
      return [...filtered].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }
    return [...filtered].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [orders, statusFilter]);

  const filterTabs: { id: StatusFilter; label: string }[] = [
    { id: "pending", label: `To Be Prepared (${stats.pending})` },
    { id: "in_progress", label: `In Progress (${stats.inProgress})` },
    { id: "completed", label: `Completed (${stats.completed})` },
    { id: "cancelled", label: `Cancelled (${stats.cancelled})` },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <header className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shadow-md">
          <button onClick={onBack} className="p-2 hover:bg-blue-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">{restaurantName}</h1>
          <div className="w-9" />
        </header>
        <div className="flex items-center justify-center flex-1">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <button onClick={onBack} className="p-2 hover:bg-blue-700 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold flex items-center">
          <ChefHat className="w-5 h-5 mr-2" />
          {restaurantName} — Kitchen
        </h1>
        <div className="flex items-center space-x-2">
          <span className="hidden sm:inline text-xs text-blue-100">
            Refreshes every 15s
          </span>
          <button
            onClick={fetchOrders}
            className="p-2 hover:bg-blue-700 rounded-lg transition-colors flex items-center"
            title="Refresh orders"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center">
            <Clock className="h-7 w-7 text-yellow-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-yellow-700">Pending</p>
              <p className="text-2xl font-bold text-yellow-800">{stats.pending}</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center">
            <Flame className="h-7 w-7 text-blue-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-blue-700">In Progress</p>
              <p className="text-2xl font-bold text-blue-800">{stats.inProgress}</p>
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
            <CheckCircle className="h-7 w-7 text-green-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-green-700">Completed</p>
              <p className="text-2xl font-bold text-green-800">{stats.completed}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No orders found</p>
            <p className="text-sm text-gray-400 mt-1">
              New orders will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredOrders.map((order) => {
              const status = order.status || "pending";
              const prepStatus = kitchenPrepStatus(status);
              const isActive = ACTIVE_STATUSES.includes(status);
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-lg shadow border overflow-hidden ${
                    prepStatus === "pending"
                      ? "border-yellow-300"
                      : prepStatus === "in_progress"
                      ? "border-blue-300"
                      : "border-gray-200"
                  }`}
                >
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-gray-900">Order #{order.id}</span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(prepStatus)}`}>
                        {getStatusLabel(prepStatus)}
                      </span>
                      {status === "settled" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
                          Paid
                        </span>
                      )}
                      {order.order_type === "takeaway" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-800">
                          Take Away
                        </span>
                      ) : order.order_type === "delivery" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                          Delivery
                        </span>
                      ) : order.table_number != null && order.tab_number != null ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                          T{order.table_number}-{order.tab_number}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center text-xs text-gray-500">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      <span className={isActive ? "font-semibold text-gray-700" : ""}>
                        {getElapsed(order.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-4 text-sm text-gray-600">
                    {order.customer_name && (
                      <span className="flex items-center">
                        <User className="h-3.5 w-3.5 mr-1" />
                        {order.customer_name}
                      </span>
                    )}
                    {(order as any).order_type === "delivery" && (
                      <span className="flex items-center">
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800">Delivery</span>
                      </span>
                    )}
                    {(order as any).order_type === "delivery" && (order as any).delivery_awb && (
                      <span className="flex items-center">
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800">SF: {(order as any).delivery_awb} {(order as any).delivery_status || ''}</span>
                      </span>
                    )}
                    {order.order_type === "delivery" && order.customer_address && (
                      <span className="flex items-center">
                        <MapPin className="h-3.5 w-3.5 mr-1" />
                        {order.customer_address}
                      </span>
                    )}
                    <span className="flex items-center capitalize">
                      <CreditCard className="h-3.5 w-3.5 mr-1" />
                      {order.payment_method || "online"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(order.created_at)}
                    </span>
                  </div>

                  <div className="p-4">
                    <ul className="space-y-2">
                      {order.items?.map((item: any, index: number) => (
                        <li key={index} className="text-sm">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center text-gray-800">
                              <span className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 rounded text-xs font-semibold text-gray-600 mr-2">
                                {item.quantity}
                              </span>
                              {item.name}
                            </span>
                            <span className="font-medium text-gray-900">
                              {formatCurrency(item.price * item.quantity, currency)}
                            </span>
                          </div>
                          {item.options && item.options.length > 0 && (
                            <p className="text-xs text-blue-700 mt-0.5 ml-8">{item.options.join(", ")}</p>
                          )}
                          {item.notes && (
                            <p className="text-xs text-amber-700 mt-0.5 ml-8">{item.notes}</p>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 pt-3 border-t border-gray-100 space-y-1">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Subtotal</span>
                        <span>{formatCurrency(order.subtotal, currency)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Tax</span>
                        <span>{formatCurrency(order.tax, currency)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-gray-900 pt-1">
                        <span>Total</span>
                        <span>{formatCurrency(order.total, currency)}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center space-x-2 flex-wrap">
                      {(order as any).order_type === "delivery" &&
                        !(order as any).delivery_awb &&
                        !(order as any).delivery_rider_id && (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/delivery/shadowfax/book', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderId: order.id, restaurantId: restaurant?.restaurant_id }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                toast.success(`Delivery booked - AWB: ${data.awb_number}`);
                                window.location.reload();
                              } else {
                                toast.error(data.error || 'Failed to book');
                              }
                            } catch (e) {
                              toast.error('Failed to book delivery');
                            }
                          }}
                          className="w-full mb-2 bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center justify-center transition-colors"
                        >
                          Book Delivery (Shadowfax)
                        </button>
                      )}
                      {prepStatus === "pending" && (
                        <>
                          <button
                            onClick={() => updateOrderStatus(order.id, "in_progress")}
                            disabled={updatingOrderId === order.id}
                            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                          >
                            <Flame className="w-4 h-4 mr-1.5" />
                            Start Preparing
                          </button>
                          <button
                            onClick={() => updateOrderStatus(order.id, "cancelled")}
                            disabled={updatingOrderId === order.id}
                            className="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors"
                          >
                            <XCircle className="w-4 h-4 mr-1.5" />
                            Cancel
                          </button>
                        </>
                      )}
                      {prepStatus === "in_progress" && (
                        <>
                          <button
                            onClick={() => updateOrderStatus(order.id, "completed")}
                            disabled={updatingOrderId === order.id}
                            className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                          >
                            <CheckCircle className="w-4 h-4 mr-1.5" />
                            Mark Complete
                          </button>
                          <button
                            onClick={() => updateOrderStatus(order.id, "cancelled")}
                            disabled={updatingOrderId === order.id}
                            className="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors"
                          >
                            <XCircle className="w-4 h-4 mr-1.5" />
                            Cancel
                          </button>
                        </>
                      )}
                      {(status === "completed" || status === "cancelled") && (
                        <button
                          onClick={() => updateOrderStatus(order.id, "pending")}
                          disabled={updatingOrderId === order.id}
                          className="flex-1 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                        >
                          <RotateCcw className="w-4 h-4 mr-1.5" />
                          Send Back to Pending
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
