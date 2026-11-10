'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, UserRole, ROLE_LABELS } from '@/contexts/AuthContext';
import CustomerMode from '@/components/customer/CustomerMode';
import KitchenMode from '@/components/kitchen/KitchenMode';
import RiderMode from '@/components/rider/RiderMode';
import RestaurantOrdering from '@/components/dashboard/RestaurantOrdering';
import OrderManagement from '@/components/dashboard/OrderManagement';
import Analytics from '@/components/dashboard/Analytics';
import RestaurantDashboard from '@/components/dashboard/RestaurantDashboard';
import MenuManagement from '@/components/dashboard/MenuManagement';
import InventoryManagement from '@/components/dashboard/InventoryManagement';
import CustomerManagement from '@/components/dashboard/CustomerManagement';
import PromotionManagement from '@/components/dashboard/PromotionManagement';
import UserManagement from '@/components/dashboard/UserManagement';
import MPINAuth from '@/components/auth/MPINAuth';
import NotificationBell from '@/components/subscription/NotificationBell';
import { usePOSStore } from '@/lib/store';
import { isOwner } from '@/lib/owner';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import {
  ShoppingCart,
  Store,
  Clock,
  Package,
  Users,
  BarChart3,
  Settings,
  User,
  LogOut,
  BookOpen,
  ChefHat,
  CreditCard,
  Shield,
  Tag,
  X,
  Megaphone,
} from 'lucide-react';

type RoleAccess = {
  sections: string[];
  customerMode: boolean;
  kitchenMode: boolean;
};

const ROLE_ACCESS: Record<UserRole, RoleAccess> = {
  admin: {
    sections: [
      'pos',
      'order-now',
      'order-status',
      'menu',
      'inventory',
      'customers',
      'promotions',
      'reports',
      'settings',
      'users',
    ],
    customerMode: true,
    kitchenMode: true,
  },
  kitchen: { sections: [], customerMode: false, kitchenMode: true },
  attendant: { sections: [], customerMode: true, kitchenMode: false },
  rider: { sections: [], customerMode: false, kitchenMode: false },
};

export default function Dashboard() {
  const { restaurant, user, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const ownerAccess = isOwner(user?.login_name);
  const [mode, setMode] = useState<'restaurant' | 'customer' | 'kitchen'>('restaurant');
  const [activeSection, setActiveSection] = useState('pos');
  const [showMPINAuth, setShowMPINAuth] = useState(false);
  const [isRestaurantModeAuthenticated, setIsRestaurantModeAuthenticated] =
    useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [criticalStockCount, setCriticalStockCount] = useState(0);

  useEffect(() => {
    const rid = restaurant?.restaurant_id;
    if (!rid) return;
    let cancelled = false;
    let isMounted = true;
    async function loadCriticalCount() {
      try {
        const { data, error } = await supabase
          .from('ingredients')
          .select('current_stock, critical_threshold')
          .eq('restaurant_id', rid);
        if (error || cancelled) return;
        const count = (data || []).filter((ing) => {
          const stock = Number(ing.current_stock || 0);
          if (stock <= 0) return true;
          return Number(ing.critical_threshold || 0) > 0 && stock <= Number(ing.critical_threshold);
        }).length;
        if (isMounted && !cancelled) setCriticalStockCount(count);
      } catch {
        /* ignore */
      }
    }
    loadCriticalCount();
    return () => {
      cancelled = true;
      isMounted = false;
    };
  }, [restaurant?.restaurant_id]);

  useEffect(() => {
    if (ownerAccess && activeSection !== 'owner-home') {
      setActiveSection('owner-home');
    }
  }, [ownerAccess, activeSection]);

  useEffect(() => {
    setIsRestaurantModeAuthenticated(true);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
    } catch (error) {
      toast.error('Error signing out');
    }
  };

  const handleRestaurantModeAccess = () => {
    setIsRestaurantModeAuthenticated(false);
    setMode('restaurant');
    if (isAdmin) {
      setShowMPINAuth(true);
    } else {
      setIsRestaurantModeAuthenticated(true);
    }
  };

  const handleCustomerModeAccess = () => {
    setIsRestaurantModeAuthenticated(false);
    usePOSStore.getState().refreshProducts();
    setMode('customer');
  };

  const handleKitchenModeAccess = () => {
    setMode('kitchen');
  };

  const handleMPINSuccess = () => {
    setIsRestaurantModeAuthenticated(true);
    setShowMPINAuth(false);
    setMode('restaurant');
    toast.success('Welcome to Restaurant Mode');
  };

  const handleMPINCancel = () => {
    setShowMPINAuth(false);
  };

  if (!restaurant && user?.role !== 'rider') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Restaurant not found
          </h2>
          <p className="text-gray-600 mb-4">
            Please contact support or try logging in again.
          </p>
          <button
            onClick={handleSignOut}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (user?.role === 'kitchen') {
    return (
      <div className="min-h-screen bg-gray-100">
        <KitchenMode onBack={handleSignOut} />
      </div>
    );
  }

  if (user?.role === 'attendant') {
    return (
      <div className="min-h-screen bg-gray-50">
        <CustomerMode showCustomerBranding onBack={handleSignOut} />
      </div>
    );
  }

  if (user?.role === 'rider') {
    return (
      <div className="min-h-screen bg-gray-50">
        <RiderMode onBack={handleSignOut} />
      </div>
    );
  }

  if (mode === 'customer') {
    return (
      <div className="min-h-screen bg-gray-50">
        <CustomerMode showCustomerBranding onBack={handleRestaurantModeAccess} />
      </div>
    );
  }

  if (mode === 'kitchen') {
    return (
      <div className="min-h-screen bg-gray-50">
        <KitchenMode
          onBack={() => {
            setMode('restaurant');
            setIsRestaurantModeAuthenticated(true);
          }}
        />
      </div>
    );
  }

  const allSidebarItems = [
    { id: 'pos', name: 'Point of Sale', icon: ShoppingCart },
    { id: 'order-now', name: 'Order Now', icon: Store },
    { id: 'order-status', name: 'Order Status', icon: Clock },
    { id: 'menu', name: 'Menu Management', icon: BookOpen },
    { id: 'inventory', name: 'Inventory', icon: Package },
    { id: 'customers', name: 'Customers', icon: Users },
    { id: 'promotions', name: 'Promotions', icon: Megaphone },
    { id: 'reports', name: 'Reports', icon: BarChart3 },
    { id: 'settings', name: 'Settings', icon: Settings },
    { id: 'users', name: 'Users', icon: User },
  ];

  const access = ownerAccess
    ? { sections: [], customerMode: false, kitchenMode: false }
    : ROLE_ACCESS[user?.role || 'admin'];
  const sidebarItems = allSidebarItems.filter((item) =>
    access.sections.includes(item.id)
  );

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 w-64 bg-blue-600 text-white flex flex-col z-40 transform transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 border-b border-blue-500 flex items-center justify-between">
          <div className="flex items-center">
            <Store className="h-8 w-8 mr-3" />
            <div>
              <h1 className="text-lg font-bold">{restaurant.restaurant_name}</h1>
              <p className="text-xs text-blue-200">SmartPOS</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-blue-200 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      setActiveSection(item.id);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors ${
                      activeSection === item.id
                        ? 'bg-blue-700 text-white'
                        : 'text-blue-100 hover:bg-blue-500 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5 mr-3 flex-shrink-0" />
                    {item.name}
                    {item.id === 'inventory' && criticalStockCount > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white min-w-[18px]">
                        {criticalStockCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-blue-500">
          <div className="mb-3">
            <p className="text-sm font-medium truncate">
              {user?.name || restaurant.restaurant_name}
            </p>
            <p className="text-xs text-blue-200">
              {ROLE_LABELS[user?.role || 'admin']}
            </p>
          </div>
          {!ownerAccess && (
            <button
              onClick={() => router.push('/subscription')}
              className="w-full flex items-center px-3 py-2 text-blue-100 hover:bg-blue-500 hover:text-white rounded-lg transition-colors text-sm"
            >
              <CreditCard className="h-4 w-4 mr-3" />
              Manage Subscription
            </button>
          )}
          {ownerAccess && (
            <button
              onClick={() => router.push('/admin')}
              className="w-full flex items-center px-3 py-2 text-blue-100 hover:bg-blue-500 hover:text-white rounded-lg transition-colors text-sm"
            >
              <Shield className="h-4 w-4 mr-3" />
              Admin Panel
            </button>
          )}
          {ownerAccess && (
            <button
              onClick={() => router.push('/owner/plans')}
              className="w-full flex items-center px-3 py-2 text-blue-100 hover:bg-blue-500 hover:text-white rounded-lg transition-colors text-sm"
            >
              <Tag className="h-4 w-4 mr-3" />
              Plan Value Change
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center px-3 py-2 text-blue-100 hover:bg-blue-500 hover:text-white rounded-lg transition-colors text-sm"
          >
            <LogOut className="h-4 w-4 mr-3" />
            Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white shadow-sm border-b h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {ownerAccess
                  ?               'Owner'
                  : sidebarItems.find((item) => item.id === activeSection)?.name || 'Point of Sale'}
              </h2>
              <p className="text-xs text-gray-500 hidden sm:block">
                {ownerAccess
                  ? 'Owner controls: admin panel and plan value management'
                  : 'Manage your restaurant operations'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {!ownerAccess && <NotificationBell />}
            {access.customerMode && (
              <button
                onClick={handleCustomerModeAccess}
                className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center text-sm font-medium"
              >
                <Users className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Customer Mode</span>
                <span className="sm:hidden">Customer</span>
              </button>
            )}
            {access.kitchenMode && (
              <button
                onClick={handleKitchenModeAccess}
                className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center text-sm font-medium"
              >
                <ChefHat className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Kitchen Mode</span>
                <span className="sm:hidden">Kitchen</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-auto bg-gray-100">
          {ownerAccess && activeSection === 'owner-home' && (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-2xl shadow p-8 mb-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Owner Panel</h3>
                <p className="text-gray-500 text-sm mt-1">
                  Manage the platform. No subscription is required for this account.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => router.push('/admin')}
                  className="bg-white rounded-2xl shadow p-6 text-left hover:shadow-lg transition-shadow"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-xl mb-3">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Admin Panel</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    See which restaurant has which subscription and manage those subscriptions.
                  </p>
                </button>
                <button
                  onClick={() => router.push('/owner/plans')}
                  className="bg-white rounded-2xl shadow p-6 text-left hover:shadow-lg transition-shadow"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-xl mb-3">
                    <Tag className="h-6 w-6 text-green-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900">Plan Value Change</h4>
                  <p className="text-sm text-gray-500 mt-1">
                    Create and update subscription plan codes and their prices and durations.
                  </p>
                </button>
              </div>
            </div>
          )}
          {activeSection === 'pos' && (
            <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Point of Sale</h3>
              <p className="text-gray-600 mb-4">
                Switch to Customer Mode to browse menu and place orders, or use Order Now for quick in-house orders.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleCustomerModeAccess}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center font-medium"
                >
                  <Users className="h-5 w-5 mr-2" />
                  Customer Mode
                </button>
                <button
                  onClick={() => setActiveSection('order-now')}
                  className="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center font-medium"
                >
                  <Store className="h-5 w-5 mr-2" />
                  Quick Order
                </button>
              </div>
            </div>
          )}
          {activeSection === 'order-now' && (
            <RestaurantOrdering
              restaurant={restaurant}
              onOrderComplete={() => {
                toast.success('Order completed successfully!');
              }}
            />
          )}
          {activeSection === 'order-status' && (
            <OrderManagement restaurant={restaurant} />
          )}
          {activeSection === 'menu' && <MenuManagement restaurant={restaurant} />}
          {activeSection === 'inventory' && <InventoryManagement restaurant={restaurant} />}
          {activeSection === 'customers' && <CustomerManagement restaurant={restaurant} />}
          {activeSection === 'promotions' && <PromotionManagement restaurant={restaurant} />}
          {activeSection === 'reports' && <Analytics restaurant={restaurant} />}
          {activeSection === 'settings' && (
            <RestaurantDashboard />
          )}
          {activeSection === 'users' && isAdmin && <UserManagement />}
        </main>
      </div>

      {showMPINAuth && (
        <MPINAuth
          onSuccess={handleMPINSuccess}
          onCancel={handleMPINCancel}
          expectedMpin={restaurant.mpin}
        />
      )}
    </div>
  );
}
