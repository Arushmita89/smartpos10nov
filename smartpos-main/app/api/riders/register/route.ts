import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      global: {
        fetch: (input: any, init?: any) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  );
}

const AADHAAR_RE = /^\d{12}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const DRIVING_LICENSE_RE = /^[A-Z0-9]{8,20}$/;
const POLICE_RECORD_RE = /^[A-Za-z0-9/_ -]{3,64}$/;

function cleanDocumentPath(value: unknown): string {
  const path = String(value || '').trim();
  if (!path || path.includes('..') || path.startsWith('/')) return '';
  return path;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const loginName = String(body.login_name || body.loginName || '')
      .toLowerCase()
      .trim();
    const password = String(body.password || '');
    const phone = String(body.phone || '').trim();
    const vehicleNumber = String(
      body.vehicle_number || body.vehicleNumber || ''
    ).trim();

    const aadhaarNumber = String(
      body.aadhaar_number || body.aadhaarNumber || ''
    )
      .replace(/\s/g, '')
      .trim();
    const panNumber = String(body.pan_number || body.panNumber || '')
      .toUpperCase()
      .trim();
    const drivingLicenseNumber = String(
      body.driving_license_number || body.drivingLicenseNumber || ''
    )
      .toUpperCase()
      .replace(/[\s-]/g, '')
      .trim();
    const policeVerificationNumber = String(
      body.police_verification_number || body.policeVerificationNumber || ''
    ).trim();

    const aadhaarDocumentPath = cleanDocumentPath(
      body.aadhaar_document_path || body.aadhaarDocumentPath
    );
    const panDocumentPath = cleanDocumentPath(
      body.pan_document_path || body.panDocumentPath
    );
    const drivingLicenseDocumentPath = cleanDocumentPath(
      body.driving_license_document_path || body.drivingLicenseDocumentPath
    );
    const policeVerificationDocumentPath = cleanDocumentPath(
      body.police_verification_document_path ||
        body.policeVerificationDocumentPath
    );

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginName)) {
      return NextResponse.json(
        { error: 'A valid email address is required' },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }
    if (!/^[0-9+\-\s()]{7,}$/.test(phone)) {
      return NextResponse.json(
        { error: 'A valid phone number is required' },
        { status: 400 }
      );
    }
    if (!AADHAAR_RE.test(aadhaarNumber)) {
      return NextResponse.json(
        { error: 'Aadhaar number must be 12 digits' },
        { status: 400 }
      );
    }
    if (!PAN_RE.test(panNumber)) {
      return NextResponse.json(
        { error: 'Enter a valid PAN (e.g. ABCDE1234F)' },
        { status: 400 }
      );
    }
    if (!DRIVING_LICENSE_RE.test(drivingLicenseNumber)) {
      return NextResponse.json(
        { error: 'Enter a valid driving license number' },
        { status: 400 }
      );
    }
    if (!POLICE_RECORD_RE.test(policeVerificationNumber)) {
      return NextResponse.json(
        { error: 'Enter a valid police verification record number' },
        { status: 400 }
      );
    }
    if (
      !aadhaarDocumentPath ||
      !panDocumentPath ||
      !drivingLicenseDocumentPath ||
      !policeVerificationDocumentPath
    ) {
      return NextResponse.json(
        { error: 'All four verification documents are required' },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    const { data: existingUser } = await admin
      .from('users')
      .select('id')
      .eq('login_name', loginName)
      .maybeSingle();
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const { data: existingRestaurant } = await admin
      .from('parameters')
      .select('restaurant_id')
      .eq('login_name', loginName)
      .maybeSingle();
    if (existingRestaurant) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    const { error } = await admin.from('users').insert({
      restaurant_id: null,
      name,
      login_name: loginName,
      password,
      role: 'rider',
      active: true,
      phone,
      vehicle_number: vehicleNumber || null,
      rider_status: 'offline',
      approval_status: 'pending',
      aadhaar_number: aadhaarNumber,
      pan_number: panNumber,
      driving_license_number: drivingLicenseNumber,
      police_verification_number: policeVerificationNumber,
      aadhaar_document_path: aadhaarDocumentPath,
      pan_document_path: panDocumentPath,
      driving_license_document_path: drivingLicenseDocumentPath,
      police_verification_document_path: policeVerificationDocumentPath,
      documents_verified: false,
    });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      message:
        'Rider application submitted. You can log in once the SmartPOS team approves your account.',
    });
  } catch (err: any) {
    console.error('Rider registration error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
