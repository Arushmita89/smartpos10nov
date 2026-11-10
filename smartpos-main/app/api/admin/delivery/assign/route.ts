import { NextRequest, NextResponse } from 'next/server';
import { assertOwner } from '@/app/api/admin/_auth';
import {
  assignRiderToOrder,
  getDeliveryServiceClient,
} from '@/lib/delivery/inhouse';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = await assertOwner(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const orderId = body.orderId || body.order_id || body.id;
    const riderId = body.riderId || body.rider_id;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId required' },
        { status: 400 }
      );
    }
    if (!riderId) {
      return NextResponse.json(
        { success: false, error: 'riderId required' },
        { status: 400 }
      );
    }

    const supabase = getDeliveryServiceClient();

    let restaurantId = body.restaurantId || body.restaurant_id || null;
    if (!restaurantId) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('restaurant_id')
        .eq('id', orderId)
        .maybeSingle();
      if (orderError) throw orderError;
      restaurantId = order?.restaurant_id || null;
    }

    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    const result = await assignRiderToOrder(supabase, {
      orderId,
      restaurantId,
      riderId,
      assignedBy: body.assignedBy || body.assigned_by,
      allowAnyRider: true,
      notifyRestaurant: true,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Admin delivery assignment error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
