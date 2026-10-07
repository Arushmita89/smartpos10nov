import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { convertAmount } from '@/lib/currency';

export const dynamic = 'force-dynamic';

type PlanRow = {
  name: string;
  price: number | string;
  currency: string | null;
  duration_days: number;
  plan_code: string | null;
};

function findPlan(plans: PlanRow[], planCode: 'MONTHLY' | 'ANNUAL'): PlanRow | null {
  const byCode = plans.find(
    (p) => (p.plan_code || '').toUpperCase() === planCode
  );
  if (byCode) return byCode;
  return (
    plans.find((p) =>
      planCode === 'MONTHLY'
        ? Number(p.duration_days) <= 31
        : Number(p.duration_days) > 31
    ) || null
  );
}

export async function GET(req: NextRequest) {
  try {
    const requested = req.nextUrl.searchParams.get('currency')?.toUpperCase();
    const currencyCode = requested || 'USD';
    const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        fetch: (input: any, init?: any) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    });

    const { data, error } = await admin
      .from('subscription_plans')
      .select('name, price, currency, duration_days, plan_code')
      .eq('is_active', true)
      .is('restaurant_id', null);

    if (error) throw error;

    const plans = (data || []) as PlanRow[];
    const monthlyPlan = findPlan(plans, 'MONTHLY');
    const annualPlan = findPlan(plans, 'ANNUAL');

    if (!monthlyPlan || !annualPlan) {
      return NextResponse.json(
        { error: 'Plans not configured' },
        { status: 503 }
      );
    }

    const resolve = async (plan: PlanRow): Promise<number | null> => {
      const planCurrency = (plan.currency || 'INR').toUpperCase();
      const price = Number(plan.price);
      if (planCurrency === currencyCode) return price;
      return convertAmount(price, planCurrency, currencyCode);
    };

    const [monthly, annual] = await Promise.all([
      resolve(monthlyPlan),
      resolve(annualPlan),
    ]);

    if (monthly == null || annual == null) {
      return NextResponse.json(
        { error: 'Currency conversion unavailable' },
        { status: 503 }
      );
    }

    const converted =
      (monthlyPlan.currency || 'INR').toUpperCase() !== currencyCode;

    return NextResponse.json({
      country: currencyCode === 'INR' ? 'IN' : 'US',
      currency: currencyCode,
      locale,
      monthly: Math.round(monthly),
      annual: Math.round(annual),
      note: converted
        ? `Approx. ${currencyCode} price. Total billed in your local currency at checkout.`
        : null,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
