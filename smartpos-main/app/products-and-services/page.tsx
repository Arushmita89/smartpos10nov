'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Store, Check } from 'lucide-react';

interface LandingPricing {
  currency: string;
  locale: string;
  monthly: number;
  annual: number;
}

function formatPrice(amount: number, locale: string, currency: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString('en')}`;
  }
}

export default function ProductsAndServicesPage() {
  const [pricing, setPricing] = useState<LandingPricing | null>(null);

  useEffect(() => {
    fetch('/api/landing-plans?currency=INR')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (
          data &&
          typeof data.monthly === 'number' &&
          typeof data.annual === 'number'
        ) {
          setPricing(data);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Store className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">SmartPOS</span>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Products &amp; Services</h1>

        <h2 className="text-xl font-semibold text-gray-900 mb-2">Restaurant Management Software</h2>
        <p className="text-gray-600 leading-relaxed mb-4">
          Our restaurant management software is a subscription-based solution designed to help
          restaurants manage their day-to-day operations.
        </p>

        <ul className="space-y-2 mb-6">
          {[
            'Restaurant order management',
            'Customer ordering',
            'Billing and order processing',
            'Restaurant operational management',
            'Customer management',
            'Sales and business reports',
            'Other restaurant management functions',
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>

        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-4">Subscription Plans</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Monthly Plan</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-gray-900">
                  {pricing
                    ? formatPrice(pricing.monthly, pricing.locale, pricing.currency)
                    : '\u2014'}
                </span>
                <span className="text-sm text-gray-500">/month</span>
              </div>
            </div>
            <div className="border border-green-200 bg-green-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">Annual Plan (Popular)</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-gray-900">
                  {pricing
                    ? formatPrice(pricing.annual, pricing.locale, pricing.currency)
                    : '\u2014'}
                </span>
                <span className="text-sm text-gray-500">/year</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">(Subject to change according to restaurant size and number of tables. These charges are for up to a table number of 10.)</p>
        </div>

        <p className="text-gray-600 leading-relaxed">
          Software access is provided electronically after successful payment and account activation.
        </p>
      </div>

      <footer className="bg-gray-900 py-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-400 mb-3">
            &copy; 2026 SmartPOS &bull; Operated by GAJANAN DATTATRAYA JOSHI
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <Link href="/about" className="hover:text-gray-300 transition-colors">About</Link>
            <span>&bull;</span>
            <Link href="/contact" className="hover:text-gray-300 transition-colors">Contact</Link>
            <span>&bull;</span>
            <Link href="/products-and-services" className="hover:text-gray-300 transition-colors">Products and Services</Link>
            <span>&bull;</span>
            <Link href="/privacy-policy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            <span>&bull;</span>
            <Link href="/return-refund-policy" className="hover:text-gray-300 transition-colors">Refund</Link>
            <span>&bull;</span>
            <Link href="/cancellation-policy" className="hover:text-gray-300 transition-colors">Cancellation</Link>
            <span>&bull;</span>
            <Link href="/shipping-policy" className="hover:text-gray-300 transition-colors">Shipping</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
