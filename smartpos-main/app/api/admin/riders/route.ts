import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertOwner } from '@/app/api/admin/_auth';

export const dynamic = 'force-dynamic';

const DOCUMENT_BUCKET = 'rider-documents';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const RIDER_SELECT =
  'id, restaurant_id, name, login_name, phone, vehicle_number, rider_status, active, approval_status, aadhaar_number, pan_number, driving_license_number, police_verification_number, aadhaar_document_path, pan_document_path, driving_license_document_path, police_verification_document_path, documents_verified, documents_verified_at, documents_verified_by, created_at';

const DOCUMENT_FIELDS = [
  {
    key: 'aadhaar',
    number: 'aadhaar_number',
    path: 'aadhaar_document_path',
    label: 'Aadhaar',
  },
  {
    key: 'pan',
    number: 'pan_number',
    path: 'pan_document_path',
    label: 'PAN',
  },
  {
    key: 'driving_license',
    number: 'driving_license_number',
    path: 'driving_license_document_path',
    label: 'Driving license',
  },
  {
    key: 'police_verification',
    number: 'police_verification_number',
    path: 'police_verification_document_path',
    label: 'Police verification record',
  },
] as const;

function missingDocumentLabels(rider: Record<string, any>): string[] {
  return DOCUMENT_FIELDS.filter(
    (field) => !rider[field.number] || !rider[field.path]
  ).map((field) => field.label);
}

async function attachSignedDocuments(admin: any, riders: any[]) {
  const paths: string[] = [];
  for (const rider of riders) {
    for (const field of DOCUMENT_FIELDS) {
      const path = rider[field.path];
      if (path) paths.push(path);
    }
  }

  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await admin.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const item of data || []) {
      if (item?.path && item?.signedUrl) {
        signedByPath.set(item.path, item.signedUrl);
      }
    }
  }

  return riders.map((rider) => {
    const documents: Record<string, string | null> = {};
    for (const field of DOCUMENT_FIELDS) {
      const path = rider[field.path];
      documents[field.key] = path ? signedByPath.get(path) || null : null;
    }
    return {
      ...rider,
      documents,
      missing_documents: missingDocumentLabels(rider),
    };
  });
}

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

export async function GET(req: NextRequest) {
  try {
    const auth = await assertOwner(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from('users')
      .select(RIDER_SELECT)
      .eq('role', 'rider')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const riders = data || [];
    const rank: Record<string, number> = {
      pending: 0,
      approved: 1,
      rejected: 2,
    };
    riders.sort((a: any, b: any) => {
      const ra = rank[a.approval_status || 'approved'] ?? 3;
      const rb = rank[b.approval_status || 'approved'] ?? 3;
      if (ra !== rb) return ra - rb;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    const ridersWithDocuments = await attachSignedDocuments(admin, riders);

    return NextResponse.json({
      riders: ridersWithDocuments,
      counts: {
        total: riders.length,
        pending: riders.filter(
          (r: any) => (r.approval_status || 'approved') === 'pending'
        ).length,
        approved: riders.filter(
          (r: any) =>
            (r.approval_status || 'approved') === 'approved' && r.active
        ).length,
        online: riders.filter(
          (r: any) =>
            (r.approval_status || 'approved') === 'approved' &&
            r.active &&
            r.rider_status === 'available'
        ).length,
      },
    });
  } catch (err: any) {
    console.error('Admin riders list error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await assertOwner(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const id = String(body.id || '').trim();
    const action = String(body.action || '').trim();

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const admin = getAdminClient();

    if (action === 'approve' || action === 'verify') {
      const { data: current, error: fetchError } = await admin
        .from('users')
        .select(RIDER_SELECT)
        .eq('id', id)
        .eq('role', 'rider')
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!current) {
        return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
      }

      const missing = missingDocumentLabels(current);
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Cannot ${action} rider: missing ${missing.join(', ')}`,
          },
          { status: 400 }
        );
      }

      if (action === 'approve' && !current.documents_verified) {
        return NextResponse.json(
          {
            error:
              'Verify all four rider documents before approving this rider',
          },
          { status: 400 }
        );
      }
    }

    const ownerLogin = (req.headers.get('x-login-name') || '').trim();
    const now = new Date().toISOString();

    const patches: Record<string, Record<string, unknown>> = {
      approve: {
        approval_status: 'approved',
        active: true,
        rider_status: 'offline',
      },
      reject: {
        approval_status: 'rejected',
        active: false,
        rider_status: 'offline',
      },
      activate: { active: true },
      deactivate: { active: false, rider_status: 'offline' },
      verify: {
        documents_verified: true,
        documents_verified_at: now,
        documents_verified_by: ownerLogin || 'owner',
      },
      unverify: {
        documents_verified: false,
        documents_verified_at: null,
        documents_verified_by: null,
      },
    };

    const patch = patches[action];
    if (!patch) {
      return NextResponse.json(
        {
          error:
            'action must be approve, reject, activate, deactivate, verify or unverify',
        },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from('users')
      .update(patch)
      .eq('id', id)
      .eq('role', 'rider')
      .select(RIDER_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Rider not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, rider: data });
  } catch (err: any) {
    console.error('Admin rider update error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
