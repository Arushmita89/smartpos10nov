'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Bike,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Store,
  Truck,
  UserCheck,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AdminRider {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string | null;
  vehicle_number: string | null;
  rider_status: string | null;
  active: boolean;
}

interface AdminDeliveryOrder {
  id: number;
  restaurant_id: string;
  restaurant_name: string | null;
  restaurant_currency: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  items: any[];
  total: number;
  payment_method: string | null;
  status: string | null;
  order_type: string | null;
  delivery_status: string | null;
  delivery_partner: string | null;
  delivery_awb: string | null;
  delivery_rider_id: string | null;
  created_at: string;
  assignment: any;
  rider: AdminRider | null;
}

type DeliveryFilter = 'needs-rider' | 'active' | 'all';

const ACTIVE_DELIVERY_STATUSES = [
  'assigned',
  'accepted',
  'picked_up',
  'out_for_delivery',
  'arrived',
];

function deliveryState(order: AdminDeliveryOrder): string {
  return (
    order.assignment?.status || order.delivery_status || order.status || 'pending'
  );
}

function isClosed(order: AdminDeliveryOrder): boolean {
  const state = deliveryState(order);
  return ['delivered', 'cancelled', 'failed', 'returned'].includes(state);
}

function needsRider(order: AdminDeliveryOrder): boolean {
  return (
    !isClosed(order) &&
    !order.delivery_rider_id &&
    !order.assignment?.rider_id &&
    !order.delivery_awb
  );
}

function isActive(order: AdminDeliveryOrder): boolean {
  const state = deliveryState(order);
  return (
    !isClosed(order) &&
    (ACTIVE_DELIVERY_STATUSES.includes(state) ||
      !!order.delivery_rider_id ||
      !!order.assignment?.rider_id)
  );
}

function statusClasses(status: string): string {
  if (['delivered', 'completed'].includes(status)) {
    return 'bg-green-100 text-green-800';
  }
  if (['cancelled', 'failed', 'returned'].includes(status)) {
    return 'bg-red-100 text-red-800';
  }
  if (['picked_up', 'out_for_delivery', 'arrived'].includes(status)) {
    return 'bg-indigo-100 text-indigo-800';
  }
  if (['accepted'].includes(status)) {
    return 'bg-blue-100 text-blue-800';
  }
  if (['assigned'].includes(status)) {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-gray-100 text-gray-700';
}

export default function DeliveryPanel() {
  const { restaurant, user } = useAuth();
  const [orders, setOrders] = useState<AdminDeliveryOrder[]>([]);
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [availableRiders, setAvailableRiders] = useState<AdminRider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DeliveryFilter>('needs-rider');
  const [selectedRider, setSelectedRider] = useState<Record<number, string>>({});
  const [assigningOrderId, setAssigningOrderId] = useState<number | null>(null);
  const [reassignOrderId, setReassignOrderId] = useState<number | null>(null);

  const adminHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-login-name': user?.login_name || '',
      'x-restaurant-id': restaurant?.restaurant_id || '',
    }),
    [user?.login_name, restaurant?.restaurant_id]
  );

  const fetchDeliveryData = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const res = await fetch('/api/admin/delivery', {
          headers: adminHeaders,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load deliveries');
        }
        setOrders(data.orders || []);
        setRiders(data.riders || []);
        setAvailableRiders(data.availableRiders || []);
        setError(null);
      } catch (err: any) {
        console.error('Error loading deliveries:', err);
        setError(err?.message || 'Failed to load deliveries');
        if (!silent) toast.error(err?.message || 'Failed to load deliveries');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [adminHeaders]
  );

  useEffect(() => {
    fetchDeliveryData();
    const interval = setInterval(() => fetchDeliveryData(true), 20000);
    return () => clearInterval(interval);
  }, [fetchDeliveryData]);

  const assignRider = async (order: AdminDeliveryOrder) => {
    const riderId = selectedRider[order.id];
    if (!riderId) {
      toast.error('Select an available rider first');
      return;
    }
    setAssigningOrderId(order.id);
    try {
      const res = await fetch('/api/admin/delivery/assign', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          orderId: order.id,
          restaurantId: order.restaurant_id,
          riderId,
          assignedBy: user?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to assign rider');
      }
      toast.success(
        `Order #${order.id} assigned to ${data.rider?.name || 'rider'}`
      );
      setSelectedRider((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      setReassignOrderId(null);
      await fetchDeliveryData(true);
    } catch (err: any) {
      console.error('Error assigning rider:', err);
      toast.error(err?.message || 'Failed to assign rider');
    } finally {
      setAssigningOrderId(null);
    }
  };

  const trackRider = async (order: AdminDeliveryOrder) => {
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
  };

  const counts = useMemo(
    () => ({
      needsRider: orders.filter(needsRider).length,
      active: orders.filter(isActive).length,
      available: availableRiders.length,
      busy: riders.filter((rider) => rider.rider_status === 'busy').length,
    }),
    [orders, availableRiders, riders]
  );

  const filteredOrders = useMemo(() => {
    if (filter === 'needs-rider') return orders.filter(needsRider);
    if (filter === 'active') return orders.filter(isActive);
    return orders;
  }, [orders, filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Delivery Assignment</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Assign riders to delivery orders across all restaurants. The
            restaurant is intimated automatically once a rider is assigned.
          </p>
        </div>
        <button
          onClick={() => fetchDeliveryData(true)}
          disabled={refreshing}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="h-4 w-4 text-amber-600" />
            Needs rider
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.needsRider}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Truck className="h-4 w-4 text-blue-600" />
            In progress
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.active}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users className="h-4 w-4 text-emerald-600" />
            Available riders
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.available}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Bike className="h-4 w-4 text-purple-600" />
            On delivery
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">{counts.busy}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['needs-rider', `Needs rider (${counts.needsRider})`],
            ['active', `In progress (${counts.active})`],
            ['all', `All delivery orders (${orders.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === value
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {filteredOrders.length === 0 ? (
            <div className="rounded-xl bg-white p-12 text-center shadow">
              <Package className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <p className="font-medium text-gray-600">
                {filter === 'needs-rider'
                  ? 'No delivery orders waiting for a rider'
                  : filter === 'active'
                  ? 'No deliveries in progress'
                  : 'No delivery orders found'}
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const state = deliveryState(order);
              const rider = order.rider;
              const showReassign =
                !!rider && reassignOrderId === order.id;
              return (
                <div
                  key={order.id}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-gray-900">
                        Order #{order.id}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses(
                          state
                        )}`}
                      >
                        {state.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses(
                          order.status || 'pending'
                        )}`}
                      >
                        {order.status || 'pending'}
                      </span>
                      {order.delivery_awb && (
                        <span className="inline-flex rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                          AWB: {order.delivery_awb}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center text-xs text-gray-500">
                      <Clock className="mr-1 h-3.5 w-3.5" />
                      {formatDate(order.created_at)}
                    </span>
                  </div>

                  <div className="space-y-3 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="inline-flex items-center font-medium text-gray-900">
                        <Store className="mr-1.5 h-4 w-4 text-blue-600" />
                        {order.restaurant_name || 'Restaurant'}
                      </span>
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">
                        ID: {order.restaurant_id}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                      <span className="font-medium text-gray-900">
                        {order.customer_name || 'Customer'}
                      </span>
                      {order.customer_phone && (
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="inline-flex items-center text-emerald-700 hover:underline"
                        >
                          <Phone className="mr-1 h-3.5 w-3.5" />
                          {order.customer_phone}
                        </a>
                      )}
                      <span className="inline-flex items-start">
                        <MapPin className="mr-1 mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                        {order.customer_address || 'No address provided'}
                      </span>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                        {(order.items || []).map((item: any, index: number) => (
                          <span key={index}>
                            {item.quantity} × {item.name}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 text-sm">
                        <span className="text-gray-500">
                          {order.payment_method === 'cash' ? 'COD' : 'Prepaid'}
                        </span>
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(
                            order.total,
                            order.restaurant_currency || 'INR'
                          )}
                        </span>
                      </div>
                    </div>

                    {rider ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="flex items-center text-sm font-medium text-emerald-900">
                              <UserCheck className="mr-1.5 h-4 w-4" />
                              {rider.name}
                            </p>
                            <p className="mt-0.5 text-xs text-emerald-800">
                              {rider.phone || 'No phone'}
                              {rider.vehicle_number
                                ? ` · ${rider.vehicle_number}`
                                : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {order.assignment?.status &&
                              ['picked_up', 'out_for_delivery'].includes(
                                order.assignment.status
                              ) && (
                                <button
                                  onClick={() => trackRider(order)}
                                  className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                >
                                  <Navigation className="mr-1 h-3.5 w-3.5" />
                                  Track
                                </button>
                              )}
                            <button
                              onClick={() => {
                                setReassignOrderId(
                                  reassignOrderId === order.id ? null : order.id
                                );
                                setSelectedRider((prev) => ({
                                  ...prev,
                                  [order.id]: rider.id,
                                }));
                              }}
                              className="rounded-md border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              {showReassign ? 'Cancel' : 'Change rider'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        No rider assigned yet.
                      </div>
                    )}

                    {(!rider || showReassign) && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedRider[order.id] || ''}
                          onChange={(e) =>
                            setSelectedRider((prev) => ({
                              ...prev,
                              [order.id]: e.target.value,
                            }))
                          }
                          className="min-w-[220px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                        >
                          <option value="">Select available rider…</option>
                          {(rider &&
                          !availableRiders.some((r) => r.id === rider.id)
                            ? [rider, ...availableRiders]
                            : availableRiders
                          ).map((availableRider) => (
                            <option
                              key={availableRider.id}
                              value={availableRider.id}
                            >
                              {availableRider.name}
                              {availableRider.phone
                                ? ` · ${availableRider.phone}`
                                : ''}
                              {availableRider.vehicle_number
                                ? ` · ${availableRider.vehicle_number}`
                                : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => assignRider(order)}
                          disabled={
                            assigningOrderId === order.id ||
                            !selectedRider[order.id]
                          }
                          className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <UserCheck className="mr-1.5 h-4 w-4" />
                          {assigningOrderId === order.id
                            ? 'Assigning…'
                            : rider
                            ? 'Reassign rider'
                            : 'Assign rider'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="xl:col-span-1">
          <div className="sticky top-20 rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="flex items-center text-sm font-semibold text-gray-900">
                <Users className="mr-2 h-4 w-4 text-emerald-600" />
                Available Riders
              </h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                {availableRiders.length}
              </span>
            </div>
            <div className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto">
              {availableRiders.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">
                  No riders are currently available.
                </p>
              ) : (
                availableRiders.map((rider) => (
                  <div key={rider.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {rider.name}
                      </p>
                      <span className="inline-flex items-center text-xs font-medium text-emerald-700">
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        available
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {rider.phone || 'No phone'}
                      {rider.vehicle_number
                        ? ` · ${rider.vehicle_number}`
                        : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
            {riders.length > availableRiders.length && (
              <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
                {riders.length - availableRiders.length} rider
                {riders.length - availableRiders.length === 1 ? '' : 's'} busy or
                offline
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
