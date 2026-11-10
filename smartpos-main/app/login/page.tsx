'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, SubscriptionRequiredError, type SignUpData } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp';
import Link from 'next/link';
import { Store, Mail, Lock, User, Phone, MapPin, FileText, Users, Percent, Coins, Globe } from 'lucide-react';
import { CURRENCIES, countriesForCurrency } from '@/app/features/owner/currencyData';
import toast from 'react-hot-toast';

type Tab = 'login' | 'signup' | 'migrate' | 'forgot';

export default function LoginPage() {
  const { restaurant, user, subscription, loading, signInWithEmail, signUp, migrate, resetPassword } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');

  const [notice, setNotice] = useState<{ activated: boolean; email: string }>({
    activated: false,
    email: '',
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'signup' || tabParam === 'login' || tabParam === 'migrate' || tabParam === 'forgot') {
      setTab(tabParam);
    }
    if (params.get('activated') === '1') {
      const email = params.get('email') || '';
      setNotice({ activated: true, email });
      if (email) setLoginEmail(email);
    }
  }, []);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [suName, setSuName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suGst, setSuGst] = useState('');
  const [suPhone, setSuPhone] = useState('');
  const [suAddr1, setSuAddr1] = useState('');
  const [suAddr2, setSuAddr2] = useState('');
  const [suAddr3, setSuAddr3] = useState('');
  const [suOwner1, setSuOwner1] = useState('');
  const [suOwner2, setSuOwner2] = useState('');
  const [suOwner3, setSuOwner3] = useState('');
  const [suOwner4, setSuOwner4] = useState('');
  const [suTaxRate, setSuTaxRate] = useState('18');
  const [suMpin, setSuMpin] = useState('1234');
  const [suCurrency, setSuCurrency] = useState('INR');
  const [suCountryCode, setSuCountryCode] = useState('IN');

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const code = e.target.value;
    setSuCurrency(code);
    const matching = countriesForCurrency(code);
    if (matching.length > 0) setSuCountryCode(matching[0]);
  };

  const [mRestId, setMRestId] = useState('');
  const [mEmail, setMEmail] = useState('');
  const [mPassword, setMPassword] = useState('');

  const [fpEmail, setFpEmail] = useState('');
  const [fpPassword, setFpPassword] = useState('');
  const [fpConfirm, setFpConfirm] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const [otpPhase, setOtpPhase] = useState<'idle' | 'sending' | 'entering'>('idle');
  const [otpCode, setOtpCode] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<'signup' | 'password_reset'>('signup');
  const [pendingSignUpData, setPendingSignUpData] = useState<SignUpData | null>(null);
  const [pendingResetEmail, setPendingResetEmail] = useState('');
  const [pendingResetPassword, setPendingResetPassword] = useState('');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Store className="h-8 w-8 text-white" />
          </div>
          <p className="text-gray-500 font-medium">Loading SmartPOS...</p>
        </div>
      </div>
    );
  }

  if (restaurant || user?.role === 'rider') {
    if (restaurant && !subscription) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
              <Store className="h-8 w-8 text-white" />
            </div>
            <p className="text-gray-500 font-medium">Loading SmartPOS...</p>
          </div>
        </div>
      );
    }
    router.push('/');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      toast.error('Please enter email and password');
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmail(loginEmail, loginPassword);
      toast.success('Welcome to SmartPOS!');
    } catch (err: any) {
      if (err instanceof SubscriptionRequiredError) {
        toast.error('No active subscription. Please subscribe to continue.');
        router.push(`/subscription?restaurantId=${err.restaurantId}&email=${encodeURIComponent(loginEmail)}`);
        return;
      }
      toast.error(err.message || 'Failed to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suName.trim() || !suEmail.trim() || !suPassword.trim()) {
      toast.error('Please fill in restaurant name, email, and password');
      return;
    }
    if (suPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setPendingSignUpData({
      restaurant_name: suName,
      login_name: suEmail,
      password: suPassword,
      gst_number: suGst,
      phone: suPhone,
      address_line1: suAddr1,
      address_line2: suAddr2,
      address_line3: suAddr3,
      owner1: suOwner1,
      owner2: suOwner2,
      owner3: suOwner3,
      owner4: suOwner4,
      tax_rate: parseFloat(suTaxRate) || 18,
      mpin: suMpin,
      currency: suCurrency,
      country_code: suCountryCode,
    });
    await sendOtp(suEmail, 'signup');
  };

  const handleMigrate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mRestId.trim() || !mEmail.trim() || !mPassword.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setSubmitting(true);
    try {
      await migrate(mRestId, mEmail, mPassword);
      toast.success('Account migrated successfully!');
    } catch (err: any) {
      if (err instanceof SubscriptionRequiredError) {
        toast.error('Account updated. Please subscribe to continue.');
        router.push(`/subscription?restaurantId=${err.restaurantId}&email=${encodeURIComponent(mEmail)}`);
        return;
      }
      toast.error(err.message || 'Failed to migrate account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fpEmail.trim() || !fpPassword.trim() || !fpConfirm.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    if (fpPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (fpPassword !== fpConfirm) {
      toast.error('Passwords do not match');
      return;
    }
    setPendingResetEmail(fpEmail);
    setPendingResetPassword(fpPassword);
    await sendOtp(fpEmail, 'password_reset');
  };

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

  const sendOtp = async (email: string, purpose: 'signup' | 'password_reset') => {
    setOtpPhase('sending');
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
      setOtpPurpose(purpose);
      setOtpPhase('entering');
      toast.success('OTP sent to your email');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send OTP');
      setOtpPhase('idle');
    }
  };

  const verifyOtpAndProceed = async () => {
    if (!otpCode.trim() || otpCode.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: otpPurpose === 'signup' ? suEmail : pendingResetEmail,
          code: otpCode,
          purpose: otpPurpose,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid OTP');

      if (otpPurpose === 'signup' && pendingSignUpData) {
        await signUp(pendingSignUpData);
        toast.success('Account created! Start your free trial or choose a plan to continue.');
      } else if (otpPurpose === 'password_reset' && pendingResetEmail && pendingResetPassword) {
        await resetPassword(pendingResetEmail, pendingResetPassword);
        toast.success('Password reset successfully! Please login.');
        setFpEmail('');
        setFpPassword('');
        setFpConfirm('');
        setTab('login');
      }
      setOtpPhase('idle');
      setOtpCode('');
      setPendingSignUpData(null);
      setPendingResetEmail('');
      setPendingResetPassword('');
    } catch (err: any) {
      if (err instanceof SubscriptionRequiredError) {
        toast.success('Account created! Start your free trial or choose a plan to continue.');
        router.push(`/subscription?restaurantId=${err.restaurantId}&email=${encodeURIComponent(suEmail)}`);
        return;
      }
      toast.error(err.message || 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-600 to-blue-800">
      <nav className="py-4 px-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-lg transition-colors backdrop-blur-sm">
            <span className="text-sm font-semibold">Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Store className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-white">SmartPOS</span>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center p-4 py-8">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="text-center pt-8 pb-4 px-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
              <Store className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">SmartPOS</h1>
            <p className="text-gray-500 mt-1 text-sm">Restaurant Management System</p>
          </div>

          {notice.activated && (
            <div className="mx-8 mt-6 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">
                Your access is now active! Please login to continue.
              </p>
            </div>
          )}

          <div className="flex border-b border-gray-200 px-8">
            {([
              { id: 'login', label: 'Login' },
              { id: 'signup', label: 'Sign Up' },
              { id: 'migrate', label: 'Migrate' },
            ] as { id: Tab; label: string }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-8">
            {otpPhase !== 'idle' ? (
              <div className="space-y-4 max-w-md mx-auto">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    {otpPhase === 'sending'
                      ? 'Sending verification code...'
                      : `Enter the 6-digit code sent to ${otpPurpose === 'signup' ? suEmail : pendingResetEmail}`}
                  </p>
                </div>
                {otpPhase === 'entering' && (
                  <>
                    <div>
                      <label className={labelClass}>Verification Code</label>
                      <div className="flex justify-center">
                        <InputOTP
                          maxLength={6}
                          value={otpCode}
                          onChange={(value) => setOtpCode(value)}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                          </InputOTPGroup>
                          <InputOTPSeparator />
                          <InputOTPGroup>
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>
                    <button
                      onClick={verifyOtpAndProceed}
                      disabled={submitting || otpCode.length !== 6}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {submitting ? 'Verifying...' : 'Verify & Continue'}
                    </button>
                    <p className="text-center text-sm text-gray-500">
                      <button
                        type="button"
                        onClick={() => {
                          setOtpPhase('idle');
                          setOtpCode('');
                        }}
                        className="text-blue-600 font-medium hover:underline"
                      >
                        Cancel
                      </button>
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
            {tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4 max-w-md mx-auto">
                <div>
                  <label className={labelClass}>Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="Enter your email"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter your password"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {submitting ? 'Signing in...' : 'Login'}
                </button>
                <p className="text-center text-sm text-gray-500">
                  <button
                    type="button"
                    onClick={() => setTab('forgot')}
                    className="text-blue-600 font-medium hover:underline"
                  >
                    Forgot Password?
                  </button>
                </p>
                <p className="text-center text-sm text-gray-500">
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setTab('signup')}
                    className="text-blue-600 font-medium hover:underline"
                  >
                    Sign Up
                  </button>
                </p>
                <p className="text-center text-sm text-gray-500">
                  Want to deliver with SmartPOS?{' '}
                  <Link
                    href="/rider/register"
                    className="text-blue-600 font-medium hover:underline"
                  >
                    Register as a rider
                  </Link>
                </p>
              </form>
            )}

            {tab === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                    <Store className="h-4 w-4 mr-2 text-blue-600" />
                    Restaurant Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Restaurant Name *</label>
                      <div className="relative">
                        <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suName}
                          onChange={(e) => setSuName(e.target.value)}
                          placeholder="Restaurant name"
                          className={inputClass}
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>GST Number</label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suGst}
                          onChange={(e) => setSuGst(e.target.value)}
                          placeholder="27AAAAA0000A1Z5"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Phone Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="tel"
                          value={suPhone}
                          onChange={(e) => setSuPhone(e.target.value)}
                          placeholder="9876543210"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Tax Rate (%)</label>
                      <div className="relative">
                        <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="number"
                          value={suTaxRate}
                          onChange={(e) => setSuTaxRate(e.target.value)}
                          placeholder="18"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Currency *</label>
                      <div className="relative">
                        <Coins className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <select
                          value={suCurrency}
                          onChange={handleCurrencyChange}
                          className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white uppercase"
                        >
                          {CURRENCIES.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code} - {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Subscription plan prices will be shown in this currency.
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>Country Code</label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suCountryCode}
                          readOnly
                          placeholder="IN"
                          className={inputClass + ' bg-gray-50 text-gray-500 cursor-not-allowed'}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                    <MapPin className="h-4 w-4 mr-2 text-blue-600" />
                    Address
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className={labelClass}>Address Line 1</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suAddr1}
                          onChange={(e) => setSuAddr1(e.target.value)}
                          placeholder="Shop / Building number, Street"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Address Line 2</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suAddr2}
                          onChange={(e) => setSuAddr2(e.target.value)}
                          placeholder="Area / Locality"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Address Line 3</label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suAddr3}
                          onChange={(e) => setSuAddr3(e.target.value)}
                          placeholder="City, State, PIN"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                    <Users className="h-4 w-4 mr-2 text-blue-600" />
                    Owner Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Owner 1</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suOwner1}
                          onChange={(e) => setSuOwner1(e.target.value)}
                          placeholder="Primary owner name"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Owner 2</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suOwner2}
                          onChange={(e) => setSuOwner2(e.target.value)}
                          placeholder="Optional"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Owner 3</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suOwner3}
                          onChange={(e) => setSuOwner3(e.target.value)}
                          placeholder="Optional"
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Owner 4</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suOwner4}
                          onChange={(e) => setSuOwner4(e.target.value)}
                          placeholder="Optional"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
                    <Lock className="h-4 w-4 mr-2 text-blue-600" />
                    Login Credentials
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Email *</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="email"
                          value={suEmail}
                          onChange={(e) => setSuEmail(e.target.value)}
                          placeholder="you@example.com"
                          className={inputClass}
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Password *</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="password"
                          value={suPassword}
                          onChange={(e) => setSuPassword(e.target.value)}
                          placeholder="Min 6 characters"
                          className={inputClass}
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>MPIN (4 digits)</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={suMpin}
                          onChange={(e) => setSuMpin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="1234"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    After creating your account you can choose to start a{' '}
                    <span className="font-semibold">30-day free trial (₹0)</span> or subscribe
                    to a paid plan. The free trial can only be used once.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {submitting ? 'Creating account...' : 'Create Account'}
                </button>
                <p className="text-center text-sm text-gray-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setTab('login')}
                    className="text-blue-600 font-medium hover:underline"
                  >
                    Login
                  </button>
                </p>
              </form>
            )}

            {tab === 'forgot' && (
              <form onSubmit={handleForgot} className="space-y-4 max-w-md mx-auto">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-800">
                    Enter your account email and a new password to reset your login.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      value={fpEmail}
                      onChange={(e) => setFpEmail(e.target.value)}
                      placeholder="Enter your email"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="password"
                      value={fpPassword}
                      onChange={(e) => setFpPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Confirm New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="password"
                      value={fpConfirm}
                      onChange={(e) => setFpConfirm(e.target.value)}
                      placeholder="Re-enter new password"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {submitting ? 'Resetting...' : 'Reset Password'}
                </button>
                <p className="text-center text-sm text-gray-500">
                  Remembered your password?{' '}
                  <button
                    type="button"
                    onClick={() => setTab('login')}
                    className="text-blue-600 font-medium hover:underline"
                  >
                    Login
                  </button>
                </p>
              </form>
            )}

            {tab === 'migrate' && (
              <form onSubmit={handleMigrate} className="space-y-4 max-w-md mx-auto">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-800">
                    Have an existing Restaurant ID but no email/password? Set up
                    login credentials for your existing account here.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Restaurant ID</label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={mRestId}
                      onChange={(e) => setMRestId(e.target.value)}
                      placeholder="e.g. REST001"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      value={mEmail}
                      onChange={(e) => setMEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="password"
                      value={mPassword}
                      onChange={(e) => setMPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {submitting ? 'Migrating...' : 'Migrate Account'}
                </button>
                <p className="text-center text-sm text-gray-500">
                  Want to login instead?{' '}
                  <button
                    type="button"
                    onClick={() => setTab('login')}
                    className="text-blue-600 font-medium hover:underline"
                  >
                    Login
                  </button>
                </p>
              </form>
            )}
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="py-6 text-center">
        <p className="text-sm text-white/70 mb-2">
          &copy; 2026 SmartPOS &bull; Operated by GAJANAN DATTATRAYA JOSHI
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/50">
          <Link href="/about" className="hover:text-white transition-colors">About</Link>
          <span>&bull;</span>
          <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
          <span>&bull;</span>
          <Link href="/products-and-services" className="hover:text-white transition-colors">Products and Services</Link>
          <span>&bull;</span>
          <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
          <span>&bull;</span>
          <Link href="/return-refund-policy" className="hover:text-white transition-colors">Refund</Link>
          <span>&bull;</span>
          <Link href="/cancellation-policy" className="hover:text-white transition-colors">Cancellation</Link>
          <span>&bull;</span>
          <Link href="/shipping-policy" className="hover:text-white transition-colors">Shipping</Link>
        </div>
      </footer>
    </div>
  );
}
