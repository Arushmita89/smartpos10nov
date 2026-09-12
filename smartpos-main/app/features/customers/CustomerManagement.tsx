"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Database } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ConfirmationDialog from "@/components/ui/ConfirmationDialog";
import toast from "react-hot-toast";
import {
  Users,
  Plus,
  Search,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MapPin,
  RefreshCw,
  Eye,
  ArrowLeft,
  ShoppingBag,
  Wallet,
  Repeat,
  X,
  Save,
  Calendar,
  CreditCard,
  Store,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

type Restaurant = Database["public"]["Tables"]["parameters"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Order = Database["public"]["Tables"]["orders"]["Row"];

type CustomerOrder = Pick<
  Order,
  "id" | "created_at" | "total" | "status" | "payment_method" | "items" | "customer_phone" | "order_type"
>;

const WALKIN_PHONE = "0000000000";

interface OrderItem {
  name?: string;
  price?: number;
  quantity?: number;
}

interface CustomerStats {
  orderCount: number;
  totalSpent: number;
  totalItems: number;
  lastOrder: CustomerOrder | null;
}

interface CustomerManagementProps {
  restaurant: Restaurant;
}

function CustomerModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [email, setEmail] = useState(customer?.email || "");
  const [address, setAddress] = useState(customer?.address || "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    const cleanedPhone = phone.replace(/[^\d]/g, "");
    if (cleanedPhone.length < 10 || cleanedPhone.length > 13) {
      toast.error("Enter a valid phone number");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone: cleanedPhone,
        email: email.trim() || null,
        address: address.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (customer?.id) {
        const { error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", customer.id);
        if (error) {
          if (error.message?.includes("duplicate")) {
            throw new Error("A customer with this phone number already exists");
          }
          throw error;
        }
        toast.success("Customer updated");
      } else {
        const { error } = await supabase
          .from("customers")
          .upsert(payload, { onConflict: "restaurant_id,phone" });
        if (error) {
          if (error.message?.includes("duplicate")) {
            throw new Error("A customer with this phone number already exists");
          }
          throw error;
        }
        toast.success("Customer added");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save customer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {customer ? "Edit Customer" : "Add Customer"}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Delivery address"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
          >
            {submitting ? (
              <>
                <LoadingSpinner size="sm" />
                <span className="ml-2">Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {customer ? "Save Changes" : "Add Customer"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomerManagement({ restaurant }: CustomerManagementProps) {
  const currency = restaurant.currency || "INR";
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rid = restaurant.restaurant_id;

      const [{ data: custData, error: custErr }, { data: orderData, error: ordErr }] =
        await Promise.all([
          supabase
            .from("customers")
            .select("*")
            .eq("restaurant_id", rid)
            .order("created_at", { ascending: false }),
          supabase
            .from("orders")
            .select("id, created_at, total, status, payment_method, items, customer_phone, order_type")
            .eq("restaurant_id", rid)
            .order("created_at", { ascending: false }),
        ]);

      if (custErr) throw custErr;
      if (ordErr) throw ordErr;

      setCustomers(custData || []);
      setOrders(orderData || []);
    } catch (err: any) {
      console.error("Error loading customers:", err);
      setError(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [restaurant.restaurant_id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const statsByPhone = useMemo(() => {
    const map = new Map<string, CustomerStats>();
    orders.forEach((order) => {
      const phone = order.customer_phone;
      if (!phone || phone === WALKIN_PHONE) return;
      const entry: CustomerStats = map.get(phone) || {
        orderCount: 0,
        totalSpent: 0,
        totalItems: 0,
        lastOrder: null,
      };
      entry.orderCount += 1;
      entry.totalSpent += order.total || 0;
      const items: OrderItem[] = order.items as OrderItem[];
      if (Array.isArray(items)) {
        entry.totalItems += items.reduce((sum, it) => sum + (it.quantity || 1), 0);
      }
      if (!entry.lastOrder || new Date(order.created_at) > new Date(entry.lastOrder.created_at)) {
        entry.lastOrder = order;
      }
      map.set(phone, entry);
    });
    return map;
  }, [orders]);

  const enrichedCustomers = useMemo(() => {
    return customers
      .map((c) => ({
        customer: c,
        stats: statsByPhone.get(c.phone) || {
          orderCount: 0,
          totalSpent: 0,
          totalItems: 0,
          lastOrder: null,
        },
      }))
      .sort((a, b) => {
        const aDate = a.stats.lastOrder?.created_at || a.customer.created_at;
        const bDate = b.stats.lastOrder?.created_at || b.customer.created_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
  }, [customers, statsByPhone]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrichedCustomers;
    return enrichedCustomers.filter(({ customer }) =>
      [customer.name, customer.phone, customer.email || ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [enrichedCustomers, search]);

  const totals = useMemo(() => {
    let totalRevenue = 0;
    let totalOrders = 0;
    let repeatCustomers = 0;
    enrichedCustomers.forEach(({ stats }) => {
      totalRevenue += stats.totalSpent;
      totalOrders += stats.orderCount;
      if (stats.orderCount > 1) repeatCustomers += 1;
    });
    return { totalRevenue, totalOrders, repeatCustomers };
  }, [enrichedCustomers]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setShowModal(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!deletingCustomer) return;
    setDeleteBusy(true);
    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", deletingCustomer.id);
      if (error) throw error;
      toast.success("Customer deleted");
      if (selectedCustomer?.id === deletingCustomer.id) {
        setSelectedCustomer(null);
      }
      setCustomers((prev) => prev.filter((c) => c.id !== deletingCustomer.id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete customer");
    } finally {
      setDeleteBusy(false);
      setDeletingCustomer(null);
    }
  };

  const orderHistory = useMemo(() => {
    if (!selectedCustomer) return [];
    return orders.filter(
      (o) =>
        o.customer_phone === selectedCustomer.phone &&
        o.customer_phone !== WALKIN_PHONE
    );
  }, [orders, selectedCustomer]);

  const selectedStats = selectedCustomer ? statsByPhone.get(selectedCustomer.phone) : null;
  const avgOrderValue =
    selectedStats && selectedStats.orderCount > 0
      ? selectedStats.totalSpent / selectedStats.orderCount
      : 0;

  const statusBadgeClass = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("settl") || s === "completed" || s === "delivered")
      return "bg-green-100 text-green-700";
    if (s.includes("cancel") || s.includes("refund")) return "bg-red-100 text-red-700";
    if (s.includes("preparing") || s.includes("cooking") || s.includes("in progress"))
      return "bg-yellow-100 text-yellow-700";
    return "bg-blue-100 text-blue-700";
  };

  const statCard = (
    icon: React.ReactNode,
    label: string,
    value: string,
    accent: string
  ) => (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-center">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center mr-3 ${accent}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </button>
      </div>
    );
  }

  if (selectedCustomer) {
    return (
      <div className="space-y-5">
        <button
          onClick={() => setSelectedCustomer(null)}
          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Customers
        </button>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start">
              <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center mr-4">
                <Users className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {selectedCustomer.name}
                </h3>
                {selectedCustomer.created_at && (
                  <p className="text-sm text-gray-500 flex items-center mt-1">
                    <Calendar className="h-3.5 w-3.5 mr-1" />
                    Customer since {formatDate(selectedCustomer.created_at)}
                  </p>
                )}
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-600 flex items-center">
                    <Phone className="h-3.5 w-3.5 mr-2 text-gray-400" />
                    {selectedCustomer.phone}
                  </p>
                  {selectedCustomer.email && (
                    <p className="text-sm text-gray-600 flex items-center">
                      <Mail className="h-3.5 w-3.5 mr-2 text-gray-400" />
                      {selectedCustomer.email}
                    </p>
                  )}
                  {selectedCustomer.address && (
                    <p className="text-sm text-gray-600 flex items-center">
                      <MapPin className="h-3.5 w-3.5 mr-2 text-gray-400" />
                      {selectedCustomer.address}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => openEditModal(selectedCustomer)}
                className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </button>
              <button
                onClick={() => setDeletingCustomer(selectedCustomer)}
                className="inline-flex items-center px-3 py-2 text-sm border border-red-200 rounded-md text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Total Orders</p>
              <p className="text-2xl font-bold text-gray-900">
                {selectedStats?.orderCount || 0}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Total Spent</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(selectedStats?.totalSpent || 0, currency)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Avg. Order Value</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(avgOrderValue, currency)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Last Order</p>
              <p className="text-lg font-bold text-gray-900 truncate">
                {selectedStats?.lastOrder
                  ? formatDate(selectedStats.lastOrder.created_at)
                  : "Never"}
              </p>
            </div>
          </div>
        </div>

        {orderHistory.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <ShoppingBag className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No orders found for this customer yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h4 className="text-sm font-medium text-gray-900">Order History</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orderHistory.map((order) => {
                    const items: OrderItem[] = order.items as OrderItem[];
                    const itemCount = Array.isArray(items)
                      ? items.reduce((sum, it) => sum + (it.quantity || 1), 0)
                      : 0;
                    const itemPreview =
                      Array.isArray(items) && items.length > 0
                        ? items
                            .slice(0, 2)
                            .map((it) => it.name || "Item")
                            .join(", ") +
                          (items.length > 2 ? ` +${items.length - 2} more` : "")
                        : "—";
                    return (
                      <tr key={order.id}>
                        <td className="px-6 py-3 text-sm text-gray-700 whitespace-nowrap">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-700">
                          {itemPreview}
                          <span className="text-xs text-gray-500 ml-1">
                            ({itemCount})
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-700 capitalize">
                          {(order.order_type || "customer").replace(/-/g, " ")}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-700 capitalize">
                          {order.payment_method || "—"}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(
                              order.status
                            )}`}
                          >
                            {(order.status || "—").replace(/-/g, " ")}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right whitespace-nowrap">
                          {formatCurrency(order.total || 0, currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCard(
          <Users className="h-5 w-5 text-blue-600" />,
          "Total Customers",
          customers.length.toString(),
          "bg-blue-100"
        )}
        {statCard(
          <ShoppingBag className="h-5 w-5 text-green-600" />,
          "Total Orders",
          totals.totalOrders.toString(),
          "bg-green-100"
        )}
        {statCard(
          <Wallet className="h-5 w-5 text-purple-600" />,
          "Total Revenue",
          formatCurrency(totals.totalRevenue, currency),
          "bg-purple-100"
        )}
        {statCard(
          <Repeat className="h-5 w-5 text-orange-600" />,
          "Repeat Customers",
          totals.repeatCustomers.toString(),
          "bg-orange-100"
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Customer Management
            </h3>
            <p className="text-sm text-gray-500">
              View and manage your restaurant&apos;s customers
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchData}
              className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={openAddModal}
              className="inline-flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </button>
          </div>
        </div>

        <div className="relative mb-5">
          <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">
              {customers.length === 0
                ? "No customers yet. Customers are saved automatically when they place orders."
                : "No customers match your search."}
            </p>
            {customers.length === 0 && (
              <button
                onClick={openAddModal}
                className="inline-flex items-center px-4 py-2 mt-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Orders
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Spent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Order
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map(({ customer, stats }) => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedCustomer(customer)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center mr-3 flex-shrink-0">
                          <Users className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {customer.name}
                          </p>
                          {customer.email && (
                            <p className="text-xs text-gray-500">
                              {customer.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700 flex items-center">
                        <Phone className="h-3.5 w-3.5 mr-2 text-gray-400" />
                        {customer.phone}
                      </p>
                      {customer.address && (
                        <p className="text-xs text-gray-500 mt-1 flex items-center truncate max-w-[220px]">
                          <MapPin className="h-3 w-3 mr-1 text-gray-400 flex-shrink-0" />
                          {customer.address}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {stats.orderCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {stats.totalSpent > 0
                        ? formatCurrency(stats.totalSpent, currency)
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                      {stats.lastOrder ? formatDate(stats.lastOrder.created_at) : "—"}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedCustomer(customer)}
                        className="inline-flex items-center p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                        title="View details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(customer)}
                        className="inline-flex items-center p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md"
                        title="Edit customer"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeletingCustomer(customer)}
                        className="inline-flex items-center p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                        title="Delete customer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => setShowModal(false)}
          onSaved={fetchData}
        />
      )}

      <ConfirmationDialog
        isOpen={!!deletingCustomer}
        onClose={() => setDeletingCustomer(null)}
        onConfirm={handleDelete}
        title="Delete Customer"
        message={
          deletingCustomer
            ? `Are you sure you want to delete "${deletingCustomer.name}"? This cannot be undone.`
            : ""
        }
        confirmText="Delete"
        isLoading={deleteBusy}
      />
    </div>
  );
}