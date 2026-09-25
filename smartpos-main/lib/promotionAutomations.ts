// Client-side event automations fired right after checkout
// (first visit, post purchase, loyalty milestone).

import { supabase } from './supabase';
import {
  CouponLike,
  buildCampaignMessage,
  crossedMilestone,
  earnPoints,
  findTrigger,
  recipientForChannel,
} from './promotions';
import type { LoyaltySettingsLike } from './promotions';

export interface EventAutomationInput {
  restaurantId: string;
  restaurantName: string;
  currency?: string;
  customer: { name: string; phone: string; email?: string | null };
  orderCountAfter: number;
  previousPointsBalance: number | null;
  finalPointsBalance: number | null;
  loyaltySettings: LoyaltySettingsLike | null;
  orderTotal: number;
}

type AutomationRow = {
  id: number;
  restaurant_id: string;
  trigger_type: string;
  channel: string;
  coupon_id: number | null;
  message: string;
  is_active: boolean;
};

/**
 * Fires any matching, enabled event automations for this order.
 * Intentionally fire-and-forget: promotion messaging must never block checkout.
 */
export async function runEventAutomations(input: EventAutomationInput): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('automations')
      .select('id, restaurant_id, trigger_type, channel, coupon_id, message, is_active')
      .eq('restaurant_id', input.restaurantId)
      .eq('is_active', true)
      .in('trigger_type', ['first_visit', 'post_purchase', 'loyalty_milestone']);

    if (error || !data || data.length === 0) return;

    const previous = input.previousPointsBalance ?? 0;
    const current = input.finalPointsBalance ?? 0;
    const milestone = crossedMilestone(previous, current);
    const earnedNow = earnPoints(input.loyaltySettings, input.orderTotal);

    const fired: AutomationRow[] = [];
    for (const automation of data as AutomationRow[]) {
      if (automation.trigger_type === 'first_visit' && input.orderCountAfter !== 1) continue;
      if (automation.trigger_type === 'post_purchase') {
        fired.push(automation);
        continue;
      }
      if (automation.trigger_type === 'loyalty_milestone' && milestone == null) continue;
      if (automation.trigger_type === 'loyalty_milestone' && earnedNow <= 0 && current <= previous) {
        continue;
      }
      fired.push(automation);
    }

    for (const automation of fired) {
      await fireOne(automation, input, milestone);
    }
  } catch (err) {
    console.error('Event automation failed:', err);
  }
}

async function fireOne(
  automation: AutomationRow,
  input: EventAutomationInput,
  milestone: number | null
): Promise<void> {
  const recipient = recipientForChannel(
    {
      id: 0,
      restaurant_id: input.restaurantId,
      name: input.customer.name,
      phone: input.customer.phone,
      email: input.customer.email || null,
      created_at: '',
    },
    automation.channel
  );
  if (!recipient) return;

  let coupon: CouponLike | null = null;
  if (automation.coupon_id) {
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', automation.coupon_id)
      .maybeSingle();
    coupon = (data as CouponLike) || null;
  }

  const pointsForMessage = milestone ?? earnPoints(input.loyaltySettings, input.orderTotal);

  const message = buildCampaignMessage({
    template: automation.message,
    customerName: input.customer.name,
    restaurantName: input.restaurantName,
    coupon,
    currency: input.currency,
    points: pointsForMessage,
  });

  const trigger = findTrigger(automation.trigger_type);
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .insert({
      restaurant_id: input.restaurantId,
      name: `${trigger?.name || 'Automation'} — ${automation.trigger_type}`,
      coupon_id: automation.coupon_id,
      channel: automation.channel,
      subject: trigger?.name || 'Offer',
      message,
      source: 'automation',
      trigger_type: automation.trigger_type,
      status: 'draft',
      audience_count: 1,
    })
    .select('id')
    .single();

  if (error || !campaign) {
    console.error('Failed to create automation campaign:', error);
    return;
  }

  try {
    const res = await fetch('/api/promotions/send-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaign.id,
        recipients: [{ customer_id: null, name: input.customer.name, recipient }],
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('Automation dispatch failed:', data.error || res.status);
    }
  } catch (err) {
    console.error('Automation dispatch error:', err);
  }
}
