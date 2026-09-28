/**
 * App-wide constants (§23 lib/constants.ts).
 *
 * Anything that a business can change lives in a database row, not here.
 * What belongs here is structural: route paths, slot granularity, and the
 * defaults a brand-new database is seeded with.
 */

export const APP_NAME = 'SmartHelp';
export const APP_TAGLINE = 'Trusted help. Right when you need it.';
export const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'INR';
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * Default dialling code for phone normalisation.
 *
 * A constant only in the sense of a default: it is env-overridable because
 * "no hard-coded geography in code" is a stated non-goal, and the value a
 * real deployment wants is a deployment decision. What is *not* negotiable is
 * that a number is stored with its country code — see `normalizePhone`.
 */
export const DEFAULT_PHONE_COUNTRY_CODE = process.env.DEFAULT_PHONE_COUNTRY_CODE || '91';

/** Slot granularity. A slot start is always a multiple of this, in minutes. */
export const SLOT_GRANULARITY_MIN = 30;

/** The public-facing shells. */
export const ROUTES = {
  home: '/',
  login: '/login',
  join: '/join',
  services: '/services',
  serviceDetail: (slug: string) => `/services/${slug}`,
  customer: {
    root: '/customer',
    services: '/customer/services',
    serviceDetail: (slug: string) => `/customer/services/${slug}`,
    checkout: '/customer/checkout',
    bookings: '/customer/bookings',
    booking: (id: string) => `/customer/bookings/${id}`,
    wallet: '/customer/wallet',
    support: '/customer/support',
    favourites: '/customer/favourites',
    profile: '/customer/profile',
  },
  professional: {
    root: '/professional',
    jobs: '/professional/jobs',
    job: (id: string) => `/professional/jobs/${id}`,
    earnings: '/professional/earnings',
    kyc: '/professional/kyc',
    availability: '/professional/availability',
    training: '/professional/training',
    profile: '/professional/profile',
  },
  admin: {
    root: '/admin',
    bookings: '/admin/bookings',
    booking: (id: string) => `/admin/bookings/${id}`,
    professionals: '/admin/professionals',
    customers: '/admin/customers',
    services: '/admin/services',
    pricing: '/admin/pricing',
    payments: '/admin/payments',
    coupons: '/admin/coupons',
    disputes: '/admin/disputes',
    support: '/admin/support',
    analytics: '/admin/analytics',
    notifications: '/admin/notifications',
    settings: '/admin/settings',
    audit: '/admin/audit',
  },
  legal: {
    privacy: '/legal/privacy',
    terms: '/legal/terms',
    refund: '/legal/refund',
    cancellation: '/legal/cancellation',
    safety: '/legal/safety',
  },
} as const;

/**
 * The defaults written to platform_settings on first run (§31.3). They are
 * seeded as rows so an admin can change them without a deploy; these values
 * are only the initial state.
 */
export const PLATFORM_DEFAULTS = {
  currency: DEFAULT_CURRENCY,
  taxRate: Number(process.env.DEFAULT_TAX_RATE || 0.18),
  commissionPct: Number(process.env.DEFAULT_COMMISSION_PCT || 0.2),
  platformFee: Number(process.env.DEFAULT_PLATFORM_FEE || 20),
  serviceOtpLength: Number(process.env.DEFAULT_SERVICE_OTP_LENGTH || 4),
  instantLeadMinutes: Number(process.env.DEFAULT_INSTANT_LEAD_MINUTES || 30),
} as const;

/** Default duration ladder offered when an admin has not overridden it (§4.3). */
export const DEFAULT_DURATION_LADDER = [30, 45, 60, 90, 120, 180, 240, 300, 360];
export const DEFAULT_EXTENSION_OPTIONS = [30, 60, 90];

/**
 * Sign-in OTP policy (§26.1).
 *
 * These live here, not in `lib/otp.ts`, because both sides need them: the
 * login screen renders exactly `OTP_LENGTH` input slots, and the server issues
 * the code. Importing them from `lib/otp.ts` would pull `nodemailer` and the
 * service-role client into the browser bundle — this module imports nothing.
 */
export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 3;
export const OTP_RESEND_SECONDS = 60;
export const OTP_LOCKOUT_MINUTES = 15;
