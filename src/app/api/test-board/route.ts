import { NextResponse } from "next/server";
import { jmail } from "@/db/jmail";
import type { Person } from "@/lib/types";
import type { BoardNode, BoardConnection, BoardPersonNode, PinnedEvidence } from "@/lib/board-types";

const TARGET_PEOPLE = [
  "jeffrey-epstein",
  "ghislaine-maxwell",
  "bill-clinton",
  "bill-gates",
  "donald-trump",
  "prince-andrew-duke-of-york",
];

function mapPerson(row: Record<string, unknown>): Person {
  const rj = (row.raw_json as Record<string, unknown>) ?? {};
  const personId = row.id as string;
  const dbImageUrl = (row.image_url as string) ?? null;
  const AVIF_PEOPLE = new Set(["jeffrey-epstein"]);
  const ext = AVIF_PEOPLE.has(personId) ? "avif" : "png";
  const thumbnailUrl = personId ? `/people-thumbnails/${personId}.${ext}` : null;
  const aliases = row.aliases;
  const emailAddresses = row.email_addresses;
  return {
    id: personId,
    name: row.name as string,
    slug: (row.slug as string) ?? null,
    aliases: Array.isArray(aliases) ? (aliases as string[]) : [],
    description: (row.description as string) ?? null,
    imageUrl: dbImageUrl || thumbnailUrl,
    emailAddresses: Array.isArray(emailAddresses) ? (emailAddresses as string[]) : [],
    photoCount: Number(rj.photo_count ?? 0),
    source: (rj.source as string) ?? null,
  };
}

export async function GET() {
  try {
    // 1. Fetch all target people
    const personRows = await jmail`
      SELECT id, name, slug, aliases, description, image_url, email_addresses, raw_json
      FROM people
      WHERE id = ANY(${TARGET_PEOPLE})
    `;
    const people = personRows.map(mapPerson);
    const peopleMap = new Map(people.map((p) => [p.id, p]));

    // 2. Fetch a few top emails for each target person
    const emailRows = await jmail`
      SELECT id, subject, sender, sent_at,
             COALESCE(star_count, 0) as star_count,
             left(body, 150) as snippet
      FROM emails
      WHERE search_vector @@ to_tsquery('english', 'epstein | maxwell | clinton | gates')
        AND sent_at IS NOT NULL
      ORDER BY star_count DESC NULLS LAST, sent_at DESC
      LIMIT 10
    `;

    // 3. Fetch a few photos for target people
    const photoFaceRows = await jmail`
      SELECT pf.photo_id, array_agg(pf.person_id) as person_ids
      FROM photo_faces pf
      WHERE pf.person_id = ANY(${TARGET_PEOPLE})
      GROUP BY pf.photo_id
      ORDER BY count(*) DESC
      LIMIT 15
    `;

    // Build pinned evidence lookups
    const photosByPerson = new Map<string, PinnedEvidence[]>();
    for (const row of photoFaceRows) {
      const photoId = row.photo_id as string;
      const personIds = (row.person_ids as string[]).filter((id) => TARGET_PEOPLE.includes(id));
      const pinned: PinnedEvidence = {
        id: photoId,
        type: "photo",
        title: `Photo — ${personIds.slice(0, 2).join(", ")}`,
        snippet: "",
        date: null,
        sender: personIds.join(", "),
        starCount: 0,
      };
      for (const pid of personIds) {
        if (!photosByPerson.has(pid)) photosByPerson.set(pid, []);
        photosByPerson.get(pid)!.push(pinned);
      }
    }

    // 4. Build person nodes in a pentagon
    const nodes: BoardNode[] = [];
    const connections: BoardConnection[] = [];
    const CX = 600, CY = 500, RADIUS = 400;
    for (let i = 0; i < TARGET_PEOPLE.length; i++) {
      const person = peopleMap.get(TARGET_PEOPLE[i]);
      if (!person) continue;
      const angle = (i / TARGET_PEOPLE.length) * Math.PI * 2 - Math.PI / 2;
      // Pin up to 2 photos to each person card
      const pinnedPhotos = (photosByPerson.get(person.id) || []).slice(0, 2);
      const node: BoardPersonNode = {
        kind: "person",
        id: person.id,
        data: person,
        position: {
          x: CX + Math.cos(angle) * RADIUS,
          y: CY + Math.sin(angle) * RADIUS,
        },
        pinnedEvidence: pinnedPhotos,
      };
      nodes.push(node);
    }

    // 5. Create person-to-person connections with pinned emails
    const personPairs: [string, string, string][] = [
      ["jeffrey-epstein", "ghislaine-maxwell", "Known associates"],
      ["jeffrey-epstein", "bill-clinton", "Flight log appearances"],
      ["jeffrey-epstein", "donald-trump", "Social acquaintances"],
      ["jeffrey-epstein", "bill-gates", "Meetings documented"],
      ["ghislaine-maxwell", "bill-clinton", "Attended events together"],
    ];

    let emailIdx = 0;
    for (const [src, tgt, label] of personPairs) {
      if (!peopleMap.has(src) || !peopleMap.has(tgt)) continue;
      // Pin 1-2 emails to this connection
      const pinned: PinnedEvidence[] = [];
      const emailsForPair = emailRows.slice(emailIdx, emailIdx + 2);
      emailIdx += 2;
      for (const row of emailsForPair) {
        pinned.push({
          id: row.id as string,
          type: "email",
          title: (row.subject as string) ?? "Re:",
          snippet: (row.snippet as string) ?? "",
          date: row.sent_at ? new Date(row.sent_at as string).toISOString().split("T")[0] : null,
          sender: (row.sender as string) ?? null,
          starCount: Number(row.star_count ?? 0),
        });
      }
      connections.push({
        id: `test-direct-${src}-${tgt}`,
        sourceId: src,
        targetId: tgt,
        type: "manual",
        label,
        strength: pinned.length,
        verified: true,
        pinnedEvidence: pinned,
      });
    }

    return NextResponse.json({ nodes, connections });
  } catch (err) {
    console.error("Test board error:", err);
    return NextResponse.json({ error: "Failed to build test board" }, { status: 500 });
  }
}
