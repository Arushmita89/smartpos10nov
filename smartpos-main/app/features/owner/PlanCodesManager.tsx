'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  CURRENCIES,
  COUNTRIES,
} from '@/app/features/owner/currencyData';
import {
  Search,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PlanCode {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  currency: string;
  country_code: string;
  plan_code: string | null;
  restaurant_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface PlanForm {
  id?: string;
  name: string;
  duration_days: string;
  price: string;
  currency: string;
  country_code: string;
  plan_code: string;
  restaurant_id: string;
  is_active: boolean;
}

const emptyPlanForm: PlanForm = {
  name: '',
  duration_days: '30',
  price: '',
  currency: 'INR',
  country_code: 'IN',
  plan_code: '',
  restaurant_id: '',
  is_active: true,
};

const generatePlanCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `PLAN${suffix}`;
};

export default function PlanCodesManager() {
  const { user, restaurant } = useAuth();
  const [plans, setPlans] = useState<PlanCode[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [restaurantFilter, setRestaurantFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PlanForm>(emptyPlanForm);
  const [saving, setSaving] = useState(false);

  const currencyOptions = useCallback(() => {
    const list = [...CURRENCIES];
    if (form.currency && !list.some((c) => c.code === form.currency)) {
      list.push({ code: form.currency, name: form.currency });
    }
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }, [form.currency]);

  const countryOptions = useCallback(() => {
    const list = [...COUNTRIES];
    if (
      form.country_code &&
      !list.some((c) => c.code === form.country_code)
    ) {
      list.push({ code: form.country_code, name: form.country_code });
    }
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }, [form.country_code]);

  const authHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      'x-login-name': user?.login_name || '',
      'x-restaurant-id': restaurant?.restaurant_id || '',
    }),
    [user?.login_name, restaurant?.restaurant_id]
  );

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const res = await fetch('/api/admin/plans', { headers: authHeaders() });
      if (res.status === 403 || res.status === 500) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Access denied');
      }
      if (!res.ok) throw new Error('Failed to load plans');
      setPlans(await res.json());
    } catch (err: any) {
      console.error('Error loading plans:', err);
      toast.error(err.message || 'Failed to load plans');
    } finally {
      setLoadingPlans(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleAdd = () => {
    setForm({ ...emptyPlanForm, plan_code: generatePlanCode() });
    setShowForm(true);
  };

  const handleEdit = (plan: PlanCode) => {
    setForm({
      id: plan.id,
      name: plan.name,
      duration_days: String(plan.duration_days),
      price: String(plan.price),
      currency: plan.currency,
      country_code: plan.country_code,
      plan_code: plan.plan_code || '',
      restaurant_id: plan.restaurant_id || '',
      is_active: plan.is_active,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.duration_days || !form.price) {
      toast.error('Plan name, duration and price are required');
      return;
    }
    setSaving(true);
    try {
      const isEdit = !!form.id;
      const payload = {
        ...(isEdit ? { id: form.id } : {}),
        name: form.name.trim(),
        duration_days: Number(form.duration_days),
        price: Number(form.price),
        currency: form.currency.trim().toUpperCase() || 'INR',
        country_code: form.country_code.trim().toUpperCase() || 'IN',
        plan_code: form.plan_code.trim() || null,
        restaurant_id: form.restaurant_id.trim() || null,
        is_active: form.is_active,
      };

      const res = await fetch('/api/admin/plans', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errMsg = 'Failed to save plan';
        try {
          const errBody = await res.json();
          if (errBody.error) errMsg = errBody.error;
        } catch {
          // Response wasn't JSON
        }
        throw new Error(errMsg);
      }

      toast.success(isEdit ? 'Plan updated' : 'Plan created');
      setShowForm(false);
      setForm(emptyPlanForm);
      loadPlans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: PlanCode) => {
    if (!window.confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/plans?id=${plan.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete plan');
      toast.success('Plan deleted');
      loadPlans();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete plan');
    }
  };

  const countries = Array.from(
    new Set(plans.map((p) => p.country_code).filter((v): v is string => !!v))
  ).sort();

  const currencies = Array.from(
    new Set(plans.map((p) => p.currency).filter((v): v is string => !!v))
  ).sort();

  const restaurantIds = Array.from(
    new Set(plans.map((p) => p.restaurant_id).filter((v): v is string => !!v))
  ).sort();

  const filtered = plans.filter((p) => {
    const q = (search || '').toLowerCase();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.plan_code || '').toLowerCase().includes(q) ||
      (p.country_code || '').toLowerCase().includes(q) ||
      (p.currency || '').toLowerCase().includes(q) ||
      (p.restaurant_id || '').toLowerCase().includes(q);
    const matchesCountry =
      countryFilter === 'all' || p.country_code === countryFilter;
    const matchesCurrency =
      currencyFilter === 'all' || p.currency === currencyFilter;
    const matchesRestaurant =
      restaurantFilter === 'all' || p.restaurant_id === restaurantFilter;
    return matchesSearch && matchesCountry && matchesCurrency && matchesRestaurant;
  });

  return (
    <div className="space-y-4">
      {/* Filters + Add */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by code, name, country, currency or rest ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white"
          />
        </div>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
        >
          <option value="all">All Countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
        >
          <option value="all">All Currencies</option>
          {currencies.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={restaurantFilter}
          onChange={(e) => setRestaurantFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
        >
          <option value="all">All Rest IDs</option>
          {restaurantIds.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Code
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
              {form.id ? 'Edit Plan Code' : 'Add Plan Code'}
            </h3>
            <button
              onClick={() => { setShowForm(false); setForm(emptyPlanForm); }}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Plan Name *</label>
              <input
                type="text"
                placeholder="e.g. Monthly Plan"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Duration (days) *</label>
              <input
                type="number"
                min="1"
                value={form.duration_days}
                onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Price *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Currency *</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white uppercase"
              >
                {currencyOptions().map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Country Code *</label>
              <select
                value={form.country_code}
                onChange={(e) => setForm({ ...form, country_code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white uppercase"
              >
                {countryOptions().map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Restaurant ID</label>
              <input
                type="text"
                placeholder="Leave empty for all restaurants"
                value={form.restaurant_id}
                onChange={(e) => setForm({ ...form, restaurant_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Active
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {form.id ? 'Update Plan' : 'Create Plan'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(emptyPlanForm); }}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Country</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rest ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loadingPlans ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto" />
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{p.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.duration_days} days</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {p.currency} {Number(p.price).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.currency}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{p.country_code}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {p.restaurant_id || 'All'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.is_active ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEdit(p)}
                          className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          className="p-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loadingPlans && filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">
            No plan codes found. Click &quot;Add Code&quot; to create one.
          </p>
        )}
      </div>
    </div>
  );
}
