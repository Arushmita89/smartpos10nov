import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Supabase service role credentials not configured');
  return createClient(url, serviceRoleKey, { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) } });
}

function verifyWebhook(req: NextRequest): boolean {
  const secret = process.env.SHADOWFAX_WEBHOOK_SECRET;
  if (!secret) return true;
  const headerName = process.env.SHADOWFAX_WEBHOOK_HEADER_NAME || 'x-shadowfax-signature';
  const sig = req.headers.get(headerName) || req.headers.get('authorization') || req.headers.get('x-api-key');
  if (!sig) return false;
  if (sig === secret || sig.replace('Bearer ', '') === secret || sig.replace('Token ', '') === secret) return true;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyWebhook(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const supabase = getServiceClient();

    const awb = body.awb_number || body.awb || body.data?.awb_number;
    const event = (body.event || body.status_id || body.status || '').toString().toLowerCase();

    if (!awb) return NextResponse.json({ message: 'ok' }, { status: 200 });

    let deliveryStatus: string | null = null;
    if (event.includes('assigned')) deliveryStatus = 'assigned';
    else if (event === 'ofd' || event.includes('out_for')) deliveryStatus = 'out_for_delivery';
    else if (event.includes('arrived')) deliveryStatus = 'arrived';
    else if (event === 'delivered') deliveryStatus = 'delivered';
    else if (event.includes('cancel')) deliveryStatus = 'cancelled';
    else if (event === 'nc' || event === 'na') deliveryStatus = 'failed';
    else if (event.includes('rts')) deliveryStatus = 'returned';

    const updates: any = { delivery_payload: body };
    if (deliveryStatus) updates.delivery_status = deliveryStatus;
    if (body.tracking_link) updates.delivery_tracking_url = body.tracking_link;

    const { data: order } = await supabase.from('orders').select('id, status').eq('delivery_awb', awb).maybeSingle();
    if (order) {
      await supabase.from('orders').update(updates).eq('id', order.id);
      if (deliveryStatus === 'delivered' && order.status !== 'completed' && order.status !== 'delivered') {
        await supabase.from('orders').update({ status: 'delivered' }).eq('id', order.id);
      }
    }

    return NextResponse.json({ message: 'ok' }, { status: 200 });
  } catch (e: any) {
    console.error('Shadowfax webhook error:', e);
    return NextResponse.json({ message: 'ok' }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Shadowfax webhook endpoint' }, { status: 200 });
}
