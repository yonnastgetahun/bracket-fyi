import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { participantId, displayName } = body as {
    participantId: string;
    displayName: string;
  };

  if (!participantId || !displayName) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { error } = await supabase
    .from("participants")
    .update({ display_name: displayName })
    .eq("id", participantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { participantId } = body as { participantId: string };

  if (!participantId) {
    return NextResponse.json({ error: "Missing participantId" }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { error } = await supabase
    .from("participants")
    .delete()
    .eq("id", participantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
