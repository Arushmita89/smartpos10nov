'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Bike,
  Check,
  CheckCircle,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserX,
  X,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AdminRider {
  id: string;
  restaurant_id: string | null;
  name: string;
  login_name: string;
  phone: string | null;
  vehicle_number: string | null;
  rider_status: string | null;
  active: boolean;
  approval_status: string | null;
  aadhaar_number: string | null;
  pan_number: string | null;
  driving_license_number: string | null;
  police_verification_number: string | null;
  documents_verified: boolean | null;
  documents_verified_at: string | null;
  documents_verified_by: string | null;
  documents?: {
    aadhaar: string | null;
    pan: string | null;
    driving_license: string | null;
    police_verification: string | null;
  };
  missing_documents?: string[];
  created_at: string;
}

const DOCUMENT_ROWS = [
  { key: 'aadhaar', numberKey: 'aadhaar_number', label: 'Aadhaar' },
  { key: 'pan', numberKey: 'pan_number', label: 'PAN' },
  {
    key: 'driving_license',
    numberKey: 'driving_license_number',
    label: 'Driving license',
  },
  {
    key: 'police_verification',
    numberKey: 'police_verification_number',
    label: 'Police verification record',
  },
] as const;

type RiderFilter = 'pending' | 'approved' | 'all';

function approvalOf(rider: AdminRider): string {
  return rider.approval_status || 'approved';
}

function statusBadge(rider: AdminRider) {
  const approval = approvalOf(rider);
  if (approval === 'pending') {
    return {
      label: 'Pending approval',
      className: 'bg-amber-100 text-amber-800',
    };
  }
  if (approval === 'rejected') {
    return {
      label: 'Rejected',
      className: 'bg-red-100 text-red-800',
    };
  }
  if (!rider.active) {
    return { label: 'Deactivated', className: 'bg-gray-200 text-gray-700' };
  }
  if (rider.rider_status === 'available') {
    return { label: 'Online', className: 'bg-emerald-100 text-emerald-800' };
  }
  if (rider.rider_status === 'busy') {
    return { label: 'On delivery', className: 'bg-indigo-100 text-indigo-800' };
  }
  return { label: 'Offline', className: 'bg-gray-100 text-gray-700' };
}

export default function RidersPanel() {
  const { restaurant, user } = useAuth();
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    online: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RiderFilter>('pending');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const adminHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-login-name': user?.login_name || '',
      'x-restaurant-id': restaurant?.restaurant_id || '',
    }),
    [user?.login_name, restaurant?.restaurant_id]
  );

  const loadRiders = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const res = await fetch('/api/admin/riders', {
          headers: adminHeaders,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load riders');
        }
        setRiders(data.riders || []);
        setCounts(
          data.counts || { total: 0, pending: 0, approved: 0, online: 0 }
        );
        setError(null);
      } catch (err: any) {
        console.error('Error loading riders:', err);
        setError(err?.message || 'Failed to load riders');
        if (!silent) toast.error(err?.message || 'Failed to load riders');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [adminHeaders]
  );

  useEffect(() => {
    loadRiders();
    const interval = setInterval(() => loadRiders(true), 30000);
    return () => clearInterval(interval);
  }, [loadRiders]);

  const updateRider = async (rider: AdminRider, action: string) => {
    setUpdatingId(rider.id);
    try {
      const res = await fetch('/api/admin/riders', {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ id: rider.id, action }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update rider');
      }
      const messages: Record<string, string> = {
        approve: `${rider.name} approved`,
        reject: `${rider.name} rejected`,
        activate: `${rider.name} activated`,
        deactivate: `${rider.name} deactivated`,
        verify: `${rider.name} documents verified`,
        unverify: `${rider.name} documents marked unverified`,
      };
      toast.success(messages[action] || 'Rider updated');
      await loadRiders(true);
    } catch (err: any) {
      console.error('Error updating rider:', err);
      toast.error(err?.message || 'Failed to update rider');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredRiders = useMemo(() => {
    if (filter === 'pending') {
      return riders.filter((r) => approvalOf(r) === 'pending');
    }
    if (filter === 'approved') {
      return riders.filter((r) => approvalOf(r) === 'approved');
    }
    return riders;
  }, [riders, filter]);

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
          <h2 className="text-2xl font-bold text-gray-900">Riders</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Approve self-registered riders and manage the SmartPOS rider pool.
            Approved riders can go online from Rider Mode and receive
            deliveries across restaurants.
          </p>
        </div>
        <button
          onClick={() => loadRiders(true)}
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
            Pending approval
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.pending}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Approved
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.approved}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Bike className="h-4 w-4 text-emerald-600" />
            Online
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.online}
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CheckCircle className="h-4 w-4 text-purple-600" />
            Total riders
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {counts.total}
          </p>
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
            ['pending', `Pending (${counts.pending})`],
            ['approved', `Approved (${counts.approved})`],
            ['all', `All riders (${counts.total})`],
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

      {filteredRiders.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow">
          <Bike className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="font-medium text-gray-600">
            {filter === 'pending'
              ? 'No rider applications waiting for approval'
              : filter === 'approved'
              ? 'No approved riders yet'
              : 'No riders registered yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRiders.map((rider) => {
            const badge = statusBadge(rider);
            const approval = approvalOf(rider);
            const isUpdating = updatingId === rider.id;
            const missingDocs = rider.missing_documents || [];
            const documentsVerified = !!rider.documents_verified;
            const canApprove = documentsVerified && missingDocs.length === 0;
            return (
              <div
                key={rider.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-gray-900">
                        {rider.name}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                      <span className="inline-flex items-center">
                        <Mail className="mr-1 h-3.5 w-3.5 text-gray-400" />
                        {rider.login_name}
                      </span>
                      {rider.phone && (
                        <a
                          href={`tel:${rider.phone}`}
                          className="inline-flex items-center text-emerald-700 hover:underline"
                        >
                          <Phone className="mr-1 h-3.5 w-3.5" />
                          {rider.phone}
                        </a>
                      )}
                      {rider.vehicle_number && (
                        <span className="inline-flex items-center">
                          <Bike className="mr-1 h-3.5 w-3.5 text-gray-400" />
                          {rider.vehicle_number}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      Registered {new Date(rider.created_at).toLocaleString('en-IN')}
                    </p>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {DOCUMENT_ROWS.map((row) => {
                        const value = rider[row.numberKey];
                        const documentUrl = rider.documents?.[row.key];
                        return (
                          <div
                            key={row.key}
                            className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2"
                          >
                            <p className="text-xs font-medium text-gray-500">
                              {row.label}
                            </p>
                            <p className="mt-0.5 break-all font-mono text-xs text-gray-900">
                              {value || (
                                <span className="text-red-600">
                                  Not provided
                                </span>
                              )}
                            </p>
                            {documentUrl ? (
                              <a
                                href={documentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-flex items-center text-xs font-medium text-blue-600 hover:underline"
                              >
                                <FileText className="mr-1 h-3 w-3" />
                                View document
                                <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            ) : (
                              <p className="mt-1 text-xs text-red-600">
                                No document uploaded
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {documentsVerified ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          Documents verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                          <Clock className="mr-1 h-3 w-3" />
                          Documents not verified
                        </span>
                      )}
                      {rider.documents_verified_at && (
                        <span className="text-gray-500">
                          Verified{' '}
                          {new Date(
                            rider.documents_verified_at
                          ).toLocaleString('en-IN')}
                          {rider.documents_verified_by
                            ? ` by ${rider.documents_verified_by}`
                            : ''}
                        </span>
                      )}
                      {missingDocs.length > 0 && (
                        <span className="text-red-600">
                          Missing: {missingDocs.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!documentsVerified && missingDocs.length === 0 && (
                      <button
                        onClick={() => updateRider(rider, 'verify')}
                        disabled={isUpdating}
                        className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <ShieldCheck className="mr-1.5 h-4 w-4" />
                        Verify documents
                      </button>
                    )}
                    {documentsVerified && (
                      <button
                        onClick={() => updateRider(rider, 'unverify')}
                        disabled={isUpdating}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <X className="mr-1.5 h-4 w-4" />
                        Unverify
                      </button>
                    )}
                    {approval === 'pending' && (
                      <>
                        <button
                          onClick={() => updateRider(rider, 'approve')}
                          disabled={isUpdating || !canApprove}
                          title={
                            canApprove
                              ? undefined
                              : 'Verify all four documents before approving'
                          }
                          className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="mr-1.5 h-4 w-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => updateRider(rider, 'reject')}
                          disabled={isUpdating}
                          className="inline-flex items-center rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X className="mr-1.5 h-4 w-4" />
                          Reject
                        </button>
                      </>
                    )}

                    {approval === 'rejected' && (
                      <button
                        onClick={() => updateRider(rider, 'approve')}
                        disabled={isUpdating || !canApprove}
                        title={
                          canApprove
                            ? undefined
                            : 'Verify all four documents before approving'
                        }
                        className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check className="mr-1.5 h-4 w-4" />
                        Approve
                      </button>
                    )}

                    {approval === 'approved' && rider.active && (
                      <button
                        onClick={() => updateRider(rider, 'deactivate')}
                        disabled={isUpdating}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <UserX className="mr-1.5 h-4 w-4" />
                        Deactivate
                      </button>
                    )}

                    {approval === 'approved' && !rider.active && (
                      <button
                        onClick={() => updateRider(rider, 'activate')}
                        disabled={isUpdating}
                        className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <CheckCircle className="mr-1.5 h-4 w-4" />
                        Activate
                      </button>
                    )}

                    {isUpdating && (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    )}

                    {!canApprove && approval !== 'approved' && (
                      <p className="w-full text-right text-xs text-amber-700">
                        {missingDocs.length > 0
                          ? 'Rider has not uploaded all four documents.'
                          : 'Verify all four documents before approving.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Riders register themselves at <strong>/rider/register</strong> and
          submit Aadhaar, PAN, driving license, and police verification
          documents. Review the uploaded documents and mark them verified before
          approving. After approval they log in with the same email/password and
          toggle themselves online from Rider Mode. Only online riders appear in
          the Delivery Assignment tab.
        </p>
      </div>
    </div>
  );
}
