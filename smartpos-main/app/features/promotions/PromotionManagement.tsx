"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Database } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import ConfirmationDialog from "@/components/ui/ConfirmationDialog";
import toast from "react-hot-toast";
import {
  BarChart3,
  Users,
  Ticket,
  Send,
  Star,
  Zap,
  Plus,
  Search,
  Pencil,
  Trash2,
  RefreshCw,
  Eye,
  X,
  Save,
  Calendar,
  Mail,
  MessageCircle,
  Smartphone,
  Clock,
  Gift,
  Info,
  Play,
  CheckCircle2,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  AUTOMATION_TRIGGERS,
  BUILTIN_SEGMENTS,
  CouponLike,
  LoyaltySettingsLike,
  PromoCustomer,
  PromoOrder,
  SegmentRules,
  buildCampaignMessage,
  buildRecipients,
  computeCustomerStats,
  computeSegmentMembers,
  defaultMessageTemplate,
  earnPoints,
  findBuiltinSegment,
  findTrigger,
  isBirthdayToday,
  offerLabel,
  redeemValue,
  segmentDisplayName,
} from "@/lib/promotions";

type Restaurant = Database["public"]["Tables"]["parameters"]["Row"];
type Customer = Database["public"]["Tables"]["customers"]["Row"];
type SegmentRow = Database["public"]["Tables"]["customer_segments"]["Row"];
type CouponRow = Database["public"]["Tables"]["coupons"]["Row"];
type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type DeliveryRow = Database["public"]["Tables"]["campaign_deliveries"]["Row"];
type RedemptionRow = Database["public"]["Tables"]["promotion_redemptions"]["Row"];
type LoyaltySettingsRow = Database["public"]["Tables"]["loyalty_settings"]["Row"];
type LoyaltyTxnRow = Database["public"]["Tables"]["loyalty_transactions"]["Row"];
type AutomationRow = Database["public"]["Tables"]["automations"]["Row"];

type OrderStatRow = Pick<
  Database["public"]["Tables"]["orders"]["Row"],
  "customer_phone" | "total" | "created_at" | "status" | "items"
>;

const TABS = [
  { id: "overview", name: "Overview", icon: BarChart3 },
  { id: "coupons", name: "Coupons", icon: Ticket },
  { id: "campaigns", name: "Campaigns", icon: Send },
] as const;

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-center">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center mr-3 ${accent}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white rounded-lg ${wide ? "max-w-2xl" : "max-w-md"} w-full p-6 max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

function statusBadge(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "sent") return "bg-green-100 text-green-700";
  if (s === "scheduled") return "bg-blue-100 text-blue-700";
  if (s === "failed") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-700";
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

interface CampaignForm {
  name: string;
  segmentValue: string;
  couponId: string;
  channel: string;
  subject: string;
  message: string;
  scheduleMode: "now" | "later";
  scheduleAt: string;
}

interface CouponForm {
  id: number | null;
  code: string;
  description: string;
  discount_type: string;
  discount_value: string;
  min_bill: string;
  max_discount: string;
  scope_item_name: string;
  max_uses: string;
  per_customer_limit: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

interface SegmentForm {
  id: number | null;
  name: string;
  description: string;
  min_orders: string;
  max_orders: string;
  min_spend: string;
  inactive_days: string;
  visited_within_days: string;
  purchased_item_or_category: string;
}

const emptyCouponForm: CouponForm = {
  id: null,
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: "",
  min_bill: "",
  max_discount: "",
  scope_item_name: "",
  max_uses: "",
  per_customer_limit: "1",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

const emptySegmentForm: SegmentForm = {
  id: null,
  name: "",
  description: "",
  min_orders: "",
  max_orders: "",
  min_spend: "",
  inactive_days: "",
  visited_within_days: "",
  purchased_item_or_category: "",
};

export default function PromotionManagement({ restaurant }: { restaurant: Restaurant }) {
  const currency = restaurant.currency || "INR";
  const restaurantId = restaurant.restaurant_id;
  const restaurantName = restaurant.restaurant_name;

  const [tab, setTab] = useState<string>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<OrderStatRow[]>([]);
  const [menu, setMenu] = useState<{ name: string; category: string }[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettingsRow | null>(null);
  const [loyaltyTxns, setLoyaltyTxns] = useState<LoyaltyTxnRow[]>([]);
  const [automations, setAutomations] = useState<AutomationRow[]>([]);

  const [search, setSearch] = useState("");
  const [couponSearch, setCouponSearch] = useState("");

  const [showSegmentModal, setShowSegmentModal] = useState(false);
  const [segmentForm, setSegmentForm] = useState<SegmentForm>(emptySegmentForm);
  const [segmentBusy, setSegmentBusy] = useState(false);
  const [deletingSegment, setDeletingSegment] = useState<SegmentRow | null>(null);

  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponForm, setCouponForm] = useState<CouponForm>(emptyCouponForm);
  const [couponBusy, setCouponBusy] = useState(false);
  const [deletingCoupon, setDeletingCoupon] = useState<CouponRow | null>(null);

  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>({
    name: "",
    segmentValue: "builtin:all_contactable",
    couponId: "",
    channel: "email",
    subject: "",
    message: "",
    scheduleMode: "now",
    scheduleAt: "",
  });
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [sendingCampaignId, setSendingCampaignId] = useState<number | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<CampaignRow | null>(null);
  const [logCampaign, setLogCampaign] = useState<CampaignRow | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  const [loyaltyForm, setLoyaltyForm] = useState({
    enabled: true,
    currency_per_point: "10",
    point_value: "0.1",
    min_redeem_points: "100",
    max_redeem_percent: "50",
  });
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);

  const [automationForms, setAutomationForms] = useState<
    Record<string, { channel: string; coupon_id: string; message: string; is_active: boolean }>
  >({});
  const [editingTrigger, setEditingTrigger] = useState<string | null>(null);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [runningTrigger, setRunningTrigger] = useState<string | null>(null);

  const didAutoSend = useRef(false);

  // ---------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const rid = restaurantId;

      const [
        custRes,
        orderRes,
        menuRes,
        segmentRes,
        couponRes,
        campaignRes,
        redemptionRes,
        loyaltySettingsRes,
        loyaltyTxnRes,
        automationRes,
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("*")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("customer_phone, total, created_at, status, items")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase.from("menu").select("name, category").eq("restaurant_id", rid),
        supabase
          .from("customer_segments")
          .select("*")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false }),
        supabase
          .from("coupons")
          .select("*")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false }),
        supabase
          .from("campaigns")
          .select("*")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("promotion_redemptions")
          .select("*")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("loyalty_settings").select("*").eq("restaurant_id", rid).maybeSingle(),
        supabase
          .from("loyalty_transactions")
          .select("*")
          .eq("restaurant_id", rid)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("automations").select("*").eq("restaurant_id", rid),
      ]);

      if (custRes.error) throw custRes.error;
      if (orderRes.error) throw orderRes.error;

      setCustomers((custRes.data || []) as Customer[]);
      setOrders((orderRes.data || []) as OrderStatRow[]);
      setMenu((menuRes.data || []) as { name: string; category: string }[]);
      setSegments((segmentRes.data || []) as SegmentRow[]);
      setCoupons((couponRes.data || []) as CouponRow[]);
      setCampaigns((campaignRes.data || []) as CampaignRow[]);
      setRedemptions((redemptionRes.data || []) as RedemptionRow[]);
      setLoyaltySettings((loyaltySettingsRes.data || null) as LoyaltySettingsRow | null);
      setLoyaltyTxns((loyaltyTxnRes.data || []) as LoyaltyTxnRow[]);
      setAutomations((automationRes.data || []) as AutomationRow[]);
    } catch (err: any) {
      console.error("Error loading promotion data:", err);
      setError(err.message || "Failed to load promotion data");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------

  const itemNameToCategory = useMemo(() => {
    const map = new Map<string, string>();
    menu.forEach((m) => map.set((m.name || "").toLowerCase(), m.category || ""));
    return map;
  }, [menu]);

  const customerStats = useMemo(
    () => computeCustomerStats(orders as PromoOrder[], itemNameToCategory),
    [orders, itemNameToCategory]
  );

  const promoCustomers = customers as unknown as PromoCustomer[];

  const activeCoupons = useMemo(
    () =>
      coupons.filter((c) => {
        if (!c.is_active) return false;
        const now = Date.now();
        if (c.starts_at && new Date(c.starts_at).getTime() > now) return false;
        if (c.ends_at && new Date(c.ends_at).getTime() < now) return false;
        if (c.max_uses != null && c.redemption_count >= c.max_uses) return false;
        return true;
      }),
    [coupons]
  );

  const overview = useMemo(() => {
    const cutoff = new Date(daysAgoIso(30)).getTime();
    const recent = redemptions.filter((r) => new Date(r.created_at).getTime() >= cutoff);
    const discountGiven = recent.reduce((sum, r) => sum + Number(r.discount_amount || 0), 0);
    const revenue = recent.reduce((sum, r) => sum + Number(r.order_total || 0), 0);
    const campaignsSent = campaigns.filter((c) => c.status === "sent").length;
    const messagesSent = campaigns.reduce((sum, c) => sum + Number(c.delivered_count || 0), 0);
    const pointsOutstanding = customers.reduce(
      (sum, c) => sum + Number(c.loyalty_points || 0),
      0
    );
    const roi = discountGiven > 0 ? revenue / discountGiven : 0;
    return { recent, discountGiven, revenue, campaignsSent, messagesSent, pointsOutstanding, roi };
  }, [redemptions, campaigns, customers]);

  const topCoupons = useMemo(
    () =>
      [...coupons]
        .sort((a, b) => Number(b.redemption_count || 0) - Number(a.redemption_count || 0))
        .slice(0, 6),
    [coupons]
  );

  const couponById = useMemo(() => {
    const map = new Map<number, CouponRow>();
    coupons.forEach((c) => map.set(c.id, c));
    return map;
  }, [coupons]);

  const automationByTrigger = useMemo(() => {
    const map = new Map<string, AutomationRow>();
    automations.forEach((a) => map.set(a.trigger_type, a));
    return map;
  }, [automations]);

  const loyaltyStats = useMemo(() => {
    const members = customers.filter((c) => Number(c.loyalty_points || 0) > 0);
    const outstanding = customers.reduce((sum, c) => sum + Number(c.loyalty_points || 0), 0);
    const redeemedPoints = loyaltyTxns
      .filter((t) => t.type === "redeem")
      .reduce((sum, t) => sum + Math.abs(Number(t.points || 0)), 0);
    const pointValue = Number(loyaltySettings?.point_value || 0.1);
    return {
      members: members.length,
      outstanding,
      redeemedPoints,
      redeemValue: redeemedPoints * pointValue,
    };
  }, [customers, loyaltyTxns, loyaltySettings]);

  // Initialize automation form state once data arrives
  useEffect(() => {
    const next: Record<
      string,
      { channel: string; coupon_id: string; message: string; is_active: boolean }
    > = {};
    AUTOMATION_TRIGGERS.forEach((trigger) => {
      const saved = automations.find((a) => a.trigger_type === trigger.key);
      next[trigger.key] = {
        channel: saved?.channel || "email",
        coupon_id: saved?.coupon_id ? String(saved.coupon_id) : "",
        message: saved?.message || trigger.defaultMessage,
        is_active: saved ? saved.is_active : false,
      };
    });
    setAutomationForms(next);
  }, [automations]);

  // Initialize loyalty form once settings arrive
  useEffect(() => {
    if (loyaltySettings) {
      setLoyaltyForm({
        enabled: loyaltySettings.enabled,
        currency_per_point: String(loyaltySettings.currency_per_point),
        point_value: String(loyaltySettings.point_value),
        min_redeem_points: String(loyaltySettings.min_redeem_points),
        max_redeem_percent: String(loyaltySettings.max_redeem_percent),
      });
    }
  }, [loyaltySettings]);

  // ---------------------------------------------------------------
  // Segment helpers
  // ---------------------------------------------------------------

  const countBuiltin = useCallback(
    (key: string) =>
      computeSegmentMembers({ builtinKey: key, customers: promoCustomers, stats: customerStats })
        .length,
    [promoCustomers, customerStats]
  );

  const countRules = useCallback(
    (rules: SegmentRules) =>
      computeSegmentMembers({ rules, customers: promoCustomers, stats: customerStats }).length,
    [promoCustomers, customerStats]
  );

  const resolveSegmentSelection = useCallback(
    (value: string): { builtinKey: string | null; rules: SegmentRules | null; label: string } => {
      if (value.startsWith("builtin:")) {
        const key = value.slice("builtin:".length);
        return {
          builtinKey: key,
          rules: null,
          label: findBuiltinSegment(key)?.name || key,
        };
      }
      if (value.startsWith("custom:")) {
        const id = Number(value.slice("custom:".length));
        const segment = segments.find((s) => s.id === id);
        return {
          builtinKey: null,
          rules: (segment?.rules as SegmentRules) || null,
          label: segment?.name || "Custom segment",
        };
      }
      return { builtinKey: "all_contactable", rules: null, label: "All contactable customers" };
    },
    [segments]
  );

  const membersForSelection = useCallback(
    (value: string) => {
      const { builtinKey, rules } = resolveSegmentSelection(value);
      return computeSegmentMembers({
        builtinKey,
        rules,
        customers: promoCustomers,
        stats: customerStats,
      });
    },
    [resolveSegmentSelection, promoCustomers, customerStats]
  );

  const membersForCampaign = useCallback(
    (campaign: CampaignRow) => {
      const segment = campaign.segment_id
        ? segments.find((s) => s.id === campaign.segment_id)
        : null;
      return computeSegmentMembers({
        builtinKey: campaign.segment_key,
        rules: (segment?.rules as SegmentRules) || null,
        customers: promoCustomers,
        stats: customerStats,
      });
    },
    [segments, promoCustomers, customerStats]
  );

  const campaignLabel = useCallback(
    (campaign: CampaignRow) => {
      const segment = campaign.segment_id
        ? segments.find((s) => s.id === campaign.segment_id)
        : null;
      return segmentDisplayName(campaign.segment_key, segment?.name);
    },
    [segments]
  );

  // ---------------------------------------------------------------
  // Campaign send
  // ---------------------------------------------------------------

  const dispatchToServer = useCallback(
    async (campaignId: number, recipients: { customer_id?: number | null; name?: string; recipient: string }[]) => {
      const res = await fetch("/api/promotions/send-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, recipients }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send campaign");
      return data as { sent: number; failed: number; errors?: string[] };
    },
    []
  );

  const sendCampaign = useCallback(
    async (campaign: CampaignRow) => {
      if (sendingCampaignId) return;
      setSendingCampaignId(campaign.id);
      try {
        const members = membersForCampaign(campaign);
        const recipients = buildRecipients(members, campaign.channel);
        if (recipients.length === 0) {
          toast.error(
            campaign.channel === "email"
              ? "No recipients with an email address in this segment"
              : "No recipients with a phone number in this segment"
          );
          return;
        }
        const result = await dispatchToServer(campaign.id, recipients);
        if (result.failed > 0 && result.sent === 0) {
          toast.error(
            result.errors?.[0] || `No messages delivered (${result.failed} failed)`,
            { duration: 6000 }
          );
        } else if (result.failed > 0) {
          toast(
            `Sent ${result.sent}, failed ${result.failed}. ${result.errors?.[0] || ""}`,
            { icon: "⚠️", duration: 6000 }
          );
        } else {
          toast.success(`Campaign sent to ${result.sent} recipient(s)`);
        }
        await fetchData();
      } catch (err: any) {
        toast.error(err.message || "Failed to send campaign");
      } finally {
        setSendingCampaignId(null);
      }
    },
    [sendingCampaignId, membersForCampaign, dispatchToServer, fetchData]
  );

  // Auto-send scheduled campaigns whose time has arrived (also covered by cron)
  useEffect(() => {
    if (didAutoSend.current || loading || campaigns.length === 0) return;
    didAutoSend.current = true;
    const now = Date.now();
    const due = campaigns.filter(
      (c) => c.status === "scheduled" && c.scheduled_at && new Date(c.scheduled_at).getTime() <= now
    );
    for (const campaign of due) {
      sendCampaign(campaign);
    }
  }, [loading, campaigns, sendCampaign]);

  // ---------------------------------------------------------------
  // Segments CRUD
  // ---------------------------------------------------------------

  const openNewSegment = () => {
    setSegmentForm(emptySegmentForm);
    setShowSegmentModal(true);
  };

  const openEditSegment = (segment: SegmentRow) => {
    const rules = (segment.rules || {}) as SegmentRules;
    setSegmentForm({
      id: segment.id,
      name: segment.name,
      description: segment.description || "",
      min_orders: rules.min_orders != null ? String(rules.min_orders) : "",
      max_orders: rules.max_orders != null ? String(rules.max_orders) : "",
      min_spend: rules.min_spend != null ? String(rules.min_spend) : "",
      inactive_days: rules.inactive_days != null ? String(rules.inactive_days) : "",
      visited_within_days:
        rules.visited_within_days != null ? String(rules.visited_within_days) : "",
      purchased_item_or_category: rules.purchased_item_or_category || "",
    });
    setShowSegmentModal(true);
  };

  const saveSegment = async () => {
    if (!segmentForm.name.trim()) {
      toast.error("Segment name is required");
      return;
    }
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const rules: SegmentRules = {
      min_orders: num(segmentForm.min_orders),
      max_orders: num(segmentForm.max_orders),
      min_spend: num(segmentForm.min_spend),
      inactive_days: num(segmentForm.inactive_days),
      visited_within_days: num(segmentForm.visited_within_days),
      purchased_item_or_category: segmentForm.purchased_item_or_category.trim() || null,
    };
    for (const [key, value] of Object.entries(rules)) {
      if (value !== null && Number.isNaN(Number(value))) {
        toast.error(`Invalid number for ${key.replace(/_/g, " ")}`);
        return;
      }
    }
    setSegmentBusy(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: segmentForm.name.trim(),
        description: segmentForm.description.trim() || null,
        rules: rules as Record<string, any>,
        updated_at: new Date().toISOString(),
      };
      if (segmentForm.id) {
        const { error: err } = await supabase
          .from("customer_segments")
          .update(payload)
          .eq("id", segmentForm.id);
        if (err) throw err;
        toast.success("Segment updated");
      } else {
        const { error: err } = await supabase.from("customer_segments").insert(payload);
        if (err) throw err;
        toast.success("Segment created");
      }
      setShowSegmentModal(false);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save segment");
    } finally {
      setSegmentBusy(false);
    }
  };

  const deleteSegment = async () => {
    if (!deletingSegment) return;
    try {
      const { error: err } = await supabase
        .from("customer_segments")
        .delete()
        .eq("id", deletingSegment.id);
      if (err) throw err;
      toast.success("Segment deleted");
      setSegments((prev) => prev.filter((s) => s.id !== deletingSegment.id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete segment");
    } finally {
      setDeletingSegment(null);
    }
  };

  // ---------------------------------------------------------------
  // Coupons CRUD
  // ---------------------------------------------------------------

  const openNewCoupon = () => {
    setCouponForm(emptyCouponForm);
    setShowCouponModal(true);
  };

  const openEditCoupon = (coupon: CouponRow) => {
    setCouponForm({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description || "",
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value || ""),
      min_bill: String(coupon.min_bill || ""),
      max_discount: coupon.max_discount != null ? String(coupon.max_discount) : "",
      scope_item_name: coupon.scope_item_name || "",
      max_uses: coupon.max_uses != null ? String(coupon.max_uses) : "",
      per_customer_limit: String(coupon.per_customer_limit ?? 1),
      starts_at: toLocalInput(coupon.starts_at),
      ends_at: toLocalInput(coupon.ends_at),
      is_active: coupon.is_active,
    });
    setShowCouponModal(true);
  };

  const saveCoupon = async () => {
    const code = couponForm.code.trim().toUpperCase();
    if (!code) {
      toast.error("Coupon code is required");
      return;
    }
    const value = Number(couponForm.discount_value);
    if (couponForm.discount_type === "bogo") {
      // BOGO value is derived from cart math; no numeric value required
    } else if (couponForm.discount_value.trim() === "" || Number.isNaN(value) || value <= 0) {
      toast.error("Enter a valid discount value");
      return;
    } else if (couponForm.discount_type === "percentage" && value > 100) {
      toast.error("Percentage discount cannot exceed 100");
      return;
    }
    const startsAt = couponForm.starts_at ? new Date(couponForm.starts_at).toISOString() : null;
    const endsAt = couponForm.ends_at ? new Date(couponForm.ends_at).toISOString() : null;
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      toast.error("Expiry must be after the start date");
      return;
    }

    setCouponBusy(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        code,
        description: couponForm.description.trim() || null,
        discount_type: couponForm.discount_type,
        discount_value: couponForm.discount_type === "bogo" ? 0 : value,
        min_bill: Number(couponForm.min_bill) || 0,
        max_discount:
          couponForm.discount_type === "percentage" && couponForm.max_discount.trim()
            ? Number(couponForm.max_discount)
            : null,
        scope_item_name:
          couponForm.discount_type === "bogo" ? couponForm.scope_item_name.trim() || null : null,
        max_uses: couponForm.max_uses.trim() ? Number(couponForm.max_uses) : null,
        per_customer_limit: Number(couponForm.per_customer_limit) || 1,
        starts_at: startsAt,
        ends_at: endsAt,
        is_active: couponForm.is_active,
        updated_at: new Date().toISOString(),
      };

      if (couponForm.id) {
        const { error: err } = await supabase
          .from("coupons")
          .update(payload)
          .eq("id", couponForm.id);
        if (err) {
          if (err.message?.includes("duplicate")) throw new Error("Code already exists");
          throw err;
        }
        toast.success("Coupon updated");
      } else {
        const { error: err } = await supabase.from("coupons").insert(payload);
        if (err) {
          if (err.message?.includes("duplicate")) throw new Error("Code already exists");
          throw err;
        }
        toast.success("Coupon created");
      }
      setShowCouponModal(false);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save coupon");
    } finally {
      setCouponBusy(false);
    }
  };

  const toggleCoupon = async (coupon: CouponRow) => {
    try {
      const { error: err } = await supabase
        .from("coupons")
        .update({ is_active: !coupon.is_active, updated_at: new Date().toISOString() })
        .eq("id", coupon.id);
      if (err) throw err;
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, is_active: !c.is_active } : c)));
      toast.success(coupon.is_active ? "Coupon deactivated" : "Coupon activated");
    } catch (err: any) {
      toast.error(err.message || "Failed to update coupon");
    }
  };

  const deleteCoupon = async () => {
    if (!deletingCoupon) return;
    try {
      const { error: err } = await supabase
        .from("coupons")
        .delete()
        .eq("id", deletingCoupon.id);
      if (err) throw err;
      toast.success("Coupon deleted");
      setCoupons((prev) => prev.filter((c) => c.id !== deletingCoupon.id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete coupon");
    } finally {
      setDeletingCoupon(null);
    }
  };

  // ---------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------

  const selectedCampaignCoupon = useMemo(
    () => coupons.find((c) => String(c.id) === campaignForm.couponId) || null,
    [coupons, campaignForm.couponId]
  );

  const openCampaignModal = (presetSegment?: string) => {
    setCampaignForm({
      name: "",
      segmentValue: presetSegment || "builtin:all_contactable",
      couponId: "",
      channel: "email",
      subject: "",
      message: defaultMessageTemplate(null, currency),
      scheduleMode: "now",
      scheduleAt: "",
    });
    setShowCampaignModal(true);
  };

  const applySuggestedMessage = () => {
    setCampaignForm((prev) => ({
      ...prev,
      message: defaultMessageTemplate(selectedCampaignCoupon, currency),
    }));
  };

  const createCampaign = async () => {
    if (!campaignForm.name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    if (!campaignForm.message.trim()) {
      toast.error("Message is required");
      return;
    }
    if (campaignForm.scheduleMode === "later") {
      if (!campaignForm.scheduleAt) {
        toast.error("Pick a schedule date and time");
        return;
      }
      if (new Date(campaignForm.scheduleAt).getTime() <= Date.now()) {
        toast.error("Schedule time must be in the future");
        return;
      }
    }

    setCampaignBusy(true);
    try {
      const { builtinKey, rules } = resolveSegmentSelection(campaignForm.segmentValue);
      const segmentId = campaignForm.segmentValue.startsWith("custom:")
        ? Number(campaignForm.segmentValue.slice("custom:".length))
        : null;

      const members = computeSegmentMembers({
        builtinKey,
        rules,
        customers: promoCustomers,
        stats: customerStats,
      });
      const recipients = buildRecipients(members, campaignForm.channel);

      if (recipients.length === 0) {
        toast.error(
          campaignForm.channel === "email"
            ? "No recipients with an email address in this segment"
            : "No recipients with a phone number in this segment"
        );
        return;
      }

      const scheduled =
        campaignForm.scheduleMode === "later"
          ? new Date(campaignForm.scheduleAt).toISOString()
          : null;

      const { data: campaign, error: insertErr } = await supabase
        .from("campaigns")
        .insert({
          restaurant_id: restaurantId,
          name: campaignForm.name.trim(),
          segment_id: segmentId,
          segment_key: builtinKey,
          coupon_id: campaignForm.couponId ? Number(campaignForm.couponId) : null,
          channel: campaignForm.channel,
          subject: campaignForm.subject.trim() || null,
          message: campaignForm.message.trim(),
          source: "manual",
          status: scheduled ? "scheduled" : "draft",
          scheduled_at: scheduled,
          audience_count: recipients.length,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setShowCampaignModal(false);

      if (scheduled) {
        toast.success(
          `Campaign scheduled for ${formatDate(scheduled)} — ${recipients.length} recipient(s)`
        );
      } else {
        const result = await dispatchToServer(campaign.id, recipients);
        if (result.sent > 0) {
          toast.success(`Campaign sent to ${result.sent} recipient(s)`);
        } else {
          toast.error(result.errors?.[0] || "Campaign created but no messages were delivered", {
            duration: 6000,
          });
        }
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create campaign");
    } finally {
      setCampaignBusy(false);
    }
  };

  const deleteCampaign = async () => {
    if (!deletingCampaign) return;
    try {
      const { error: err } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", deletingCampaign.id);
      if (err) throw err;
      toast.success("Campaign deleted");
      setCampaigns((prev) => prev.filter((c) => c.id !== deletingCampaign.id));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete campaign");
    } finally {
      setDeletingCampaign(null);
    }
  };

  const openDeliveries = async (campaign: CampaignRow) => {
    setLogCampaign(campaign);
    setDeliveries([]);
    setDeliveriesLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("campaign_deliveries")
        .select("*")
        .eq("campaign_id", campaign.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (err) throw err;
      setDeliveries((data || []) as DeliveryRow[]);
    } catch (err: any) {
      toast.error(err.message || "Failed to load delivery log");
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const campaignPerformance = useCallback(
    (campaignId: number) => {
      const rows = redemptions.filter((r) => r.campaign_id === campaignId);
      return {
        redeemed: rows.length,
        revenue: rows.reduce((sum, r) => sum + Number(r.order_total || 0), 0),
        discount: rows.reduce((sum, r) => sum + Number(r.discount_amount || 0), 0),
      };
    },
    [redemptions]
  );

  // ---------------------------------------------------------------
  // Loyalty settings
  // ---------------------------------------------------------------

  const saveLoyaltySettings = async () => {
    const per = Number(loyaltyForm.currency_per_point);
    const value = Number(loyaltyForm.point_value);
    const min = Number(loyaltyForm.min_redeem_points);
    const maxPct = Number(loyaltyForm.max_redeem_percent);
    if ([per, value, min, maxPct].some((n) => Number.isNaN(n) || n < 0) || per <= 0 || value <= 0) {
      toast.error("Enter valid loyalty settings");
      return;
    }
    setLoyaltyBusy(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        enabled: loyaltyForm.enabled,
        currency_per_point: per,
        point_value: value,
        min_redeem_points: min,
        max_redeem_percent: maxPct,
        updated_at: new Date().toISOString(),
      };
      const { error: err } = await supabase
        .from("loyalty_settings")
        .upsert(payload, { onConflict: "restaurant_id" });
      if (err) throw err;
      setLoyaltySettings(payload as LoyaltySettingsRow);
      toast.success("Loyalty settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save loyalty settings");
    } finally {
      setLoyaltyBusy(false);
    }
  };

  // ---------------------------------------------------------------
  // Automations
  // ---------------------------------------------------------------

  const saveAutomation = async (triggerKey: string) => {
    const form = automationForms[triggerKey];
    if (!form) return;
    if (!form.message.trim()) {
      toast.error("Message is required");
      return;
    }
    setAutomationBusy(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        trigger_type: triggerKey,
        channel: form.channel,
        coupon_id: form.coupon_id ? Number(form.coupon_id) : null,
        message: form.message.trim(),
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };
      const { error: err } = await supabase
        .from("automations")
        .upsert(payload, { onConflict: "restaurant_id,trigger_type" });
      if (err) throw err;
      toast.success("Automation saved");
      setEditingTrigger(null);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save automation");
    } finally {
      setAutomationBusy(false);
    }
  };

  const membersForAudience = useCallback(
    (audience: string) => {
      if (audience === "birthday_today") {
        const today = new Date();
        return promoCustomers
          .filter((c) => isBirthdayToday(c.birthday, today))
          .map((customer) => ({
            customer,
            stats: customerStats.get(customer.phone) || {
              orderCount: 0,
              totalSpent: 0,
              lastOrderAt: null,
              itemNames: [],
              categories: [],
            },
          }));
      }
      if (audience === "recent") {
        return computeSegmentMembers({
          rules: { visited_within_days: 7 },
          customers: promoCustomers,
          stats: customerStats,
        });
      }
      if (audience === "loyalty_members") {
        return promoCustomers
          .filter((c) => Number(c.loyalty_points || 0) > 0)
          .map((customer) => ({
            customer,
            stats: customerStats.get(customer.phone) || {
              orderCount: 0,
              totalSpent: 0,
              lastOrderAt: null,
              itemNames: [],
              categories: [],
            },
          }));
      }
      const builtinKey =
        audience === "inactive_30"
          ? "inactive_30"
          : audience === "high_value"
            ? "high_value"
            : "new";
      return computeSegmentMembers({
        builtinKey,
        customers: promoCustomers,
        stats: customerStats,
      });
    },
    [promoCustomers, customerStats]
  );

  const runAutomationNow = async (triggerKey: string) => {
    const trigger = findTrigger(triggerKey);
    const saved = automationByTrigger.get(triggerKey);
    if (!trigger) return;
    if (!saved) {
      toast.error("Save the automation before running it");
      return;
    }
    setRunningTrigger(triggerKey);
    try {
      const members = membersForAudience(trigger.audience);
      const recipients = buildRecipients(members, saved.channel);
      if (recipients.length === 0) {
        toast.error("No matching recipients right now");
        return;
      }

      let coupon: CouponLike | null = null;
      if (saved.coupon_id) {
        const { data } = await supabase
          .from("coupons")
          .select("*")
          .eq("id", saved.coupon_id)
          .maybeSingle();
        coupon = (data as CouponLike) || null;
      }

      const message = buildCampaignMessage({
        template: saved.message,
        customerName: null,
        restaurantName,
        coupon,
        currency,
        points: 0,
      });

      const { data: campaign, error: insertErr } = await supabase
        .from("campaigns")
        .insert({
          restaurant_id: restaurantId,
          name: `${trigger.name} — manual run`,
          coupon_id: saved.coupon_id,
          channel: saved.channel,
          subject: trigger.name,
          message,
          source: "automation",
          trigger_type: triggerKey,
          status: "draft",
          audience_count: recipients.length,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      const result = await dispatchToServer(campaign.id, recipients);
      await supabase
        .from("automations")
        .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("restaurant_id", restaurantId)
        .eq("trigger_type", triggerKey);

      if (result.sent > 0) {
        toast.success(`${trigger.name}: sent to ${result.sent} recipient(s)`);
      } else {
        toast.error(result.errors?.[0] || "No messages were delivered", { duration: 6000 });
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to run automation");
    } finally {
      setRunningTrigger(null);
    }
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </button>
      </div>
    );
  }

  const filteredSegments = segments.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const filteredCoupons = coupons.filter((c) =>
    [c.code, c.description || ""].join(" ").toLowerCase().includes(couponSearch.trim().toLowerCase())
  );

  const previewAudience = showCampaignModal
    ? membersForSelection(campaignForm.segmentValue).length
    : 0;
  const previewRecipients = showCampaignModal
    ? buildRecipients(
        membersForSelection(campaignForm.segmentValue),
        campaignForm.channel
      ).length
    : 0;

  const loyaltySettingsEffective: LoyaltySettingsLike = {
    restaurant_id: restaurantId,
    enabled: loyaltySettings?.enabled ?? true,
    currency_per_point: Number(loyaltySettings?.currency_per_point ?? 10),
    point_value: Number(loyaltySettings?.point_value ?? 0.1),
    min_redeem_points: Number(loyaltySettings?.min_redeem_points ?? 100),
    max_redeem_percent: Number(loyaltySettings?.max_redeem_percent ?? 50),
  };

  return (
    <div className="space-y-5">
      {/* Header + tabs */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Customer Marketing</h3>
            <p className="text-sm text-gray-500">
              Segments, coupons, campaigns, loyalty and automations — in one place
            </p>
          </div>
          <button
            onClick={fetchData}
            className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 self-start"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="flex space-x-1 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon className="h-4 w-4 mr-2" />
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------------------------------------------------------
          OVERVIEW
      --------------------------------------------------------------- */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              icon={<Ticket className="h-5 w-5 text-blue-600" />}
              label="Active Coupons"
              value={String(activeCoupons.length)}
              accent="bg-blue-100"
            />
            <StatCard
              icon={<Gift className="h-5 w-5 text-green-600" />}
              label="Redemptions (30d)"
              value={String(overview.recent.length)}
              accent="bg-green-100"
            />
            <StatCard
              icon={<Send className="h-5 w-5 text-purple-600" />}
              label="Campaigns Sent"
              value={String(overview.campaignsSent)}
              accent="bg-purple-100"
            />
            <StatCard
              icon={<BarChart3 className="h-5 w-5 text-indigo-600" />}
              label="Promo Revenue (30d)"
              value={formatCurrency(overview.revenue, currency)}
              accent="bg-indigo-100"
            />
            <StatCard
              icon={<Info className="h-5 w-5 text-amber-600" />}
              label="Discount Given (30d)"
              value={formatCurrency(overview.discountGiven, currency)}
              accent="bg-amber-100"
            />
            <StatCard
              icon={<Star className="h-5 w-5 text-pink-600" />}
              label="Loyalty Points Outstanding"
              value={String(Math.round(overview.pointsOutstanding))}
              accent="bg-pink-100"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900">Recent Redemptions</h4>
                {overview.discountGiven > 0 && (
                  <span className="text-xs text-gray-500">
                    ROI {overview.revenue > 0 ? overview.roi.toFixed(1) : "0.0"}x
                  </span>
                )}
              </div>
              {overview.recent.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No coupon redemptions in the last 30 days.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Code
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Customer
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Discount
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Order
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {overview.recent.slice(0, 8).map((r) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">
                            {formatDate(r.created_at)}
                          </td>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900">
                            {couponById.get(r.coupon_id)?.code || `#${r.coupon_id}`}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700">
                            {r.customer_phone || "—"}
                          </td>
                          <td className="px-4 py-2 text-sm text-red-600 text-right whitespace-nowrap">
                            −{formatCurrency(r.discount_amount, currency)}
                          </td>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right whitespace-nowrap">
                            {formatCurrency(r.order_total, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h4 className="text-sm font-medium text-gray-900">Top Coupons</h4>
              </div>
              {coupons.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No coupons yet. Create one in the Coupons tab.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Code
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Offer
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Uses
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {topCoupons.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2 text-sm font-semibold text-gray-900">{c.code}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">
                          {offerLabel(c as CouponLike, currency)}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">
                          {c.redemption_count}
                          {c.max_uses ? ` / ${c.max_uses}` : ""}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {c.is_active ? "Active" : "Off"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------
          SEGMENTS
      --------------------------------------------------------------- */}
      {tab === "segments" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BUILTIN_SEGMENTS.map((segment) => (
              <div key={segment.key} className="bg-white rounded-lg shadow p-5 flex flex-col">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-gray-900">{segment.name}</h4>
                    <p className="text-xs text-gray-500 mt-1">{segment.description}</p>
                  </div>
                  <span className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 ml-2">
                    {countBuiltin(segment.key)}
                  </span>
                </div>
                <button
                  onClick={() => openCampaignModal(`builtin:${segment.key}`)}
                  className="mt-auto inline-flex items-center justify-center px-3 py-2 text-sm border border-blue-200 text-blue-700 rounded-md hover:bg-blue-50"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Campaign
                </button>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h4 className="text-lg font-medium text-gray-900">Custom Segments</h4>
                <p className="text-sm text-gray-500">
                  Combine filters: order count, spend, recency and purchased items/categories
                </p>
              </div>
              <button
                onClick={openNewSegment}
                className="inline-flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Segment
              </button>
            </div>

            <div className="relative mb-5">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search segments..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {filteredSegments.length === 0 ? (
              <div className="py-10 text-center text-gray-500 text-sm">
                No custom segments yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Rules
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Members
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredSegments.map((segment) => {
                      const rules = (segment.rules || {}) as SegmentRules;
                      const ruleLabels = Object.entries(rules)
                        .filter(([, v]) => v != null && v !== "")
                        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`);
                      return (
                        <tr key={segment.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{segment.name}</p>
                            {segment.description && (
                              <p className="text-xs text-gray-500">{segment.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {ruleLabels.length > 0 ? ruleLabels.join(" · ") : "No filters"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                              {countRules(rules)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => openCampaignModal(`custom:${segment.id}`)}
                              className="inline-flex p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                              title="Create campaign"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openEditSegment(segment)}
                              className="inline-flex p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md"
                              title="Edit segment"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeletingSegment(segment)}
                              className="inline-flex p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                              title="Delete segment"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------
          COUPONS
      --------------------------------------------------------------- */}
      {tab === "coupons" && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h4 className="text-lg font-medium text-gray-900">Coupons</h4>
              <p className="text-sm text-gray-500">
                Percentage, fixed amount and BOGO offers with min bill, expiry and usage rules
              </p>
            </div>
            <button
              onClick={openNewCoupon}
              className="inline-flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Coupon
            </button>
          </div>

          <div className="relative mb-5">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={couponSearch}
              onChange={(e) => setCouponSearch(e.target.value)}
              placeholder="Search by code or description..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {filteredCoupons.length === 0 ? (
            <div className="py-12 text-center">
              <Ticket className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">
                {coupons.length === 0
                  ? "No coupons yet. Create your first offer to get started."
                  : "No coupons match your search."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Offer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Min Bill
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Usage
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Validity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCoupons.map((coupon) => (
                    <tr key={coupon.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">{coupon.code}</p>
                        {coupon.description && (
                          <p className="text-xs text-gray-500">{coupon.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {offerLabel(coupon as CouponLike, currency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {Number(coupon.min_bill || 0) > 0
                          ? formatCurrency(coupon.min_bill, currency)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {coupon.redemption_count}
                        {coupon.max_uses ? ` / ${coupon.max_uses}` : ""}
                        <span className="text-xs text-gray-500">
                          {" "}
                          (max {coupon.per_customer_limit}/customer)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {coupon.starts_at || coupon.ends_at ? (
                          <>
                            {coupon.starts_at ? formatDate(coupon.starts_at) : "Now"}
                            <br />→ {coupon.ends_at ? formatDate(coupon.ends_at) : "No expiry"}
                          </>
                        ) : (
                          "Always"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            coupon.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {coupon.is_active ? "Active" : "Off"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => toggleCoupon(coupon)}
                          className="inline-flex p-2 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-md"
                          title={coupon.is_active ? "Deactivate" : "Activate"}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openEditCoupon(coupon)}
                          className="inline-flex p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-md"
                          title="Edit coupon"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingCoupon(coupon)}
                          className="inline-flex p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                          title="Delete coupon"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------
          CAMPAIGNS
      --------------------------------------------------------------- */}
      {tab === "campaigns" && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h4 className="text-lg font-medium text-gray-900">Campaigns</h4>
              <p className="text-sm text-gray-500">
                Pick a segment, attach an offer, and schedule
              </p>
            </div>
            <button
              onClick={() => openCampaignModal()}
              className="inline-flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="py-12 text-center">
              <Send className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No campaigns yet. Create your first campaign.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Campaign
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Segment
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Channel
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Sent
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Redeemed
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Revenue
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {campaigns.map((campaign) => {
                    const perf = campaignPerformance(campaign.id);
                    const due =
                      campaign.status === "scheduled" &&
                      campaign.scheduled_at &&
                      new Date(campaign.scheduled_at).getTime() <= Date.now();
                    const canSend = campaign.status !== "sent" || due;
                    return (
                      <tr key={campaign.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{campaign.name}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[220px]">
                            {campaign.message}
                          </p>
                          {campaign.source === "automation" && (
                            <span className="inline-flex mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 uppercase">
                              Auto
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {campaignLabel(campaign)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center text-xs font-medium text-gray-700 capitalize">
                            {campaign.channel === "email" ? (
                              <Mail className="h-3.5 w-3.5 mr-1 text-gray-400" />
                            ) : campaign.channel === "whatsapp" ? (
                              <MessageCircle className="h-3.5 w-3.5 mr-1 text-gray-400" />
                            ) : (
                              <Smartphone className="h-3.5 w-3.5 mr-1 text-gray-400" />
                            )}
                            {campaign.channel}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge(
                              campaign.status
                            )}`}
                          >
                            {campaign.status}
                          </span>
                          {campaign.status === "scheduled" && campaign.scheduled_at && (
                            <p className="text-xs text-gray-500 mt-1 flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {formatDate(campaign.scheduled_at)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {campaign.delivered_count}
                          <span className="text-xs text-gray-500"> / {campaign.audience_count}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right">
                          {perf.redeemed}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right whitespace-nowrap">
                          {formatCurrency(perf.revenue, currency)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {canSend && (
                            <button
                              onClick={() => sendCampaign(campaign)}
                              disabled={sendingCampaignId === campaign.id}
                              className="inline-flex p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md disabled:opacity-50"
                              title={due || campaign.status === "scheduled" ? "Send now" : "Send"}
                            >
                              {sendingCampaignId === campaign.id ? (
                                <LoadingSpinner size="sm" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => openDeliveries(campaign)}
                            className="inline-flex p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"
                            title="Delivery log"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {campaign.status !== "sent" && (
                            <button
                              onClick={() => setDeletingCampaign(campaign)}
                              className="inline-flex p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                              title="Delete campaign"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------
          LOYALTY
      --------------------------------------------------------------- */}
      {tab === "loyalty" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Users className="h-5 w-5 text-blue-600" />}
              label="Members with Points"
              value={String(loyaltyStats.members)}
              accent="bg-blue-100"
            />
            <StatCard
              icon={<Star className="h-5 w-5 text-yellow-600" />}
              label="Points Outstanding"
              value={String(Math.round(loyaltyStats.outstanding))}
              accent="bg-yellow-100"
            />
            <StatCard
              icon={<Gift className="h-5 w-5 text-green-600" />}
              label="Points Redeemed"
              value={String(Math.round(loyaltyStats.redeemedPoints))}
              accent="bg-green-100"
            />
            <StatCard
              icon={<BarChart3 className="h-5 w-5 text-purple-600" />}
              label="Redeemed Value"
              value={formatCurrency(loyaltyStats.redeemValue, currency)}
              accent="bg-purple-100"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-lg shadow p-6">
              <h4 className="text-lg font-medium text-gray-900 mb-1">Loyalty Settings</h4>
              <p className="text-sm text-gray-500 mb-5">
                Customers earn points on every paid order and redeem them at checkout.
              </p>
              <div className="space-y-4">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={loyaltyForm.enabled}
                    onChange={(e) =>
                      setLoyaltyForm((prev) => ({ ...prev, enabled: e.target.checked }))
                    }
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Enable loyalty program
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Currency spent per point (earn)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={loyaltyForm.currency_per_point}
                      onChange={(e) =>
                        setLoyaltyForm((prev) => ({
                          ...prev,
                          currency_per_point: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      e.g. 10 → {formatCurrency(10, currency)} spent earns 1 point
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Value per point (redeem)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={loyaltyForm.point_value}
                      onChange={(e) =>
                        setLoyaltyForm((prev) => ({ ...prev, point_value: e.target.value }))
                      }
                      className={inputClass}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      e.g. 0.1 → 100 points = {formatCurrency(10, currency)}
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Minimum points to redeem</label>
                    <input
                      type="number"
                      min="0"
                      value={loyaltyForm.min_redeem_points}
                      onChange={(e) =>
                        setLoyaltyForm((prev) => ({ ...prev, min_redeem_points: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Max redemption (% of bill)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={loyaltyForm.max_redeem_percent}
                      onChange={(e) =>
                        setLoyaltyForm((prev) => ({ ...prev, max_redeem_percent: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <button
                    onClick={saveLoyaltySettings}
                    disabled={loyaltyBusy}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loyaltyBusy ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Settings
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
                  Preview: earning{" "}
                  {formatCurrency(
                    Number(loyaltyForm.currency_per_point || 10) * 10,
                    currency
                  )}{" "}
                  gives{" "}
                  {earnPoints(loyaltySettingsEffective, Number(loyaltyForm.currency_per_point || 10) * 10)}{" "}
                  points, worth{" "}
                  {formatCurrency(
                    redeemValue(loyaltySettingsEffective, 100),
                    currency
                  )}{" "}
                  when redeeming 100 points.
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h4 className="text-sm font-medium text-gray-900">Recent Loyalty Activity</h4>
              </div>
              {loyaltyTxns.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  No loyalty activity yet. Points are earned automatically on paid orders.
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Customer
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Type
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Points
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {loyaltyTxns.map((txn) => (
                        <tr key={txn.id}>
                          <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                            {formatDate(txn.created_at)}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-700">
                            {txn.customer_phone}
                          </td>
                          <td className="px-4 py-2 text-xs capitalize">{txn.type}</td>
                          <td
                            className={`px-4 py-2 text-xs font-semibold text-right ${
                              Number(txn.points) >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {Number(txn.points) >= 0 ? "+" : ""}
                            {txn.points}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-900 text-right">
                            {txn.balance_after ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------
          AUTOMATIONS
      --------------------------------------------------------------- */}
      {tab === "automations" && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-5 flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600">
              Automations send messages automatically. Birthday, inactive and high-value runs
              execute daily (via cron or <span className="font-medium">Run now</span>); first
              visit, after-purchase and loyalty milestone messages fire right after checkout.
              Enable SMTP credentials (SMTP_USER / SMTP_PASS) to actually dispatch messages.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {AUTOMATION_TRIGGERS.map((trigger) => {
              const form = automationForms[trigger.key];
              const saved = automationByTrigger.get(trigger.key);
              if (!form) return null;
              const editing = editingTrigger === trigger.key;
              const coupon = coupons.find((c) => String(c.id) === form.coupon_id);
              return (
                <div key={trigger.key} className="bg-white rounded-lg shadow p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start">
                      <div className="h-9 w-9 rounded-lg bg-purple-100 flex items-center justify-center mr-3 flex-shrink-0">
                        <Zap className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{trigger.name}</h4>
                        <p className="text-xs text-gray-500">{trigger.description}</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        form.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {form.is_active ? "Active" : "Off"}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 italic mb-3">e.g. “{trigger.example}”</p>

                  {!editing ? (
                    <div className="space-y-2">
                      <div className="text-sm text-gray-700">
                        <span className="text-gray-500">Channel:</span>{" "}
                        <span className="font-medium capitalize">{form.channel}</span>
                        <span className="text-gray-500 ml-3">Offer:</span>{" "}
                        <span className="font-medium">
                          {coupon ? `${coupon.code} (${offerLabel(coupon as CouponLike, currency)})` : "None"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 line-clamp-2">
                        {form.message}
                      </p>
                      {saved?.last_run_at && (
                        <p className="text-xs text-gray-500 flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          Last run {formatDate(saved.last_run_at)}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() => setEditingTrigger(trigger.key)}
                          className="inline-flex items-center px-3 py-1.5 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </button>
                        <button
                          onClick={() => runAutomationNow(trigger.key)}
                          disabled={runningTrigger === trigger.key || !saved}
                          className="inline-flex items-center px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                          title={saved ? "Run once now" : "Save first"}
                        >
                          {runningTrigger === trigger.key ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <Play className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Run now
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <div>
                          <label className={labelClass}>Coupon (optional)</label>
                          <select
                            value={form.coupon_id}
                            onChange={(e) =>
                              setAutomationForms((prev) => ({
                                ...prev,
                                [trigger.key]: { ...prev[trigger.key], coupon_id: e.target.value },
                              }))
                            }
                            className={inputClass}
                          >
                            <option value="">No coupon</option>
                            {coupons
                              .filter((c) => c.is_active)
                              .map((c) => (
                                <option key={c.id} value={String(c.id)}>
                                  {c.code}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Message template</label>
                        <textarea
                          value={form.message}
                          onChange={(e) =>
                            setAutomationForms((prev) => ({
                              ...prev,
                              [trigger.key]: { ...prev[trigger.key], message: e.target.value },
                            }))
                          }
                          rows={3}
                          className={`${inputClass} resize-none`}
                          placeholder="Use {name}, {restaurant}, {offer}, {coupon}, {points}"
                        />
                      </div>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={form.is_active}
                          onChange={(e) =>
                            setAutomationForms((prev) => ({
                              ...prev,
                              [trigger.key]: { ...prev[trigger.key], is_active: e.target.checked },
                            }))
                          }
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700">Enabled</span>
                      </label>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => saveAutomation(trigger.key)}
                          disabled={automationBusy}
                          className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          {automationBusy ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-1.5" />
                              Save
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setEditingTrigger(null)}
                          className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------
          MODALS
      --------------------------------------------------------------- */}

      {showSegmentModal && (
        <Modal
          title={segmentForm.id ? "Edit Segment" : "New Segment"}
          onClose={() => setShowSegmentModal(false)}
          wide
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                type="text"
                value={segmentForm.name}
                onChange={(e) => setSegmentForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Pizza lovers who stopped visiting"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <input
                type="text"
                value={segmentForm.description}
                onChange={(e) => setSegmentForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Optional note for your team"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Min orders</label>
                <input
                  type="number"
                  min="0"
                  value={segmentForm.min_orders}
                  onChange={(e) => setSegmentForm((p) => ({ ...p, min_orders: e.target.value }))}
                  className={inputClass}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={labelClass}>Max orders</label>
                <input
                  type="number"
                  min="0"
                  value={segmentForm.max_orders}
                  onChange={(e) => setSegmentForm((p) => ({ ...p, max_orders: e.target.value }))}
                  className={inputClass}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={labelClass}>Min total spend</label>
                <input
                  type="number"
                  min="0"
                  value={segmentForm.min_spend}
                  onChange={(e) => setSegmentForm((p) => ({ ...p, min_spend: e.target.value }))}
                  className={inputClass}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={labelClass}>Inactive for (days)</label>
                <input
                  type="number"
                  min="1"
                  value={segmentForm.inactive_days}
                  onChange={(e) =>
                    setSegmentForm((p) => ({ ...p, inactive_days: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={labelClass}>Visited within (days)</label>
                <input
                  type="number"
                  min="1"
                  value={segmentForm.visited_within_days}
                  onChange={(e) =>
                    setSegmentForm((p) => ({ ...p, visited_within_days: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={labelClass}>Purchased item / category</label>
                <input
                  type="text"
                  value={segmentForm.purchased_item_or_category}
                  onChange={(e) =>
                    setSegmentForm((p) => ({
                      ...p,
                      purchased_item_or_category: e.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder="e.g. Pizza"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Leave a filter empty to ignore it. All filled filters must match.
            </p>
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={() => setShowSegmentModal(false)}
              disabled={segmentBusy}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={saveSegment}
              disabled={segmentBusy}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              {segmentBusy ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {segmentForm.id ? "Save Changes" : "Create Segment"}
                </>
              )}
            </button>
          </div>
        </Modal>
      )}

      {showCouponModal && (
        <Modal
          title={couponForm.id ? "Edit Coupon" : "New Coupon"}
          onClose={() => setShowCouponModal(false)}
          wide
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Code *</label>
                <input
                  type="text"
                  value={couponForm.code}
                  onChange={(e) =>
                    setCouponForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))
                  }
                  placeholder="WELCOME20"
                  className={`${inputClass} font-bold uppercase`}
                />
              </div>
              <div>
                <label className={labelClass}>Discount type</label>
                <select
                  value={couponForm.discount_type}
                  onChange={(e) =>
                    setCouponForm((p) => ({ ...p, discount_type: e.target.value }))
                  }
                  className={inputClass}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed amount</option>
                  <option value="bogo">BOGO (Buy 1 Get 1)</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <input
                type="text"
                value={couponForm.description}
                onChange={(e) => setCouponForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Shown to your team"
                className={inputClass}
              />
            </div>
            {couponForm.discount_type !== "bogo" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    {couponForm.discount_type === "percentage" ? "Percent off *" : "Amount off *"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={couponForm.discount_value}
                    onChange={(e) =>
                      setCouponForm((p) => ({ ...p, discount_value: e.target.value }))
                    }
                    className={inputClass}
                    placeholder={couponForm.discount_type === "percentage" ? "20" : "100"}
                  />
                </div>
                {couponForm.discount_type === "percentage" && (
                  <div>
                    <label className={labelClass}>Max discount cap</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={couponForm.max_discount}
                      onChange={(e) =>
                        setCouponForm((p) => ({ ...p, max_discount: e.target.value }))
                      }
                      className={inputClass}
                      placeholder="No cap"
                    />
                  </div>
                )}
              </div>
            )}
            {couponForm.discount_type === "bogo" && (
              <div>
                <label className={labelClass}>Scope item (optional)</label>
                <input
                  type="text"
                  value={couponForm.scope_item_name}
                  onChange={(e) =>
                    setCouponForm((p) => ({ ...p, scope_item_name: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="Leave empty to apply to the cheapest item"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Free units = floor(quantity / 2) on the scoped item, otherwise the cheapest
                  single unit is free.
                </p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Min bill</label>
                <input
                  type="number"
                  min="0"
                  value={couponForm.min_bill}
                  onChange={(e) => setCouponForm((p) => ({ ...p, min_bill: e.target.value }))}
                  className={inputClass}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={labelClass}>Total uses</label>
                <input
                  type="number"
                  min="1"
                  value={couponForm.max_uses}
                  onChange={(e) => setCouponForm((p) => ({ ...p, max_uses: e.target.value }))}
                  className={inputClass}
                  placeholder="Unlimited"
                />
              </div>
              <div>
                <label className={labelClass}>Per customer</label>
                <input
                  type="number"
                  min="1"
                  value={couponForm.per_customer_limit}
                  onChange={(e) =>
                    setCouponForm((p) => ({ ...p, per_customer_limit: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Starts at</label>
                <input
                  type="datetime-local"
                  value={couponForm.starts_at}
                  onChange={(e) => setCouponForm((p) => ({ ...p, starts_at: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Expires at</label>
                <input
                  type="datetime-local"
                  value={couponForm.ends_at}
                  onChange={(e) => setCouponForm((p) => ({ ...p, ends_at: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={couponForm.is_active}
                onChange={(e) => setCouponForm((p) => ({ ...p, is_active: e.target.checked }))}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Active</span>
            </label>
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={() => setShowCouponModal(false)}
              disabled={couponBusy}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={saveCoupon}
              disabled={couponBusy}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              {couponBusy ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {couponForm.id ? "Save Changes" : "Create Coupon"}
                </>
              )}
            </button>
          </div>
        </Modal>
      )}

      {showCampaignModal && (
        <Modal
          title="New Campaign"
          onClose={() => setShowCampaignModal(false)}
          wide
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Campaign name *</label>
              <input
                type="text"
                value={campaignForm.name}
                onChange={(e) => setCampaignForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Weekend special"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>1. Segment *</label>
                <select
                  value={campaignForm.segmentValue}
                  onChange={(e) =>
                    setCampaignForm((p) => ({ ...p, segmentValue: e.target.value }))
                  }
                  className={inputClass}
                >
                  <optgroup label="Built-in">
                    {BUILTIN_SEGMENTS.map((s) => (
                      <option key={s.key} value={`builtin:${s.key}`}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                  {segments.length > 0 && (
                    <optgroup label="Custom">
                      {segments.map((s) => (
                        <option key={s.id} value={`custom:${s.id}`}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className={labelClass}>2. Offer / coupon</label>
                <select
                  value={campaignForm.couponId}
                  onChange={(e) =>
                    setCampaignForm((p) => ({ ...p, couponId: e.target.value }))
                  }
                  className={inputClass}
                >
                  <option value="">No coupon</option>
                  {coupons
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.code} — {offerLabel(c as CouponLike, currency)}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>3. Schedule</label>
                <select
                  value={campaignForm.scheduleMode}
                  onChange={(e) =>
                    setCampaignForm((p) => ({
                      ...p,
                      scheduleMode: e.target.value as "now" | "later",
                    }))
                  }
                  className={inputClass}
                >
                  <option value="now">Send now</option>
                  <option value="later">Schedule for later</option>
                </select>
              </div>
            </div>

            {campaignForm.scheduleMode === "later" && (
              <div>
                <label className={labelClass}>Send at</label>
                <input
                  type="datetime-local"
                  value={campaignForm.scheduleAt}
                  onChange={(e) =>
                    setCampaignForm((p) => ({ ...p, scheduleAt: e.target.value }))
                  }
                  className={inputClass}
                />
              </div>
            )}

            {campaignForm.channel === "email" && (
              <div>
                <label className={labelClass}>Email subject</label>
                <input
                  type="text"
                  value={campaignForm.subject}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, subject: e.target.value }))}
                  className={inputClass}
                  placeholder="A special offer for you"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass}>Message *</label>
                <button
                  type="button"
                  onClick={applySuggestedMessage}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Use suggested message
                </button>
              </div>
              <textarea
                value={campaignForm.message}
                onChange={(e) => setCampaignForm((p) => ({ ...p, message: e.target.value }))}
                rows={4}
                className={`${inputClass} resize-none`}
                placeholder="Placeholders: {name} {restaurant} {offer} {coupon} {expires}"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start space-x-2">
              <Users className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <span className="font-semibold">{previewAudience}</span> customer(s) in this
                segment, <span className="font-semibold">{previewRecipients}</span> reachable on email.
              </div>
            </div>
          </div>
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={() => setShowCampaignModal(false)}
              disabled={campaignBusy}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={createCampaign}
              disabled={campaignBusy}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              {campaignBusy ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {campaignForm.scheduleMode === "later" ? "Schedule Campaign" : "Create & Send"}
                </>
              )}
            </button>
          </div>
        </Modal>
      )}

      {logCampaign && (
        <Modal
          title={`Delivery Log — ${logCampaign.name}`}
          onClose={() => setLogCampaign(null)}
          wide
        >
          {deliveriesLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" />
            </div>
          ) : deliveries.length === 0 ? (
            <p className="text-center text-gray-500 py-6 text-sm">
              No deliveries recorded for this campaign yet.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Recipient
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Sent
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 text-sm text-gray-900">{d.recipient}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{d.customer_name || "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            d.status === "sent" || d.status === "delivered"
                              ? "bg-green-100 text-green-700"
                              : d.status === "failed"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {d.sent_at ? formatDate(d.sent_at) : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-red-600 max-w-[220px] truncate">
                        {d.error || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      <ConfirmationDialog
        isOpen={!!deletingSegment}
        onClose={() => setDeletingSegment(null)}
        onConfirm={deleteSegment}
        title="Delete Segment"
        message={
          deletingSegment
            ? `Delete segment "${deletingSegment.name}"? Campaigns that already used it keep running with their saved settings.`
            : ""
        }
        confirmText="Delete"
      />

      <ConfirmationDialog
        isOpen={!!deletingCoupon}
        onClose={() => setDeletingCoupon(null)}
        onConfirm={deleteCoupon}
        title="Delete Coupon"
        message={
          deletingCoupon
            ? `Delete coupon "${deletingCoupon.code}"? Existing redemption history stays, but it can no longer be used.`
            : ""
        }
        confirmText="Delete"
      />

      <ConfirmationDialog
        isOpen={!!deletingCampaign}
        onClose={() => setDeletingCampaign(null)}
        onConfirm={deleteCampaign}
        title="Delete Campaign"
        message={
          deletingCampaign
            ? `Delete campaign "${deletingCampaign.name}" and its delivery log?`
            : ""
        }
        confirmText="Delete"
      />
    </div>
  );
}
