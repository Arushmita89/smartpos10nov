// Server-only helpers for the Customer Promotion Module.
// Do NOT import this from client components (it pulls in nodemailer).

import nodemailer from 'nodemailer';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CampaignRecipient {
  customer_id?: number | null;
  name?: string | null;
  recipient: string;
}

export interface DispatchCampaignInput {
  campaignId: number;
  recipients: CampaignRecipient[];
}

export interface DispatchResult {
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

const MAX_RECIPIENTS = 5000;

export async function dispatchCampaign(
  admin: SupabaseClient,
  input: DispatchCampaignInput
): Promise<DispatchResult> {
  const { campaignId } = input;
  const recipients = (input.recipients || []).slice(0, MAX_RECIPIENTS);

  const { data: campaign, error: campaignErr } = await admin
    .from('campaigns')
    .select('id, restaurant_id, name, channel, subject, message, coupon_id, status')
    .eq('id', campaignId)
    .maybeSingle();

  if (campaignErr || !campaign) {
    throw new Error(campaignErr?.message || 'Campaign not found');
  }

  const channel = campaign.channel as 'sms' | 'whatsapp' | 'email';
  const result: DispatchResult = { sent: 0, failed: 0, skipped: 0, errors: [] };
  const nowIso = new Date().toISOString();

  if (recipients.length === 0) {
    await admin
      .from('campaigns')
      .update({
        status: 'sent',
        sent_at: nowIso,
        audience_count: 0,
        delivered_count: 0,
        updated_at: nowIso,
      })
      .eq('id', campaignId);
    return result;
  }

  const deliveryRows: {
    campaign_id: number;
    restaurant_id: string;
    customer_id?: number | null;
    customer_name?: string | null;
    recipient: string;
    channel: string;
    status: string;
    error?: string | null;
    message: string;
    sent_at?: string | null;
  }[] = [];

  if (channel === 'email') {
    const transporter = buildMailer();
    for (const r of recipients) {
      if (!transporter) {
        result.failed++;
        deliveryRows.push({
          campaign_id: campaignId,
          restaurant_id: campaign.restaurant_id,
          customer_id: r.customer_id ?? null,
          customer_name: r.name ?? null,
          recipient: r.recipient,
          channel,
          status: 'failed',
          error: 'SMTP credentials not configured',
          message: campaign.message,
          sent_at: null,
        });
        if (result.errors.length < 5) result.errors.push('SMTP credentials not configured');
        continue;
      }
      try {
        await transporter.sendMail({
          from: `"SmartPOS" <${process.env.SMTP_USER}>`,
          to: r.recipient,
          subject: campaign.subject || campaign.name,
          text: campaign.message,
        });
        result.sent++;
        deliveryRows.push({
          campaign_id: campaignId,
          restaurant_id: campaign.restaurant_id,
          customer_id: r.customer_id ?? null,
          customer_name: r.name ?? null,
          recipient: r.recipient,
          channel,
          status: 'sent',
          error: null,
          message: campaign.message,
          sent_at: nowIso,
        });
      } catch (err: any) {
        result.failed++;
        const message = err?.message || 'Email send failed';
        deliveryRows.push({
          campaign_id: campaignId,
          restaurant_id: campaign.restaurant_id,
          customer_id: r.customer_id ?? null,
          customer_name: r.name ?? null,
          recipient: r.recipient,
          channel,
          status: 'failed',
          error: message,
          message: campaign.message,
          sent_at: null,
        });
        if (result.errors.length < 5) result.errors.push(message);
      }
    }
  } else {
    // sms / whatsapp — dispatch through a generic provider webhook when configured.
    // Costs for third-party messaging are expected to be passed through to the
    // restaurant based on actual usage.
    const providerUrl = process.env.SMS_PROVIDER_URL;
    const providerKey = process.env.SMS_API_KEY;

    for (const r of recipients) {
      if (!providerUrl) {
        result.failed++;
        deliveryRows.push({
          campaign_id: campaignId,
          restaurant_id: campaign.restaurant_id,
          customer_id: r.customer_id ?? null,
          customer_name: r.name ?? null,
          recipient: r.recipient,
          channel,
          status: 'failed',
          error: `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} provider not configured (set SMS_PROVIDER_URL)`,
          message: campaign.message,
          sent_at: null,
        });
        if (result.errors.length < 5) {
          result.errors.push(
            `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} provider not configured (set SMS_PROVIDER_URL)`
          );
        }
        continue;
      }
      try {
        const res = await fetch(providerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(providerKey ? { Authorization: `Bearer ${providerKey}` } : {}),
          },
          body: JSON.stringify({
            to: r.recipient,
            message: campaign.message,
            channel,
            restaurant_id: campaign.restaurant_id,
          }),
        });
        if (res.ok) {
          result.sent++;
          deliveryRows.push({
            campaign_id: campaignId,
            restaurant_id: campaign.restaurant_id,
            customer_id: r.customer_id ?? null,
            customer_name: r.name ?? null,
            recipient: r.recipient,
            channel,
            status: 'sent',
            error: null,
            message: campaign.message,
            sent_at: nowIso,
          });
        } else {
          const body = await res.text().catch(() => '');
          const message = `Provider responded ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`;
          result.failed++;
          deliveryRows.push({
            campaign_id: campaignId,
            restaurant_id: campaign.restaurant_id,
            customer_id: r.customer_id ?? null,
            customer_name: r.name ?? null,
            recipient: r.recipient,
            channel,
            status: 'failed',
            error: message,
            message: campaign.message,
            sent_at: null,
          });
          if (result.errors.length < 5) result.errors.push(message);
        }
      } catch (err: any) {
        const message = err?.message || 'Provider request failed';
        result.failed++;
        deliveryRows.push({
          campaign_id: campaignId,
          restaurant_id: campaign.restaurant_id,
          customer_id: r.customer_id ?? null,
          customer_name: r.name ?? null,
          recipient: r.recipient,
          channel,
          status: 'failed',
          error: message,
          message: campaign.message,
          sent_at: null,
        });
        if (result.errors.length < 5) result.errors.push(message);
      }
    }
  }

  // Deliveries are capped per insert batch to stay well under payload limits
  for (let i = 0; i < deliveryRows.length; i += 200) {
    const batch = deliveryRows.slice(i, i + 200);
    const { error } = await admin.from('campaign_deliveries').insert(batch);
    if (error) {
      console.error('Failed to record campaign deliveries:', error);
    }
  }

  await admin
    .from('campaigns')
    .update({
      status: result.sent > 0 || result.failed > 0 ? 'sent' : 'failed',
      sent_at: nowIso,
      audience_count: recipients.length,
      delivered_count: result.sent,
      updated_at: nowIso,
    })
    .eq('id', campaignId);

  return result;
}

function buildMailer() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}
