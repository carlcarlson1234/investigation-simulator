import { NextRequest, NextResponse } from "next/server";
import { searchEvidence } from "@/lib/queries";
import type { EvidenceType } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? "";
  const type = (searchParams.get("type") ?? "all") as EvidenceType | "all";
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
  const offset = Number(searchParams.get("offset") ?? 0);

  try {
    const { results, total } = await searchEvidence(q, type, limit, offset);
    return NextResponse.json({ results, total, query: q, type, limit, offset });
  } catch (err: unknown) {
    console.error("Search error:", err);
    return NextResponse.json(
      { error: "Search failed", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
