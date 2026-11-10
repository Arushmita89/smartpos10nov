import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { shadowfax } from '@/lib/delivery/shadowfax';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Supabase service role credentials not configured');
  return createClient(url, serviceRoleKey, { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = body.orderId || body.order_id || body.id;
    const restaurantId = body.restaurantId || body.restaurant_id;
    if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

    const supabase = getServiceClient();
    let order: any = null;
    let orderErr: any = null;
    
    // Try all methods
    const methods = [
      () => supabase.from('orders').select('*').eq('id', orderId).limit(1).maybeSingle(),
      () => supabase.from('orders').select('*').filter('id', 'eq', orderId).limit(1).maybeSingle(),
    ];
    if (restaurantId) {
      methods.push(() => supabase.from('orders').select('*').eq('id', orderId).eq('restaurant_id', restaurantId).maybeSingle());
    }
    
    for (const m of methods) {
      try {
        const r = await m();
        if (r.data) { order = r.data; orderErr = r.error; break; }
        if (r.error) orderErr = r.error;
      } catch (e: any) { orderErr = e; }
    }
    
    if (!order) {
      try {
        const r = await supabase.from('orders').select('id, restaurant_id').limit(10);
        console.log('Available orders:', r.data);
      } catch (e) {}
    }
    
    console.log('Book delivery lookup:', { orderId, restaurantId, found: !!order, err: orderErr?.message });
    if (!order) return NextResponse.json({ error: 'Order not found', details: orderErr?.message }, { status: 404 });
    const targetRestaurantId = order.restaurant_id || restaurantId;
    if (order.delivery_awb) return NextResponse.json({ success: true, awb_number: order.delivery_awb, alreadyBooked: true });

    const { data: param } = await supabase.from('parameters').select('*').eq('restaurant_id', targetRestaurantId).maybeSingle();

    const pickup = {
      name: param?.restaurant_name || 'Restaurant',
      phone: param?.phone_number || param?.contact_number || order.customer_phone || '9999999999',
      address_line_1: param?.address_line1 || param?.address || 'Address',
      address_line_2: param?.address_line2 || '',
      city: param?.city || 'Delhi',
      state: param?.state || 'Delhi',
      pincode: param?.pincode || '110001',
      latitude: param?.latitude || '',
      longitude: param?.longitude || '',
    };

    const paymentMode = order.payment_method === 'cash' ? 'COD' : 'Prepaid';
    const codAmount = paymentMode === 'COD' ? Number(order.total || 0) : 0;
    const clientOrderId = `ORD-${order.id}-${Date.now().toString().slice(-6)}`;

    const result = await shadowfax.createOrder({
      clientOrderId,
      orderId: order.id,
      restaurantId: targetRestaurantId,
      paymentMode,
      codAmount,
      productValue: Number(order.subtotal || order.total || 0),
      totalAmount: Number(order.total || 0),
      customer: {
        name: order.customer_name || 'Customer',
        phone: order.customer_phone || '9999999999',
        address_line_1: order.customer_address || 'Address',
        pincode: (order as any).customer_pincode || '110001',
        city: (order as any).customer_city || 'Delhi',
        state: (order as any).customer_state || 'Delhi',
      },
      pickup,
      items: Array.isArray(order.items) ? order.items.map((i: any) => ({ name: i.name, quantity: i.quantity, price: i.price })) : [],
      pickupReadyTime: Math.floor(Date.now() / 1000) + 60,
    });

    if (!result.success || !result.awb_number) {
      console.error('Shadowfax createOrder failed:', result.error, result.raw);
      await supabase.from('orders').update({ delivery_status: 'failed', delivery_error: result.error || 'Booking failed', delivery_partner: 'shadowfax' }).eq('id', orderId);
      return NextResponse.json({ error: result.error || 'Failed to book delivery', details: result.raw }, { status: 500 });
    }

    await supabase.from('orders').update({
      delivery_partner: 'shadowfax',
      delivery_status: 'assigned',
      delivery_awb: result.awb_number,
      delivery_tracking_url: result.tracking_link || null,
      delivery_job_id: result.awb_number,
      delivery_payload: result.raw || {},
      delivery_booked_at: new Date().toISOString(),
      delivery_error: null,
    }).eq('id', orderId);

    return NextResponse.json({ success: true, awb_number: result.awb_number, tracking_link: result.tracking_link });
  } catch (e: any) {
    console.error('Shadowfax book error:', e);
    return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
  }
}
