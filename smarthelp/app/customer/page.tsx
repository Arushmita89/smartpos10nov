'use client';

import Link from 'next/link';
import { CalendarDays, CreditCard, Headphones, Star, User } from 'lucide-react';
import AuthGuard from '@/components/auth/AuthGuard';
import RoleShell from '@/components/auth/RoleShell';
import { useAuth } from '@/contexts/AuthContext';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900 tabular-nums">{value}</p>
    </div>
  );
}

export default function CustomerHome() {
  const { customer } = useAuth();

  return (
    <AuthGuard role="customer">
      <RoleShell role="customer" eyebrow="Customer" title="Your home services, in one place">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-gray-900">Book a service</h2>
              <p className="mt-1 text-sm text-gray-600">
                Browse verified professionals, see the price before you confirm, and pick a slot that
                suits you.
              </p>
              <button
                type="button"
                disabled
                className="mt-4 inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg opacity-60 cursor-not-allowed"
                title="Arrives in Phase 1"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Browse services
              </button>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-gray-900">Your bookings</h2>
              <p className="mt-1 text-sm text-gray-600">
                No bookings yet. Your upcoming and past jobs will appear here.
              </p>
            </section>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Total bookings" value={customer?.total_bookings ?? 0} />
              <Stat label="Completed" value={customer?.completed_bookings ?? 0} />
            </div>

            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-gray-900">Your referral code</h2>
              <p className="mt-2 font-mono text-lg font-semibold text-blue-700">
                {customer?.referral_code ?? '—'}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Share it with a neighbour. When they complete a booking, you both get ₹100.
              </p>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl p-6">
              <h2 className="text-base font-semibold text-gray-900">Quick links</h2>
              <ul className="mt-3 space-y-1">
                {[
                  { href: '#', label: 'Wallet & refunds', icon: CreditCard },
                  { href: '#', label: 'Favourites', icon: Star },
                  { href: '#', label: 'Support', icon: Headphones },
                  { href: '#', label: 'Profile', icon: User },
                ].map(({ href, label, icon: Icon }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </RoleShell>
    </AuthGuard>
  );
}
