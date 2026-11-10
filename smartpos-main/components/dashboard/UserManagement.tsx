'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth, AuthUser, UserRole, ROLE_LABELS } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  Users,
  UserPlus,
  Pencil,
  Power,
  X,
  Mail,
  Lock,
  User as UserIcon,
} from 'lucide-react';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'attendant', label: 'Table Attendant' },
  { value: 'rider', label: 'Delivery Rider' },
];

interface UserModalProps {
  title: string;
  initial?: AuthUser;
  submitLabel: string;
  isSelf: boolean;
  onSubmit: (data: {
    name: string;
    login_name: string;
    password?: string;
    role: UserRole;
    phone?: string | null;
    vehicle_number?: string | null;
    rider_status?: 'available' | 'busy' | 'offline' | null;
  }) => Promise<void>;
  onClose: () => void;
}

function UserModal({ title, initial, submitLabel, isSelf, onSubmit, onClose }: UserModalProps) {
  const [name, setName] = useState(initial?.name || '');
  const [loginName, setLoginName] = useState(initial?.login_name || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(initial?.role || 'attendant');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [vehicleNumber, setVehicleNumber] = useState(initial?.vehicle_number || '');
  const [riderStatus, setRiderStatus] = useState<'available' | 'busy' | 'offline'>(
    (initial?.rider_status as 'available' | 'busy' | 'offline') || 'offline'
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !loginName.trim()) {
      toast.error('Please fill in name and email');
      return;
    }
    if (!initial && (!password || password.length < 6)) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password && password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        login_name: loginName.trim(),
        password: password || undefined,
        role,
        phone: phone.trim() || null,
        vehicle_number: vehicleNumber.trim() || null,
        rider_status: role === 'rider' ? riderStatus : null,
      });
      toast.success(initial ? 'User updated successfully' : 'User added successfully');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <UserPlus className="h-6 w-6 text-blue-600 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Staff name"
                className={inputClass}
                required
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Email (Login ID)</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="email"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="staff@example.com"
                className={inputClass}
                required
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>
              {initial ? 'New Password (leave blank to keep)' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className={inputClass}
                required={!initial}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              disabled={isSelf}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm disabled:bg-gray-100 disabled:text-gray-500"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {isSelf && (
              <p className="text-xs text-gray-400 mt-1.5">
                You cannot change your own role to avoid locking yourself out.
              </p>
            )}
          </div>
          {role === 'rider' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Rider phone number"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className={labelClass}>Vehicle Number</label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="e.g. DL 01 AB 1234"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Availability</label>
                <select
                  value={riderStatus}
                  onChange={(e) =>
                    setRiderStatus(e.target.value as 'available' | 'busy' | 'offline')
                  }
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                >
                  <option value="available">Available</option>
                  <option value="busy">On delivery (offline)</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {submitting ? 'Saving...' : submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const { restaurant, user: currentUser, addUser, updateUser, toggleUserActive } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AuthUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    if (!restaurant?.restaurant_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('restaurant_id', restaurant.restaurant_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers((data as AuthUser[]) || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.restaurant_id]);

  const handleToggleActive = async (u: AuthUser) => {
    if (currentUser && u.id === currentUser.id) {
      toast.error('You cannot deactivate your own account');
      return;
    }
    setTogglingId(u.id);
    try {
      await toggleUserActive(u.id, !u.active);
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, active: !u.active } : x))
      );
      toast.success(u.active ? 'User deactivated' : 'User activated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setTogglingId(null);
    }
  };

  const roleBadgeClass: Record<UserRole, string> = {
    admin: 'bg-purple-100 text-purple-800',
    kitchen: 'bg-orange-100 text-orange-800',
    attendant: 'bg-blue-100 text-blue-800',
    rider: 'bg-green-100 text-green-800',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Users</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage login access for your restaurant staff.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors flex items-center font-medium text-sm"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Add User
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center pb-2 border-b border-gray-100">
          <Users className="h-4 w-4 mr-2 text-blue-600" />
          Staff Accounts ({users.length})
        </h3>

        {loading ? (
          <p className="text-gray-500 text-sm py-8 text-center">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">
            No users yet. Add your first staff member to give them login access.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-3 pr-4 font-medium">Name</th>
                  <th className="pb-3 pr-4 font-medium">Login Email</th>
                  <th className="pb-3 pr-4 font-medium">Role</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = currentUser ? u.id === currentUser.id : false;
                  return (
                    <tr key={u.id} className="border-b border-gray-50">
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        {u.name}
                        {isSelf && (
                          <span className="ml-2 text-xs text-gray-400">(You)</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">{u.login_name}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            roleBadgeClass[u.role as UserRole] || roleBadgeClass.attendant
                          }`}
                        >
                          {ROLE_LABELS[u.role as UserRole] || u.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            u.active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => setEditing(u)}
                            className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors"
                            title="Edit user"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={togglingId === u.id}
                            className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                              u.active
                                ? 'text-red-500 hover:bg-red-50'
                                : 'text-green-600 hover:bg-green-50'
                            }`}
                            title={u.active ? 'Deactivate user' : 'Activate user'}
                          >
                            <Power className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Roles:</strong> Admin has full access to all features including user
          management. Kitchen can only view and update orders in Kitchen Mode. Table
          Attendants can take orders (POS, Quick Order, Order Status) but cannot manage
          the menu, settings, or users. Delivery Riders only see their assigned deliveries
          in Rider Mode.
        </p>
      </div>

      {showAdd && (
        <UserModal
          title="Add User"
          submitLabel="Add User"
          isSelf={false}
          onClose={() => setShowAdd(false)}
          onSubmit={async (data) => {
            await addUser({
              name: data.name,
              login_name: data.login_name,
              password: data.password,
              role: data.role,
              phone: data.phone,
              vehicle_number: data.vehicle_number,
              rider_status: data.rider_status,
            });
            await fetchUsers();
          }}
        />
      )}

      {editing && (
        <UserModal
          title="Edit User"
          initial={editing}
          submitLabel="Save Changes"
          isSelf={currentUser ? editing.id === currentUser.id : false}
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            await updateUser(editing.id, data);
            setEditing(null);
            await fetchUsers();
          }}
        />
      )}
    </div>
  );
}
