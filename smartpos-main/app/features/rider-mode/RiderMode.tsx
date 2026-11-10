"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Database, supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/utils";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Bike,
  CheckCircle,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Phone,
  Power,
  RefreshCw,
  Store,
  Truck,
  User,
  XCircle,
} from "lucide-react";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type Assignment = Database["public"]["Tables"]["delivery_assignments"]["Row"];

interface RiderModeProps {
  onBack: () => void;
}

type RiderTab = "active" | "completed";
type AssignmentStatus = "assigned" | "accepted" | "picked_up" | "delivered" | "cancelled";

const ACTIVE_STATUSES: AssignmentStatus[] = ["assigned", "accepted", "picked_up"];
const LOCATION_INTERVAL_MS = 30000;

const statusLabel = (status: string) =>
  status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const statusColor = (status: string) => {
  switch (status) {
    case "assigned":
      return "bg-yellow-100 text-yellow-800";
    case "accepted":
      return "bg-blue-100 text-blue-800";
    case "picked_up":
    case "out_for_delivery":
      return "bg-indigo-100 text-indigo-800";
    case "delivered":
      return "bg-green-100 text-green-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default function RiderMode({ onBack }: RiderModeProps) {
  const { restaurant, user } = useAuth();
  const currency = restaurant?.currency || "INR";
  const [orders, setOrders] = useState<Order[]>([]);
  const [assignments, setAssignments] = useState<Record<number, Assignment>>({});
  const [restaurantNames, setRestaurantNames] = useState<Record<string, string>>(
    {}
  );
  const [restaurantCurrencies, setRestaurantCurrencies] = useState<
    Record<string, string>
  >({});
  const [riderStatus, setRiderStatus] = useState<string>(
    user?.rider_status || "offline"
  );
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<RiderTab>("active");
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lastLocationSent = useRef<number>(0);
  const permissionWarned = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchDeliveries = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const { data: orderRows, error } = await supabase
        .from("orders")
        .select("*")
        .eq("delivery_rider_id", user.id)
        .eq("order_type", "delivery")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      const rows = (orderRows || []) as Order[];
      setOrders(rows);

      const restaurantIds = Array.from(
        new Set(rows.map((o) => o.restaurant_id).filter(Boolean))
      ) as string[];
      if (restaurantIds.length > 0) {
        const { data: paramRows } = await supabase
          .from("parameters")
          .select("restaurant_id, restaurant_name, currency")
          .in("restaurant_id", restaurantIds);
        const nameMap: Record<string, string> = {};
        const currencyMap: Record<string, string> = {};
        (
          (paramRows || []) as {
            restaurant_id: string;
            restaurant_name: string;
            currency: string | null;
          }[]
        ).forEach((p) => {
          nameMap[p.restaurant_id] = p.restaurant_name;
          if (p.currency) currencyMap[p.restaurant_id] = p.currency;
        });
        setRestaurantNames(nameMap);
        setRestaurantCurrencies(currencyMap);
      }

      if (rows.length > 0) {
        const { data: assignmentRows } = await supabase
          .from("delivery_assignments")
          .select("*")
          .eq("rider_id", user.id)
          .in(
            "order_id",
            rows.map((o) => o.id)
          );
        const map: Record<number, Assignment> = {};
        ((assignmentRows || []) as Assignment[]).forEach((a) => {
          map[a.order_id] = a;
        });
        setAssignments(map);
      } else {
        setAssignments({});
      }

      const { data: riderRow } = await supabase
        .from("users")
        .select("rider_status")
        .eq("id", user.id)
        .maybeSingle();
      if (riderRow?.rider_status) {
        setRiderStatus(riderRow.rider_status as string);
      }
    } catch (err) {
      console.error("Error fetching rider deliveries:", err);
      toast.error("Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchDeliveries();
    const interval = setInterval(fetchDeliveries, 15000);
    return () => clearInterval(interval);
  }, [fetchDeliveries]);

  const assignmentStatus = useCallback(
    (order: Order): AssignmentStatus => {
      const a = assignments[order.id];
      if (a?.status) return a.status as AssignmentStatus;
      const s = order.delivery_status;
      if (s === "accepted") return "accepted";
      if (s === "picked_up" || s === "out_for_delivery") return "picked_up";
      if (s === "delivered") return "delivered";
      if (s === "cancelled") return "cancelled";
      return "assigned";
    },
    [assignments]
  );

  const activeOrders = useMemo(
    () =>
      orders.filter((o) => ACTIVE_STATUSES.includes(assignmentStatus(o))),
    [orders, assignmentStatus]
  );
  const completedOrders = useMemo(
    () =>
      orders.filter((o) => {
        const s = assignmentStatus(o);
        return s === "delivered" || s === "cancelled";
      }),
    [orders, assignmentStatus]
  );

  const shownOrders = tab === "active" ? activeOrders : completedOrders;
  const activeOrderId = activeOrders[0]?.id;
  const activeRestaurantId = activeOrders[0]?.restaurant_id;

  const isOnline = riderStatus !== "offline";
  const canToggleAvailability = activeOrders.length === 0;

  const toggleAvailability = async () => {
    if (!user?.id || togglingStatus) return;
    if (!canToggleAvailability) {
      toast.error("Complete your active deliveries before going offline.");
      return;
    }

    const next = riderStatus === "offline" ? "available" : "offline";
    setTogglingStatus(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ rider_status: next })
        .eq("id", user.id);
      if (error) throw error;
      setRiderStatus(next);
      toast.success(
        next === "offline"
          ? "You are now offline and won't receive new deliveries"
          : "You are now online and available for deliveries"
      );
    } catch (err: any) {
      console.error("Error updating rider availability:", err);
      toast.error(err?.message || "Failed to update availability");
    } finally {
      setTogglingStatus(false);
    }
  };

  useEffect(() => {
    if (!user?.id || !activeOrderId || !activeRestaurantId) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const orderId = activeOrderId;

    const pushLocation = (position: GeolocationPosition) => {
      const timestamp = Date.now();
      if (timestamp - lastLocationSent.current < LOCATION_INTERVAL_MS) return;
      lastLocationSent.current = timestamp;
      supabase
        .from("rider_locations")
        .insert({
          restaurant_id: activeRestaurantId,
          rider_id: user.id,
          order_id: orderId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        .then(({ error }) => {
          if (error) console.error("Failed to save rider location:", error);
        });
    };

    const watchId = navigator.geolocation.watchPosition(
      pushLocation,
      (err) => {
        if (!permissionWarned.current && err.code === err.PERMISSION_DENIED) {
          permissionWarned.current = true;
          toast.error("Location permission denied. Customer tracking is unavailable.");
        }
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeOrderId, activeRestaurantId, user?.id]);

  const updateDelivery = async (order: Order, next: AssignmentStatus) => {
    if (!user?.id) return;
    const iso = new Date().toISOString();
    const assignmentPatch: Record<string, unknown> = {
      status: next,
      updated_at: iso,
    };
    const orderPatch: Record<string, unknown> = {};

    if (next === "accepted") {
      assignmentPatch.accepted_at = iso;
      orderPatch.delivery_status = "accepted";
    } else if (next === "picked_up") {
      assignmentPatch.picked_up_at = iso;
      orderPatch.delivery_status = "out_for_delivery";
      if (!order.status || order.status === "pending") {
        orderPatch.status = "in_progress";
      }
    } else if (next === "delivered") {
      assignmentPatch.delivered_at = iso;
      orderPatch.delivery_status = "delivered";
      orderPatch.status = "completed";
    } else if (next === "cancelled") {
      assignmentPatch.cancelled_at = iso;
      orderPatch.delivery_status = "cancelled";
    }

    setUpdatingOrderId(order.id);
    try {
      const { error: assignmentError } = await supabase
        .from("delivery_assignments")
        .update(assignmentPatch)
        .eq("order_id", order.id);
      if (assignmentError) throw assignmentError;

      if (Object.keys(orderPatch).length > 0) {
        const { error: orderError } = await supabase
          .from("orders")
          .update(orderPatch)
          .eq("id", order.id);
        if (orderError) throw orderError;
      }

      if (next === "accepted") {
        await supabase.from("users").update({ rider_status: "busy" }).eq("id", user.id);
      }
      if (next === "delivered" || next === "cancelled") {
        const { count } = await supabase
          .from("delivery_assignments")
          .select("id", { count: "exact", head: true })
          .eq("rider_id", user.id)
          .in("status", ACTIVE_STATUSES);
        await supabase
          .from("users")
          .update({ rider_status: count && count > 0 ? "busy" : "available" })
          .eq("id", user.id);
      }

      toast.success(`Order #${order.id} marked as ${statusLabel(next)}`);
      await fetchDeliveries();
    } catch (err: any) {
      console.error("Error updating delivery:", err);
      toast.error(err?.message || "Failed to update delivery");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const mapsUrl = (order: Order) => {
    const lat = (order as any).customer_latitude;
    const lng = (order as any).customer_longitude;
    if (lat != null && lng != null) {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      order.customer_address || ""
    )}`;
  };

  const elapsed = (createdAt: string) => {
    const diff = Math.max(0, now - new Date(createdAt).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <header className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between shadow-md">
          <button onClick={onBack} className="p-2 hover:bg-emerald-700 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Rider Mode</h1>
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
      <header className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <button onClick={onBack} className="p-2 hover:bg-emerald-700 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold flex items-center">
          <Bike className="w-5 h-5 mr-2" />
          Rider Mode
        </h1>
        <button
          onClick={fetchDeliveries}
          className="p-2 hover:bg-emerald-700 rounded-lg transition-colors"
          title="Refresh deliveries"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </header>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto w-full">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm text-gray-500">Logged in as</p>
            <p className="text-lg font-semibold text-gray-900 flex items-center">
              <User className="h-4 w-4 mr-1.5 text-gray-400" />
              {user?.name || "Rider"}
            </p>
            {user?.vehicle_number && (
              <p className="text-xs text-gray-500 mt-0.5">{user.vehicle_number}</p>
            )}
            <span
              className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                activeOrders.length > 0
                  ? "bg-amber-100 text-amber-800"
                  : riderStatus === "offline"
                  ? "bg-gray-100 text-gray-700"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              <span
                className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                  activeOrders.length > 0
                    ? "bg-amber-500"
                    : riderStatus === "offline"
                    ? "bg-gray-400"
                    : "bg-emerald-500"
                }`}
              />
              {activeOrders.length > 0
                ? "Offline — on delivery"
                : riderStatus === "offline"
                ? "Offline — not available"
                : "Online — available"}
            </span>
            <div className="mt-2">
              <button
                type="button"
                role="switch"
                aria-checked={isOnline}
                onClick={toggleAvailability}
                disabled={togglingStatus || !canToggleAvailability}
                title={
                  canToggleAvailability
                    ? isOnline
                      ? "Go offline"
                      : "Go online"
                    : "Complete your active deliveries before going offline"
                }
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  isOnline
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {togglingStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
                <span
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                    isOnline ? "bg-emerald-500" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
                      isOnline ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
                {togglingStatus
                  ? "Updating..."
                  : isOnline
                  ? "Online"
                  : "Offline"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              {activeOrders.length > 0
                ? "New deliveries pause until this trip is completed."
                : riderStatus === "offline"
                ? "You are not receiving new deliveries."
                : "You will automatically go offline while delivering."}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Platform</p>
            <p className="font-medium text-gray-900">SmartPOS Rider</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center">
            <Truck className="h-7 w-7 text-yellow-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-yellow-700">Active</p>
              <p className="text-2xl font-bold text-yellow-800">{activeOrders.length}</p>
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
            <CheckCircle className="h-7 w-7 text-green-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-green-700">Completed</p>
              <p className="text-2xl font-bold text-green-800">{completedOrders.length}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setTab("active")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "active"
                ? "bg-emerald-600 text-white"
                : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Active Deliveries ({activeOrders.length})
          </button>
          <button
            onClick={() => setTab("completed")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "completed"
                ? "bg-emerald-600 text-white"
                : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            History ({completedOrders.length})
          </button>
        </div>

        {shownOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">
              {tab === "active" ? "No active deliveries" : "No completed deliveries yet"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {tab === "active"
                ? "New assignments will appear here automatically."
                : "Delivered and cancelled jobs are shown here."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {shownOrders.map((order) => {
              const status = assignmentStatus(order);
              const isUpdating = updatingOrderId === order.id;
              const orderCurrency =
                restaurantCurrencies[order.restaurant_id] || currency;
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-lg shadow border overflow-hidden ${
                    status === "assigned"
                      ? "border-yellow-300"
                      : status === "accepted"
                      ? "border-blue-300"
                      : status === "picked_up"
                      ? "border-indigo-300"
                      : "border-gray-200"
                  }`}
                >
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">Order #{order.id}</span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(
                          status
                        )}`}
                      >
                        {statusLabel(status)}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800">
                        {order.payment_method === "cash" ? "COD" : "Prepaid"}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">
                        <Store className="h-3 w-3 mr-1" />
                        {restaurantNames[order.restaurant_id] ||
                          order.restaurant_id}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 flex items-center">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      {elapsed(order.created_at)}
                    </span>
                  </div>

                  <div className="px-4 py-3 border-b border-gray-100 space-y-1.5 text-sm">
                    <p className="flex items-center text-gray-900 font-medium">
                      <User className="h-4 w-4 mr-1.5 text-gray-400" />
                      {order.customer_name || "Customer"}
                    </p>
                    {order.customer_phone && (
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="flex items-center text-emerald-700 hover:underline"
                      >
                        <Phone className="h-4 w-4 mr-1.5" />
                        {order.customer_phone}
                      </a>
                    )}
                    <p className="flex items-start text-gray-700">
                      <MapPin className="h-4 w-4 mr-1.5 text-gray-400 mt-0.5 shrink-0" />
                      <span>{order.customer_address || "No address provided"}</span>
                    </p>
                    <div className="flex items-center gap-3 pt-1">
                      {order.customer_address && (
                        <a
                          href={mapsUrl(order)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-md"
                        >
                          <Navigation className="h-3.5 w-3.5 mr-1" />
                          Navigate
                        </a>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatDate(order.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4">
                    <ul className="space-y-1.5 mb-3">
                      {order.items?.map((item: any, index: number) => (
                        <li key={index} className="text-sm flex justify-between">
                          <span className="text-gray-800">
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-100 rounded text-xs font-semibold text-gray-600 mr-2">
                              {item.quantity}
                            </span>
                            {item.name}
                          </span>
                          <span className="text-gray-600">
                            {formatCurrency(
                              item.price * item.quantity,
                              orderCurrency
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="border-t border-gray-100 pt-2 flex justify-between text-sm">
                      <span className="text-gray-600">
                        {order.payment_method === "cash" ? "Collect cash" : "Total"}
                      </span>
                      <span className="font-bold text-gray-900">
                        {formatCurrency(order.total, orderCurrency)}
                      </span>
                    </div>

                    {tab === "active" && (
                      <div className="mt-4 flex items-center gap-2 flex-wrap">
                        {status === "assigned" && (
                          <button
                            onClick={() => updateDelivery(order, "accepted")}
                            disabled={isUpdating}
                            className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
                          >
                            <CheckCircle className="w-4 h-4 mr-1.5" />
                            Accept Delivery
                          </button>
                        )}
                        {status === "accepted" && (
                          <button
                            onClick={() => updateDelivery(order, "picked_up")}
                            disabled={isUpdating}
                            className="flex-1 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center"
                          >
                            <Package className="w-4 h-4 mr-1.5" />
                            Picked Up
                          </button>
                        )}
                        {status === "picked_up" && (
                          <button
                            onClick={() => updateDelivery(order, "delivered")}
                            disabled={isUpdating}
                            className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center"
                          >
                            <CheckCircle className="w-4 h-4 mr-1.5" />
                            Mark Delivered
                          </button>
                        )}
                        {(status === "assigned" || status === "accepted") && (
                          <button
                            onClick={() => updateDelivery(order, "cancelled")}
                            disabled={isUpdating}
                            className="px-3 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 flex items-center"
                          >
                            <XCircle className="w-4 h-4 mr-1.5" />
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
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
