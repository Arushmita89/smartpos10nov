'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import CustomerMode from '@/app/features/customer-mode/CustomerMode';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { SearchX, Store } from 'lucide-react';

interface PublicRestaurant {
  restaurant_id: string;
  restaurant_name: string;
  currency?: string | null;
  item_options?: string[] | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_line3?: string | null;
  phone?: string | null;
  delivery_mode?: string | null;
}

export default function PublicOrderPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const rawCode = (params?.code || '').toUpperCase().trim();

  const [restaurant, setRestaurant] = useState<PublicRestaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!rawCode) {
      router.replace('/order');
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      const { data, error } = await supabase
        .from('parameters')
        .select('restaurant_id, restaurant_name, currency, item_options, address_line1, address_line2, address_line3, phone, delivery_mode')
        .eq('restaurant_id', rawCode)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setRestaurant(data as PublicRestaurant);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [rawCode, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 shadow-sm px-4 py-3 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 border-2 border-[#1E5FE8] rounded-xl flex items-center justify-center">
              <Store className="h-5 w-5 text-[#1E5FE8]" />
            </div>
            <span className="text-lg font-bold">
              <span className="text-[#0B1B3A]">Smart</span>
              <span className="text-[#1E5FE8]">POS</span>
            </span>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <LoadingSpinner size="lg" />
          <p className="text-gray-500 font-medium mt-4">Loading menu...</p>
        </div>
        <footer className="bg-[#0B1B3A] text-white px-4 py-5 text-center">
          <p className="text-xs text-gray-400">Powered by ALTTASOFTWARE CONSULTANCY LLP</p>
        </footer>
      </div>
    );
  }

  if (notFound || !restaurant) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 shadow-sm px-4 py-3 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 border-2 border-[#1E5FE8] rounded-xl flex items-center justify-center">
              <Store className="h-5 w-5 text-[#1E5FE8]" />
            </div>
            <span className="text-lg font-bold">
              <span className="text-[#0B1B3A]">Smart</span>
              <span className="text-[#1E5FE8]">POS</span>
            </span>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 w-full max-w-md text-center">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-5 mx-auto">
              <SearchX className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Restaurant not found</h1>
            <p className="text-gray-500 text-sm mb-7">
              No restaurant matches the code &ldquo;{rawCode}&rdquo;. Please check the code and try
              again.
            </p>
            <Link
              href="/order"
              className="inline-flex items-center justify-center gap-2 w-full bg-[#1E5FE8] text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              <Store className="h-4 w-4" />
              Back to Code Entry
            </Link>
          </div>
        </div>
        <footer className="bg-[#0B1B3A] text-white px-4 py-5 text-center">
          <p className="text-xs text-gray-400">Powered by ALTTASOFTWARE CONSULTANCY LLP</p>
        </footer>
      </div>
    );
  }

  return (
    <CustomerMode
      restaurantProp={restaurant}
      customerMode
      onBack={() => router.push('/order')}
    />
  );
}