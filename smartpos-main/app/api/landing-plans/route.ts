import { NextRequest, NextResponse } from 'next/server';
import { convertAmount } from '@/lib/currency';

export const dynamic = 'force-dynamic';

const PLAN_PRICES: Record<string, Record<string, number>> = {
  monthly: { INR: 999, USD: 49 },
  annual: { INR: 9999, USD: 490 },
};

export async function GET(req: NextRequest) {
  try {
    const requested = req.nextUrl.searchParams
      .get('currency')
      ?.toUpperCase();
    const currencyCode = requested || 'USD';
    const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';

    const baseMonthly = PLAN_PRICES.monthly[currencyCode];
    const baseAnnual = PLAN_PRICES.annual[currencyCode];
    const isBase =
      baseMonthly != null && baseAnnual != null;

    let monthly: number | null = null;
    let annual: number | null = null;

    if (isBase) {
      monthly = baseMonthly!;
      annual = baseAnnual!;
    } else {
      monthly = await convertAmount(999, 'INR', currencyCode);
      annual = await convertAmount(9999, 'INR', currencyCode);
    }

    if (monthly == null || annual == null) {
      return NextResponse.json({
        country: 'US',
        currency: 'USD',
        locale: 'en-US',
        monthly: PLAN_PRICES.monthly.USD,
        annual: PLAN_PRICES.annual.USD,
        note: null,
      });
    }

    return NextResponse.json({
      country: 'US',
      currency: currencyCode,
      locale,
      monthly: Math.round(monthly),
      annual: Math.round(annual),
      note:
        currencyCode !== 'INR'
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