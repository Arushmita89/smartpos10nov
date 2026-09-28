import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Which of the two browser keys are absent.
 *
 * Every lookup here is written as a literal `process.env.NEXT_PUBLIC_*` member
 * access, and that is load-bearing. Next.js inlines those values into the
 * browser bundle at build time, but only when it can see the literal name. A
 * computed `process.env[key]` compiles to a lookup on the `{}` that stands in
 * for `process.env` in the browser, so it reads as *undefined for every key*
 * no matter what `.env.local` says — and the app then reports missing
 * credentials with a perfectly valid environment file.
 *
 * The server does not have this problem, which is why such a check can sit
 * green through `next build` and the whole test suite and still break on the
 * first page load. `test/env-inlining.test.ts` guards the pattern.
 */
const missingEnv = [
  process.env.NEXT_PUBLIC_SUPABASE_URL ? null : 'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? null : 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
].filter((key): key is string => key !== null);

/**
 * The browser client. It only ever carries the anon key, so every query it
 * makes is subject to RLS — that is the point. Any route that needs to read
 * or write a row the caller must not see uses lib/supabaseServer.ts instead.
 *
 * Built lazily, behind a Proxy, for one reason: `createClient` throws when the
 * URL is missing, and a throw at module scope takes down the prerender of
 * every page that transitively imports this file — including the build itself.
 * A missing key should surface as one clear message at the moment a caller
 * actually asks for a query, not as a wall of unrelated build errors.
 */
let client: SupabaseClient<Database> | null = null;

/**
 * Whether the browser client can be built at all.
 *
 * The UI asks this before it touches `supabase`, so that a missing key becomes
 * a screen with instructions rather than a thrown error. `getSupabase()` still
 * throws, because a server route that reaches it without credentials has a real
 * fault and should fail loudly.
 */
export function supabaseConfigError(): string | null {
  if (!missingEnv.length) return null;
  return (
    `Supabase browser credentials missing: ${missingEnv.join(', ')}. ` +
    'Copy .env.example to .env.local and fill it in, then restart the dev server.'
  );
}

export function getSupabase(): SupabaseClient<Database> {
  if (client) return client;

  const problem = supabaseConfigError();
  if (problem) throw new Error(problem);

  client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }),
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
  return client;
}

/**
 * `supabase.auth.getSession()` reads naturally, and a Proxy keeps every call
 * site unchanged while deferring construction to first use.
 */
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(getSupabase(), prop);
  },
});

export type UserRole =
  | 'customer'
  | 'professional'
  | 'admin'
  | 'support'
  | 'ops'
  | 'super_admin';

export type UserStatus =
  | 'active'
  | 'suspended'
  | 'blocked'
  | 'deleted'
  | 'pending_verification';

export type VerificationStatus =
  | 'not_submitted'
  | 'submitted'
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'expired';

export type TrainingStatus = 'not_started' | 'in_progress' | 'completed';
export type AvailabilityStatus = 'offline' | 'online' | 'busy' | 'break';
export type PricingType = 'hourly' | 'flat' | 'per_unit';
export type AddressType = 'home' | 'work' | 'other';
/** Whether `lat`/`lng` came from the browser or from the locality's centre. */
export type LocationPrecision = 'exact' | 'locality_centre';
export type OtpChannel = 'phone' | 'email';
export type OtpPurpose = 'login' | 'staff_login' | 'admin_mfa' | 'signup' | 'password_reset';

export type OtpOutcome = 'ok' | 'invalid' | 'expired' | 'locked' | 'missing';

/** The three states `claim_idempotency_key` can return. */
export interface IdempotencyClaim {
  outcome: 'claimed' | 'replay' | 'in_flight' | 'conflict';
  stored_status: number | null;
  stored_body: object | null;
}

type Timestamptz = string;

/**
 * Hand-maintained mirror of the generated Supabase `Database` type.
 *
 * Regenerate it with:
 *   npx supabase gen types typescript --project-id <ref> > lib/database.types.ts
 *
 * Only the tables of the current phase are present; later phases add their own
 * block. Row types are the single source of truth for `Table<...>` aliases in
 * lib/queries.ts, and for the shapes the API returns.
 */
/**
 * supabase-js 2.117 requires every table and view to carry a `Relationships`
 * entry before it will accept the type as a `GenericSchema`; leave it out and
 * the whole thing silently degrades to `never`, which surfaces as a wall of
 * unrelated "property does not exist on type never" errors in the routes.
 *
 * Declaring them once here beats hand-writing `Relationships: []` on eighteen
 * tables and forgetting two. Phase 0 has no PostgREST embedding, so "none" is
 * also the honest answer: when a phase starts selecting across a foreign key,
 * regenerate the whole block with
 *   npx supabase gen types typescript --project-id <ref> > lib/database.types.ts
 * and delete this shim.
 */
type WithRelationships<T> = { [K in keyof T]: T[K] & { Relationships: [] } };

type RawTables = {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          status: UserStatus;
          full_name: string;
          /** Optional: an email + password account has no number until it adds one (0027). */
          phone: string | null;
          phone_verified_at: Timestamptz | null;
          email: string | null;
          avatar_url: string | null;
          locale: string;
          last_seen_at: Timestamptz | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id: string;
          role?: UserRole;
          status?: UserStatus;
          full_name: string;
          phone?: string | null;
          phone_verified_at?: Timestamptz | null;
          email?: string | null;
          avatar_url?: string | null;
          locale?: string;
          last_seen_at?: Timestamptz | null;
        };
        Update: {
          role?: UserRole;
          status?: UserStatus;
          full_name?: string;
          phone?: string | null;
          phone_verified_at?: Timestamptz | null;
          email?: string | null;
          avatar_url?: string | null;
          locale?: string;
          last_seen_at?: Timestamptz | null;
        };
      };

      customers: {
        Row: {
          id: string;
          profile_id: string;
          referral_code: string;
          referred_by: string | null;
          wallet_id: string | null;
          total_bookings: number;
          completed_bookings: number;
          lifetime_value: number;
          cancelled_bookings: number;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: string;
          profile_id: string;
          referral_code: string;
          referred_by?: string | null;
        };
        Update: {
          referred_by?: string | null;
          wallet_id?: string | null;
        };
      };

      cities: {
        Row: {
          id: string;
          name: string;
          state: string;
          country: string;
          country_code: string;
          time_zone: string;
          default_currency: string;
          pincode_prefixes: string[];
          lat: number | null;
          lng: number | null;
          business_hours: Record<string, { open: string; close: string }>;
          is_active: boolean;
          created_at: Timestamptz;
        };
        Insert: Partial<RawTables['cities']['Row']> & {
          name: string;
          state: string;
        };
        Update: Partial<RawTables['cities']['Row']>;
      };

      localities: {
        Row: {
          id: string;
          city_id: string;
          name: string;
          lat: number;
          lng: number;
          radius_km: number;
          is_active: boolean;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          city_id: string;
          name: string;
          lat: number;
          lng: number;
          radius_km?: number;
        };
        Update: Partial<RawTables['localities']['Row']>;
      };

      service_categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          icon_key: string;
          image_url: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          icon_key: string;
          image_url?: string | null;
          sort_order?: number;
        };
        Update: Partial<RawTables['service_categories']['Row']>;
      };

      services: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          slug: string;
          short_description: string | null;
          description: string | null;
          image_url: string | null;
          base_price: number;
          pricing_type: PricingType;
          unit_label: string | null;
          unit_price: number | null;
          min_duration_min: number;
          max_duration_min: number;
          prep_minutes: number;
          max_active_jobs: number;
          materials_included: boolean;
          materials_note: string | null;
          requires_photo_proof: boolean;
          sort_order: number;
          is_active: boolean;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          slug: string;
          base_price: number;
          pricing_type?: PricingType;
          min_duration_min?: number;
          max_duration_min?: number;
        };
        Update: Partial<RawTables['services']['Row']>;
      };

      service_tasks: {
        Row: {
          id: string;
          service_id: string;
          kind: 'included' | 'excluded';
          label: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          service_id: string;
          kind: 'included' | 'excluded';
          label: string;
          sort_order?: number;
        };
        Update: Partial<RawTables['service_tasks']['Row']>;
      };

      service_images: {
        Row: { id: string; service_id: string; url: string; alt_text: string | null; sort_order: number };
        Insert: { id?: string; service_id: string; url: string; alt_text?: string | null; sort_order?: number };
        Update: Partial<RawTables['service_images']['Row']>;
      };

      service_keywords: {
        Row: { service_id: string; keyword: string };
        Insert: { service_id: string; keyword: string };
        Update: { service_id: string; keyword: string };
      };

      service_areas: {
        Row: {
          id: string;
          locality_id: string;
          service_id: string;
          lead_minutes: number;
          slot_capacity: number;
          is_active: boolean;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          locality_id: string;
          service_id: string;
          lead_minutes?: number;
          slot_capacity?: number;
        };
        Update: Partial<RawTables['service_areas']['Row']>;
      };

      service_durations: {
        Row: {
          id: string;
          service_id: string;
          minutes: number;
          price: number | null;
          price_multiplier: number | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          service_id: string;
          minutes: number;
          price?: number | null;
          price_multiplier?: number | null;
        };
        Update: Partial<RawTables['service_durations']['Row']>;
      };

      professionals: {
        Row: {
          id: string;
          profile_id: string;
          employee_code: string | null;
          verification_status: VerificationStatus;
          training_status: TrainingStatus;
          availability_status: AvailabilityStatus;
          is_available_today: boolean;
          current_lat: number | null;
          current_lng: number | null;
          location_updated_at: Timestamptz | null;
          service_radius_km: number;
          commission_pct: number;
          rating: number | null;
          rating_count: number;
          total_offers: number;
          accepted_offers: number;
          completed_jobs: number;
          cancelled_jobs: number;
          no_shows: number;
          experience_months: number;
          probation_until: Timestamptz | null;
          suspended_reason: string | null;
          kyc_verified_at: Timestamptz | null;
          onboarded_at: Timestamptz | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: string;
          profile_id: string;
          employee_code?: string | null;
          commission_pct?: number;
        };
        Update: Partial<RawTables['professionals']['Row']>;
      };

      professional_documents: {
        Row: {
          id: string;
          professional_id: string;
          doc_type: string;
          file_path: string;
          status: VerificationStatus;
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: Timestamptz | null;
          expires_at: Timestamptz | null;
          created_at: Timestamptz;
        };
        Insert: {
          id?: string;
          professional_id: string;
          doc_type: string;
          file_path: string;
          // Default is `not_submitted`; a professional may only ever write
          // `submitted`, and the guard trigger refuses anything else.
          status?: VerificationStatus;
        };
        Update: Partial<RawTables['professional_documents']['Row']>;
      };

      professional_skills: {
        Row: { professional_id: string; service_id: string; proficiency: number; verified_at: Timestamptz | null };
        Insert: { professional_id: string; service_id: string; proficiency?: number; verified_at?: Timestamptz | null };
        Update: { proficiency?: number; verified_at?: Timestamptz | null };
      };

      professional_working_hours: {
        Row: {
          id: string;
          professional_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          professional_id: string;
          weekday: number;
          start_time: string;
          end_time: string;
        };
        Update: Partial<RawTables['professional_working_hours']['Row']>;
      };

      professional_time_off: {
        Row: {
          id: string;
          professional_id: string;
          starts_at: Timestamptz;
          ends_at: Timestamptz;
          reason: string | null;
        };
        Insert: { id?: string; professional_id: string; starts_at: string; ends_at: string; reason?: string | null };
        Update: Partial<RawTables['professional_time_off']['Row']>;
      };

      // 0008. `customer_id` is not updatable from a payload, so Update omits
      // it: `Partial<Row>` would otherwise offer it.
      addresses: {
        Row: {
          id: string;
          customer_id: string;
          /** NULL means the address is outside current coverage, not that it is broken. */
          locality_id: string | null;
          label: string;
          address_type: AddressType;
          line1: string;
          line2: string | null;
          area: string;
          city: string;
          state: string;
          pincode: string;
          lat: number;
          lng: number;
          landmark: string | null;
          access_notes: string | null;
          location_precision: LocationPrecision;
          is_default: boolean;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: {
          id?: string;
          customer_id: string;
          locality_id?: string | null;
          label?: string;
          address_type?: AddressType;
          line1: string;
          line2?: string | null;
          area: string;
          city: string;
          state: string;
          pincode: string;
          lat: number;
          lng: number;
          landmark?: string | null;
          access_notes?: string | null;
          location_precision?: LocationPrecision;
          is_default?: boolean;
        };
        Update: {
          locality_id?: string | null;
          label?: string;
          address_type?: AddressType;
          line1?: string;
          line2?: string | null;
          area?: string;
          city?: string;
          state?: string;
          pincode?: string;
          lat?: number;
          lng?: number;
          landmark?: string | null;
          access_notes?: string | null;
          location_precision?: LocationPrecision;
          is_default?: boolean;
        };
      };
};

type RawViews = {
  public_professionals: {
    Row: {
      id: string;
          full_name: string;
          avatar_url: string | null;
          rating: number | null;
          rating_count: number;
          completed_jobs: number;
          experience_months: number;
          verification_status: VerificationStatus;
          training_status: TrainingStatus;
          is_available_today: boolean;
          availability_status: AvailabilityStatus;
          service_radius_km: number;
      onboarded_at: Timestamptz | null;
    };
  };
};

export type Database = {
  public: {
    Tables: WithRelationships<RawTables>;
    Views: WithRelationships<RawViews>;

    Functions: {
      current_role: { Args: Record<PropertyKey, never>; Returns: UserRole };
      current_status: { Args: Record<PropertyKey, never>; Returns: UserStatus };
      is_staff: { Args: { p_roles: UserRole[] }; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_ops: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_trusted_session: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_customer_id: { Args: Record<PropertyKey, never>; Returns: string | null };
      current_professional_id: { Args: Record<PropertyKey, never>; Returns: string | null };
      is_serviceable: {
        Args: { p_locality_id: string; p_service_id: string; p_at?: string | null };
        Returns: boolean;
      };
      /** 0008. Clears the customer's default and sets this one, atomically. */
      set_default_address: {
        Args: { p_customer_id: string; p_address_id: string };
        Returns: string;
      };

      // Phase 0 auth. The ledger lives in SQL so the attempt counter, the
      // resend throttle and the lockout cannot be raced by two requests.
      // Both are `security definer` and callable by `service_role` only.
      issue_otp: {
        Args: {
          p_target: string;
          p_channel: OtpChannel;
          p_purpose: OtpPurpose;
          p_code: string;
          p_ttl_minutes: number;
          p_max_attempts: number;
          p_resend_seconds: number;
          p_lockout_minutes: number;
        };
        Returns: string;
      };
      consume_otp: {
        Args: { p_target: string; p_purpose: OtpPurpose; p_code: string };
        Returns: OtpOutcome;
      };

      // Phase 0 platform plumbing (§29.2). Both are security definer and are
      // revoked from PUBLIC; only service_role may call them.
      write_audit: {
        Args: {
          p_actor_profile_id: string | null;
          p_action: string;
          p_entity_type: string;
          p_entity_id: string | null;
          p_before_state: object | null;
          p_after_state: object | null;
          p_metadata: object | null;
          p_ip_address: string | null;
          p_user_agent: string | null;
          p_request_id: string | null;
        };
        Returns: string;
      };
      claim_idempotency_key: {
        Args: {
          p_key: string;
          p_operation: string;
          p_actor_profile_id: string | null;
          p_request_hash: string;
        };
        Returns: IdempotencyClaim;
      };
      complete_idempotency_key: {
        Args: {
          p_key: string;
          p_operation: string;
          p_actor_profile_id: string | null;
          p_status: number;
          p_body: object | null;
        };
        Returns: undefined;
      };
    };

    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      verification_status: VerificationStatus;
      training_status: TrainingStatus;
      availability_status: AvailabilityStatus;
      pricing_type: PricingType;
      address_type: AddressType;
    };
  };
};

type Schema = Database['public'];

export type Tables<T extends keyof Schema['Tables']> = Schema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Schema['Tables']> = Schema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Schema['Tables']> = Schema['Tables'][T]['Update'];

export type Profile = Tables<'profiles'>;
export type Customer = Tables<'customers'>;
export type Address = Tables<'addresses'>;
export type Service = Tables<'services'>;
export type ServiceTask = Tables<'service_tasks'>;
export type ServiceCategory = Tables<'service_categories'>;
export type Locality = Tables<'localities'>;
export type Professional = Tables<'professionals'>;
export type PublicProfessional = Schema['Views']['public_professionals']['Row'];
