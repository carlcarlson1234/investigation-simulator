import { NextRequest, NextResponse } from "next/server";
import { browsePhotos } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(60, Math.max(1, Number(sp.get("pageSize") ?? 24)));
  const search = sp.get("q") ?? undefined;
  const personId = sp.get("personId") ?? undefined;

  try {
    const result = await browsePhotos({
      page,
      pageSize,
      search,
      personId,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Photo browse error:", err);
    return NextResponse.json(
      { error: "Failed to browse photos" },
      { status: 500 }
    );
  }
}
