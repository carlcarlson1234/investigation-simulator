import { NextRequest, NextResponse } from "next/server";
import { getEvidenceById } from "@/lib/queries";
import type { EvidenceType } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const type = (req.nextUrl.searchParams.get("type") ?? "email") as EvidenceType;

  try {
    const evidence = await getEvidenceById(id, type);
    if (!evidence) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(evidence);
  } catch (err: unknown) {
    console.error("Evidence fetch error:", err);
    return NextResponse.json(
      { error: "Fetch failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
