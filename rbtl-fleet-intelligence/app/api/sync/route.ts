
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

export const runtime = 'nodejs';

type AlertRow = {
  source_event_id: string;
  alert_date: string;
  registration: string;
  alert_type: string;
  description: string | null;
  severity: string | null;
  event_count: number;
};

type AssignmentRow = {
  assignment_date: string;
  registration: string;
  inspector_id: string | null;
  inspection_id: string;
  inspection_time: string | null;
  driver_name: string | null;
};

function validToken(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function registration(value: unknown) {
  return clean(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(value + 'T00:00:00Z');

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

export async function POST(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token = process.env.RBTL_SYNC_TOKEN;

    if (!url || !key || !token) {
      return NextResponse.json(
        { error: 'Sync server configuration missing' },
        { status: 500 }
      );
    }

    const received = request.headers
      .get('authorization')
      ?.replace(/^Bearer\s+/i, '') || '';

    if (!validToken(received, token)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const payload = await request.json();

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    const hasAlerts = Array.isArray(payload.alerts);
    const hasAssignments = Array.isArray(payload.assignments);

    if (!hasAlerts && !hasAssignments) {
      return NextResponse.json(
        { error: 'Expected alerts or assignments' },
        { status: 400 }
      );
    }

    const rawAlerts = hasAlerts ? payload.alerts : [];
    const rawAssignments = hasAssignments
      ? payload.assignments
      : [];

    if (rawAlerts.length > 500 || rawAssignments.length > 500) {
      return NextResponse.json(
        { error: 'Maximum 500 records per type' },
        { status: 400 }
      );
    }

    const alerts: AlertRow[] = rawAlerts.map(
      (row: Record<string, unknown>) => ({
        source_event_id: clean(row.source_event_id),
        alert_date: clean(row.alert_date),
        registration: registration(row.registration),
        alert_type: clean(row.alert_type),
        description: clean(row.description) || null,
        severity: clean(row.severity) || null,
        event_count: Number(row.event_count) || 1
      })
    );

    if (alerts.some(a =>
      !a.source_event_id ||
      !validDate(a.alert_date) ||
      !a.registration ||
      !a.alert_type ||
      !Number.isFinite(a.event_count) ||
      a.event_count < 1
    )) {
      return NextResponse.json(
        { error: 'Invalid alert data' },
        { status: 400 }
      );
    }

    const assignments: AssignmentRow[] = rawAssignments.map(
      (row: Record<string, unknown>) => ({
        assignment_date: clean(row.assignment_date),
        registration: registration(row.registration),
        inspector_id: clean(row.inspector_id) || null,
        inspection_id: clean(row.inspection_id),
        inspection_time: clean(row.inspection_time) || null,
        driver_name: clean(row.driver_name) || null
      })
    );

    if (assignments.some(a =>
      !validDate(a.assignment_date) ||
      !a.registration ||
      !a.inspection_id ||
      (
        a.inspection_time !== null &&
        !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(
          a.inspection_time
        )
      )
    )) {
      return NextResponse.json(
        { error: 'Invalid driver assignment data' },
        { status: 400 }
      );
    }

    const supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    if (alerts.length) {
      const { error } = await supabase
        .from('netradyne_alerts')
        .upsert(alerts, {
          onConflict: 'source_event_id'
        });

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    if (assignments.length) {
      const { error } = await supabase
        .from('driver_assignments')
        .upsert(assignments, {
          onConflict: 'inspection_id'
        });

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      alerts_processed: alerts.length,
      assignments_processed: assignments.length
    });

  } catch {
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
}
