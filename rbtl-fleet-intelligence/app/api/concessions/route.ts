
import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const viewer = await getViewer();

    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (viewer.profile.role !== "manager") {
      return NextResponse.json(
        { success: false, error: "Manager access required" },
        { status: 403 }
      );
    }

    const supabase = await supabaseServer();

    const { data, error } = await supabase
      .from("concessions")
      .select(
        "id,concession_id,tracking_id,driver_name,transporter_id,dsp,station"
      )
      .order("id", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("Concessions API:", error.message);

      return NextResponse.json(
        { success: false, error: "Unable to load concessions" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        concessions: data || [],
        count: data?.length || 0,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error("Concessions API:", error);

    return NextResponse.json(
      { success: false, error: "Unable to load concessions" },
      { status: 500 }
    );
  }
}
