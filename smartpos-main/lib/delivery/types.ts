export interface DeliveryAddress {
  name: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  pincode: string;
  latitude?: string;
  longitude?: string;
}

export interface PickupDetails {
  name: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  pincode: string;
  latitude?: string;
  longitude?: string;
  unique_code?: string;
}

export interface DeliveryOrderItem {
  name: string;
  quantity: number;
  price: number;
  sku_id?: string;
}

export interface CreateDeliveryJobParams {
  clientOrderId: string;
  orderId: number;
  restaurantId: string;
  riderId?: string;
  paymentMode: 'Prepaid' | 'COD' | 'prepaid' | 'cod';
  codAmount: number;
  productValue: number;
  totalAmount: number;
  customer: DeliveryAddress;
  pickup: PickupDetails;
  items: DeliveryOrderItem[];
  pickupReadyTime?: number;
}

export interface DeliveryJobResult {
  success: boolean;
  awb_number?: string;
  tracking_link?: string;
  sort_code?: string;
  raw?: any;
  error?: string;
}

export interface DeliveryProvider {
  createOrder(params: CreateDeliveryJobParams): Promise<DeliveryJobResult>;
  markReadyForPickup(awb: string): Promise<{ success: boolean; raw?: any; error?: string }>;
  track(awb: string): Promise<any>;
}
