import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const restaurantId = req.nextUrl.searchParams.get('restaurantId');
    if (!restaurantId) {
      return NextResponse.json(
        { error: 'restaurantId is required' },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from('order_notifications')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const notifications = data || [];
    const unread = notifications.filter((n: any) => !n.is_read).length;

    return NextResponse.json({ notifications, unread_count: unread });
  } catch (err: any) {
    console.error('Order notifications load error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, restaurantId, markAll } = body;

    if (!id && !(restaurantId && markAll)) {
      return NextResponse.json(
        { error: 'id or restaurantId with markAll is required' },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    if (id) {
      const { error } = await admin
        .from('order_notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    } else if (restaurantId && markAll) {
      const { error } = await admin
        .from('order_notifications')
        .update({ is_read: true })
        .eq('restaurant_id', restaurantId)
        .eq('is_read', false);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Order notifications update error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
