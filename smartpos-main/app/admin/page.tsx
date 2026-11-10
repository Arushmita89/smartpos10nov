'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { isOwner } from '@/lib/owner';
import PlanCodesManager from '@/app/features/owner/PlanCodesManager';
import DeliveryPanel from '@/components/admin/DeliveryPanel';
import RidersPanel from '@/components/admin/RidersPanel';
import RestaurantDetailsModal, {
  AdminUser,
  AdminPayment,
} from '@/components/admin/RestaurantDetailsModal';
import {
  Users,
  Search,
  Loader2,
  CheckCircle,
  Clock,
  IndianRupee,
  Shield,
  XCircle,
  Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';

function formatAdminPrice(amount: number | null, currency: string | null) {
  if (amount == null) return '';
  const code = currency || 'INR';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount}`;
  }
}

export default function AdminPage() {
  const { restaurant, user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<
    'users' | 'subscriptions' | 'payments' | 'delivery' | 'riders' | 'plans'
  >('users');
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const adminHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      'x-login-name': user?.login_name || '',
      'x-restaurant-id': restaurant?.restaurant_id || '',
    }),
    [user?.login_name, restaurant?.restaurant_id]
  );

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      router.replace('/');
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, paymentsRes] = await Promise.all([
        fetch('/api/admin/users', { headers: adminHeaders() }),
        fetch('/api/admin/payments', { headers: adminHeaders() }),
      ]);

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }
      if (paymentsRes.ok) {
        const paymentsData = await paymentsRes.json();
        setPayments(paymentsData);
        const revenue = paymentsData
          .filter((p: AdminPayment) => p.status === 'completed')
          .reduce((sum: number, p: AdminPayment) => sum + Number(p.amount), 0);
        setTotalRevenue(revenue);
      }
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [adminHeaders]);

  useEffect(() => {
    if (!authLoading && !restaurant) {
      router.replace('/');
      return;
    }
    if (!authLoading && restaurant) {
      loadData();
    }
  }, [authLoading, restaurant, router, loadData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (
      tab === 'users' ||
      tab === 'subscriptions' ||
      tab === 'payments' ||
      tab === 'delivery' ||
      tab === 'riders' ||
      tab === 'plans'
    ) {
      setActiveTab(tab);
    }
  }, []);

  // Temporarily disabled: Activate option
  // const handleActivate = async (restaurantId: string) => {
  //   try {
  //     const res = await fetch('/api/admin/activate', {
  //       method: 'PATCH',
  //       headers: adminHeaders(),
  //       body: JSON.stringify({ restaurantId, action: 'activate' }),
  //     });
  //     if (!res.ok) throw new Error('Failed to activate');
  //     toast.success('Subscription activated');
  //     loadData();
  //   } catch (err: any) {
  //     toast.error(err.message || 'Failed to activate');
  //   }
  // };

  const handleDeactivate = async (restaurantId: string) => {
    try {
      const res = await fetch('/api/admin/activate', {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ restaurantId, action: 'deactivate' }),
      });
      if (!res.ok) throw new Error('Failed to deactivate');
      toast.success('Subscription deactivated');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to deactivate');
    }
  };

  // Temporarily disabled: +30d (extend) option
  // const handleExtend = async (restaurantId: string, days: number) => {
  //   try {
  //     const res = await fetch('/api/admin/activate', {
  //       method: 'PATCH',
  //       headers: adminHeaders(),
  //       body: JSON.stringify({ restaurantId, action: 'extend', days }),
  //     });
  //     if (!res.ok) throw new Error('Failed to extend');
  //     toast.success(`Subscription extended by ${days} days`);
  //     loadData();
  //   } catch (err: any) {
  //     toast.error(err.message || 'Failed to extend');
  //   }
  // };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchTerm ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.restaurant_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.id || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || u.status === statusFilter;
    const matchesPlan = planFilter === 'all' || u.plan_name === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!restaurant) return null;

  if (!isOwner(user?.login_name)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center bg-white rounded-2xl shadow-2xl p-10 max-w-md">
          <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 text-sm mb-6">
            This is the owner&apos;s panel. You are not authorized to
            view this page.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Dashboard
            </button>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const trialUsers = users.filter((u) => u.status === 'trial');
  const activeUsers = users.filter((u) => u.status === 'active');
  const expiredUsers = users.filter((u) => u.status === 'expired');
  const noneUsers = users.filter((u) => u.status === 'none');

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7" />
            <h1 className="text-xl font-bold">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="text-sm text-blue-100 hover:text-white transition-colors"
            >
              Back to Dashboard
            </button>
            <button
              onClick={handleSignOut}
              className="text-sm text-blue-100 hover:text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-blue-600" />
              <p className="text-sm text-gray-500">Total Restaurants</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{users.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-gray-500">Trial</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{trialUsers.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <p className="text-sm text-gray-500">Active Subs</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{activeUsers.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="h-5 w-5 text-red-600" />
              <p className="text-sm text-gray-500">Expired</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{expiredUsers.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow p-5">
            <div className="flex items-center gap-2 mb-2">
              <IndianRupee className="h-5 w-5 text-green-600" />
              <p className="text-sm text-gray-500">Total Revenue</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ₹{totalRevenue.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {(['users', 'subscriptions', 'payments', 'delivery', 'riders', 'plans'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'plans' ? 'Plan Codes' : tab}
            </button>
          ))}
        </div>

        {/* Users & Subscriptions Tab */}
        {(activeTab === 'users' || activeTab === 'subscriptions') && (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Subscribed</option>
                <option value="trial">Trial Active</option>
                <option value="expired">Expired</option>
                <option value="none">No Access</option>
              </select>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              >
                <option value="all">All Plans</option>
                {Array.from(
                  new Set(users.map((u) => u.plan_name).filter(Boolean) as string[])
                ).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Restaurant</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subscription Ends</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trial Ends</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUsers.map((u) => {
                      const isTrialActive = u.trial_active;
                      const isSubActive = u.status === 'active';
                      return (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{u.full_name || u.restaurant_name || '—'}</p>
                            <p className="text-xs text-gray-400">{u.email || u.id}</p>
                            {u.restaurant_name && u.full_name && u.full_name !== u.restaurant_name && (
                              <p className="text-xs text-gray-400">{u.restaurant_name}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {u.phone || '—'}
                            <p className="text-xs text-gray-400">{u.gst_number || ''}</p>
                          </td>
                          <td className="px-4 py-3">
                            {isSubActive ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
                            ) : isTrialActive ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                Trial {u.trial_days_remaining}d left
                              </span>
                            ) : u.status === 'expired' ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Expired</span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">None</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-600">{u.plan_name || '—'}</p>
                            {u.plan_price != null && (
                              <p className="text-xs text-gray-400">
                                {formatAdminPrice(u.plan_price, u.currency)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {u.subscription_end
                              ? new Date(u.subscription_end).toLocaleDateString('en-IN')
                              : '—'}
                            {isSubActive && u.subscription_days_remaining <= 3 && (
                              <p className="text-xs font-medium text-red-500">
                                {u.subscription_days_remaining}d left
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {u.trial_end
                              ? new Date(u.trial_end).toLocaleDateString('en-IN')
                              : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button
                                onClick={() => setSelectedUser(u)}
                                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors inline-flex items-center gap-1"
                                title="View details"
                              >
                                <Eye className="h-3 w-3" /> Details
                              </button>
                              <button
                                onClick={() => handleDeactivate(u.id)}
                                className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                title="Deactivate"
                              >
                                Deactivate
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredUsers.length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">No users found.</p>
              )}
            </div>
          </>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{p.user_email || '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        ₹{Number(p.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            p.status === 'captured'
                              ? 'bg-green-100 text-green-700'
                              : p.status === 'failed'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(p.created_at).toLocaleDateString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {payments.length === 0 && (
              <p className="text-center text-gray-400 py-8 text-sm">No payments found.</p>
            )}
          </div>
        )}

        {/* Delivery Assignment Tab */}
        {activeTab === 'delivery' && <DeliveryPanel />}

        {/* Rider Approval & Management Tab */}
        {activeTab === 'riders' && <RidersPanel />}

        {/* Plan Codes Tab (merged owner panel: value change) */}
        {activeTab === 'plans' && <PlanCodesManager />}
      </div>

      {selectedUser && (
        <RestaurantDetailsModal
          user={selectedUser}
          payments={payments}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
