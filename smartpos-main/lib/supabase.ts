import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (input: any, init?: any) =>
      fetch(input, { ...init, cache: 'no-store' }),
  },
});

export type Database = {
  public: {
    Tables: {
      parameters: {
        Row: {
          restaurant_id: string;
          restaurant_name: string;
          mpin: string;
          created_at: string;
          login_name: string | null;
          password: string | null;
          password_hash: string | null;
          gst_number: string | null;
          phone: string | null;
          address_line1: string | null;
          address_line2: string | null;
          address_line3: string | null;
          owner1: string | null;
          owner2: string | null;
          owner3: string | null;
          owner4: string | null;
          tax_rate: number;
          currency: string | null;
          country_code: string | null;
          trial_start: string | null;
          trial_end: string | null;
          trial_used: boolean;
          item_options: string[] | null;
          razorpay_key_id: string | null;
          razorpay_key_secret: string | null;
          delivery_mode: string | null;
        };
        Insert: {
          restaurant_id: string;
          restaurant_name: string;
          mpin?: string;
          login_name?: string | null;
          password?: string | null;
          password_hash?: string | null;
          gst_number?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          address_line3?: string | null;
          owner1?: string | null;
          owner2?: string | null;
          owner3?: string | null;
          owner4?: string | null;
          tax_rate?: number;
          currency?: string | null;
          country_code?: string | null;
          trial_start?: string | null;
          trial_end?: string | null;
          trial_used?: boolean;
          item_options?: string[] | null;
          razorpay_key_id?: string | null;
          razorpay_key_secret?: string | null;
          delivery_mode?: string | null;
        };
        Update: {
          restaurant_name?: string;
          mpin?: string;
          login_name?: string | null;
          password?: string | null;
          password_hash?: string | null;
          gst_number?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          address_line3?: string | null;
          owner1?: string | null;
          owner2?: string | null;
          owner3?: string | null;
          owner4?: string | null;
          tax_rate?: number;
          currency?: string | null;
          country_code?: string | null;
          trial_start?: string | null;
          trial_end?: string | null;
          trial_used?: boolean;
          item_options?: string[] | null;
          razorpay_key_id?: string | null;
          razorpay_key_secret?: string | null;
          delivery_mode?: string | null;
        };
      };
      users: {
        Row: {
          id: string;
          restaurant_id: string | null;
          name: string;
          login_name: string;
          password: string;
          role: string;
          active: boolean;
          phone: string | null;
          vehicle_number: string | null;
          rider_status: string | null;
          approval_status: string | null;
          aadhaar_number: string | null;
          pan_number: string | null;
          driving_license_number: string | null;
          police_verification_number: string | null;
          aadhaar_document_path: string | null;
          pan_document_path: string | null;
          driving_license_document_path: string | null;
          police_verification_document_path: string | null;
          documents_verified: boolean;
          documents_verified_at: string | null;
          documents_verified_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id?: string | null;
          name: string;
          login_name: string;
          password: string;
          role?: string;
          active?: boolean;
          phone?: string | null;
          vehicle_number?: string | null;
          rider_status?: string | null;
          approval_status?: string | null;
          aadhaar_number?: string | null;
          pan_number?: string | null;
          driving_license_number?: string | null;
          police_verification_number?: string | null;
          aadhaar_document_path?: string | null;
          pan_document_path?: string | null;
          driving_license_document_path?: string | null;
          police_verification_document_path?: string | null;
          documents_verified?: boolean;
          documents_verified_at?: string | null;
          documents_verified_by?: string | null;
        };
        Update: {
          restaurant_id?: string | null;
          name?: string;
          login_name?: string;
          password?: string;
          role?: string;
          active?: boolean;
          phone?: string | null;
          vehicle_number?: string | null;
          rider_status?: string | null;
          approval_status?: string | null;
          aadhaar_number?: string | null;
          pan_number?: string | null;
          driving_license_number?: string | null;
          police_verification_number?: string | null;
          aadhaar_document_path?: string | null;
          pan_document_path?: string | null;
          driving_license_document_path?: string | null;
          police_verification_document_path?: string | null;
          documents_verified?: boolean;
          documents_verified_at?: string | null;
          documents_verified_by?: string | null;
        };
      };
      menu: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          description: string | null;
          price: number;
          category: string;
          image_url: string | null;
          available: boolean;
          preparation_time: number;
          options: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          description?: string | null;
          price: number;
          category: string;
          image_url?: string | null;
          available?: boolean;
          preparation_time?: number;
          options?: string[] | null;
        };
        Update: {
          name?: string;
          description?: string | null;
          price?: number;
          category?: string;
          image_url?: string | null;
          available?: boolean;
          preparation_time?: number;
          options?: string[] | null;
        };
      };
      categories: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          type?: string;
        };
        Update: {
          name?: string;
          type?: string;
        };
      };
      orders: {
        Row: {
          id: number;
          restaurant_id: string;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          items: { name: string; price: number; quantity: number; options?: string[] | null; notes?: string | null }[];
          subtotal: number;
          tax: number;
          total: number;
          customer_name: string | null;
          customer_phone: string | null;
          customer_email: string | null;
          customer_address: string | null;
          payment_method: string;
          status: string;
          order_type: string;
          estimated_delivery_time: number | null;
          table_number: number | null;
          tab_number: number | null;
          created_at: string;
          updated_at: string;
          discount_amount: number;
          promo_code: string | null;
          loyalty_points_redeemed: number;
          loyalty_points_earned: number;
          delivery_partner: string | null;
          delivery_fee: number | null;
          delivery_status: string | null;
          delivery_awb: string | null;
          delivery_tracking_url: string | null;
          delivery_rider_id: string | null;
          customer_latitude: number | null;
          customer_longitude: number | null;
        };
        Insert: {
          restaurant_id: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          items: { name: string; price: number; quantity: number; options?: string[] | null; notes?: string | null }[];
          subtotal: number;
          tax: number;
          total: number;
          customer_name?: string | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          customer_address?: string | null;
          payment_method?: string;
          status?: string;
          order_type?: string;
          estimated_delivery_time?: number | null;
          table_number?: number | null;
          tab_number?: number | null;
          discount_amount?: number;
          promo_code?: string | null;
          loyalty_points_redeemed?: number;
          loyalty_points_earned?: number;
          delivery_partner?: string | null;
          delivery_fee?: number | null;
          delivery_status?: string | null;
          delivery_awb?: string | null;
          delivery_tracking_url?: string | null;
          delivery_rider_id?: string | null;
          customer_latitude?: number | null;
          customer_longitude?: number | null;
        };
        Update: {
          status?: string;
          payment_method?: string;
          table_number?: number | null;
          tab_number?: number | null;
          estimated_delivery_time?: number | null;
          discount_amount?: number;
          promo_code?: string | null;
          loyalty_points_redeemed?: number;
          loyalty_points_earned?: number;
          delivery_partner?: string | null;
          delivery_fee?: number | null;
          delivery_status?: string | null;
          delivery_awb?: string | null;
          delivery_tracking_url?: string | null;
          delivery_rider_id?: string | null;
          customer_latitude?: number | null;
          customer_longitude?: number | null;
        };
      };
      delivery_assignments: {
        Row: {
          id: number;
          restaurant_id: string;
          order_id: number;
          rider_id: string | null;
          status: string;
          assigned_by: string | null;
          notes: string | null;
          assigned_at: string | null;
          accepted_at: string | null;
          picked_up_at: string | null;
          delivered_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          order_id: number;
          rider_id?: string | null;
          status?: string;
          assigned_by?: string | null;
          notes?: string | null;
          assigned_at?: string | null;
          accepted_at?: string | null;
          picked_up_at?: string | null;
          delivered_at?: string | null;
          cancelled_at?: string | null;
        };
        Update: {
          rider_id?: string | null;
          status?: string;
          notes?: string | null;
          accepted_at?: string | null;
          picked_up_at?: string | null;
          delivered_at?: string | null;
          cancelled_at?: string | null;
        };
      };
      rider_locations: {
        Row: {
          id: number;
          restaurant_id: string;
          rider_id: string;
          order_id: number | null;
          latitude: number;
          longitude: number;
          accuracy: number | null;
          recorded_at: string;
        };
        Insert: {
          restaurant_id: string;
          rider_id: string;
          order_id?: number | null;
          latitude: number;
          longitude: number;
          accuracy?: number | null;
          recorded_at?: string;
        };
        Update: {
          latitude?: number;
          longitude?: number;
          accuracy?: number | null;
        };
      };
      customers: {
        Row: {
          id: number;
          restaurant_id: string;
          name: string;
          phone: string;
          email: string | null;
          address: string | null;
          birthday: string | null;
          loyalty_points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          name: string;
          phone: string;
          email?: string | null;
          address?: string | null;
          birthday?: string | null;
          loyalty_points?: number;
        };
        Update: {
          name?: string;
          email?: string | null;
          address?: string | null;
          birthday?: string | null;
          loyalty_points?: number;
        };
      };
      customer_segments: {
        Row: {
          id: number;
          restaurant_id: string;
          name: string;
          description: string | null;
          rules: Record<string, any>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          name: string;
          description?: string | null;
          rules?: Record<string, any>;
        };
        Update: {
          name?: string;
          description?: string | null;
          rules?: Record<string, any>;
        };
      };
      coupons: {
        Row: {
          id: number;
          restaurant_id: string;
          code: string;
          description: string | null;
          discount_type: string;
          discount_value: number;
          min_bill: number;
          max_discount: number | null;
          scope_item_name: string | null;
          max_uses: number | null;
          per_customer_limit: number;
          starts_at: string | null;
          ends_at: string | null;
          redemption_count: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          code: string;
          description?: string | null;
          discount_type?: string;
          discount_value?: number;
          min_bill?: number;
          max_discount?: number | null;
          scope_item_name?: string | null;
          max_uses?: number | null;
          per_customer_limit?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          redemption_count?: number;
          is_active?: boolean;
        };
        Update: {
          code?: string;
          description?: string | null;
          discount_type?: string;
          discount_value?: number;
          min_bill?: number;
          max_discount?: number | null;
          scope_item_name?: string | null;
          max_uses?: number | null;
          per_customer_limit?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          redemption_count?: number;
          is_active?: boolean;
        };
      };
      campaigns: {
        Row: {
          id: number;
          restaurant_id: string;
          name: string;
          segment_id: number | null;
          segment_key: string | null;
          coupon_id: number | null;
          channel: string;
          subject: string | null;
          message: string;
          source: string;
          trigger_type: string | null;
          status: string;
          scheduled_at: string | null;
          sent_at: string | null;
          audience_count: number;
          delivered_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          name: string;
          segment_id?: number | null;
          segment_key?: string | null;
          coupon_id?: number | null;
          channel: string;
          subject?: string | null;
          message: string;
          source?: string;
          trigger_type?: string | null;
          status?: string;
          scheduled_at?: string | null;
          sent_at?: string | null;
          audience_count?: number;
          delivered_count?: number;
        };
        Update: {
          name?: string;
          segment_id?: number | null;
          segment_key?: string | null;
          coupon_id?: number | null;
          channel?: string;
          subject?: string | null;
          message?: string;
          trigger_type?: string | null;
          status?: string;
          scheduled_at?: string | null;
          sent_at?: string | null;
          audience_count?: number;
          delivered_count?: number;
        };
      };
      campaign_deliveries: {
        Row: {
          id: number;
          campaign_id: number;
          restaurant_id: string;
          customer_id: number | null;
          customer_name: string | null;
          recipient: string;
          channel: string;
          status: string;
          error: string | null;
          message: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          campaign_id: number;
          restaurant_id: string;
          customer_id?: number | null;
          customer_name?: string | null;
          recipient: string;
          channel: string;
          status?: string;
          error?: string | null;
          message?: string | null;
          sent_at?: string | null;
        };
        Update: {
          status?: string;
          error?: string | null;
          sent_at?: string | null;
        };
      };
      promotion_redemptions: {
        Row: {
          id: number;
          restaurant_id: string;
          coupon_id: number;
          campaign_id: number | null;
          order_id: number | null;
          customer_phone: string | null;
          discount_amount: number;
          order_total: number;
          created_at: string;
        };
        Insert: {
          restaurant_id: string;
          coupon_id: number;
          campaign_id?: number | null;
          order_id?: number | null;
          customer_phone?: string | null;
          discount_amount?: number;
          order_total?: number;
        };
        Update: {
          campaign_id?: number | null;
          discount_amount?: number;
          order_total?: number;
        };
      };
      loyalty_settings: {
        Row: {
          restaurant_id: string;
          enabled: boolean;
          currency_per_point: number;
          point_value: number;
          min_redeem_points: number;
          max_redeem_percent: number;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          enabled?: boolean;
          currency_per_point?: number;
          point_value?: number;
          min_redeem_points?: number;
          max_redeem_percent?: number;
        };
        Update: {
          enabled?: boolean;
          currency_per_point?: number;
          point_value?: number;
          min_redeem_points?: number;
          max_redeem_percent?: number;
        };
      };
      loyalty_transactions: {
        Row: {
          id: number;
          restaurant_id: string;
          customer_phone: string;
          points: number;
          type: string;
          order_id: number | null;
          coupon_id: number | null;
          note: string | null;
          balance_after: number | null;
          created_at: string;
        };
        Insert: {
          restaurant_id: string;
          customer_phone: string;
          points: number;
          type: string;
          order_id?: number | null;
          coupon_id?: number | null;
          note?: string | null;
          balance_after?: number | null;
        };
        Update: {
          points?: number;
          type?: string;
          note?: string | null;
        };
      };
      automations: {
        Row: {
          id: number;
          restaurant_id: string;
          trigger_type: string;
          channel: string;
          coupon_id: number | null;
          message: string;
          is_active: boolean;
          last_run_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          trigger_type: string;
          channel?: string;
          coupon_id?: number | null;
          message: string;
          is_active?: boolean;
          last_run_at?: string | null;
        };
        Update: {
          channel?: string;
          coupon_id?: number | null;
          message?: string;
          is_active?: boolean;
          last_run_at?: string | null;
        };
      };
      subscription_plans: {
        Row: {
          id: string;
          name: string;
          duration_days: number;
          price: number;
          currency: string;
          country_code: string;
          plan_code: string | null;
          restaurant_id: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          duration_days: number;
          price: number;
          currency?: string;
          country_code?: string;
          plan_code?: string | null;
          restaurant_id?: string | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          duration_days?: number;
          price?: number;
          currency?: string;
          country_code?: string;
          plan_code?: string | null;
          restaurant_id?: string | null;
          is_active?: boolean;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          restaurant_id: string;
          plan_id: string | null;
          status: string;
          trial_start_date: string | null;
          trial_end_date: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          next_billing_date: string | null;
          cancelled_at: string | null;
          payment_status: string | null;
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          razorpay_subscription_id: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          restaurant_id: string;
          plan_id?: string | null;
          status?: string;
          trial_start_date?: string | null;
          trial_end_date?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          next_billing_date?: string | null;
          cancelled_at?: string | null;
          payment_status?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_subscription_id?: string | null;
        };
        Update: {
          plan_id?: string | null;
          status?: string;
          trial_start_date?: string | null;
          trial_end_date?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          next_billing_date?: string | null;
          cancelled_at?: string | null;
          payment_status?: string | null;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_subscription_id?: string | null;
        };
      };
      payment_history: {
        Row: {
          id: string;
          subscription_id: string | null;
          payment_method_id: string | null;
          amount: number | null;
          currency: string;
          status: string;
          payment_gateway_id: string | null;
          payment_gateway_response: string | null;
          billing_period_start: string | null;
          billing_period_end: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          subscription_id?: string | null;
          payment_method_id?: string | null;
          amount?: number | null;
          currency?: string;
          status?: string;
          payment_gateway_id?: string | null;
          payment_gateway_response?: string | null;
          billing_period_start?: string | null;
          billing_period_end?: string | null;
        };
        Update: {
          amount?: number | null;
          status?: string;
        };
      };
      email_otps: {
        Row: {
          id: string;
          email: string;
          code: string;
          purpose: string;
          expires_at: string;
          verified: boolean;
          created_at: string;
        };
        Insert: {
          email: string;
          code: string;
          purpose: string;
          expires_at: string;
          verified?: boolean;
        };
        Update: {
          verified?: boolean;
        };
      };
      ingredients: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          category: string;
          unit: string;
          current_stock: number;
          reorder_level: number;
          low_threshold: number;
          critical_threshold: number;
          supplier_name: string | null;
          supplier_contact: string | null;
          cost_per_unit: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          category?: string;
          unit?: string;
          current_stock?: number;
          reorder_level?: number;
          low_threshold?: number;
          critical_threshold?: number;
          supplier_name?: string | null;
          supplier_contact?: string | null;
          cost_per_unit?: number | null;
          updated_at?: string;
        };
        Update: {
          name?: string;
          category?: string;
          unit?: string;
          current_stock?: number;
          reorder_level?: number;
          low_threshold?: number;
          critical_threshold?: number;
          supplier_name?: string | null;
          supplier_contact?: string | null;
          cost_per_unit?: number | null;
          updated_at?: string;
        };
      };
      stock_movements: {
        Row: {
          id: number;
          ingredient_id: string;
          restaurant_id: string;
          type: string;
          quantity_change: number;
          reason: string | null;
          order_id: number | null;
          user_id: string | null;
          before_quantity: number | null;
          after_quantity: number | null;
          created_at: string;
        };
        Insert: {
          ingredient_id: string;
          restaurant_id: string;
          type: string;
          quantity_change: number;
          reason?: string | null;
          order_id?: number | null;
          user_id?: string | null;
          before_quantity?: number | null;
          after_quantity?: number | null;
        };
        Update: {
          reason?: string | null;
        };
      };
      recipes: {
        Row: {
          id: string;
          menu_item_id: string;
          ingredient_id: string;
          quantity_required: number;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          ingredient_id: string;
          quantity_required?: number;
        };
        Update: {
          quantity_required?: number;
        };
      };
    };
  };
};
