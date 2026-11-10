"use client";

import { useState, useMemo, useEffect } from "react";
import { ShoppingCart, Plus, Minus, Printer, MessageCircle, X, Search, CreditCard, UtensilsCrossed, ShoppingBag, Truck, Clock, Store, AlertTriangle, Tag, Star } from "lucide-react";
import { usePOSStore, checkMenuItemsStock, checkAllMenuItemsStock } from "@/lib/store";
import type { MenuItemStockStatus } from "@/lib/store";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/utils";
import ItemOptionsDialog from "@/components/ui/ItemOptionsDialog";
import { supabase } from "@/lib/supabase";
import {
  CouponLike,
  LoyaltySettingsLike,
  computeCouponDiscount,
  defaultLoyaltySettings,
  earnPoints,
  maxRedeemablePoints,
  redeemValue,
  validateCoupon,
} from "@/lib/promotions";
import { runEventAutomations } from "@/lib/promotionAutomations";
import {
  buildReceiptText,
  openWhatsAppReceipt,
  sendReceiptEmail,
} from "@/lib/receipt";
import toast from "react-hot-toast";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_JYYxadLPnYq0QW";

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

// Fire-and-forget post-checkout bookkeeping: coupon redemption + attribution,
// loyalty earn/redeem ledger, and event automations. Promotions must never
// block a successful checkout, so failures are logged and swallowed.
async function postOrderRewards(opts: {
  restaurantId: string;
  restaurantName: string;
  currency: string;
  customer: { name: string; phone: string; email?: string | null; loyaltyBalance?: number | null };
  orderId: number;
  coupon: CouponLike | null;
  couponDiscount: number;
  discountedTotalWithTax: number;
  redeemPoints: number;
  earnedPoints: number;
  loyaltySettings: LoyaltySettingsLike | null;
}) {
  try {
    const digits = (opts.customer.phone || "").replace(/\D/g, "");

    if (opts.coupon && opts.couponDiscount > 0) {
      await supabase.rpc("increment_coupon_redemptions", { p_coupon_id: opts.coupon.id });

      // Best-effort campaign attribution: match the latest delivered message to this
      // phone that carried the same coupon.
      let campaignId: number | null = null;
      const { data: delivery } = await supabase
        .from("campaign_deliveries")
        .select("campaign_id")
        .eq("restaurant_id", opts.restaurantId)
        .eq("recipient", digits)
        .eq("status", "delivered")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (delivery?.campaign_id) {
        const { data: camp } = await supabase
          .from("campaigns")
          .select("coupon_id")
          .eq("id", delivery.campaign_id)
          .maybeSingle();
        if (camp && camp.coupon_id === opts.coupon.id) {
          campaignId = delivery.campaign_id as number;
        }
      }

      await supabase.from("promotion_redemptions").insert({
        restaurant_id: opts.restaurantId,
        coupon_id: opts.coupon.id,
        campaign_id: campaignId,
        order_id: opts.orderId,
        customer_phone: opts.customer.phone,
        discount_amount: opts.couponDiscount,
        order_total: opts.discountedTotalWithTax,
      });
    }

    const previous = opts.customer.loyaltyBalance ?? 0;
    let balanceAfter = opts.customer.loyaltyBalance ?? null;

    if (opts.redeemPoints > 0) {
      const { data: afterRedeem } = await supabase.rpc("record_loyalty_transaction", {
        p_restaurant_id: opts.restaurantId,
        p_phone: opts.customer.phone,
        p_points: -opts.redeemPoints,
        p_type: "redeem",
        p_name: opts.customer.name,
        p_order_id: opts.orderId,
        p_note: `Loyalty redemption on order #${opts.orderId}`,
      });
      if (afterRedeem != null) balanceAfter = Number(afterRedeem);
    }

    if (opts.earnedPoints > 0 && opts.loyaltySettings?.enabled) {
      const { data: afterEarn } = await supabase.rpc("record_loyalty_transaction", {
        p_restaurant_id: opts.restaurantId,
        p_phone: opts.customer.phone,
        p_points: opts.earnedPoints,
        p_type: "earn",
        p_name: opts.customer.name,
        p_order_id: opts.orderId,
        p_note: `Points earned on order #${opts.orderId}`,
      });
      if (afterEarn != null) balanceAfter = Number(afterEarn);
    }

    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", opts.restaurantId)
      .eq("customer_phone", opts.customer.phone)
      .in("status", ["settled", "completed", "delivered"]);

    await runEventAutomations({
      restaurantId: opts.restaurantId,
      restaurantName: opts.restaurantName,
      currency: opts.currency,
      customer: {
        name: opts.customer.name,
        phone: opts.customer.phone,
        email: opts.customer.email || null,
      },
      orderCountAfter: count ?? 1,
      previousPointsBalance: previous,
      finalPointsBalance: balanceAfter,
      loyaltySettings: opts.loyaltySettings,
      orderTotal: opts.discountedTotalWithTax,
    });
  } catch (err) {
    console.error("Post-order reward bookkeeping failed:", err);
  }
}

function CustomerInfoModal({
  onSubmit,
  onCancel,
  restaurantId,
  isDelivery,
  appliedCoupon,
  discountedSubtotal,
  discountedTotalWithTax,
  loyaltySettings,
  currency,
  hasNewItems,
}: {
  onSubmit: (info: { name: string; phone: string; email?: string; address?: string; redeemPoints?: number; loyaltyBalance?: number }) => void;
  onCancel: () => void;
  restaurantId?: string;
  isDelivery: boolean;
  appliedCoupon?: CouponLike | null;
  discountedSubtotal: number;
  discountedTotalWithTax: number;
  loyaltySettings: LoyaltySettingsLike | null;
  currency: string;
  hasNewItems: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState(false);
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null);
  const [redeemPoints, setRedeemPoints] = useState("");
  const [couponLimitError, setCouponLimitError] = useState<string | null>(null);

  useEffect(() => {
    if (phone.length === 10 && restaurantId) {
      let cancelled = false;
      setLookingUp(true);
      usePOSStore.getState().lookupCustomerByPhone(restaurantId, phone).then((result) => {
        if (cancelled) return;
        setLookingUp(false);
        if (result) {
          setFoundCustomer(true);
          if (result.name) setName(result.name);
          if (result.email) setEmail(result.email);
          if (result.address) setAddress(result.address);
          setLoyaltyBalance(result.loyalty_points != null ? Number(result.loyalty_points) : null);
          toast.success("Customer found — details pre-filled");
        } else {
          setFoundCustomer(false);
          setLoyaltyBalance(null);
        }
      });
      return () => { cancelled = true; };
    } else {
      setFoundCustomer(false);
      setLoyaltyBalance(null);
    }
  }, [phone, restaurantId]);

  // Per-customer coupon usage limit can only be checked once the phone is known
  useEffect(() => {
    let cancelled = false;
    if (appliedCoupon && phone.length === 10 && restaurantId) {
      supabase
        .from("promotion_redemptions")
        .select("id")
        .eq("coupon_id", appliedCoupon.id)
        .eq("customer_phone", phone)
        .then(({ data }) => {
          if (cancelled) return;
          const limit = Number(appliedCoupon.per_customer_limit || 0);
          const used = (data || []).length;
          if (limit > 0 && used >= limit) {
            setCouponLimitError(
              used === 1
                ? "You have already used this coupon once."
                : `You have already used this coupon ${used} times.`
            );
          } else {
            setCouponLimitError(null);
          }
        });
      return () => { cancelled = true; };
    } else {
      setCouponLimitError(null);
    }
    return () => { cancelled = true; };
  }, [phone, appliedCoupon, restaurantId]);

  const balance = loyaltyBalance ?? 0;
  const maxPts = maxRedeemablePoints(loyaltySettings, discountedSubtotal, balance);
  const pts = redeemPoints.trim() === "" ? 0 : parseInt(redeemPoints, 10);
  const redeemValid =
    !isNaN(pts) &&
    pts >= 0 &&
    pts <= maxPts &&
    (pts === 0 ||
      (!!loyaltySettings && Number(loyaltySettings.min_redeem_points || 0) <= pts));
  const redemptionPreview = redeemValid && loyaltySettings ? redeemValue(loyaltySettings, pts) : 0;
  const payableAfterLoyalty = Math.max(0, discountedTotalWithTax - redemptionPreview);

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("Please enter customer name and phone number");
      return;
    }
    if (phone.length < 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }
    if (isDelivery && !address.trim()) {
      toast.error("Please enter the delivery address");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (couponLimitError) {
      toast.error(couponLimitError);
      return;
    }
    if (!redeemValid) {
      toast.error("Please enter a valid number of loyalty points");
      return;
    }
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      redeemPoints: pts > 0 ? pts : 0,
      loyaltyBalance: balance > 0 ? balance : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Customer Information</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-gray-600 text-sm mb-6">
          Enter phone number to auto-fill returning customer details
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Phone Number *
            </label>
            <div className="relative">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Enter 10-digit phone number"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
              />
              {lookingUp && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              )}
            </div>
            {foundCustomer && !lookingUp && (
              <p className="text-xs text-green-600 mt-1">Existing customer — details loaded</p>
            )}
          </div>
          {appliedCoupon && hasNewItems && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-green-800 flex items-center">
                  <Tag className="h-4 w-4 mr-1.5" />
                  Coupon {appliedCoupon.code} applied
                </p>
                <span className="text-xs text-green-600">discount applied to cart</span>
              </div>
              {couponLimitError && (
                <p className="text-xs text-red-600 mt-1 font-medium">{couponLimitError}</p>
              )}
            </div>
          )}
          {loyaltySettings?.enabled && hasNewItems && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-purple-800 flex items-center">
                  <Star className="h-4 w-4 mr-1.5" />
                  Loyalty Points
                </p>
                <span className="text-xs text-purple-700">
                  Balance: <span className="font-bold">{balance} pts</span>
                </span>
              </div>
              {loyaltySettings && maxPts > 0 ? (
                <>
                  <input
                    type="number"
                    min={0}
                    max={maxPts}
                    value={redeemPoints}
                    onChange={(e) => setRedeemPoints(e.target.value.replace(/\D/g, ""))}
                    placeholder={`Redeem up to ${maxPts} pts`}
                    className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
                  />
                  <p className="text-[11px] text-purple-600">
                    Max redeemable: {maxPts} pts (worth {formatCurrency(redeemValue(loyaltySettings, maxPts), currency)})
                    {Number(loyaltySettings.min_redeem_points || 0) > 1 &&
                      ` · Min ${loyaltySettings.min_redeem_points} pts`}
                  </p>
                  {(isNaN(pts) || pts > maxPts) && (
                    <p className="text-xs text-red-600 font-medium">Exceeds your redeemable points</p>
                  )}
                  {!isNaN(pts) && pts > 0 && pts < Number(loyaltySettings.min_redeem_points || 0) && (
                    <p className="text-xs text-red-600 font-medium">
                      Minimum {loyaltySettings.min_redeem_points} points required to redeem
                    </p>
                  )}
                  {redeemValid && pts > 0 && (
                    <div className="text-xs text-purple-800 bg-white rounded-md border border-purple-200 px-2 py-1.5 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Loyalty discount:</span>
                        <span className="font-semibold">-{formatCurrency(redemptionPreview, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Amount payable:</span>
                        <span className="font-semibold">{formatCurrency(payableAfterLoyalty, currency)}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-purple-600">
                  {balance > 0
                    ? "This order isn't eligible for redemption."
                    : "You have no loyalty balance yet — you'll earn points on this order."}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Customer Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter customer name"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address (optional)"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            />
          </div>
          {isDelivery && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Delivery Address *
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter full delivery address"
                rows={2}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
              />
            </div>
          )}
        </div>
        <div className="flex space-x-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              !name.trim() ||
              !phone.trim() ||
              phone.length < 10 ||
              (isDelivery && !address.trim()) ||
              !!couponLimitError ||
              !redeemValid
            }
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Continue to Payment
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({
  amount,
  restaurantId,
  customerInfo,
  currency,
  restaurantName,
  onSuccess,
  onCancel,
}: {
  amount: number;
  restaurantId?: string;
  customerInfo: { name: string; phone: string; email?: string };
  currency: string;
  restaurantName: string;
  onSuccess: (data: {
    method: "online" | "cash";
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    cashReceived?: number;
    change?: number;
  }) => void;
  onCancel: () => void;
}) {
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cash" | null>(null);
  const [cashAmount, setCashAmount] = useState("");

  const handleOnlinePayment = async () => {
    setProcessing(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error("Failed to load payment system. Please try again.");
        return;
      }

      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Math.round(amount), restaurantId }),
      });
      if (!res.ok) throw new Error("Failed to create order");
      const order = await res.json();

      const rzp = new window.Razorpay({
        key: order.razorpayKeyId || RAZORPAY_KEY,
        amount: order.amount,
        currency: order.currency,
        name: restaurantName,
        description: "Food Order",
        order_id: order.id,
        handler: (response: any) => {
          onSuccess({
            method: "online",
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
          });
        },
        prefill: {
          name: customerInfo.name,
          email: customerInfo.email || "customer@example.com",
          contact: customerInfo.phone,
        },
        theme: { color: "#2563eb" },
        method: { upi: true, card: true, netbanking: true },
        modal: {
          ondismiss: () => {
            toast.error("Payment was cancelled.");
            onCancel();
          },
        },
      });

      rzp.open();
    } catch (err) {
      console.error(err);
      toast.error("Payment failed, please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handleCashPayment = () => {
    const cash = parseFloat(cashAmount);
    if (isNaN(cash) || cash < amount) {
      toast.error(`Please enter at least ${formatCurrency(amount, currency)}`);
      return;
    }
    onSuccess({
      method: "cash",
      cashReceived: cash,
      change: cash - amount,
    });
  };

  if (!paymentMethod) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Choose Payment Method</h3>
            <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-gray-600 mb-6">
            Total Amount: <span className="font-semibold text-gray-900">{formatCurrency(amount, currency)}</span>
          </p>
          <div className="space-y-3">
            <button
              onClick={() => setPaymentMethod("online")}
              className="w-full p-4 border-2 border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium"
            >
              Pay Online (UPI / Card / Net Banking)
            </button>
            <button
              onClick={() => setPaymentMethod("cash")}
              className="w-full p-4 border-2 border-green-500 text-green-600 rounded-lg hover:bg-green-50 transition-colors font-medium"
            >
              Pay with Cash
            </button>
          </div>
          <button
            onClick={onCancel}
            className="w-full mt-4 py-2 text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (paymentMethod === "cash") {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Cash Payment</h3>
            <button onClick={() => setPaymentMethod(null)} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-gray-600 mb-4">
            Total Amount: <span className="font-semibold text-gray-900">{formatCurrency(amount, currency)}</span>
          </p>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Cash Received
            </label>
            <input
              type="number"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              placeholder={`Minimum ${formatCurrency(amount, currency)}`}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              min={amount}
              step="0.01"
            />
          </div>
          {cashAmount && parseFloat(cashAmount) >= amount && (
            <p className="text-green-600 mb-4 font-medium">
              Change: {formatCurrency(parseFloat(cashAmount) - amount, currency)}
            </p>
          )}
          <div className="flex space-x-3">
            <button
              onClick={() => setPaymentMethod(null)}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleCashPayment}
              disabled={!cashAmount || parseFloat(cashAmount) < amount}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Confirm Payment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-center">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Processing Payment</h3>
        <p className="text-gray-600 mb-6">Amount: {formatCurrency(amount, currency)}</p>
        <button
          onClick={handleOnlinePayment}
          disabled={processing}
          className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {processing ? "Processing..." : "Pay Now"}
        </button>
        <button
          onClick={onCancel}
          className="w-full mt-3 bg-gray-500 text-white py-3 px-6 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReceiptModal({ order, currency, onClose }: { order: any; currency: string; onClose: () => void }) {
  if (!order) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">{order.restaurantName || 'Receipt'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Order #{order.id} - {new Date(order.created_at).toLocaleString()}
        </p>
        {order.customerInfo && (
          <div className="border-b pb-3 mb-3">
            <h4 className="font-semibold text-sm mb-1">Customer Details:</h4>
            <p className="text-sm text-gray-600">Name: {order.customerInfo.name}</p>
            <p className="text-sm text-gray-600">Phone: {order.customerInfo.phone}</p>
            {order.customerInfo.email && (
              <p className="text-sm text-gray-600">Email: {order.customerInfo.email}</p>
            )}
            {order.customerInfo.address && order.orderType === "Delivery" && (
              <p className="text-sm text-gray-600">Deliver To: {order.customerInfo.address}</p>
            )}
          </div>
        )}
        {order.orderType && (
          <div className="border-b pb-3 mb-3">
            <p className="text-sm text-gray-600">Order Type: <span className="font-medium text-gray-900">{order.orderType}</span></p>
            {order.estimatedDeliveryTime && (
              <p className="text-sm text-gray-600">Est. Delivery: <span className="font-medium text-gray-900">{order.estimatedDeliveryTime} min</span></p>
            )}
          </div>
        )}
        <div className="space-y-1 mb-3">
          {order.items.map((item: any, i: number) => (
            <div key={i} className="text-sm">
              <div className="flex justify-between">
                <span>{item.name} x{item.quantity}</span>
                <span className="font-medium">{formatCurrency(item.price * item.quantity, currency)}</span>
              </div>
              {item.options && item.options.length > 0 && (
                <p className="text-xs text-blue-700 ml-2">{item.options.join(", ")}</p>
              )}
              {item.notes && <p className="text-xs text-gray-500 ml-2">{item.notes}</p>}
            </div>
          ))}
        </div>
        <div className="border-t pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span>Subtotal:</span>
            <span>{formatCurrency(order.subtotal, currency)}</span>
          </div>
          {order.discountAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Discount{order.promoCode ? ` (${order.promoCode})` : ""}:</span>
              <span>-{formatCurrency(order.discountAmount, currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span>Tax (18%):</span>
            <span>{formatCurrency(order.tax, currency)}</span>
          </div>
          {order.loyaltyPointsRedeemed > 0 && (
            <div className="flex justify-between text-sm">
              <span>Points Redeemed:</span>
              <span>{order.loyaltyPointsRedeemed} pts</span>
            </div>
          )}
          {order.loyaltyPointsEarned > 0 && (
            <div className="flex justify-between text-sm">
              <span>Points Earned:</span>
              <span>{order.loyaltyPointsEarned} pts</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-1 border-t">
            <span>Total:</span>
            <span>{formatCurrency(order.total, currency)}</span>
          </div>
          <div className="pt-2">
            <div className="flex justify-between text-sm">
              <span>Payment Method:</span>
              <span className="capitalize">{order.paymentMethod || "Online"}</span>
            </div>
            {order.paymentMethod === "cash" && order.cashReceived && (
              <>
                <div className="flex justify-between text-sm">
                  <span>Cash Received:</span>
                  <span>{formatCurrency(order.cashReceived, currency)}</span>
                </div>
                {order.change !== undefined && order.change > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>Change Given:</span>
                    <span>{formatCurrency(order.change, currency)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex space-x-3 mt-6">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 flex items-center justify-center transition-colors"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print
          </button>
          <button
            onClick={() =>
              openWhatsAppReceipt(
                order.customerInfo?.phone || "",
                buildReceiptText(order)
              )
            }
            disabled={!order.customerInfo?.phone}
            className="flex-1 bg-green-600 text-white py-2.5 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            WhatsApp
          </button>
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 py-2.5 px-4 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CustomerMode({
  onBack,
  restaurantProp,
  customerMode,
  showCustomerBranding,
}: {
  onBack: () => void;
  restaurantProp?: {
    restaurant_id: string;
    restaurant_name: string;
    currency?: string | null;
    item_options?: string[] | null;
    address_line1?: string | null;
    address_line2?: string | null;
    address_line3?: string | null;
    phone?: string | null;
  } | null;
  customerMode?: boolean;
  showCustomerBranding?: boolean;
}) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [optionsDialogItem, setOptionsDialogItem] = useState<any>(null);
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastOrder, setLastOrder] = useState<any>(null);
  const [settleMode, setSettleMode] = useState(false);
  const [sendingToKitchen, setSendingToKitchen] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<{
    name: string;
    phone: string;
    email?: string;
    address?: string;
    redeemPoints?: number;
    loyaltyBalance?: number;
  } | null>(null);
  const [orderType, setOrderType] = useState<"dinein" | "takeaway" | "delivery">(customerMode ? "delivery" : "dinein");
  const [estimatedDeliveryTime, setEstimatedDeliveryTime] = useState<number>(30);
  const [stockCheckResults, setStockCheckResults] = useState<MenuItemStockStatus[]>([]);
  const [isCheckingStock, setIsCheckingStock] = useState(false);
  const [outOfStockItems, setOutOfStockItems] = useState<Set<string>>(new Set());
  const [appliedCoupon, setAppliedCoupon] = useState<CouponLike | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [loyaltySettings, setLoyaltySettings] = useState<LoyaltySettingsLike | null>(null);

  const {
    products,
    cart,
    addToCart,
    updateCartQuantity,
    clearCart,
    createOrder,
    getCartTotal,
    fetchProducts,
    selectedTable,
    selectedTab,
    setSelectedTable,
    setSelectedTab,
    settleOrdersWithPayment,
    activeOrders,
    activeOrdersLoading,
    fetchActiveOrders,
    lastStockAlerts,
    clearStockAlerts,
  } = usePOSStore();
  const { restaurant: authRestaurant } = useAuth();
  // Public/customer mode is driven purely by the restaurant code — it must never
  // fall back to (or share) the main SmartPOS login session.
  const restaurant = (customerMode && restaurantProp) ? restaurantProp : (restaurantProp || authRestaurant);
  const restaurantId = restaurant?.restaurant_id;
  const currency = restaurant?.currency || 'INR';
  const restaurantName = restaurant?.restaurant_name || 'SmartPOS';
  const restaurantAddress = [
    (restaurant as any)?.address_line1,
    (restaurant as any)?.address_line2,
    (restaurant as any)?.address_line3,
  ]
    .filter(Boolean)
    .join(', ');
  const restaurantPhone = (restaurant as any)?.phone || '';
  // Show the customer-facing header (restaurant details) + SmartPOS footer in the
  // public /order flow (customerMode) or the SmartPOS dashboard Customer Mode
  // (showCustomerBranding) — without changing the POS dine-in behavior.
  const isCustomerPresented = customerMode || showCustomerBranding;

  // Each order type has its own isolated bucket — orders never mix between types
  // Dine In: selectedTable + selectedTab
  // Take Away: table 0, tab 0
  // Delivery: table 0, tab 1
  const isOffPremise = orderType === "takeaway" || orderType === "delivery";
  const effTable = isOffPremise ? 0 : selectedTable;
  const effTab = orderType === "takeaway" ? 0 : orderType === "delivery" ? 1 : selectedTab;
  const orderTypeLabel = orderType === "takeaway" ? "Take Away" : orderType === "delivery" ? "Delivery" : "Dine In";

  useEffect(() => {
    if (restaurantId) {
      fetchProducts(restaurantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  // Load the restaurant's loyalty configuration (falls back to smart defaults)
  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    supabase
      .from("loyalty_settings")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setLoyaltySettings(
          (data as LoyaltySettingsLike | null) || defaultLoyaltySettings(restaurantId)
        );
      });
    return () => { cancelled = true; };
  }, [restaurantId]);

  // Coupons apply to the cart only — clear it if everything is removed
  useEffect(() => {
    if (cart.length === 0) {
      setAppliedCoupon(null);
    }
  }, [cart.length]);

  // Determine which menu items are out of stock based on ingredient availability
  useEffect(() => {
    if (!restaurantId || products.length === 0) return;
    let cancelled = false;
    const checkStock = async () => {
      try {
        const availability = await checkAllMenuItemsStock(restaurantId);
        if (cancelled) return;
        const unavailable = new Set<string>();
        availability.forEach((avail, name) => {
          if (!avail) unavailable.add(name);
        });
        setOutOfStockItems(unavailable);
      } catch {
        // silently ignore — availability is an enhancement, not a blocker
      }
    };
    checkStock();
    return () => { cancelled = true; };
  }, [restaurantId, products.length]);

  // Customer mode is its own self-contained ordering session: start from a clean
  // cart and default table/tab so the customer can't see or carry the POS's state.
  useEffect(() => {
    if (customerMode) {
      usePOSStore.setState({ cart: [], selectedTable: 1, selectedTab: 1, activeOrders: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restaurantId) {
      usePOSStore.setState({ activeOrders: [] });
      fetchActiveOrders(restaurantId, effTable, effTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, effTable, effTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.key) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() !== "b") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  // Check stock availability when cart changes
  useEffect(() => {
    if (!restaurantId || cart.length === 0) {
      setStockCheckResults([]);
      return;
    }
    let cancelled = false;
    const checkStock = async () => {
      setIsCheckingStock(true);
      try {
        const results = await checkMenuItemsStock(
          restaurantId,
          cart.map((c) => ({ name: c.name, quantity: c.quantity }))
        );
        if (!cancelled) setStockCheckResults(results);
      } catch {
        if (!cancelled) setStockCheckResults([]);
      } finally {
        if (!cancelled) setIsCheckingStock(false);
      }
    };
    const timer = setTimeout(checkStock, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [restaurantId, cart]);

  // Show toast when stock alerts arrive after order creation
  useEffect(() => {
    if (lastStockAlerts.length > 0) {
      lastStockAlerts.forEach((alert) => {
        if (alert.severity === 'negative') {
          toast.error(
            `OUT OF STOCK: ${alert.ingredientName} went negative (${alert.after} ${alert.unit}). Order cannot be fully fulfilled.`,
            { duration: 6000 }
          );
        } else {
          toast(
            `CRITICAL: ${alert.ingredientName} is critically low (${alert.after} ${alert.unit}). Please restock soon.`,
            { icon: '⚠️', duration: 5000 }
          );
        }
      });
      clearStockAlerts();
    }
  }, [lastStockAlerts, clearStockAlerts]);

  const filteredProducts = useMemo(
    () =>
      (selectedCategory === "All"
        ? products.filter((p) => p.available)
        : products.filter((p) => p.available && p.category === selectedCategory))
        .filter((p) => {
          const term = searchTerm.trim().toLowerCase();
          if (!term) return true;
          return (
            p.name.toLowerCase().includes(term) ||
            (p.description || "").toLowerCase().includes(term) ||
            (p.category || "").toLowerCase().includes(term)
          );
        }),
    [products, selectedCategory, searchTerm],
  );

  const cartTotal = getCartTotal();
  const cartLines = useMemo(
    () => cart.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
    [cart]
  );
  const couponNote = useMemo(
    () => (appliedCoupon ? validateCoupon(appliedCoupon, { subtotal: cartTotal }) : null),
    [appliedCoupon, cartTotal]
  );
  const couponDiscount = useMemo(
    () =>
      !appliedCoupon || couponNote
        ? 0
        : computeCouponDiscount(appliedCoupon, cartLines, cartTotal),
    [appliedCoupon, couponNote, cartLines, cartTotal]
  );
  const discountedSubtotal = useMemo(
    () => Math.max(0, cartTotal - couponDiscount),
    [cartTotal, couponDiscount]
  );
  const taxAmount = useMemo(() => Math.round(discountedSubtotal * 0.18), [discountedSubtotal]);
  const totalWithTax = useMemo(() => discountedSubtotal + taxAmount, [discountedSubtotal, taxAmount]);
  const cartItemCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return ["All", ...Array.from(cats).sort()];
  }, [products]);

  // QD-08: zero cart AND zero active orders never enables Place & Pay
  // customerMode (public customer screen): Place & Pay works directly, no need to enter settle mode
  const canPay = (settleMode || customerMode) && (activeOrders.length > 0 || cart.length > 0);

  // QD-05: changing table or tab exits settlement mode
  const handleTableChange = (table: number) => {
    setSettleMode(false);
    setSelectedTable(table, restaurantId);
  };

  const handleTabChange = (tab: number) => {
    setSettleMode(false);
    setSelectedTab(tab, restaurantId);
  };

  const handleOrderTypeChange = (type: "dinein" | "takeaway" | "delivery") => {
    if (type === orderType) return;
    if (customerMode && type === "dinein") return;
    setSettleMode(false);
    setOrderType(type);
    usePOSStore.setState({ activeOrders: [] });
    if (type !== "delivery") setEstimatedDeliveryTime(30);
  };

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || !restaurantId) return;
    try {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      const coupon = data as CouponLike | null;
      if (!coupon) {
        toast.error("Invalid coupon code");
        return;
      }
      const err = validateCoupon(coupon, { subtotal: cartTotal });
      if (err) {
        toast.error(err);
        return;
      }
      setAppliedCoupon(coupon);
      setCouponInput("");
      toast.success(`Coupon ${coupon.code} applied`);
    } catch {
      toast.error("Could not validate this coupon");
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
  };

  const handleProceedToPayment = () => {
    if (!canPay) return;
    const unavailable = stockCheckResults.filter((r) => !r.available);
    if (unavailable.length > 0) {
      toast(
        `${unavailable.length} item(s) in your cart have insufficient ingredients and may not be fully fulfilled: ${unavailable
          .map((u) => u.menuItemName)
          .join(", ")}`,
        { icon: "⚠️", duration: 6000 }
      );
    }
    setShowMobileCart(false);
    setShowCustomerInfo(true);
  };

  // QD-01: unpaid KOT-style send — inserts a real 'pending' order with no payment collected
  const handleSendToKitchen = async () => {
    if (!restaurantId || cart.length === 0 || sendingToKitchen) return;
    const unavailable = stockCheckResults.filter((r) => !r.available);
    if (unavailable.length > 0) {
      toast.error(
        `Cannot send to kitchen — ingredient stock insufficient: ${unavailable
          .map((u) => u.menuItemName)
          .join(", ")}`,
        { duration: 6000 }
      );
      return;
    }
    setSendingToKitchen(true);
    try {
      const order = await createOrder({
        restaurant_id: restaurantId,
        razorpay_order_id: "",
        razorpay_payment_id: "",
        items: cart.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          options: item.options || [],
          notes: item.notes || "",
        })),
        subtotal: cartTotal,
        tax: Math.round(cartTotal * 0.18),
        total: cartTotal + Math.round(cartTotal * 0.18),
        customer_name: "",
        customer_phone: "",
        payment_method: "unpaid",
        order_type: orderType,
        table_number: effTable,
        tab_number: effTab,
        estimated_delivery_time: orderType === "delivery" ? estimatedDeliveryTime : null,
      });
      clearCart();
      toast.success(`Order #${order.id} sent to kitchen`);
    } catch {
      toast.error("Failed to send order to kitchen");
    } finally {
      setSendingToKitchen(false);
    }
  };

  const handleCustomerInfoSubmit = (info: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    redeemPoints?: number;
    loyaltyBalance?: number;
  }) => {
    setCustomerInfo(info);
    setShowCustomerInfo(false);
    setShowPayment(true);

    // Save customer to database immediately on entry
    if (restaurantId) {
      usePOSStore.getState().upsertCustomer(restaurantId, {
        name: info.name,
        phone: info.phone,
        email: info.email,
        address: info.address,
      });
    }
  };

  const handlePaymentSuccess = async (paymentData: {
    method: "online" | "cash";
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    cashReceived?: number;
    change?: number;
  }) => {
    try {
      if (!restaurantId) {
        toast.error("Unable to place order. Restaurant ID missing.");
        return;
      }
      if (!customerInfo) {
        toast.error("Customer information missing. Please try again.");
        return;
      }

      // Snapshot render-closure values BEFORE any await (QD-03, QD-06)
      const priorItems = activeOrders.flatMap((o) => o.items);
      const cartItems = cart.map((item) => ({
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        options: item.options || [],
        notes: item.notes || "",
      }));
      const combinedItems = isOffPremise ? cartItems : [...priorItems, ...cartItems];

      // Promotions apply to the cart portion only — never to previous/settled orders
      const hasNewItems = cart.length > 0;
      const coupon = hasNewItems ? appliedCoupon : null;
      const couponDiscount =
        hasNewItems && coupon && !couponNote
          ? computeCouponDiscount(coupon, cartLines, cartTotal)
          : 0;
      const discountedSubtotalFinal = Math.max(0, cartTotal - couponDiscount);
      const cartTaxFinal = Math.round(discountedSubtotalFinal * 0.18);
      const cartTotalWithTaxFinal = discountedSubtotalFinal + cartTaxFinal;
      const redeemPts = hasNewItems ? customerInfo.redeemPoints || 0 : 0;
      const redeemedValueFinal =
        redeemPts > 0 && loyaltySettings ? redeemValue(loyaltySettings, redeemPts) : 0;
      const earnedPts = loyaltySettings ? earnPoints(loyaltySettings, cartTotalWithTaxFinal) : 0;
      const priorOrderCount = activeOrders.length;
      const grandTotal = isOffPremise
        ? cartTotalWithTaxFinal
        : activeOrdersTotal + cartTotalWithTaxFinal;
      const finalPayable = Math.max(0, grandTotal - redeemedValueFinal);
      const combinedSubtotal = isOffPremise
        ? discountedSubtotalFinal
        : activeOrdersSubtotal + discountedSubtotalFinal;
      const combinedTax = isOffPremise ? cartTaxFinal : activeOrdersTax + cartTaxFinal;

      // Shared payment-id convention so EVERY settled row carries identical ids
      const paidOrderId =
        paymentData.razorpayOrderId ||
        (paymentData.method === "cash" ? `cash_${Date.now()}` : "");
      const paidPaymentId =
        paymentData.razorpayPaymentId ||
        (paymentData.method === "cash" ? `cash_payment_${Date.now()}` : "");

      let receiptId: number;

      if (cart.length > 0) {
        // Insert the cart order FIRST with the real payment — a failed insert
        // aborts before anything is marked settled
        const orderData = {
          restaurant_id: restaurantId,
          razorpay_order_id: paidOrderId,
          razorpay_payment_id: paidPaymentId,
          items: cartItems,
          subtotal: discountedSubtotalFinal,
          tax: cartTaxFinal,
          total: Math.max(0, cartTotalWithTaxFinal - redeemedValueFinal),
          customer_name: customerInfo.name,
          customer_phone: customerInfo.phone,
          customer_email: customerInfo.email || null,
          customer_address: customerInfo.address || null,
          payment_method: paymentData.method,
          status: "settled",
          order_type: orderType,
          table_number: effTable,
          tab_number: effTab,
          estimated_delivery_time: orderType === "delivery" ? estimatedDeliveryTime : null,
          discount_amount: couponDiscount,
          promo_code: coupon?.code || null,
          loyalty_points_redeemed: redeemPts,
          loyalty_points_earned: earnedPts,
        };

        const order = await createOrder(orderData);
        receiptId = order.id;
      } else {
        // Cart empty: receipt id comes from the first active order (QD-06)
        receiptId = activeOrders[0].id;
      }

      // Stamp ALL unpaid rows of table+tab (any kitchen status) as 'settled' with payment data (QD-02)
      await settleOrdersWithPayment(restaurantId, effTable, effTab, {
        method: paymentData.method,
        razorpayOrderId: paidOrderId || undefined,
        razorpayPaymentId: paidPaymentId || undefined,
      }, cart.length > 0 ? receiptId : undefined);

      // Clear active orders so nothing shows as "Previous Orders" after settling
      usePOSStore.setState({ activeOrders: [] });

      // Combined receipt covering every item from every settled order + cart extras (QD-06)
      const receiptOrder = {
        id: receiptId,
        created_at: new Date().toISOString(),
        items: combinedItems,
        subtotal: combinedSubtotal,
        tax: combinedTax,
        total: finalPayable,
        paymentMethod: paymentData.method,
        cashReceived: paymentData.cashReceived,
        change: paymentData.change,
        currency,
        restaurantName,
        customerInfo,
        orderType: orderTypeLabel,
        estimatedDeliveryTime: orderType === "delivery" ? estimatedDeliveryTime : undefined,
        discountAmount: couponDiscount,
        promoCode: coupon?.code || undefined,
        loyaltyPointsRedeemed: redeemPts,
        loyaltyPointsEarned: earnedPts,
      };

      setLastOrder(receiptOrder);
      setShowPayment(false);
      setShowReceipt(true);
      clearCart();
      setSettleMode(false);
      setCustomerInfo(null);
      toast.success(
        isOffPremise
          ? `Payment received �?" Order #${receiptId} sent to kitchen`
          : `Settled ${priorOrderCount + (cart.length > 0 ? 1 : 0)} order(s) �?" ${formatCurrency(finalPayable, currency)}`
      );

      const deliveryMode = (restaurant as any)?.delivery_mode || 'aggregator';
      if (orderType === 'delivery' && restaurantId && receiptId) {
        if (deliveryMode === 'aggregator') {
          // Shadowfax auto-booking disabled. Delivery orders stay unassigned
          // and show up in the admin Delivery tab for manual rider selection.
          /*
          fetch('/api/delivery/shadowfax/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: receiptId, restaurantId }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success && data.awb_number) {
                toast.success(`Delivery booked - AWB: ${data.awb_number}`);
              } else if (data.error) {
                console.error('Shadowfax booking failed:', data.error);
              }
            })
            .catch((err) => console.error('Shadowfax booking error:', err));
          */
        } else if (deliveryMode === 'own') {
          fetch('/api/delivery/inhouse/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: receiptId, restaurantId }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success && data.rider?.name) {
                toast.success(`Delivery assigned to ${data.rider.name}`);
              } else if (data.error) {
                console.error('Rider assignment failed:', data.error);
              }
            })
            .catch((err) => console.error('Rider assignment error:', err));
        }
      }

      // Record coupon redemption, loyalty ledger updates and fire event
      // automations — fire-and-forget so checkout is never blocked.
      if (hasNewItems) {
        void postOrderRewards({
          restaurantId,
          restaurantName,
          currency,
          customer: customerInfo,
          orderId: receiptId,
          coupon,
          couponDiscount,
          discountedTotalWithTax: cartTotalWithTaxFinal,
          redeemPoints: redeemPts,
          earnedPoints: earnedPts,
          loyaltySettings,
        });
      }

      const receiptText = buildReceiptText(receiptOrder);
      if (customerInfo.email) {
        sendReceiptEmail(
          customerInfo.email,
          `Your ${restaurantName} Receipt - Order #${receiptId}`,
          receiptText
        ).catch((err: Error) => {
          console.error("Failed to send receipt email:", err);
          if (!err.message.includes("SMTP credentials not configured")) {
            toast.error("Receipt saved, but the email could not be sent.");
          }
        });
      }
      if (customerInfo.phone) {
        openWhatsAppReceipt(customerInfo.phone, receiptText);
      }
    } catch (err: any) {
      console.error("Error in handlePaymentSuccess:", err);
      toast.error("Something went wrong while saving order. Please try again.");
    }
  };

  const activeOrdersTotal = useMemo(
    () => activeOrders.reduce((sum, o) => sum + o.total, 0),
    [activeOrders]
  );
  const activeOrdersTax = useMemo(
    () => activeOrders.reduce((sum, o) => sum + o.tax, 0),
    [activeOrders]
  );
  const activeOrdersSubtotal = useMemo(
    () => activeOrders.reduce((sum, o) => sum + o.subtotal, 0),
    [activeOrders]
  );

  const CartContent = () => (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {settleMode && !isOffPremise && activeOrders.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-3 py-2 text-xs font-medium">
            Settlement Mode — paying for {activeOrders.length} previous order(s) + current cart
          </div>
        )}
        {(isOffPremise ? cart.length === 0 : activeOrders.length === 0 && cart.length === 0) ? (
          <div className="text-center text-gray-400 py-12">
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Cart is empty</p>
          </div>
        ) : (
          <>
        {activeOrders.length > 0 && !isOffPremise && (
              <>
                <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
                  Previous Orders ({activeOrders.length})
                </div>
                {activeOrders.map((order) => (
                  <div key={order.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-blue-800">Order #{order.id}</span>
                      <span className="text-xs text-blue-600">{formatCurrency(order.total, currency)}</span>
                    </div>
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-gray-700">
                        <span>{item.name} x{item.quantity}</span>
                        <span>{formatCurrency(item.price * item.quantity, currency)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="border-t border-blue-200 pt-2 mt-2">
                  <div className="flex justify-between text-sm font-semibold text-blue-800">
                    <span>Previous Total</span>
                    <span>{formatCurrency(activeOrdersTotal, currency)}</span>
                  </div>
                </div>
              </>
            )}

            {cart.length > 0 && (
              <>
            {activeOrders.length > 0 && !isOffPremise && (
                  <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mt-2 mb-1">
                    New Items
                  </div>
                )}
                {cart.map((item) => (
                  <div key={item.key} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                      {item.options && item.options.length > 0 && (
                        <p className="text-xs text-blue-700 truncate">{item.options.join(", ")}</p>
                      )}
                      {item.notes && <p className="text-xs text-gray-500 truncate">{item.notes}</p>}
                      <p className="text-xs text-gray-500">{formatCurrency(item.price, currency)} each</p>
                    </div>
                    <div className="flex items-center space-x-2 mx-3">
                      <button
                        className="p-1.5 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                        onClick={() => updateCartQuantity(item.key, item.quantity - 1)}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                      <button
                        className="p-1.5 bg-white border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                        onClick={() => updateCartQuantity(item.key, item.quantity + 1)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-16 text-right">
                      {formatCurrency(item.price * item.quantity, currency)}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
      <div className="p-4 border-t bg-gray-50 space-y-2">
        {isCheckingStock && (
          <p className="text-[11px] text-gray-400 text-center animate-pulse">Checking stock availability...</p>
        )}
        {stockCheckResults.length > 0 && stockCheckResults.some((r) => !r.available) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Insufficient Stock
            </p>
            {stockCheckResults
              .filter((r) => !r.available)
              .map((r) => (
                <div key={r.menuItemId} className="text-xs text-red-600">
                  <span className="font-medium">{r.menuItemName}</span> —{" "}
                  {r.missingIngredients
                    .map((m) =>
                      m.available <= 0
                        ? `${m.name} is out of stock (need ${m.needed} ${m.unit})`
                        : `only ${m.available} ${m.unit} of ${m.name} left (need ${m.needed} ${m.unit})`
                    )
                    .join("; ")}
                </div>
              ))}
            <p className="text-[11px] text-red-500 italic">
              These items can&apos;t be fully prepared right now. Remove them from the cart or alert the kitchen.
            </p>
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-lg p-2">
          {appliedCoupon ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center min-w-0">
                <Tag className="h-4 w-4 text-green-600 mr-1.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-green-700 truncate">{appliedCoupon.code}</p>
                  {couponNote ? (
                    <p className="text-[11px] text-amber-600">{couponNote}</p>
                  ) : (
                    <p className="text-[11px] text-green-600">-{formatCurrency(couponDiscount, currency)} off</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleRemoveCoupon}
                className="text-gray-400 hover:text-red-500 p-1"
                title="Remove coupon"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex space-x-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleApplyCoupon(); }}
                placeholder="Enter coupon code"
                className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none uppercase"
              />
              <button
                onClick={handleApplyCoupon}
                disabled={!couponInput.trim()}
                className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center"
              >
                Apply
              </button>
            </div>
          )}
        </div>
        {activeOrders.length > 0 && !isOffPremise && (
          <>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Previous Subtotal</span>
              <span>{formatCurrency(activeOrdersSubtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>Previous Tax</span>
              <span>{formatCurrency(activeOrdersTax, currency)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-sm text-gray-600">
          <span>New Subtotal</span>
          <span>{formatCurrency(cartTotal, currency)}</span>
        </div>
        {couponDiscount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Discount ({appliedCoupon?.code})</span>
            <span>-{formatCurrency(couponDiscount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm text-gray-600">
          <span>New Tax (18%)</span>
          <span>{formatCurrency(taxAmount, currency)}</span>
        </div>
        <div className="flex justify-between font-bold text-gray-900 pt-2 border-t">
          <span>Grand Total</span>
          <span>{formatCurrency((isOffPremise ? 0 : activeOrdersTotal) + totalWithTax, currency)}</span>
        </div>
        {!isOffPremise && !customerMode && (
          <button
            className="w-full border border-indigo-500 text-indigo-600 py-3 rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            onClick={handleSendToKitchen}
            disabled={cart.length === 0 || sendingToKitchen}
          >
            {sendingToKitchen ? "Sending..." : "Send to Kitchen"}
          </button>
        )}
        {isOffPremise && !settleMode && !customerMode && (
          <div className="w-full text-xs text-gray-500 text-center bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
            Click <span className="font-semibold">Settle Now</span>, then <span className="font-semibold">Place & Pay</span> to send to kitchen
          </div>
        )}
        <button
          className={`w-full text-white py-3 rounded-lg font-medium transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed ${
            settleMode
              ? "bg-green-600 hover:bg-green-700"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          onClick={handleProceedToPayment}
          disabled={!canPay}
        >
          Place & Pay
        </button>
        <button
          className="w-full border border-gray-300 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm text-gray-600"
          onClick={clearCart}
          disabled={cart.length === 0}
        >
          Clear Cart
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className={isCustomerPresented ? "bg-blue-600 text-white px-4 py-3 shadow-md" : "bg-blue-600 text-white px-4 py-3 flex items-center justify-between shadow-md"}>
        {isCustomerPresented ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{restaurantName}</h1>
              {restaurantAddress && (
                <p className="text-xs text-blue-100/90 leading-snug">{restaurantAddress}</p>
              )}
              {restaurantPhone && (
                <p className="text-xs text-blue-100/90 leading-snug">{restaurantPhone}</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-blue-100 hidden sm:inline">{cartItemCount} items</span>
              <button
                onClick={() => setShowMobileCart(true)}
                className="lg:hidden p-2 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <ShoppingCart className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-bold">{restaurantName}</h1>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-blue-100 hidden sm:inline">{cartItemCount} items</span>
              <button
                onClick={() => setShowMobileCart(true)}
                className="lg:hidden p-2 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <ShoppingCart className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </header>

      {/* Order type / Table / Tab selector bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 overflow-x-auto">
        <div className="flex items-center bg-gray-100 border border-gray-300 rounded-lg p-0.5">
          {!customerMode && (
            <button
              onClick={() => handleOrderTypeChange("dinein")}
              className={`flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                orderType === "dinein"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              Dine In
            </button>
          )}
          <button
            onClick={() => handleOrderTypeChange("takeaway")}
            className={`flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              orderType === "takeaway"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Take Away
          </button>
          <button
            onClick={() => handleOrderTypeChange("delivery")}
            className={`flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-md transition-colors ${
              orderType === "delivery"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Delivery
          </button>
        </div>

        {orderType === "delivery" && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">ETA (min)</span>
            <input
              type="number"
              min={5}
              max={180}
              value={estimatedDeliveryTime}
              onChange={(e) => setEstimatedDeliveryTime(Math.max(5, parseInt(e.target.value) || 5))}
              className="text-sm font-bold text-gray-900 bg-gray-100 border border-gray-300 rounded-lg px-2 py-1 w-16 focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        )}

        {!customerMode && (
          <>
            <div className="h-5 w-px bg-gray-300" />

            <div className={`flex items-center gap-1.5 ${isOffPremise ? "opacity-50" : ""}`}>
              <span className="text-xs font-semibold text-gray-500 uppercase">Table</span>
              <select
                value={selectedTable}
                onChange={(e) => handleTableChange(parseInt(e.target.value))}
                disabled={isOffPremise}
                title={isOffPremise ? "Not applicable for this order type" : undefined}
                className="text-sm font-bold text-gray-900 bg-gray-100 border border-gray-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>Table {n}</option>
                ))}
              </select>
            </div>

            <div className="h-5 w-px bg-gray-300" />

            <div className={`flex items-center gap-1.5 ${isOffPremise ? "opacity-50" : ""}`}>
              <span className="text-xs font-semibold text-gray-500 uppercase">Tab</span>
              <select
                value={selectedTab}
                onChange={(e) => handleTabChange(parseInt(e.target.value))}
                disabled={isOffPremise}
                title={isOffPremise ? "Not applicable for this order type" : undefined}
                className="text-sm font-bold text-gray-900 bg-gray-100 border border-gray-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{selectedTable}-{n}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="flex-1" />

        {!customerMode && (
          <button
            onClick={() => setSettleMode((s) => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              settleMode
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            {settleMode ? "Cancel Settlement" : "Settle Now"}
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div className="flex space-x-2 mb-6 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${
                  selectedCategory === c
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
                onClick={() => setSelectedCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="text-center text-gray-400 py-20">
              <p>No items available in this category.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow relative"
                >
                  {outOfStockItems.has(p.name) && (
                    <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
                      <span className="bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide shadow">
Out of Stock
                      </span>
                    </div>
                  )}
                  <div className="w-full h-40 bg-gray-100">
                    {p.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-semibold text-gray-900 text-sm">{p.name}</h3>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{p.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-base font-bold text-gray-900">{formatCurrency(p.price, currency)}</span>
                      <button
                        className={`rounded-lg px-3 py-1.5 flex items-center text-sm transition-colors ${
                          outOfStockItems.has(p.name)
                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        }`}
                        disabled={outOfStockItems.has(p.name)}
                        onClick={() => setOptionsDialogItem(p)}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        {outOfStockItems.has(p.name) ? "Out of Stock" : "Add"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hidden lg:flex lg:w-80 bg-white shadow-md border-l border-gray-200 flex-col">
          <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Cart — {orderTypeLabel}</h2>
          </div>
          <CartContent />
        </div>
      </div>

      {showMobileCart && (
        <div className="fixed inset-0 bg-black/50 z-40 flex justify-end">
          <div className="w-80 bg-white shadow-lg flex flex-col max-w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Cart — {orderTypeLabel}</h2>
              <button
                onClick={() => setShowMobileCart(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <CartContent />
          </div>
        </div>
      )}

      {showCustomerInfo && (
        <CustomerInfoModal
          onSubmit={handleCustomerInfoSubmit}
          onCancel={() => setShowCustomerInfo(false)}
          restaurantId={restaurantId}
          isDelivery={orderType === "delivery"}
          appliedCoupon={appliedCoupon}
          discountedSubtotal={discountedSubtotal}
          discountedTotalWithTax={totalWithTax}
          loyaltySettings={loyaltySettings}
          currency={currency}
          hasNewItems={cart.length > 0}
        />
      )}
      {showPayment && customerInfo && (
        <PaymentModal
          amount={Math.max(
            0,
            (isOffPremise ? totalWithTax : activeOrdersTotal + totalWithTax) -
              (customerInfo.redeemPoints && loyaltySettings
                ? redeemValue(loyaltySettings, customerInfo.redeemPoints)
                : 0)
          )}
          restaurantId={restaurantId}
          customerInfo={customerInfo}
          currency={currency}
          restaurantName={restaurantName}
          onSuccess={handlePaymentSuccess}
          onCancel={() => setShowPayment(false)}
        />
      )}
      {showReceipt && (
        <ReceiptModal order={lastOrder} currency={currency} onClose={() => setShowReceipt(false)} />
      )}

      {optionsDialogItem && (
        <ItemOptionsDialog
          item={optionsDialogItem}
          commonOptions={restaurant?.item_options || []}
          onConfirm={(options, notes) => {
            addToCart(optionsDialogItem, options, notes);
            setOptionsDialogItem(null);
          }}
          onCancel={() => setOptionsDialogItem(null)}
        />
      )}

      {isCustomerPresented && (
        <footer className="bg-[#0B1B3A] text-white mt-auto">
          <div className="px-4 py-5 flex flex-col items-center justify-center text-center gap-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 border-2 border-white/40 rounded-lg flex items-center justify-center">
                <Store className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-bold">
                Smart<span className="text-[#6DA4FF]">POS</span>
              </span>
            </div>
            <p className="text-xs text-gray-400">Powered by ALTTASOFTWARE CONSULTANCY LLP</p>
          </div>
        </footer>
      )}
    </div>
  );
}
