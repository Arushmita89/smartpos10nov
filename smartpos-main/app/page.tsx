'use client';

import { useAuth } from '@/contexts/AuthContext';
import Dashboard from '@/app/features/dashboard/Dashboard';
import SubscriptionLocked from '@/components/subscription/SubscriptionLocked';
import Link from 'next/link';
import {
  Store,
  Check,
  ArrowRight,
  ShoppingCart,
  CreditCard,
  LayoutGrid,
  BarChart3,
  Package,
  ClipboardList,
  Shield,
  Cloud,
  Zap,
  Users,
  Phone,
  Mail,
  MapPin,
  Lock,
  Facebook,
  Instagram,
  Linkedin,
  Menu,
  X,
} from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { CURRENCIES } from '@/app/features/owner/currencyData';

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/about' },
  { label: 'Products & Services', href: '/products-and-services' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Features', href: '/#features' },
  { label: 'Contact Us', href: '/contact' },
];

const featureCards = [
  {
    icon: ShoppingCart,
    title: 'Order Management',
    description:
      'Manage dine-in, takeaway, and online orders from a single dashboard. Track order status in real time.',
  },
  {
    icon: CreditCard,
    title: 'Billing & Invoicing',
    description:
      'Generate accurate bills, apply taxes and discounts, and send digital receipts to customers.',
  },
  {
    icon: LayoutGrid,
    title: 'Table Management',
    description:
      'Manage table layouts, capacity, and reservations. Assign tables and track occupancy in real time.',
  },
  {
    icon: ClipboardList,
    title: 'Menu Management',
    description:
      'Add categories, items, variants, and update prices. Keep your menu organised and always up to date.',
  },
  {
    icon: Package,
    title: 'Inventory Control',
    description:
      'Track stock levels, set low-stock alerts, and reduce food wastage with real-time inventory tracking.',
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    description:
      'Access real-time sales reports, revenue insights, and business analytics to grow your restaurant.',
  },
];

const monthlyChecks = [
  'All Core Features',
  'Cloud Access',
  'Regular Updates',
  'Email Support',
];

const annualChecks = [
  'All Core Features',
  'Cloud Access',
  'Priority Support',
  'Regular Updates',
  'Free Setup Assistance',
];

interface LandingPricing {
  country: string;
  currency: string;
  locale: string;
  monthly: number;
  annual: number;
  note: string | null;
}

function formatPlanPrice(amount: number, locale: string, currency: string) {
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

export default function Home() {
  const { restaurant, subscription, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('/');
  const [pricing, setPricing] = useState<LandingPricing | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const setSectionRef = useCallback((id: string) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  }, []);

  useEffect(() => {
    const sections = Object.entries(sectionRefs.current).filter(([, el]) => el);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-section');
            if (id) setActiveSection(id);
          }
        });
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );

    sections.forEach(([, el]) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [restaurant, subscription, loading]);

  useEffect(() => {
    fetch('/api/landing-plans')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.monthly === 'number' && typeof data.annual === 'number') {
          setPricing(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const currency = e.target.value;
    setPricing(null);
    fetch(`/api/landing-plans?currency=${currency}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.monthly === 'number' && typeof data.annual === 'number') {
          setPricing(data);
        }
      })
      .catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Store className="h-8 w-8 text-white" />
          </div>
          <p className="text-gray-500 font-medium">Loading SmartPOS...</p>
        </div>
      </div>
    );
  }

  if (restaurant) {
    if (!subscription) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
              <Store className="h-8 w-8 text-white" />
            </div>
            <p className="text-gray-500 font-medium">Loading SmartPOS...</p>
          </div>
        </div>
      );
    }
    if (subscription.isLocked) {
      return <SubscriptionLocked />;
    }
    return <Dashboard />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* ========== NAVBAR ========== */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 border-2 border-blue-600 rounded-xl flex items-center justify-center">
              <Store className="h-5 w-5 text-blue-600" />
            </div>
            <div className="leading-tight">
              <span className="text-lg font-bold">
                <span className="text-[#0B1B3A]">Smart</span>
                <span className="text-[#1E5FE8]">POS</span>
              </span>
              <p className="text-[10px] text-gray-400 -mt-0.5">Restaurant Management System</p>
            </div>
          </Link>

          {/* Center Nav Links (hidden on mobile) */}
          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => {
              const isActive = activeSection === link.href;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`text-sm font-medium transition-colors pb-0.5 ${
                    isActive
                      ? 'text-[#1E5FE8] border-b-2 border-[#1E5FE8]'
                      : 'text-gray-600 hover:text-gray-900 border-b-2 border-transparent'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right CTA */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden sm:inline-flex text-sm font-medium border border-[#1E5FE8] text-[#1E5FE8] px-5 py-2 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Login
            </Link>
            <Link
              href="/login?tab=signup"
              className="text-sm font-medium bg-[#1E5FE8] text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Get Started
            </Link>
            {/* Mobile menu toggle */}
            <button
              className="lg:hidden p-1 text-gray-600"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block text-sm font-medium ${
                  activeSection === link.href ? 'text-[#1E5FE8]' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-[#1E5FE8]"
            >
              Login
            </Link>
          </div>
        )}
      </nav>

      {/* ========== HERO SECTION ========== */}
      <section data-section="/" ref={setSectionRef('/')} className="bg-[#EBF3FE]">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-16 lg:py-24 flex flex-col lg:flex-row items-center gap-12">
          {/* Left content */}
          <div className="flex-1 text-center lg:text-left">
            {/* Pill badge */}
            <span className="inline-block bg-[#D6E6FF] text-[#1E5FE8] text-xs font-semibold uppercase tracking-wider px-4 py-1.5 rounded-full mb-6">
              Restaurant Management Software
            </span>

            {/* Headline */}
            <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-6">
              <span className="text-[#0B1B3A]">Simplify Operations.</span>
              <br />
              <span className="text-[#1E5FE8]">Grow Your Restaurant.</span>
            </h1>

            {/* Subtext */}
            <p className="text-gray-500 text-base lg:text-lg leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
              SmartPOS is an easy-to-use restaurant management software that handles orders, billing,
              inventory, table management, and business reports — all in one place.
            </p>

            {/* Mini features row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                { icon: Zap, label: 'Easy to Use', sub: 'Simple and intuitive interface' },
                { icon: LayoutGrid, label: 'All in One', sub: 'Everything you need in one system' },
                { icon: Cloud, label: 'Cloud Based', sub: 'Access your business anytime, anywhere' },
                { icon: Shield, label: 'Secure', sub: 'Your data is safe and protected' },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className="w-12 h-12 mx-auto border-2 border-[#1E5FE8] rounded-full flex items-center justify-center mb-2">
                    <item.icon className="h-5 w-5 text-[#1E5FE8]" />
                  </div>
                  <p className="text-sm font-semibold text-[#0B1B3A]">{item.label}</p>
                  <p className="text-xs text-gray-400 leading-snug">{item.sub}</p>
                </div>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
              <a
                href="#pricing"
                className="bg-[#1E5FE8] text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
              >
                View Plans & Pricing <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                href="/login"
                className="border-2 border-[#1E5FE8] text-[#1E5FE8] px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
              >
                Login to SmartPOS
              </Link>
            </div>
          </div>

          {/* Right graphic — product images */}
          <div className="flex-1 relative flex items-center justify-center min-h-[340px]">
            <img
              src="/1.png"
              alt="SmartPOS Dashboard"
              className="w-full max-w-[420px] rounded-xl shadow-2xl"
            />
            <img
              src="/2.png"
              alt="SmartPOS Mobile App"
              className="absolute -bottom-4 right-0 lg:right-4 w-[120px] lg:w-[160px] rounded-xl shadow-2xl border-4 border-white"
            />
          </div>
        </div>
      </section>

      {/* ========== FEATURES SECTION ========== */}
      <section id="features" data-section="/#features" ref={setSectionRef('/#features')} className="py-20 bg-[#F6F9FC]">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6">
          <h2 className="text-3xl lg:text-4xl font-bold text-[#0B1B3A] text-center mb-3">
            Powerful Features for Your Restaurant
          </h2>
          <p className="text-gray-500 text-center mb-14 max-w-xl mx-auto">
            Everything you need to run your restaurant smoothly.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {featureCards.map((card) => (
              <div
                key={card.title}
                className="bg-white rounded-xl p-7 border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-[#EBF3FE] rounded-xl flex items-center justify-center mb-4">
                  <card.icon className="h-6 w-6 text-[#1E5FE8]" />
                </div>
                <h3 className="text-lg font-semibold text-[#0B1B3A] mb-2">{card.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== PRICING SECTION ========== */}
      <section id="pricing" data-section="/#pricing" ref={setSectionRef('/#pricing')} className="py-20 bg-white">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6">
          <h2 className="text-3xl lg:text-4xl font-bold text-[#0B1B3A] text-center mb-3">
            Simple &amp; Affordable Pricing
          </h2>
          <p className="text-gray-500 text-center mb-8 max-w-xl mx-auto">
            Choose the plan that works best for your restaurant.
          </p>

          <div className="flex justify-center mb-8">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">Currency:</span>
              <select
                value={pricing?.currency || 'USD'}
                onChange={handleCurrencyChange}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-[#0B1B3A] bg-white focus:outline-none focus:ring-2 focus:ring-[#1E5FE8] focus:border-[#1E5FE8] cursor-pointer"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Monthly */}
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 relative">
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Monthly Plan
              </p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold text-[#0B1B3A]">
                  {pricing
                    ? formatPlanPrice(pricing.monthly, pricing.locale, pricing.currency)
                    : '$49'}
                </span>
                <span className="text-gray-400">/month</span>
              </div>
              <p className="text-sm text-gray-400 mb-6">
                Ideal for small and medium restaurants.
              </p>
              <ul className="space-y-3 mb-8">
                {monthlyChecks.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-[#1E5FE8] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/login?tab=signup"
                className="block w-full border-2 border-[#1E5FE8] text-[#1E5FE8] py-3 rounded-lg font-semibold text-center hover:bg-blue-50 transition-colors"
              >
                Get Started - Monthly
              </Link>
            </div>

            {/* Annual */}
            <div className="bg-white border-2 border-[#1BA352] rounded-2xl p-8 relative">
              {/* Popular badge */}
              <span className="absolute -top-3.5 right-6 bg-[#1BA352] text-white text-xs font-semibold px-4 py-1 rounded-full">
                Popular
              </span>
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">
                Annual Plan
              </p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold text-[#0B1B3A]">
                  {pricing
                    ? formatPlanPrice(pricing.annual, pricing.locale, pricing.currency)
                    : '$490'}
                </span>
                <span className="text-gray-400">/year</span>
              </div>
              <p className="text-sm text-gray-400 mb-6">
                Best value for growing restaurants.
              </p>
              <ul className="space-y-3 mb-8">
                {annualChecks.map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-[#1BA352] flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href="/login?tab=signup"
                className="block w-full bg-[#1BA352] text-white py-3 rounded-lg font-semibold text-center hover:bg-green-700 transition-colors"
              >
                Get Started - Annual
              </Link>
            </div>
          </div>

          {pricing?.note && (
            <p className="text-center text-xs text-gray-400 mt-4">{pricing.note}</p>
          )}

          <p className="text-center text-xs text-gray-400 mt-6">
            Subject to change according to restaurant size and number of tables. These charges are for up to a table number of 10.
          </p>

          <p className="text-center text-sm text-gray-400 mt-4">
            <Lock className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            Secure Payments &nbsp;|&nbsp; 100% Safe &amp; Encrypted
          </p>
        </div>
      </section>

      {/* ========== ABOUT US SECTION ========== */}
      <section id="about" data-section="/about" ref={setSectionRef('/about')} className="py-20 bg-[#F6F9FC]">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6">
          <div className="flex flex-col lg:flex-row items-start gap-12">
            {/* Left — icon + description */}
            <div className="flex-1">
              <div className="w-16 h-16 bg-[#EBF3FE] rounded-full flex items-center justify-center mb-6">
                <Users className="h-8 w-8 text-[#1E5FE8]" />
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-[#0B1B3A] mb-4">
                About SmartPOS
              </h2>
              <p className="text-gray-500 leading-relaxed">
                SmartPOS is a modern restaurant management software designed to help you streamline
                your operations, improve customer service, and increase profits. From order management
                to inventory tracking and detailed business reports, SmartPOS gives you everything
                you need to run your restaurant efficiently.
              </p>
            </div>

            {/* Right — merchant / legal info */}
            <div className="flex-1 w-full">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-[#1E5FE8] rounded-full flex items-center justify-center">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Operated by</p>
                    <p className="text-base font-bold text-[#1E5FE8]">
                      GAJANAN DATTATRAYA JOSHI
                    </p>
                    <p className="text-xs text-gray-400">Individual Merchant</p>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-600">
                      HILL GARDEN ROW HOUSE - 4, TIKUJINIWADI ROAD, OPPOSITE TIKUJINIWADI,
                      CHITALSAR MANPADA, THANE WEST, THANE, MAHARASHTRA - 400610
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <p className="text-sm text-gray-600">+91-9820504215</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <p className="text-sm text-gray-600">JOSHI_GD@YAHOO.COM</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== FOOTER (Dark Navy) ========== */}
      <footer className="bg-[#0B1B3A] text-white">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* Col 1 — Logo + tagline + socials */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 border-2 border-white rounded-lg flex items-center justify-center">
                  <Store className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold">
                  Smart<span className="text-[#6DA4FF]">POS</span>
                </span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-5">
                SmartPOS is a subscription-based restaurant management solution that helps
                restaurants manage their day-to-day operations efficiently.
              </p>
              <div className="flex items-center gap-3">
                <a
                  href="#"
                  className="w-9 h-9 rounded-full border border-gray-600 flex items-center justify-center hover:border-white transition-colors"
                >
                  <Facebook className="h-4 w-4 text-gray-400" />
                </a>
                <a
                  href="#"
                  className="w-9 h-9 rounded-full border border-gray-600 flex items-center justify-center hover:border-white transition-colors"
                >
                  <Instagram className="h-4 w-4 text-gray-400" />
                </a>
                <a
                  href="#"
                  className="w-9 h-9 rounded-full border border-gray-600 flex items-center justify-center hover:border-white transition-colors"
                >
                  <Linkedin className="h-4 w-4 text-gray-400" />
                </a>
              </div>
            </div>

            {/* Col 2 — Quick Links */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider mb-4">Quick Links</h4>
              <ul className="space-y-2.5">
                {[
                  { label: 'Home', href: '#' },
                  { label: 'About Us', href: '#about' },
                  { label: 'Products & Services', href: '#features' },
                  { label: 'Pricing', href: '#pricing' },
                  { label: 'Features', href: '#features' },
                  { label: 'Contact Us', href: '#about' },
                ].map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3 — Policies */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider mb-4">Policy</h4>
              <ul className="space-y-2.5">
                {[
                  { label: 'Privacy Policy', href: '/privacy-policy' },
                  { label: 'Refund Policy', href: '/return-refund-policy' },
                  { label: 'Cancellation Policy', href: '/cancellation-policy' },
                  { label: 'Shipping / Delivery Policy', href: '/shipping-policy' },
                  { label: 'Terms & Conditions', href: '/privacy-policy' },
                ].map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 4 — Contact */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider mb-4">Contact</h4>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-400">+91-9820504215</span>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-400">JOSHI_GD@YAHOO.COM</span>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-400">
                    Thane, Maharashtra, India
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-700/50">
          <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-5 text-center">
            <p className="text-sm text-gray-500">
              &copy; 2026 SmartPOS &bull; Operated by GAJANAN DATTATRAYA JOSHI. All Rights Reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
