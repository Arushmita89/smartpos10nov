import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { dispatchCampaign } from '@/lib/promotionsServer';
import {
  BUILTIN_SEGMENTS,
  PromoCustomer,
  PromoOrder,
  buildCampaignMessage,
  buildRecipients,
  computeCustomerStats,
  computeSegmentMembers,
  findTrigger,
  isBirthdayToday,
} from '@/lib/promotions';

export const dynamic = 'force-dynamic';

// Daily worker for the Customer Promotion Module:
// 1. Sends scheduled campaigns whose scheduled_at has passed.
// 2. Runs daily automations (birthday, inactive, high-value) at most once per day.
// Protected by CRON_SECRET (same convention as subscription-notifications).

const DAILY_AUTOMATION_TRIGGERS = ['birthday', 'inactive', 'high_value'];

export async function GET(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth =
        req.headers.get('authorization')?.replace('Bearer ', '') ||
        req.headers.get('x-cron-secret') ||
        req.nextUrl.searchParams.get('secret') ||
        '';
      if (auth !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
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

    const scheduledSent = await sendDueScheduledCampaigns(admin);
    const automationsRun = await runDailyAutomations(admin);

    return NextResponse.json({
      success: true,
      scheduledSent,
      automationsRun,
    });
  } catch (err: any) {
    console.error('Promotion cron error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function sendDueScheduledCampaigns(admin: SupabaseClient): Promise<number> {
  const now = new Date().toISOString();
  const { data: due } = await admin
    .from('campaigns')
    .select('id, restaurant_id, segment_id, segment_key, channel')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(50);

  let sent = 0;
  for (const campaign of due || []) {
    try {
      const members = await resolveAudience(admin, campaign);
      const recipients = buildRecipients(members, campaign.channel);
      await dispatchCampaign(admin, {
        campaignId: campaign.id,
        recipients,
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send scheduled campaign ${campaign.id}:`, err);
      await admin
        .from('campaigns')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', campaign.id);
    }
  }
  return sent;
}

async function runDailyAutomations(admin: SupabaseClient): Promise<number> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: automations } = await admin
    .from('automations')
    .select('id, restaurant_id, trigger_type, channel, coupon_id, message, last_run_at')
    .eq('is_active', true)
    .in('trigger_type', DAILY_AUTOMATION_TRIGGERS);

  let run = 0;
  for (const automation of automations || []) {
    if (automation.last_run_at && new Date(automation.last_run_at) > new Date(dayAgo)) {
      continue;
    }

    try {
      const { data: params } = await admin
        .from('parameters')
        .select('restaurant_id, restaurant_name')
        .eq('restaurant_id', automation.restaurant_id)
        .maybeSingle();

      const members = await membersForTrigger(admin, automation.restaurant_id, automation.trigger_type);
      const coupon = automation.coupon_id
        ? (
            await admin
              .from('coupons')
              .select('*')
              .eq('id', automation.coupon_id)
              .maybeSingle()
          ).data
        : null;

      const message = buildCampaignMessage({
        template: automation.message,
        customerName: null,
        restaurantName: params?.restaurant_name || 'our restaurant',
        coupon,
        points: 0,
      });

      const { data: campaign, error: insertErr } = await admin
        .from('campaigns')
        .insert({
          restaurant_id: automation.restaurant_id,
          name: `${findTrigger(automation.trigger_type)?.name || 'Automation'} — daily run`,
          coupon_id: automation.coupon_id,
          channel: automation.channel,
          subject: findTrigger(automation.trigger_type)?.name || 'Offer',
          message,
          source: 'automation',
          trigger_type: automation.trigger_type,
          status: 'draft',
          audience_count: members.length,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      const recipients = buildRecipients(members, automation.channel);
      await dispatchCampaign(admin, { campaignId: campaign.id, recipients });

      await admin
        .from('automations')
        .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', automation.id);

      run++;
    } catch (err) {
      console.error(`Automation ${automation.trigger_type} failed for ${automation.restaurant_id}:`, err);
      await admin
        .from('automations')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', automation.id);
    }
  }
  return run;
}

async function resolveAudience(
  admin: SupabaseClient,
  campaign: { restaurant_id: string; segment_id: number | null; segment_key: string | null }
) {
  const { customers, orders } = await loadRestaurantData(admin, campaign.restaurant_id);

  let rules: Record<string, any> | null = null;
  if (campaign.segment_id) {
    const { data: segment } = await admin
      .from('customer_segments')
      .select('rules')
      .eq('id', campaign.segment_id)
      .maybeSingle();
    rules = segment?.rules || null;
  }

  const stats = computeCustomerStats(orders);
  const members = computeSegmentMembers({
    builtinKey: campaign.segment_key,
    rules,
    customers,
    stats,
  });
  return members;
}

async function membersForTrigger(
  admin: SupabaseClient,
  restaurantId: string,
  triggerType: string
) {
  const { customers, orders } = await loadRestaurantData(admin, restaurantId);
  const stats = computeCustomerStats(orders);

  if (triggerType === 'birthday') {
    const today = new Date();
    return customers
      .filter((c) => isBirthdayToday(c.birthday, today) && c.phone)
      .map((customer) => ({ customer, stats: stats.get(customer.phone) || {
        orderCount: 0, totalSpent: 0, lastOrderAt: null, itemNames: [], categories: [],
      }}));
  }

  const builtinKey =
    triggerType === 'inactive'
      ? 'inactive_30'
      : triggerType === 'high_value'
        ? 'high_value'
        : BUILTIN_SEGMENTS[0].key;

  return computeSegmentMembers({ builtinKey, customers, stats });
}

async function loadRestaurantData(admin: SupabaseClient, restaurantId: string) {
  const [customersRes, ordersRes, menuRes] = await Promise.all([
    admin.from('customers').select('*').eq('restaurant_id', restaurantId),
    admin
      .from('orders')
      .select('customer_phone, total, created_at, status, items')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(5000),
    admin.from('menu').select('name, category').eq('restaurant_id', restaurantId),
  ]);

  const itemNameToCategory = new Map<string, string>();
  for (const row of menuRes.data || []) {
    if (row.name) itemNameToCategory.set(String(row.name).toLowerCase(), row.category || '');
  }

  const customers = (customersRes.data || []) as unknown as PromoCustomer[];
  const orders = (ordersRes.data || []) as unknown as PromoOrder[];
  return { customers, orders, itemNameToCategory };
}
