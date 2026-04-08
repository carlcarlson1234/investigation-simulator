import { NextRequest, NextResponse } from "next/server";
import {
  getDirectEvidence,
  getCrypticEvidence,
  getFodderEvidence,
  photoThumbnailUrl,
} from "@/lib/queries";
import type { SearchResult } from "@/lib/types";

export interface FocusEvidenceItem extends SearchResult {
  /** How the evidence relates to the target person */
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
 * Body: { personId: string, excludeIds?: string[] }
 * Returns: { items: FocusEvidenceItem[] }  (up to 8 items)
 *
 * Mix: 40% direct, 30% tangential, 20% temporal, 10% wildcard
 * → 3 direct, 2 tangential (cryptic), 2 temporal (cryptic), 1 wildcard (fodder)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const personId: string = body.personId;
    const excludeIds: string[] = body.excludeIds ?? [];

    if (!personId) {
      return NextResponse.json({ error: "personId required" }, { status: 400 });
    }

    // Fetch evidence in parallel
    const [direct, tangential, wildcard] = await Promise.all([
      // Direct: clearly connected to this person (name in doc, face in photo)
      getDirectEvidence([personId], excludeIds, 3),
      // Tangential + temporal: interesting but indirect (high-star emails, docs)
      getCrypticEvidence([personId], excludeIds, 4),
      // Wildcard: random noise that might spark unexpected connections
      getFodderEvidence(excludeIds, 1),
    ]);

    // Tag with relevance and add thumbnails
    const tag = (items: SearchResult[], relevance: FocusEvidenceItem["relevance"]): FocusEvidenceItem[] =>
      items.map(item => ({
        ...item,
        relevance,
        thumbnailUrl: item.type === "photo" ? photoThumbnailUrl(item.id) : null,
      }));

    // Split tangential into "tangential" and "temporal" labels (first 2 = tangential, next 2 = temporal)
    const tangentialTagged = tag(tangential.slice(0, 2), "tangential");
    const temporalTagged = tag(tangential.slice(2, 4), "temporal");

    const allItems = [
      ...tag(direct, "direct"),
      ...tangentialTagged,
      ...temporalTagged,
      ...tag(wildcard, "wildcard"),
    ];

    // Shuffle so relevance types aren't grouped
    const items = shuffle(allItems).slice(0, 8);

    return NextResponse.json({ items });
  } catch (err: unknown) {
    console.error("Focus evidence error:", err);
    return NextResponse.json(
      { error: "Failed to fetch focus evidence", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
