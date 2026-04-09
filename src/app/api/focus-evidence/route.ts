import { NextRequest, NextResponse } from "next/server";
import {
  getDirectEvidence,
  getCrypticEvidence,
  getFodderEvidence,
  photoThumbnailUrl,
} from "@/lib/queries";
import type { SearchResult } from "@/lib/types";

export interface FocusEvidenceItem extends SearchResult {
  relevance: "direct" | "tangential" | "temporal" | "wildcard";
  thumbnailUrl?: string | null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * POST /api/focus-evidence
 * Fetch curated evidence for a focused investigation session.
 *
 * Body: { personId: string, excludeIds?: string[], wave?: number }
 * Returns: { items: FocusEvidenceItem[] }  (up to 8 items)
 *
 * Mix: 40% direct, 30% tangential, 20% temporal, 10% wildcard
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const personId: string = body.personId;
    const excludeIds: string[] = body.excludeIds ?? [];
    const wave: number = body.wave ?? 1;

    if (!personId) {
      return NextResponse.json({ error: "personId required" }, { status: 400 });
    }

    // Later waves shift toward more tangential/wildcard
    const directCount = wave <= 2 ? 3 : 2;
    const crypticCount = wave <= 2 ? 4 : 5;
    const fodderCount = 1;

    const [direct, tangential, wildcard] = await Promise.all([
      getDirectEvidence([personId], excludeIds, directCount),
      getCrypticEvidence([personId], excludeIds, crypticCount),
      getFodderEvidence(excludeIds, fodderCount),
    ]);

    const tag = (items: SearchResult[], relevance: FocusEvidenceItem["relevance"]): FocusEvidenceItem[] =>
      items.map((item) => ({
        ...item,
        relevance,
        thumbnailUrl: item.type === "photo" ? photoThumbnailUrl(item.id) : null,
      }));

    const tangentialTagged = tag(tangential.slice(0, 2), "tangential");
    const temporalTagged = tag(tangential.slice(2), "temporal");

    const allItems = [
      ...tag(direct, "direct"),
      ...tangentialTagged,
      ...temporalTagged,
      ...tag(wildcard, "wildcard"),
    ];

    const items = shuffle(allItems).slice(0, 8);

    return NextResponse.json({ items });
  } catch (err: unknown) {
    console.error("Focus evidence error:", err);
    return NextResponse.json(
      { error: "Failed to fetch focus evidence", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
