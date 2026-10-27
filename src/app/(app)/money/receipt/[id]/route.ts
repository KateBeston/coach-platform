import { NextResponse, type NextRequest } from "next/server";
import { getCoach } from "@/lib/coach";

/** Opens a receipt through a short-lived link, so receipts are never public. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, isManager } = await getCoach();
  if (!isManager) return new NextResponse("Not allowed", { status: 403 });
  const { data: e } = await supabase.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  if (!e?.receipt_path) return new NextResponse("No receipt", { status: 404 });
  const { data } = await supabase.storage.from("receipts").createSignedUrl(e.receipt_path, 60);
  if (!data?.signedUrl) return new NextResponse("Receipt unavailable", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
