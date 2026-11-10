'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Bike,
  CheckCircle,
  CreditCard,
  FileText,
  Mail,
  Lock,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import DocumentUpload from '@/components/rider/DocumentUpload';

const inputClass =
  'w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm';

const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';

const AADHAAR_RE = /^\d{12}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const DRIVING_LICENSE_RE = /^[A-Z0-9]{8,20}$/;
const POLICE_RECORD_RE = /^[A-Za-z0-9/_ -]{3,64}$/;

export default function RiderRegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [drivingLicenseNumber, setDrivingLicenseNumber] = useState('');
  const [policeVerificationNumber, setPoliceVerificationNumber] = useState('');
  const [aadhaarDocument, setAadhaarDocument] = useState('');
  const [panDocument, setPanDocument] = useState('');
  const [drivingLicenseDocument, setDrivingLicenseDocument] = useState('');
  const [policeVerificationDocument, setPoliceVerificationDocument] =
    useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [documentFolder] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `rider-${Date.now()}`
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanAadhaar = aadhaarNumber.replace(/\s/g, '');
    const cleanPan = panNumber.trim().toUpperCase();
    const cleanDrivingLicense = drivingLicenseNumber
      .trim()
      .toUpperCase()
      .replace(/[\s-]/g, '');
    const cleanPoliceRecord = policeVerificationNumber.trim();

    if (!name.trim() || !email.trim() || !phone.trim() || !password) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!AADHAAR_RE.test(cleanAadhaar)) {
      toast.error('Aadhaar number must be 12 digits');
      return;
    }
    if (!PAN_RE.test(cleanPan)) {
      toast.error('Enter a valid PAN (e.g. ABCDE1234F)');
      return;
    }
    if (!DRIVING_LICENSE_RE.test(cleanDrivingLicense)) {
      toast.error('Enter a valid driving license number');
      return;
    }
    if (!POLICE_RECORD_RE.test(cleanPoliceRecord)) {
      toast.error('Enter a valid police verification record number');
      return;
    }
    if (
      !aadhaarDocument ||
      !panDocument ||
      !drivingLicenseDocument ||
      !policeVerificationDocument
    ) {
      toast.error('Upload all four verification documents');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/riders/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          login_name: email,
          phone,
          vehicle_number: vehicleNumber,
          password,
          aadhaar_number: cleanAadhaar,
          pan_number: cleanPan,
          driving_license_number: cleanDrivingLicense,
          police_verification_number: cleanPoliceRecord,
          aadhaar_document_path: aadhaarDocument,
          pan_document_path: panDocument,
          driving_license_document_path: drivingLicenseDocument,
          police_verification_document_path: policeVerificationDocument,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit application');
      }
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-3 shadow-lg">
            <Bike className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Become a SmartPOS Rider
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Register once and deliver for SmartPOS restaurants near you.
          </p>
        </div>

        {submitted ? (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100">
              <CheckCircle className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Application submitted
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Your rider account is pending approval. Once the SmartPOS team
                approves it, you can log in and go online to start receiving
                deliveries.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-block w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Full Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className={inputClass}
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Email Address *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                  required
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                This email is your login.
              </p>
            </div>

            <div>
              <label className={labelClass}>Phone Number *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  className={inputClass}
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Vehicle Number</label>
              <div className="relative">
                <Bike className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="KA01AB1234"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Verification documents
                  </p>
                  <p className="text-xs text-gray-500">
                    Required before the SmartPOS team can approve your account.
                  </p>
                </div>
              </div>

              <div>
                <label className={labelClass}>Aadhaar Number *</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={aadhaarNumber}
                    onChange={(e) => setAadhaarNumber(e.target.value)}
                    placeholder="12-digit Aadhaar number"
                    inputMode="numeric"
                    maxLength={12}
                    className={inputClass}
                    required
                  />
                </div>
                <div className="mt-2">
                  <DocumentUpload
                    label="Aadhaar card"
                    folder={documentFolder}
                    value={aadhaarDocument}
                    onChange={setAadhaarDocument}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>PAN Number *</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    className={inputClass}
                    required
                  />
                </div>
                <div className="mt-2">
                  <DocumentUpload
                    label="PAN card"
                    folder={documentFolder}
                    value={panDocument}
                    onChange={setPanDocument}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Driving License Number *</label>
                <div className="relative">
                  <Bike className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={drivingLicenseNumber}
                    onChange={(e) =>
                      setDrivingLicenseNumber(e.target.value.toUpperCase())
                    }
                    placeholder="KA0120180012345"
                    className={inputClass}
                    required
                  />
                </div>
                <div className="mt-2">
                  <DocumentUpload
                    label="Driving license"
                    folder={documentFolder}
                    value={drivingLicenseDocument}
                    onChange={setDrivingLicenseDocument}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Police Verification Record Number *
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={policeVerificationNumber}
                    onChange={(e) =>
                      setPoliceVerificationNumber(e.target.value)
                    }
                    placeholder="Police verification record number"
                    className={inputClass}
                    required
                  />
                </div>
                <div className="mt-2">
                  <DocumentUpload
                    label="Police verification record"
                    folder={documentFolder}
                    value={policeVerificationDocument}
                    onChange={setPoliceVerificationDocument}
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={inputClass}
                  required
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Confirm Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
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
              {submitting ? 'Submitting...' : 'Submit Application'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already registered?{' '}
              <Link href="/login" className="text-blue-600 font-medium hover:underline">
                Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
