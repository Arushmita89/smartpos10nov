import { NextRequest, NextResponse } from 'next/server';
import { convertAmount } from '@/lib/currency';
import { currencyForCountry } from '@/app/features/owner/currencyData';

export const dynamic = 'force-dynamic';

const PLAN_PRICES: Record<string, number> = {
  monthly: 999,
  annual: 9999,
};

export async function GET(req: NextRequest) {
  try {
    const requested = req.nextUrl.searchParams
      .get('currency')
      ?.toUpperCase();
    const country =
      req.headers.get('x-vercel-ip-country')?.toUpperCase() || 'IN';
    const currencyCode = requested || currencyForCountry(country) || 'INR';
    const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';

    const monthly = await convertAmount(
      PLAN_PRICES.monthly,
      'INR',
      currencyCode
    );
    const annual = await convertAmount(PLAN_PRICES.annual, 'INR', currencyCode);

    if (monthly == null || annual == null) {
      return NextResponse.json({
        country,
        currency: 'INR',
        locale: 'en-IN',
        monthly: PLAN_PRICES.monthly,
        annual: PLAN_PRICES.annual,
        note: null,
      });
    }

    return NextResponse.json({
      country,
      currency: currencyCode,
      locale,
      monthly: Math.round(monthly),
      annual: Math.round(annual),
      note:
        currencyCode !== 'INR'
          ? `Approx. ${currencyCode} price. Total billed in INR at checkout.`
          : null,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}