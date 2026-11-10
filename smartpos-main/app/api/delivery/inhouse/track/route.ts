import { NextRequest, NextResponse } from 'next/server';
import { getDeliveryServiceClient } from '@/lib/delivery/inhouse';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }

    const supabase = getDeliveryServiceClient();

    const { data: assignment } = await supabase
      .from('delivery_assignments')
      .select('*, rider:users(id, name, phone, vehicle_number)')
      .eq('order_id', orderId)
      .maybeSingle();

    const { data: location } = await supabase
      .from('rider_locations')
      .select('latitude, longitude, accuracy, recorded_at')
      .eq('order_id', orderId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ assignment, location });
  } catch (e: any) {
    console.error('In-house tracking error:', e);
    return NextResponse.json(
      { error: e.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
