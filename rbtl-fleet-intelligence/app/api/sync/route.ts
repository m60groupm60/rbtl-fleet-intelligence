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

type InspectionRow = {
  inspection_id: string;
  inspection_date: string;
  inspection_time: string | null;
  registration: string;
  inspector_id: string | null;
  result: string | null;
  vin: string | null;
  source_timestamp: string | null;
};

type ClearQuoteRow = {
  inspection_id: string;
  inspection_date: string;
  inspection_time: string | null;
  registration: string;
  inspection_type: string | null;
  status: string;
  new_damage: boolean | null;
  existing_damage: boolean | null;
  checklist_alert: boolean | null;
  depot: string | null;
  submitted_at: string;
  synced_at: string;
};

const clean = (value: unknown) =>
  String(value ?? '').trim();

const registration = (value: unknown) =>
  clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(value + 'T00:00:00Z');

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function validTime(value: string | null) {
  return value === null ||
    /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

function validTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function validToken(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  return a.length === b.length &&
    timingSafeEqual(a, b);
}

function parseBoolean(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;

  const text = clean(value).toLowerCase();

  if (['yes', 'true', '1'].includes(text)) return true;
  if (['no', 'false', '0'].includes(text)) return false;

  return null;
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

    const received = request.headers.get('authorization')
      ?.replace(/^Bearer\s+/i, '') || '';

    if (!validToken(received, token)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const payload = await request.json();

    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    const hasAlerts = Array.isArray(payload.alerts);
    const hasAssignments = Array.isArray(payload.assignments);
    const hasInspections = Array.isArray(payload.inspections);
    const hasClearQuote = Array.isArray(payload.clearquote);

    if (
      !hasAlerts &&
      !hasAssignments &&
      !hasInspections &&
      !hasClearQuote
    ) {
      return NextResponse.json(
        {
          error:
            'Expected alerts, assignments, inspections or clearquote'
        },
        { status: 400 }
      );
    }

    const rawAlerts = hasAlerts ? payload.alerts : [];

    const rawAssignments = hasAssignments
      ? payload.assignments
      : [];

    const rawInspections = hasInspections
      ? payload.inspections
      : [];

    const rawClearQuote = hasClearQuote
      ? payload.clearquote
      : [];

    if (
      rawAlerts.length > 500 ||
      rawAssignments.length > 500 ||
      rawInspections.length > 500 ||
      rawClearQuote.length > 500
    ) {
      return NextResponse.json(
        { error: 'Maximum 500 records per type' },
        { status: 400 }
      );
    }

    const validObjects = (rows: unknown[]) =>
      rows.every(row =>
        row !== null &&
        typeof row === 'object' &&
        !Array.isArray(row)
      );

    if (
      !validObjects(rawAlerts) ||
      !validObjects(rawAssignments) ||
      !validObjects(rawInspections) ||
      !validObjects(rawClearQuote)
    ) {
      return NextResponse.json(
        { error: 'Invalid record format' },
        { status: 400 }
      );
    }

    // ==========================================
    // NETRADYNE ALERTS
    // ==========================================

    const alerts: AlertRow[] = rawAlerts.map(
      (row: Record<string, unknown>) => ({
        source_event_id: clean(row.source_event_id),
        alert_date: clean(row.alert_date),
        registration: registration(row.registration),
        alert_type: clean(row.alert_type),
        description: clean(row.description) || null,
        severity: clean(row.severity) || null,
        event_count: Number(row.event_count)
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

    // ==========================================
    // DRIVER ASSIGNMENTS
    // ==========================================

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
      !validTime(a.inspection_time)
    )) {
      return NextResponse.json(
        { error: 'Invalid driver assignment data' },
        { status: 400 }
      );
    }

    // ==========================================
    // AMAZON DVIC INSPECTIONS
    // ==========================================

    const inspections: InspectionRow[] = rawInspections.map(
      (row: Record<string, unknown>) => ({
        inspection_id: clean(row.inspection_id),
        inspection_date: clean(row.inspection_date),
        inspection_time: clean(row.inspection_time) || null,
        registration: registration(row.registration),
        inspector_id: clean(row.inspector_id) || null,
        result: clean(row.result) || null,
        vin: clean(row.vin) || null,
        source_timestamp: clean(row.source_timestamp) || null
      })
    );

    if (inspections.some(i =>
      !i.inspection_id ||
      !validDate(i.inspection_date) ||
      !i.registration ||
      !validTime(i.inspection_time)
    )) {
      return NextResponse.json(
        { error: 'Invalid DVIC inspection data' },
        { status: 400 }
      );
    }

    // ==========================================
    // CLEARQUOTE INSPECTIONS
    // ==========================================

    const clearquote: ClearQuoteRow[] = rawClearQuote.map(
      (row: Record<string, unknown>) => ({
        inspection_id: clean(row.inspection_id),
        inspection_date: clean(row.inspection_date),
        inspection_time: clean(row.inspection_time) || null,
        registration: registration(row.registration),
        inspection_type: clean(row.inspection_type) || null,
        status: clean(row.status).toUpperCase(),
        new_damage: parseBoolean(row.new_damage),
        existing_damage: parseBoolean(row.existing_damage),
        checklist_alert: parseBoolean(row.checklist_alert),
        depot: clean(row.depot) || null,
        submitted_at: clean(row.submitted_at),
        synced_at: new Date().toISOString()
      })
    );

    if (clearquote.some(c =>
      !c.inspection_id ||
      !validDate(c.inspection_date) ||
      !c.registration ||
      !validTime(c.inspection_time) ||
      !validTimestamp(c.submitted_at) ||
      c.status !== 'COMPLETED'
    )) {
      return NextResponse.json(
        { error: 'Invalid ClearQuote inspection data' },
        { status: 400 }
      );
    }

    // Remove duplicate ClearQuote IDs within each batch.

    const uniqueClearQuote = Array.from(
      new Map(
        clearquote.map(row => [row.inspection_id, row])
      ).values()
    );

    // ==========================================
    // SUPABASE CONNECTION
    // ==========================================

    const supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    // ==========================================
    // SAVE NETRADYNE ALERTS
    // ==========================================

    if (alerts.length) {
      const { error } = await supabase
        .from('netradyne_alerts')
        .upsert(alerts, {
          onConflict: 'source_event_id'
        });

      if (error) {
        return NextResponse.json(
          { error: 'Alerts: ' + error.message },
          { status: 400 }
        );
      }
    }

    // ==========================================
    // SAVE DRIVER ASSIGNMENTS
    // ==========================================

    if (assignments.length) {
      const { error } = await supabase
        .from('driver_assignments')
        .upsert(assignments, {
          onConflict: 'inspection_id'
        });

      if (error) {
        return NextResponse.json(
          { error: 'Assignments: ' + error.message },
          { status: 400 }
        );
      }
    }

    // ==========================================
    // SAVE AMAZON DVIC INSPECTIONS
    // ==========================================

    if (inspections.length) {
      const { error } = await supabase
        .from('dvic_inspections')
        .upsert(inspections, {
          onConflict: 'inspection_id'
        });

      if (error) {
        return NextResponse.json(
          { error: 'Inspections: ' + error.message },
          { status: 400 }
        );
      }
    }

    // ==========================================
    // SAVE CLEARQUOTE INSPECTIONS
    // ==========================================

    if (uniqueClearQuote.length) {
      const { error } = await supabase
        .from('clearquote_inspections')
        .upsert(uniqueClearQuote, {
          onConflict: 'inspection_id'
        });

      if (error) {
        return NextResponse.json(
          { error: 'ClearQuote: ' + error.message },
          { status: 400 }
        );
      }
    }

    // ==========================================
    // SUCCESS RESPONSE
    // ==========================================

    return NextResponse.json({
      success: true,
      alerts_processed: alerts.length,
      assignments_processed: assignments.length,
      inspections_processed: inspections.length,
      clearquote_processed: uniqueClearQuote.length
    });

  } catch (error) {
    console.error('RBTL sync failed:', error);

    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
}
