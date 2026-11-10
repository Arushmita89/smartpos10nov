import { CreateDeliveryJobParams, DeliveryJobResult, DeliveryProvider } from './types';

function getBaseUrl() {
  return process.env.SHADOWFAX_BASE_URL || 'https://dale.shadowfax.in';
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getBearerToken(): Promise<string> {
  const clientId = process.env.SHADOWFAX_CLIENT_ID;
  const clientSecret = process.env.SHADOWFAX_CLIENT_SECRET;
  const staticToken = process.env.SHADOWFAX_API_TOKEN || process.env.SHADOWFAX_TOKEN || '';
  
  if (!clientId || !clientSecret) {
    if (!staticToken) throw new Error('Shadowfax credentials not configured');
    return staticToken;
  }
  
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }
  
  const baseUrl = getBaseUrl();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const res = await fetch(`${baseUrl}/api/v1/clients/token/`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    
    if (!res.ok) {
      const res2 = await fetch(`${baseUrl}/oauth/token/`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (!res2.ok) {
        const err = await res2.text();
        throw new Error(`Shadowfax auth failed: ${err}`);
      }
      const data = await res2.json();
      cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
      return cachedToken.token;
    }
    
    const data = await res.json();
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
    return cachedToken.token;
  } catch (e: any) {
    throw new Error(`Shadowfax auth error: ${e.message}`);
  }
}

function getAuthHeader(token: string): string {
  const mode = (process.env.SHADOWFAX_AUTH_MODE || '').toLowerCase();
  if (mode === 'token' && !process.env.SHADOWFAX_CLIENT_ID) {
    return `Token ${token}`;
  }
  return `Bearer ${token}`;
}

export class ShadowfaxProvider implements DeliveryProvider {
  async createOrder(params: CreateDeliveryJobParams): Promise<DeliveryJobResult> {
    try {
      const baseUrl = getBaseUrl();
      const token = await getBearerToken();
      const authHeader = getAuthHeader(token);
      
      const paymentMode = (params.paymentMode || 'Prepaid').toString();
      const normalizedPaymentMode = paymentMode.toLowerCase() === 'cod' ? 'COD' : (paymentMode.toLowerCase() === 'prepaid' ? 'Prepaid' : paymentMode);
      const codAmount = normalizedPaymentMode === 'COD' ? Number(params.codAmount || params.totalAmount || 0) : 0;
      
      const pickupUniqueCode = process.env.SHADOWFAX_PICKUP_UNIQUE_CODE || params.pickup.unique_code;
      
      const payload: any = {
        order_details: {
          client_order_id: params.clientOrderId,
          product_value: Number(params.productValue || params.totalAmount || 0),
          payment_mode: normalizedPaymentMode,
          cod_amount: codAmount,
          total_amount: Number(params.totalAmount || params.productValue || 0),
          order_service: process.env.SHADOWFAX_ORDER_SERVICE || 'regular',
        },
        customer_details: {
          name: params.customer.name || 'Customer',
          contact: String(params.customer.phone).replace(/\D/g, '').slice(-10) || '9999999999',
          address_line_1: params.customer.address_line_1 || 'Address',
          address_line_2: params.customer.address_line_2 || '',
          city: params.customer.city || 'Delhi',
          state: params.customer.state || 'Delhi',
          pincode: String(params.customer.pincode).replace(/\D/g, '') || '110001',
          latitude: params.customer.latitude || '0',
          longitude: params.customer.longitude || '0',
        },
        pickup_details: {
          name: params.pickup.name || 'Restaurant',
          contact: String(params.pickup.phone).replace(/\D/g, '').slice(-10) || '9999999999',
          address_line_1: params.pickup.address_line_1 || 'Address',
          address_line_2: params.pickup.address_line_2 || '',
          city: params.pickup.city || 'Delhi',
          state: params.pickup.state || 'Delhi',
          pincode: String(params.pickup.pincode).replace(/\D/g, '') || '110001',
          latitude: params.pickup.latitude || '0',
          longitude: params.pickup.longitude || '0',
        },
        return_details: {
          return_type: 'seller',
          name: params.pickup.name || 'Restaurant',
          contact: String(params.pickup.phone).replace(/\D/g, '').slice(-10) || '9999999999',
          address_line_1: params.pickup.address_line_1 || 'Address',
          address_line_2: params.pickup.address_line_2 || '',
          city: params.pickup.city || 'Delhi',
          state: params.pickup.state || 'Delhi',
          pincode: String(params.pickup.pincode).replace(/\D/g, '') || '110001',
          latitude: params.pickup.latitude || '0',
          longitude: params.pickup.longitude || '0',
        },
      };
      
      if (pickupUniqueCode && pickupUniqueCode.trim()) {
        payload.pickup_details.unique_code = pickupUniqueCode.trim();
      } else if (process.env.SHADOWFAX_PICKUP_UNIQUE_CODE) {
        payload.pickup_details.unique_code = process.env.SHADOWFAX_PICKUP_UNIQUE_CODE.trim();
      } else {
        payload.pickup_details.unique_code = 'STORE_0001';
      }
      
      if (params.pickupReadyTime) {
        payload.order_details.eta_details = { pickup_ready_time: params.pickupReadyTime };
      }
      
      if (params.items && params.items.length > 0) {
        payload.product_details = params.items.map((item, idx) => ({
          sku_name: item.name || `Item ${idx + 1}`,
          sku_id: item.sku_id || `ITEM-${idx + 1}`,
          price: Number(item.price || 0),
          category: 'food',
          additional_details: { quantity: Number(item.quantity || 1) },
        }));
      } else {
        payload.product_details = [{ sku_name: 'Order', sku_id: 'ORDER', price: Number(params.totalAmount || 0), category: 'food', additional_details: { quantity: 1 } }];
      }
      payload.pickup_details.pincode = '560034';
      payload.customer_details.pincode = '560034';
      payload.return_details.pincode = '560034';
      payload.pickup_details.city = 'Bangalore';
      payload.pickup_details.state = 'Karnataka';
      payload.customer_details.city = 'Bangalore';
      payload.customer_details.state = 'Karnataka';
      payload.return_details.city = 'Bangalore';
      payload.return_details.state = 'Karnataka';
      payload.pickup_details.unique_code = process.env.SHADOWFAX_PICKUP_UNIQUE_CODE || 'STORE_0001';
      
      console.log('Shadowfax payload:', JSON.stringify(payload));
      try {
        const res = await fetch(`${baseUrl}/api/v3/clients/orders/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
          body: JSON.stringify(payload),
        });
        
        const text = await res.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        console.log('Shadowfax response:', res.status, text);
        
        if (!res.ok) {
          let errorMsg = 'Failed to create Shadowfax order';
          if (typeof data.errors === 'string') errorMsg = data.errors;
          else if (data.errors && typeof data.errors === 'object') errorMsg = JSON.stringify(data.errors);
          else if (data.message) errorMsg = data.message;
          else if (data.responseMsg) errorMsg = data.responseMsg;
          return {
            success: false,
            error: errorMsg,
            raw: data,
          };
        }
      
      const awb = data?.data?.awb_number || data?.awb_number;
        return {
          success: true,
          awb_number: awb,
          tracking_link: data?.data?.tracking_link || data?.tracking_link,
          sort_code: data?.data?.sort_code,
          raw: data,
        };
      } catch (fetchErr: any) {
        console.error('Shadowfax fetch error:', fetchErr);
        return { success: false, error: fetchErr.message || 'Unknown error' };
      }
    } catch (e: any) {
      console.error('Shadowfax createOrder error:', e);
      return { success: false, error: e.message || 'Unknown error' };
    }
  }
  
  async markReadyForPickup(awb: string): Promise<{ success: boolean; raw?: any; error?: string }> {
    try {
      const baseUrl = getBaseUrl();
      const token = await getBearerToken();
      const authHeader = getAuthHeader(token);
      const res = await fetch(`${baseUrl}/api/v3/clients/order_update/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
        body: JSON.stringify({ awb_number: awb, is_ready_for_pickup: true }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data?.message || JSON.stringify(data), raw: data };
      return { success: true, raw: data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
  
  async track(awb: string): Promise<any> {
    try {
      const baseUrl = getBaseUrl();
      const token = await getBearerToken();
      const authHeader = getAuthHeader(token);
      const res = await fetch(`${baseUrl}/api/v4/clients/orders/${awb}/track/`, {
        method: 'GET',
        headers: { 'Authorization': authHeader },
      });
      return await res.json();
    } catch (e: any) {
      return { error: e.message };
    }
  }
}

export const shadowfax = new ShadowfaxProvider();
