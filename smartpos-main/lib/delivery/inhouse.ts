import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CreateDeliveryJobParams, DeliveryJobResult, DeliveryProvider } from './types';

const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'picked_up'];

/**
 * Riders with an active delivery are not available for new deliveries.
 * Once the last active delivery is completed/cancelled they automatically
 * return to `available` (online).
 */
export async function syncRiderAvailability(
  supabase: SupabaseClient,
  riderId: string | null | undefined
): Promise<void> {
  if (!riderId) return;

  const { count } = await supabase
    .from('delivery_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('rider_id', riderId)
    .in('status', ACTIVE_ASSIGNMENT_STATUSES);

  await supabase
    .from('users')
    .update({ rider_status: count && count > 0 ? 'busy' : 'available' })
    .eq('id', riderId)
    .eq('role', 'rider');
}

export function getDeliveryServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service role credentials not configured');
  }
  return createClient(url, serviceRoleKey, {
    global: {
      fetch: (input: any, init?: any) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

export interface AssignRiderOptions {
  orderId: number | string;
  restaurantId?: string;
  riderId?: string;
  assignedBy?: string;
  /**
   * When true the rider is treated as part of the shared SmartPOS rider pool
   * and does not have to belong to the order's restaurant. Used by the owner
   * admin panel.
   */
  allowAnyRider?: boolean;
  /** Send the restaurant an in-app intimation after assignment. */
  notifyRestaurant?: boolean;
}

export interface AssignRiderResult {
  success: boolean;
  rider?: {
    id: string;
    name: string;
    phone: string | null;
    vehicle_number: string | null;
  };
  assignment?: any;
  error?: string;
}

async function pickAvailableRider(
  supabase: SupabaseClient,
  restaurantId: string,
  riderId?: string,
  allowAnyRider = false
) {
  if (riderId) {
    let query = supabase
      .from('users')
      .select('id, name, phone, vehicle_number, rider_status, active')
      .eq('id', riderId)
      .eq('role', 'rider');
    if (!allowAnyRider) {
      query = query.eq('restaurant_id', restaurantId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;
    if (!data.active) return null;
    return data;
  }

  let query = supabase
    .from('users')
    .select('id, name, phone, vehicle_number, rider_status, created_at')
    .eq('role', 'rider')
    .eq('active', true)
    .eq('rider_status', 'available');
  if (!allowAnyRider) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data: riders, error } = await query.order('created_at', {
    ascending: true,
  });

  if (error) throw error;
  if (!riders || riders.length === 0) return null;

  const ids = riders.map((r: any) => r.id);
  const { data: activeAssignments } = await supabase
    .from('delivery_assignments')
    .select('rider_id')
    .in('rider_id', ids)
    .in('status', ACTIVE_ASSIGNMENT_STATUSES);

  const load: Record<string, number> = {};
  ids.forEach((id: string) => (load[id] = 0));
  (activeAssignments || []).forEach((row: any) => {
    if (row.rider_id in load) load[row.rider_id] += 1;
  });

  return [...riders].sort((a: any, b: any) => load[a.id] - load[b.id])[0];
}

export async function assignRiderToOrder(
  supabase: SupabaseClient,
  options: AssignRiderOptions
): Promise<AssignRiderResult> {
  const { orderId, assignedBy } = options;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order) return { success: false, error: 'Order not found' };

  const restaurantId = options.restaurantId || order.restaurant_id;
  if (!restaurantId) return { success: false, error: 'restaurantId required' };

  if (order.order_type !== 'delivery') {
    return { success: false, error: 'Order is not a delivery order' };
  }
  if (order.delivery_partner === 'shadowfax' && order.delivery_awb) {
    return {
      success: false,
      error: 'Order is already booked with an external delivery partner',
    };
  }

  const rider = await pickAvailableRider(
    supabase,
    restaurantId,
    options.riderId,
    !!options.allowAnyRider
  );
  if (!rider) {
    return {
      success: false,
      error: options.riderId
        ? 'Rider not found or inactive'
        : 'No available riders right now',
    };
  }

  const now = new Date().toISOString();

  const { data: previousAssignment } = await supabase
    .from('delivery_assignments')
    .select('rider_id')
    .eq('order_id', order.id)
    .maybeSingle();

  const { data: assignment, error: assignmentError } = await supabase
    .from('delivery_assignments')
    .upsert(
      {
        restaurant_id: restaurantId,
        order_id: order.id,
        rider_id: rider.id,
        status: 'assigned',
        assigned_by: assignedBy || null,
        assigned_at: now,
        accepted_at: null,
        picked_up_at: null,
        delivered_at: null,
        cancelled_at: null,
        updated_at: now,
      },
      { onConflict: 'order_id' }
    )
    .select('*')
    .single();

  if (assignmentError) throw assignmentError;

  if (
    previousAssignment?.rider_id &&
    previousAssignment.rider_id !== rider.id
  ) {
    await syncRiderAvailability(supabase, previousAssignment.rider_id);
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      delivery_partner: 'inhouse',
      delivery_status: 'assigned',
      delivery_rider_id: rider.id,
      delivery_error: null,
      delivery_booked_at: now,
      updated_at: now,
    })
    .eq('id', order.id);

  if (updateError) throw updateError;

  await syncRiderAvailability(supabase, rider.id);

  if (options.notifyRestaurant !== false) {
    try {
      await supabase
        .from('order_notifications')
        .delete()
        .eq('order_id', order.id)
        .eq('type', 'delivery_assigned')
        .eq('is_read', false);

      await supabase.from('order_notifications').insert({
        restaurant_id: restaurantId,
        order_id: order.id,
        rider_id: rider.id,
        type: 'delivery_assigned',
        title: `Rider assigned for Order #${order.id}`,
        message: `${rider.name}${
          rider.phone ? ` (${rider.phone})` : ''
        } will pick up Order #${order.id}. Please prepare the order and keep it ready.`,
        is_read: false,
      });
    } catch (notifyError) {
      console.error(
        'Failed to create order intimation notification:',
        notifyError
      );
    }
  }

  return {
    success: true,
    rider: {
      id: rider.id,
      name: rider.name,
      phone: rider.phone || null,
      vehicle_number: rider.vehicle_number || null,
    },
    assignment,
  };
}

export class InHouseProvider implements DeliveryProvider {
  async createOrder(params: CreateDeliveryJobParams): Promise<DeliveryJobResult> {
    try {
      const supabase = getDeliveryServiceClient();
      const result = await assignRiderToOrder(supabase, {
        orderId: params.orderId,
        restaurantId: params.restaurantId,
        riderId: params.riderId,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        awb_number: undefined,
        raw: { rider: result.rider, assignment: result.assignment },
      };
    } catch (e: any) {
      console.error('InHouse createOrder error:', e);
      return { success: false, error: e.message || 'Unknown error' };
    }
  }

  async markReadyForPickup(
    _awb: string
  ): Promise<{ success: boolean; raw?: any; error?: string }> {
    return { success: true, raw: { message: 'In-house delivery ready for pickup' } };
  }

  async track(orderId: string): Promise<any> {
    try {
      const supabase = getDeliveryServiceClient();
      const { data: assignment } = await supabase
        .from('delivery_assignments')
        .select('*, rider:users(id, name, phone, vehicle_number)')
        .eq('order_id', orderId)
        .maybeSingle();
      const { data: location } = await supabase
        .from('rider_locations')
        .select('*')
        .eq('order_id', orderId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { assignment, location };
    } catch (e: any) {
      return { error: e.message };
    }
  }
}

export const inhouse = new InHouseProvider();
