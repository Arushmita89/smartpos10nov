import { NextRequest, NextResponse } from 'next/server';
import { assignRiderToOrder, getDeliveryServiceClient } from '@/lib/delivery/inhouse';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = body.orderId || body.order_id || body.id;
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId required' }, { status: 400 });
    }

    const supabase = getDeliveryServiceClient();
    const result = await assignRiderToOrder(supabase, {
      orderId,
      restaurantId: body.restaurantId || body.restaurant_id,
      riderId: body.riderId || body.rider_id,
      assignedBy: body.assignedBy || body.assigned_by,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e: any) {
    console.error('In-house rider assignment error:', e);
    return NextResponse.json(
      { success: false, error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ message: 'In-house rider assignment endpoint' }, { status: 200 });
}
