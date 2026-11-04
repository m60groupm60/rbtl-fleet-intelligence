
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

function validToken(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
    const rows = payload?.alerts;

    if (!Array.isArray(rows) || rows.length > 500) {
      return NextResponse.json(
        { error: 'Expected up to 500 alerts' },
        { status: 400 }
      );
    }

    const alerts: AlertRow[] = rows.map((row: AlertRow) => ({
      source_event_id: String(row.source_event_id || ''),
      alert_date: String(row.alert_date || ''),
      registration: String(row.registration || '')
        .toUpperCase().replace(/[^A-Z0-9]/g, ''),
      alert_type: String(row.alert_type || ''),
      description: row.description || null,
      severity: row.severity || null,
      event_count: Number(row.event_count) || 1
    }));

    if (alerts.some(a =>
      !a.source_event_id ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.alert_date) ||
      !a.registration ||
      !a.alert_type
    )) {
      return NextResponse.json(
        { error: 'Invalid alert data' },
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

    return NextResponse.json({
      success: true,
      processed: alerts.length
    });

  } catch {
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
}
