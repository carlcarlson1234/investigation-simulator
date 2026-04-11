import { NextRequest, NextResponse } from "next/server";
import { listFlights } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 30)));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  const sortParam = sp.get("sort");
  const sort: "newest" | "oldest" = sortParam === "oldest" ? "oldest" : "newest";

  try {
    const result = await listFlights({ q, limit, offset, sort });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Flight list error:", err);
    return NextResponse.json(
      { error: "Failed to list flights", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
