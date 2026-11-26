import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverClient } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const db = await serverClient();

    const {
      data: { user }
    } = await db.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "manager") {
      return NextResponse.json(
        { error: "Managers only" },
        { status: 403 }
      );
    }

    const date = request.nextUrl.searchParams.get("date");

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Invalid date" },
        { status: 400 }
      );
    }

    const parsed = new Date(date + "T00:00:00Z");

    if (
      isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      return NextResponse.json(
        { error: "Invalid date" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { error: "Server configuration missing" },
        { status: 500 }
      );
    }

    const admin = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const inspections = [];
    const pageSize = 500;

    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin
        .from("clearquote_inspections")
        .select(`
          inspection_id,
          inspection_date,
          inspection_time,
          registration,
          inspection_type,
          status,
          new_damage,
          existing_damage,
          checklist_alert,
          depot,
          submitted_at,
          synced_at
        `)
        .eq("inspection_date", date)
        .order("inspection_id")
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(error.message);
      }

      inspections.push(...(data || []));

      if (!data || data.length < pageSize) break;
    }

    return NextResponse.json(
      {
        success: true,
        date,
        total: inspections.length,
        inspections
      },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );

  } catch (error) {
    console.error("ClearQuote retrieval failed", error);

    return NextResponse.json(
      { error: "Unable to retrieve ClearQuote data" },
      { status: 500 }
    );
  }
}
