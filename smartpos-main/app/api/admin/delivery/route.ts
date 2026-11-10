import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertOwner } from '@/app/api/admin/_auth';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      global: {
        fetch: (input: any, init?: any) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  );
}

export async function GET(req: NextRequest) {
  try {
    const auth = await assertOwner(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = getAdminClient();

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('order_type', 'delivery')
      .order('created_at', { ascending: false })
      .limit(200);

    if (ordersError) throw ordersError;

    const orderRows = orders || [];
    const orderIds = orderRows.map((order: any) => order.id);
    const restaurantIds = Array.from(
      new Set(
        orderRows
          .map((order: any) => order.restaurant_id)
          .filter((id: string | null): id is string => !!id)
      )
    );

    let restaurantRows: any[] = [];
    if (restaurantIds.length > 0) {
      const { data } = await supabase
        .from('parameters')
        .select(
          'restaurant_id, restaurant_name, currency, phone, address_line1, address_line2, address_line3'
        )
        .in('restaurant_id', restaurantIds);
      restaurantRows = data || [];
    }

    let assignmentRows: any[] = [];
    if (orderIds.length > 0) {
      const { data } = await supabase
        .from('delivery_assignments')
        .select('*')
        .in('order_id', orderIds);
      assignmentRows = data || [];
    }

    const { data: riders, error: ridersError } = await supabase
      .from('users')
      .select(
        'id, restaurant_id, name, phone, vehicle_number, rider_status, active'
      )
      .eq('role', 'rider')
      .eq('active', true)
      .order('name', { ascending: true });

    if (ridersError) throw ridersError;

    const restaurantMap = new Map<string, any>(
      restaurantRows.map((row: any) => [row.restaurant_id, row])
    );
    const assignmentMap = new Map<number, any>(
      assignmentRows.map((row: any) => [row.order_id, row])
    );
    const riderMap = new Map<string, any>(
      (riders || []).map((row: any) => [row.id, row])
    );

    const enrichedOrders = orderRows.map((order: any) => {
      const assignment = assignmentMap.get(order.id) || null;
      const riderId =
        order.delivery_rider_id || assignment?.rider_id || null;
      return {
        ...order,
        restaurant_name:
          restaurantMap.get(order.restaurant_id)?.restaurant_name || null,
        restaurant_currency:
          restaurantMap.get(order.restaurant_id)?.currency || 'INR',
        assignment,
        rider: riderId ? riderMap.get(riderId) || null : null,
      };
    });

    return NextResponse.json({
      orders: enrichedOrders,
      riders: riders || [],
      availableRiders: (riders || []).filter(
        (rider: any) => rider.rider_status === 'available'
      ),
    });
  } catch (err: any) {
    console.error('Admin delivery list error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
