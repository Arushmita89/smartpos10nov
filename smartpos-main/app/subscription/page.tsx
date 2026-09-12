'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { SubscriptionStatus } from '@/lib/subscription';
import { Store, CreditCard, Calendar, CheckCircle, AlertCircle, Loader2, Lock, Clock, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

declare global {
  interface Window {
    Razorpay: any;
  }
}

const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

interface PlanData {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  currency: string;
  display_price: number;
  display_currency: string;
  converted: boolean;
  is_trial?: boolean;
  trial_active?: boolean;
  trial_used?: boolean;
  trial_days_remaining?: number;
}

const formatPrice = (amount: number, currencyCode: string) => {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${Number(amount).toFixed(2)}`;
  }
};

function SubscriptionPageContent() {
  const { restaurant, subscription, loading, signOut, refreshSubscription } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(subscription);

  const pendingRestaurantId = searchParams.get('restaurantId');
  const pendingEmail = searchParams.get('email') || '';
  const isPending = !restaurant;

  const restaurantId = restaurant?.restaurant_id || pendingRestaurantId || '';
  const email = restaurant?.login_name || pendingEmail || '';

  useEffect(() => {
    if (!loading && !restaurant && !pendingRestaurantId) {
      router.replace('/');
      return;
    }
    loadPlans();
  }, [loading, restaurant, pendingRestaurantId, router]);

  useEffect(() => {
    if (pendingRestaurantId) {
      fetch(`/api/subscription/status?restaurantId=${encodeURIComponent(pendingRestaurantId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && setStatus(s))
        .catch(() => {});
    } else {
      setStatus(subscription);
    }
  }, [pendingRestaurantId, subscription]);

  const loadPlans = async () => {
    try {
      const res = await fetch(
        `/api/subscription/plans?restaurantId=${encodeURIComponent(
          restaurantId || pendingRestaurantId || ''
        )}`
      );
      if (!res.ok) throw new Error('Failed to load plans');
      const data = await res.json();
      setPlans(Array.isArray(data?.plans) ? data.plans : []);
    } catch (err) {
      console.error('Error loading plans:', err);
      toast.error('Failed to load plans. Please refresh the page.');
    }
  };

  const handleSubscribe = async (plan: PlanData) => {
    if (!restaurantId) {
      toast.error('Please login first');
      router.push('/');
      return;
    }

    if (plan.is_trial) {
      await handleTrialActivate(plan);
      return;
    }

    setProcessingPlanId(plan.id);
    try {
      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          restaurantId,
        }),
      });

      if (!res.ok) {
        let errMsg = `Failed to create order (${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody.error) errMsg = errBody.error;
        } catch {
          // Response wasn't JSON (likely HTML redirect) — use default message
        }
        throw new Error(errMsg);
      }

      let orderData;
      try {
        orderData = await res.json();
      } catch {
        throw new Error('Invalid response from server. Please try again.');
      }

      const { orderId, amount, currency, razorpayKeyId } = orderData;

      if (!orderId || !razorpayKeyId) {
        throw new Error('Invalid order data received from server');
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        throw new Error('Razorpay checkout failed to load. Please try again.');
      }

      const rzp = new window.Razorpay({
        key: razorpayKeyId,
        amount,
        currency,
        order_id: orderId,
        name: 'SmartPOS Subscription',
        description: `${plan.name} Plan`,
        prefill: {
          email,
        },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/subscription/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                restaurantId,
                planId: plan.id,
                amount: amount / 100,
                currency,
              }),
            });

            if (!verifyRes.ok) {
              let errMsg = 'Payment verification failed';
              try {
                const errBody = await verifyRes.json();
                if (errBody.error) errMsg = errBody.error;
              } catch {
                // Response wasn't JSON
              }
              throw new Error(errMsg);
            }

            if (isPending) {
              router.push(`/payment-success?email=${encodeURIComponent(email)}`);
            } else {
              await refreshSubscription();
              router.push('/payment-success');
            }
          } catch (err: any) {
            toast.error(err.message || 'Payment verification failed');
            router.push('/payment-failed');
          }
        },
        modal: {
          ondismiss: () => {
            setProcessingPlanId(null);
          },
        },
      });

      rzp.on('payment.failed', () => {
        toast.error('Payment failed. Please try again.');
        setProcessingPlanId(null);
      });

      rzp.open();
    } catch (err: any) {
      toast.error(err.message || 'Failed to start payment');
      setProcessingPlanId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const handleTrialActivate = async (plan: PlanData) => {
    setProcessingPlanId(plan.id);
    try {
      const res = await fetch('/api/trial/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to activate free trial');
      }
      if (isPending) {
        toast.success('Free trial activated! Please login to continue.');
        router.push('/');
      } else {
        await refreshSubscription();
        toast.success('Free trial activated! Enjoy SmartPOS for the next 30 days.');
        router.push('/');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to activate free trial');
    } finally {
      setProcessingPlanId(null);
    }
  };

  const hasAccess = status?.hasActiveSubscription || status?.hasActiveTrial;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 p-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 shadow-lg">
            <Store className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-white">Subscription</h1>
          <p className="text-blue-100 mt-1">
            {isPending
              ? 'Subscribe to continue. Once paid, you can login to SmartPOS.'
              : 'Choose a plan to continue using SmartPOS'}
          </p>
        </div>

        {isPending && hasAccess && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 max-w-2xl mx-auto flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <p className="text-green-800 text-sm font-medium flex-1">
              Your subscription is active! Please login to continue.
            </p>
            <button
              onClick={() => router.push('/')}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition-colors"
            >
              Go to Login
            </button>
          </div>
        )}

        {isPending && !hasAccess && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 max-w-2xl mx-auto flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-amber-800 text-sm font-medium">
              No active subscription found for this account. Please choose a plan below.
            </p>
          </div>
        )}

        {!isPending && status?.isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 max-w-2xl mx-auto flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-amber-800 text-sm font-medium">
              {status.trialUsed
                ? 'Your free trial has ended and cannot be used again. Please choose a paid plan to continue.'
                : 'Your subscription has expired. Please choose a plan to continue.'}
            </p>
          </div>
        )}

        {!isPending &&
          status?.hasActiveTrial &&
          status.trialDaysRemaining > 0 &&
          status.trialDaysRemaining <= 3 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 max-w-2xl mx-auto flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="text-amber-800 text-sm font-medium">
                Your free trial ends in {status.trialDaysRemaining} day
                {status.trialDaysRemaining === 1 ? '' : 's'}. Please subscribe to avoid
                losing access.
              </p>
            </div>
          )}

        {!isPending &&
          status?.hasActiveSubscription &&
          status.subscriptionDaysRemaining > 0 &&
          status.subscriptionDaysRemaining <= 3 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 max-w-2xl mx-auto flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="text-amber-800 text-sm font-medium">
                Your subscription expires in {status.subscriptionDaysRemaining} day
                {status.subscriptionDaysRemaining === 1 ? '' : 's'}. Please renew now to
                avoid losing access.
              </p>
            </div>
          )}

        {!isPending && status?.hasActiveTrial && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 max-w-2xl mx-auto flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <p className="text-green-800 text-sm font-medium">
              Your free trial is active! {status.trialDaysRemaining} days remaining. You can subscribe now to continue after your trial ends.
            </p>
          </div>
        )}

        {!isPending && status?.hasActiveSubscription && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 max-w-2xl mx-auto flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <p className="text-green-800 text-sm font-medium">
              Your subscription is active. Plan: {status.planName} — expires in {status.subscriptionDaysRemaining} days.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {plans.map((plan) => {
            const isTrial = !!plan.is_trial;
            const trialButtonText = isTrial
              ? plan.trial_active
                ? plan.trial_days_remaining && plan.trial_days_remaining <= 3
                  ? `Trial ends in ${plan.trial_days_remaining}d`
                  : 'Trial Active'
                : 'Start Free Trial'
              : 'Subscribe';
            const trialButtonDisabled =
              isTrial && plan.trial_active;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl shadow-xl p-6 flex flex-col hover:shadow-2xl transition-shadow ${
                  isTrial
                    ? 'bg-gradient-to-b from-green-50 to-white ring-2 ring-green-500'
                    : 'bg-white'
                }`}
              >
                {isTrial && (
                  <span className="inline-flex self-start items-center px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold mb-2">
                    Free — ₹0
                  </span>
                )}
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <p
                  className={`text-3xl font-bold mt-2 ${
                    isTrial ? 'text-green-600' : 'text-blue-600'
                  }`}
                >
                  {formatPrice(plan.display_price, plan.display_currency)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {plan.duration_days} days
                  {isTrial && ' — one-time'}
                </p>
                {isTrial && plan.trial_active && (
                  <p className="text-xs text-green-600 mt-1">
                    {plan.trial_days_remaining} day
                    {plan.trial_days_remaining === 1 ? '' : 's'} remaining
                  </p>
                )}
                {plan.converted && (
                  <p className="text-xs text-gray-400 mt-1">
                    ≈ {formatPrice(plan.price, plan.currency)} converted to {plan.display_currency}
                  </p>
                )}
                <div className="mt-4 space-y-2 flex-1">
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" /> Full POS access
                  </p>
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" /> Menu management
                  </p>
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" /> Order management
                  </p>
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" /> Analytics & reports
                  </p>
                </div>
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={processingPlanId !== null || trialButtonDisabled}
                  className={`w-full py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium mt-4 ${
                    isTrial
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {processingPlanId === plan.id ? (
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  ) : (
                    trialButtonText
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {plans.length > 0 && (
          <div className="text-center mt-2 mb-6">
            <p className="text-blue-100 text-xs">
              Subject to change according to restaurant size and number of tables. These charges are for up to a table number of 10.
            </p>
          </div>
        )}

        {plans.length === 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md mx-auto">
            <p className="text-gray-500">No plans available. Please check back later.</p>
          </div>
        )}

        <div className="text-center mt-6 space-x-4">
          {isPending && (
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-2 text-blue-100 hover:text-white text-sm font-medium"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Login
            </button>
          )}
          {!isPending && hasAccess && (
            <button
              onClick={() => router.push('/')}
              className="text-blue-100 hover:text-white text-sm font-medium"
            >
              Continue to dashboard
            </button>
          )}
          {!isPending && (
            <button
              onClick={signOut}
              className="text-blue-100 hover:text-white text-sm font-medium"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <SubscriptionPageContent />
    </Suspense>
  );
}
