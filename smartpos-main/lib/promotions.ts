// Shared, client-safe logic for the Customer Promotion Module.
// Pure functions only — no supabase/nodemailer imports so route handlers
// and browser components can both use this file.

export const WALKIN_PHONE = '0000000000';

export const MILESTONE_POINTS = [100, 250, 500, 1000, 2500, 5000, 10000];

// ---------------------------------------------------------------
// Types (structural subsets of the DB rows so both sides can share)
// ---------------------------------------------------------------

export interface PromoCustomer {
  id: number;
  restaurant_id: string;
  name: string;
  phone: string;
  email: string | null;
  address?: string | null;
  birthday?: string | null;
  loyalty_points?: number;
  created_at: string;
}

export interface PromoOrder {
  customer_phone: string | null;
  total: number;
  created_at: string;
  status?: string | null;
  items?: { name?: string; price?: number; quantity?: number }[] | null;
}

export interface CustomerStats {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  itemNames: string[];
  categories: string[];
}

export interface SegmentRules {
  min_orders?: number | null;
  max_orders?: number | null;
  min_spend?: number | null;
  inactive_days?: number | null;
  visited_within_days?: number | null;
  purchased_item_or_category?: string | null;
}

export interface SegmentMember {
  customer: PromoCustomer;
  stats: CustomerStats;
}

export interface CouponLike {
  id: number;
  restaurant_id?: string;
  code: string;
  description?: string | null;
  discount_type: string;
  discount_value: number;
  min_bill: number;
  max_discount: number | null;
  scope_item_name: string | null;
  max_uses: number | null;
  per_customer_limit: number;
  redemption_count: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

export interface LoyaltySettingsLike {
  restaurant_id: string;
  enabled: boolean;
  currency_per_point: number;
  point_value: number;
  min_redeem_points: number;
  max_redeem_percent: number;
}

// ---------------------------------------------------------------
// Segments
// ---------------------------------------------------------------

export const BUILTIN_SEGMENTS = [
  {
    key: 'all_contactable',
    name: 'All contactable customers',
    description: 'Every saved customer with a phone number (walk-ins excluded).',
  },
  {
    key: 'new',
    name: 'New customers',
    description: 'Customers with 1 or fewer orders.',
  },
  {
    key: 'regular',
    name: 'Regular customers',
    description: 'Customers with 3 or more orders.',
  },
  {
    key: 'inactive_30',
    name: 'Inactive (30+ days)',
    description: 'Ordered before, but not in the last 30 days.',
  },
  {
    key: 'high_value',
    name: 'High-value customers',
    description: 'Top 20% by total spend, with at least 2 orders.',
  },
  {
    key: 'birthday_month',
    name: 'Birthdays this month',
    description: 'Customers whose birthday falls in the current month.',
  },
] as const;

export type BuiltinSegmentKey = (typeof BUILTIN_SEGMENTS)[number]['key'];

export function findBuiltinSegment(key: string | null | undefined) {
  return BUILTIN_SEGMENTS.find((s) => s.key === key) || null;
}

export function segmentDisplayName(
  segmentKey: string | null | undefined,
  segmentName?: string | null
): string {
  if (segmentName) return segmentName;
  const builtin = findBuiltinSegment(segmentKey);
  if (builtin) return builtin.name;
  return segmentKey ? `Segment ${segmentKey}` : 'All customers';
}

export function computeCustomerStats(
  orders: PromoOrder[],
  itemNameToCategory?: Map<string, string>
): Map<string, CustomerStats> {
  const map = new Map<string, CustomerStats>();

  for (const order of orders) {
    const phone = order.customer_phone;
    if (!phone || phone === WALKIN_PHONE) continue;
    if ((order.status || '').toLowerCase().includes('cancel')) continue;

    let entry = map.get(phone);
    if (!entry) {
      entry = {
        orderCount: 0,
        totalSpent: 0,
        lastOrderAt: null,
        itemNames: [],
        categories: [],
      };
      map.set(phone, entry);
    }

    entry.orderCount += 1;
    entry.totalSpent += Number(order.total || 0);

    const created = new Date(order.created_at).getTime();
    if (!entry.lastOrderAt || created > new Date(entry.lastOrderAt).getTime()) {
      entry.lastOrderAt = order.created_at;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const name = (item.name || '').trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (!entry.itemNames.includes(lower)) entry.itemNames.push(lower);
      const category = itemNameToCategory?.get(lower);
      if (category) {
        const catLower = category.toLowerCase();
        if (!entry.categories.includes(catLower)) entry.categories.push(catLower);
      }
    }
  }

  return map;
}

export function computeSegmentMembers(params: {
  builtinKey?: string | null;
  rules?: SegmentRules | null;
  customers: PromoCustomer[];
  stats: Map<string, CustomerStats>;
  now?: Date;
}): SegmentMember[] {
  const { builtinKey, rules, customers, stats } = params;
  const now = params.now || new Date();
  const nowMs = now.getTime();

  let members: SegmentMember[] = customers
    .filter((c) => c.phone && c.phone !== WALKIN_PHONE)
    .map((customer) => ({
      customer,
      stats: stats.get(customer.phone) || {
        orderCount: 0,
        totalSpent: 0,
        lastOrderAt: null,
        itemNames: [],
        categories: [],
      },
    }));

  if (builtinKey === 'new') {
    members = members.filter((m) => m.stats.orderCount <= 1);
  } else if (builtinKey === 'regular') {
    members = members.filter((m) => m.stats.orderCount >= 3);
  } else if (builtinKey === 'inactive_30') {
    members = members.filter((m) => {
      if (m.stats.orderCount < 1 || !m.stats.lastOrderAt) return false;
      const days = (nowMs - new Date(m.stats.lastOrderAt).getTime()) / 86400000;
      return days >= 30;
    });
  } else if (builtinKey === 'high_value') {
    const eligible = members
      .filter((m) => m.stats.orderCount >= 2 && m.stats.totalSpent > 0)
      .sort((a, b) => b.stats.totalSpent - a.stats.totalSpent);
    const take = Math.max(1, Math.ceil(eligible.length * 0.2));
    const top = new Set(eligible.slice(0, take).map((m) => m.customer.phone));
    members = members.filter((m) => top.has(m.customer.phone));
  } else if (builtinKey === 'birthday_month') {
    members = members.filter(
      (m) => !!m.customer.birthday && monthDay(m.customer.birthday).month === now.getMonth() + 1
    );
  }

  if (rules) {
    members = members.filter(({ stats: s }) => {
      if (rules.min_orders != null && s.orderCount < rules.min_orders) return false;
      if (rules.max_orders != null && s.orderCount > rules.max_orders) return false;
      if (rules.min_spend != null && s.totalSpent < rules.min_spend) return false;
      if (rules.inactive_days != null) {
        if (s.orderCount < 1 || !s.lastOrderAt) return false;
        const days = (nowMs - new Date(s.lastOrderAt).getTime()) / 86400000;
        if (days < rules.inactive_days) return false;
      }
      if (rules.visited_within_days != null) {
        if (s.orderCount < 1 || !s.lastOrderAt) return false;
        const days = (nowMs - new Date(s.lastOrderAt).getTime()) / 86400000;
        if (days > rules.visited_within_days) return false;
      }
      if (rules.purchased_item_or_category) {
        const term = rules.purchased_item_or_category.trim().toLowerCase();
        if (!term) return true;
        const hit =
          s.itemNames.some((n) => n.includes(term)) ||
          s.categories.some((c) => c.includes(term));
        if (!hit) return false;
      }
      return true;
    });
  }

  return members;
}

export function monthDay(dateLike: string): { month: number; day: number } {
  // dates may be YYYY-MM-DD (date column) or full ISO timestamps
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return { month: 0, day: 0 };
  return { month: date.getMonth() + 1, day: date.getDate() };
}

export function isBirthdayToday(birthday: string | null | undefined, now = new Date()): boolean {
  if (!birthday) return false;
  const { month, day } = monthDay(birthday);
  return month === now.getMonth() + 1 && day === now.getDate();
}

export function emptyStats(): CustomerStats {
  return { orderCount: 0, totalSpent: 0, lastOrderAt: null, itemNames: [], categories: [] };
}

// ---------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------

export function offerLabel(coupon: CouponLike | null | undefined, currency = 'INR'): string {
  if (!coupon) return 'a special offer';
  const value = Number(coupon.discount_value || 0);
  if (coupon.discount_type === 'percentage') {
    const cap =
      coupon.max_discount && Number(coupon.max_discount) > 0
        ? ` (up to ${formatPlain(Number(coupon.max_discount), currency)})`
        : '';
    return `${value}% off${cap}`;
  }
  if (coupon.discount_type === 'fixed') {
    return `${formatPlain(value, currency)} off`;
  }
  if (coupon.discount_type === 'bogo') {
    return coupon.scope_item_name
      ? `Buy 1 Get 1 Free on ${coupon.scope_item_name}`
      : 'Buy 1 Get 1 Free';
  }
  return 'a special offer';
}

function formatPlain(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: (currency || 'INR').toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount || 0);
  } catch {
    return `${currency} ${amount}`;
  }
}

export interface CartLine {
  name: string;
  price: number;
  quantity: number;
}

export function computeCouponDiscount(
  coupon: CouponLike,
  items: CartLine[],
  subtotal: number
): number {
  if (!coupon || subtotal <= 0) return 0;
  const base = Math.max(0, subtotal);
  let discount = 0;

  if (coupon.discount_type === 'percentage') {
    discount = (base * Number(coupon.discount_value || 0)) / 100;
    if (coupon.max_discount != null && Number(coupon.max_discount) > 0) {
      discount = Math.min(discount, Number(coupon.max_discount));
    }
  } else if (coupon.discount_type === 'fixed') {
    discount = Number(coupon.discount_value || 0);
  } else if (coupon.discount_type === 'bogo') {
    const scope = (coupon.scope_item_name || '').trim().toLowerCase();
    if (scope) {
      // Buy N get N free on the scoped item: floor(totalQty / 2) free units
      const qty = items
        .filter((i) => (i.name || '').toLowerCase().includes(scope))
        .reduce((sum, i) => sum + (i.quantity || 0), 0);
      const freeUnits = Math.floor(qty / 2);
      const unitPrice =
        items.find((i) => (i.name || '').toLowerCase().includes(scope))?.price || 0;
      discount = freeUnits * unitPrice;
    } else {
      // Unscoped: cheapest single unit is free once the cart has 2+ units
      const totalUnits = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
      if (totalUnits >= 2 && items.length > 0) {
        const cheapest = Math.min(...items.map((i) => Number(i.price || 0)));
        discount = cheapest;
      }
    }
  }

  return Math.max(0, Math.min(discount, base));
}

export function validateCoupon(
  coupon: CouponLike,
  ctx: {
    subtotal: number;
    now?: Date;
    currency?: string;
    phoneRedemptions?: number | null;
  }
): string | null {
  const now = ctx.now || new Date();
  const currency = ctx.currency || 'INR';

  if (!coupon.is_active) return 'This coupon is not active';
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return 'This coupon is not active yet';
  if (coupon.ends_at && new Date(coupon.ends_at) < now) return 'This coupon has expired';
  if (coupon.max_uses != null && coupon.redemption_count >= coupon.max_uses) {
    return 'This coupon has reached its usage limit';
  }
  if (Number(coupon.min_bill || 0) > 0 && ctx.subtotal < Number(coupon.min_bill)) {
    return `A minimum bill of ${formatPlain(Number(coupon.min_bill), currency)} is required`;
  }
  if (
    ctx.phoneRedemptions != null &&
    coupon.per_customer_limit > 0 &&
    ctx.phoneRedemptions >= coupon.per_customer_limit
  ) {
    return 'You have already used this coupon';
  }
  return null;
}

// ---------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------

export function defaultLoyaltySettings(restaurantId: string): LoyaltySettingsLike {
  return {
    restaurant_id: restaurantId,
    enabled: true,
    currency_per_point: 10,
    point_value: 0.1,
    min_redeem_points: 100,
    max_redeem_percent: 50,
  };
}

export function earnPoints(settings: LoyaltySettingsLike | null, amount: number): number {
  if (!settings || !settings.enabled) return 0;
  const per = Number(settings.currency_per_point || 0);
  if (per <= 0) return 0;
  return Math.floor(Math.max(0, amount) / per);
}

export function redeemValue(settings: LoyaltySettingsLike, points: number): number {
  if (!settings.enabled || points <= 0) return 0;
  const value = points * Number(settings.point_value || 0);
  return Math.max(0, value);
}

export function maxRedeemablePoints(
  settings: LoyaltySettingsLike | null,
  subtotal: number,
  balance: number
): number {
  if (!settings || !settings.enabled || balance <= 0 || subtotal <= 0) return 0;
  const pointValue = Number(settings.point_value || 0);
  if (pointValue <= 0) return 0;
  const capByBill = Math.floor(
    (subtotal * Math.max(0, Number(settings.max_redeem_percent || 0))) / 100 / pointValue
  );
  return Math.max(0, Math.min(Math.floor(balance), capByBill));
}

// ---------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------

export interface AutomationTriggerDef {
  key: string;
  name: string;
  description: string;
  example: string;
  defaultMessage: string;
  audience: 'birthday_today' | 'inactive_30' | 'high_value' | 'new' | 'recent' | 'loyalty_members';
}

export const AUTOMATION_TRIGGERS: AutomationTriggerDef[] = [
  {
    key: 'birthday',
    name: 'Birthday',
    description: 'Send a greeting with an offer on the customer’s birthday.',
    example: 'Happy Birthday! Celebrate with 20% off today.',
    defaultMessage:
      'Happy Birthday {name}! Celebrate with {offer} today at {restaurant}. Use code {coupon}.',
    audience: 'birthday_today',
  },
  {
    key: 'inactive',
    name: 'Inactive customer',
    description: 'Win back customers who have not visited in 30 days.',
    example: 'We haven’t seen you in 30 days — here’s a special offer.',
    defaultMessage:
      'We haven’t seen you in a while, {name}! Here’s {offer} just for you at {restaurant}. Use code {coupon}.',
    audience: 'inactive_30',
  },
  {
    key: 'first_visit',
    name: 'First visit',
    description: 'Thank new customers after their first order.',
    example: 'Thank you for visiting. Get 10% off your next order.',
    defaultMessage:
      'Thank you for visiting {restaurant}, {name}! Get {offer} on your next order with code {coupon}.',
    audience: 'new',
  },
  {
    key: 'high_value',
    name: 'High-value customer',
    description: 'VIP reward for your top spenders.',
    example: 'You’re a valued guest — enjoy a VIP reward.',
    defaultMessage:
      'You’re a valued guest, {name}! Enjoy {offer} as our thanks. Use code {coupon} at {restaurant}.',
    audience: 'high_value',
  },
  {
    key: 'post_purchase',
    name: 'After purchase',
    description: 'Thank-you message with loyalty points after each order.',
    example: 'Thank you! You earned loyalty points on your order.',
    defaultMessage:
      'Thank you for your order, {name}! You’ve earned {points} loyalty points at {restaurant}.',
    audience: 'recent',
  },
  {
    key: 'loyalty_milestone',
    name: 'Loyalty milestone',
    description: 'Congratulate customers when they hit a points milestone.',
    example: 'Congratulations — you earned a reward!',
    defaultMessage:
      'Congratulations {name}! You’ve earned {points} loyalty points at {restaurant}. Keep it up!',
    audience: 'loyalty_members',
  },
];

export function findTrigger(key: string): AutomationTriggerDef | null {
  return AUTOMATION_TRIGGERS.find((t) => t.key === key) || null;
}

export function fillTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  return (template || '').replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function buildCampaignMessage(opts: {
  template: string;
  customerName?: string | null;
  restaurantName: string;
  coupon?: CouponLike | null;
  currency?: string;
  points?: number;
  expiresLabel?: string | null;
}): string {
  const firstName = (opts.customerName || 'there').trim().split(/\s+/)[0] || 'there';
  return fillTemplate(opts.template, {
    name: firstName,
    restaurant: opts.restaurantName,
    offer: offerLabel(opts.coupon, opts.currency || 'INR'),
    coupon: opts.coupon ? opts.coupon.code : '',
    expires: opts.expiresLabel || '',
    points: opts.points ?? 0,
  });
}

export function defaultMessageTemplate(
  coupon: CouponLike | null | undefined,
  currency?: string
): string {
  if (coupon) {
    return `Hi {name}! ${offerLabel(coupon, currency)} at {restaurant}. Use code ${coupon.code} at checkout. Show this message to redeem.`;
  }
  return 'Hi {name}! We have a new offer waiting for you at {restaurant}. Visit us soon.';
}

// ---------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------

export function recipientForChannel(
  customer: PromoCustomer,
  channel: string
): string | null {
  if (channel === 'email') {
    const email = (customer.email || '').trim();
    return email.includes('@') ? email : null;
  }
  const digits = (customer.phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

export function buildRecipients(
  members: SegmentMember[],
  channel: string
): { customer_id: number; name: string; recipient: string }[] {
  const out: { customer_id: number; name: string; recipient: string }[] = [];
  const seen = new Set<string>();
  for (const member of members) {
    const recipient = recipientForChannel(member.customer, channel);
    if (!recipient || seen.has(recipient)) continue;
    seen.add(recipient);
    out.push({
      customer_id: member.customer.id,
      name: member.customer.name,
      recipient,
    });
  }
  return out;
}

export function crossedMilestone(previous: number, current: number): number | null {
  for (const milestone of MILESTONE_POINTS) {
    if (previous < milestone && current >= milestone) return milestone;
  }
  return null;
}
