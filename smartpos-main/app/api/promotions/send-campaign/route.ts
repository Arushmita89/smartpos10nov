import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchCampaign, CampaignRecipient } from '@/lib/promotionsServer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const campaignId = Number(body.campaignId);
    const recipients = (body.recipients || []) as CampaignRecipient[];

    if (!campaignId || Number.isNaN(campaignId)) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }
    if (!Array.isArray(recipients)) {
      return NextResponse.json({ error: 'recipients must be an array' }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Service role key not configured' },
        { status: 500 }
      );
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
      global: {
        fetch: (input: any, init?: any) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    });

    const result = await dispatchCampaign(admin, { campaignId, recipients });

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
    });
  } catch (err: any) {
    console.error('Send campaign error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
