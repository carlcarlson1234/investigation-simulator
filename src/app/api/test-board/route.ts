import { NextResponse } from "next/server";
import { jmail } from "@/db/jmail";
import type { Person, SearchResult } from "@/lib/types";
import type { BoardNode, BoardConnection, BoardPersonNode, BoardEvidenceNode } from "@/lib/board-types";

const TARGET_PEOPLE = [
  "jeffrey-epstein",
  "ghislaine-maxwell",
  "bill-clinton",
  "bill-gates",
  "donald-trump",
  "prince-andrew-duke-of-york",
];

const PHOTO_CDN = "https://assets.getkino.com";

function photoThumbnailUrl(photoId: string, width = 400): string {
  return `${PHOTO_CDN}/cdn-cgi/image/width=${width},quality=80,format=auto/photos-deboned/${photoId}`;
}

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
    aliases: Array.isArray(aliases) ? aliases : [],
    description: (row.description as string) ?? null,
    imageUrl: dbImageUrl || thumbnailUrl,
    emailAddresses: Array.isArray(emailAddresses) ? emailAddresses : [],
    photoCount: Number(rj.photo_count ?? 0),
    source: (rj.source as string) ?? null,
  };
}

export async function GET() {
  try {
    // 1. Fetch the 5 target people
    const personRows = await jmail`
      SELECT id, name, slug, aliases, description, image_url, email_addresses, raw_json
      FROM people
      WHERE id = ANY(${TARGET_PEOPLE})
    `;
    const people = personRows.map(mapPerson);
    const peopleMap = new Map(people.map(p => [p.id, p]));

    // People who should get evidence connections (exclude orphan: Prince Andrew)
    const CONNECTED_PEOPLE = TARGET_PEOPLE.filter(id => id !== "prince-andrew-duke-of-york");

    // 2. Find photos where multiple target people appear together (shared photos first)
    const photoFaceRows = await jmail`
      SELECT pf.photo_id, array_agg(pf.person_id) as person_ids
      FROM photo_faces pf
      WHERE pf.person_id = ANY(${CONNECTED_PEOPLE})
      GROUP BY pf.photo_id
      ORDER BY count(*) DESC, pf.photo_id
      LIMIT 40
    `;

    // Prioritize: shared photos (2+ people), then fill per-person
    const sharedPhotos: { photoId: string; personIds: string[] }[] = [];
    const soloPhotos: Map<string, { photoId: string; personIds: string[] }[]> = new Map();
    for (const pid of TARGET_PEOPLE) soloPhotos.set(pid, []);

    for (const row of photoFaceRows) {
      const photoId = row.photo_id as string;
      const personIds = (row.person_ids as string[]).filter(id => CONNECTED_PEOPLE.includes(id));
      if (personIds.length >= 2) {
        sharedPhotos.push({ photoId, personIds });
      } else if (personIds.length === 1) {
        soloPhotos.get(personIds[0])?.push({ photoId, personIds });
      }
    }

    // Pick up to 3 shared + 2 solo per person (max ~15 photos total)
    const selectedPhotos: { photoId: string; personIds: string[] }[] = [];
    const usedPhotoIds = new Set<string>();

    for (const sp of sharedPhotos.slice(0, 4)) {
      selectedPhotos.push(sp);
      usedPhotoIds.add(sp.photoId);
    }
    for (const pid of CONNECTED_PEOPLE) {
      const solos = soloPhotos.get(pid) ?? [];
      let added = 0;
      for (const s of solos) {
        if (added >= 2) break;
        if (usedPhotoIds.has(s.photoId)) continue;
        selectedPhotos.push(s);
        usedPhotoIds.add(s.photoId);
        added++;
      }
    }

    // 3. Fetch photo details
    const photoIds = selectedPhotos.map(sp => sp.photoId);
    const photoDetailRows = photoIds.length > 0 ? await jmail`
      SELECT id, raw_json FROM photos WHERE id = ANY(${photoIds})
    ` : [];
    const photoDetails = new Map(photoDetailRows.map(r => [r.id as string, r]));

    // Also get ALL face names for each photo (not just target people)
    const allFaceRows = photoIds.length > 0 ? await jmail`
      SELECT pf.photo_id, p.name, pf.person_id
      FROM photo_faces pf
      JOIN people p ON p.id = pf.person_id
      WHERE pf.photo_id = ANY(${photoIds})
      ORDER BY pf.confidence::float DESC
    ` : [];
    const photoFaceNames = new Map<string, string[]>();
    for (const r of allFaceRows) {
      const pid = r.photo_id as string;
      if (!photoFaceNames.has(pid)) photoFaceNames.set(pid, []);
      photoFaceNames.get(pid)!.push(r.name as string);
    }

    // 4. Fetch a few emails mentioning target people
    const emailRows = await jmail`
      SELECT id, subject, sender, recipients, sent_at,
             COALESCE(star_count, 0) as star_count,
             left(body, 150) as snippet
      FROM emails
      WHERE search_vector @@ to_tsquery('english', 'epstein | maxwell | clinton | gates')
        AND sent_at IS NOT NULL
      ORDER BY star_count DESC NULLS LAST, sent_at DESC
      LIMIT 8
    `;

    // Map emails to person IDs based on content
    const emailPersonLinks: { emailId: string; personIds: string[] }[] = [];
    for (const row of emailRows) {
      const text = `${row.subject ?? ""} ${row.sender ?? ""} ${row.snippet ?? ""}`.toLowerCase();
      const linked: string[] = [];
      if (text.includes("epstein")) linked.push("jeffrey-epstein");
      if (text.includes("maxwell")) linked.push("ghislaine-maxwell");
      if (text.includes("clinton")) linked.push("bill-clinton");
      if (text.includes("gates")) linked.push("bill-gates");
      if (text.includes("trump")) linked.push("donald-trump");
      if (linked.length > 0) {
        emailPersonLinks.push({ emailId: row.id as string, personIds: linked });
      }
    }

    // 5. Build board nodes
    const nodes: BoardNode[] = [];
    const connections: BoardConnection[] = [];

    // Position people in a pentagon
    const CX = 600, CY = 500, RADIUS = 400;
    for (let i = 0; i < TARGET_PEOPLE.length; i++) {
      const person = peopleMap.get(TARGET_PEOPLE[i]);
      if (!person) continue;
      const angle = (i / TARGET_PEOPLE.length) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        kind: "person",
        id: person.id,
        data: person,
        position: {
          x: CX + Math.cos(angle) * RADIUS,
          y: CY + Math.sin(angle) * RADIUS,
        },
      } as BoardPersonNode);
    }

    // Photo evidence nodes — position near the center of their linked people
    let photoIdx = 0;
    for (const sp of selectedPhotos) {
      const detail = photoDetails.get(sp.photoId);
      const rj = (detail?.raw_json as Record<string, unknown>) ?? {};
      const faceNames = photoFaceNames.get(sp.photoId) ?? [];
      const title = faceNames.length > 0 ? `Photo — ${faceNames.slice(0, 3).join(", ")}${faceNames.length > 3 ? ` +${faceNames.length - 3}` : ""}` : "Photo";

      // Position: average of linked people positions + offset
      const linkedNodes = nodes.filter(n => sp.personIds.includes(n.id));
      const avgX = linkedNodes.reduce((s, n) => s + n.position.x, 0) / (linkedNodes.length || 1);
      const avgY = linkedNodes.reduce((s, n) => s + n.position.y, 0) / (linkedNodes.length || 1);
      const jitter = photoIdx * 30;

      nodes.push({
        kind: "evidence",
        id: sp.photoId,
        evidenceType: "photo",
        data: {
          id: sp.photoId,
          type: "photo",
          title,
          snippet: ((rj.image_description as string) ?? "").slice(0, 150),
          date: null,
          sender: faceNames.join(", ") || null,
          score: 0.5,
          starCount: 0,
        } as SearchResult,
        position: {
          x: avgX + (photoIdx % 3 - 1) * 100 + jitter,
          y: avgY + Math.floor(photoIdx / 3) * 80 + 50,
        },
      } as BoardEvidenceNode);

      // Create connections: photo <-> each linked person
      for (const pid of sp.personIds) {
        connections.push({
          id: `test-photo-${sp.photoId}-${pid}`,
          sourceId: pid,
          targetId: sp.photoId,
          type: "photo_coappearance",
          label: "Photo co-appearance",
          strength: sp.personIds.length >= 2 ? 4 : 2,
          verified: false,
        });
      }
      photoIdx++;
    }

    // Email evidence nodes
    let emailIdx = 0;
    for (const el of emailPersonLinks.slice(0, 6)) {
      const row = emailRows.find(r => (r.id as string) === el.emailId);
      if (!row) continue;

      const linkedNodes = nodes.filter(n => el.personIds.includes(n.id));
      const avgX = linkedNodes.reduce((s, n) => s + n.position.x, 0) / (linkedNodes.length || 1);
      const avgY = linkedNodes.reduce((s, n) => s + n.position.y, 0) / (linkedNodes.length || 1);

      nodes.push({
        kind: "evidence",
        id: row.id as string,
        evidenceType: "email",
        data: {
          id: row.id as string,
          type: "email",
          title: (row.subject as string) ?? "Re:",
          snippet: (row.snippet as string) ?? "",
          date: row.sent_at ? new Date(row.sent_at as string).toISOString().split("T")[0] : null,
          sender: (row.sender as string) ?? null,
          score: 0.5,
          starCount: Number(row.star_count ?? 0),
        } as SearchResult,
        position: {
          x: avgX + (emailIdx % 2 === 0 ? -120 : 120),
          y: avgY + 150 + emailIdx * 40,
        },
      } as BoardEvidenceNode);

      // Connect email to linked people
      for (const pid of el.personIds) {
        connections.push({
          id: `test-email-${row.id}-${pid}`,
          sourceId: pid,
          targetId: row.id as string,
          type: "email_thread",
          label: "Mentioned in email",
          strength: 2,
          verified: false,
        });
      }
      emailIdx++;
    }

    // ── Ensure every connected person has at least one evidence link ──
    // Some people may not have photo_faces matches; connect them to nearby evidence
    const connectedPersonIds = new Set<string>();
    for (const c of connections) {
      for (const pid of CONNECTED_PEOPLE) {
        if (c.sourceId === pid || c.targetId === pid) connectedPersonIds.add(pid);
      }
    }
    const evidenceNodes = nodes.filter(n => n.kind === "evidence");
    for (const pid of CONNECTED_PEOPLE) {
      if (pid === "bill-gates") continue; // Gates stays indirect-only
      if (connectedPersonIds.has(pid)) continue;
      // Connect this person to the first available evidence not yet connected to them
      if (evidenceNodes.length > 0) {
        const ev = evidenceNodes[Math.floor(Math.random() * evidenceNodes.length)];
        connections.push({
          id: `test-fallback-${pid}-${ev.id}`,
          sourceId: pid,
          targetId: ev.id,
          type: "manual",
          label: "Referenced in evidence",
          strength: 2,
          verified: false,
        });
      }
    }

    // ── Additional connection types for stress testing ──

    // Direct person-to-person connections (manual/investigator assertions)
    // NOTE: Bill Gates has NO direct person connections — only reachable through evidence
    // NOTE: Prince Andrew has NO connections at all — orphan node for testing
    const personPairs: [string, string, string, number][] = [
      ["jeffrey-epstein", "ghislaine-maxwell", "Known associates / romantic relationship", 5],
      ["jeffrey-epstein", "bill-clinton", "Multiple flight log appearances", 4],
      ["jeffrey-epstein", "donald-trump", "Social acquaintances, Mar-a-Lago", 3],
      ["ghislaine-maxwell", "bill-clinton", "Attended events together", 3],
    ];
    for (const [src, tgt, label, strength] of personPairs) {
      if (peopleMap.has(src) && peopleMap.has(tgt)) {
        connections.push({
          id: `test-direct-${src}-${tgt}`,
          sourceId: src,
          targetId: tgt,
          type: "manual",
          label,
          strength,
          verified: true,
        });
      }
    }

    // Evidence-to-evidence connections (linking related evidence)
    const photoNodes = nodes.filter(n => n.kind === "evidence" && (n as BoardEvidenceNode).evidenceType === "photo");
    const emailNodes = nodes.filter(n => n.kind === "evidence" && (n as BoardEvidenceNode).evidenceType === "email");

    // Link first two photos to each other (same event / related imagery)
    if (photoNodes.length >= 2) {
      connections.push({
        id: `test-ev2ev-photo-${photoNodes[0].id}-${photoNodes[1].id}`,
        sourceId: photoNodes[0].id,
        targetId: photoNodes[1].id,
        type: "manual",
        label: "Related photos — same event",
        strength: 3,
        verified: false,
      });
    }

    // Link a photo to an email (photo referenced in email)
    if (photoNodes.length >= 1 && emailNodes.length >= 1) {
      connections.push({
        id: `test-ev2ev-photo-email-${photoNodes[0].id}-${emailNodes[0].id}`,
        sourceId: photoNodes[0].id,
        targetId: emailNodes[0].id,
        type: "manual",
        label: "Photo referenced in email",
        strength: 2,
        verified: false,
      });
    }

    // Transitive chain: Person -> Photo -> Email -> Person
    // Find a photo connected to one person and an email connected to a different person,
    // then link the photo and email to create a transitive path
    if (photoNodes.length >= 3 && emailNodes.length >= 2) {
      connections.push({
        id: `test-transitive-${photoNodes[2].id}-${emailNodes[1].id}`,
        sourceId: photoNodes[2].id,
        targetId: emailNodes[1].id,
        type: "manual",
        label: "Evidence cross-reference",
        strength: 2,
        verified: false,
      });
    }

    // Link two emails together (same thread / related correspondence)
    if (emailNodes.length >= 2) {
      connections.push({
        id: `test-ev2ev-emails-${emailNodes[0].id}-${emailNodes[1].id}`,
        sourceId: emailNodes[0].id,
        targetId: emailNodes[1].id,
        type: "email_thread",
        label: "Related correspondence",
        strength: 3,
        verified: false,
      });
    }

    // ── Gates indirect chain: Gates -> Email A -> Email B -> Epstein ──
    // Create two dedicated evidence nodes so Gates is reachable but only through a 2-hop chain
    const gatesNode = nodes.find(n => n.id === "bill-gates");
    if (gatesNode) {
      // Fetch an email mentioning Gates specifically
      const gatesEmailRows = await jmail`
        SELECT id, subject, sender, sent_at, COALESCE(star_count, 0) as star_count,
               left(body, 150) as snippet
        FROM emails
        WHERE search_vector @@ to_tsquery('english', 'gates')
          AND sent_at IS NOT NULL
        ORDER BY star_count DESC NULLS LAST
        LIMIT 1
      `;
      if (gatesEmailRows.length > 0) {
        const ge = gatesEmailRows[0];
        const gatesEmailId = `gates-email-${ge.id}`;
        nodes.push({
          kind: "evidence",
          id: gatesEmailId,
          evidenceType: "email",
          data: {
            id: gatesEmailId,
            type: "email",
            title: (ge.subject as string) ?? "Re: Gates",
            snippet: (ge.snippet as string) ?? "",
            date: ge.sent_at ? new Date(ge.sent_at as string).toISOString().split("T")[0] : null,
            sender: (ge.sender as string) ?? null,
            score: 0.5,
            starCount: Number(ge.star_count ?? 0),
          } as SearchResult,
          position: { x: gatesNode.position.x - 100, y: gatesNode.position.y + 200 },
        } as BoardEvidenceNode);

        // Gates -> his email
        connections.push({
          id: `test-gates-email-link`,
          sourceId: "bill-gates",
          targetId: gatesEmailId,
          type: "email_thread",
          label: "Mentioned in email",
          strength: 3,
          verified: false,
        });

        // His email -> an Epstein-connected EVIDENCE node (not person node)
        // This creates: Gates -> GatesEmail -> EpsteinEvidence -> Epstein (3-hop)
        const epsteinEvidenceConn = connections.find(c => {
          const isEpstein = c.sourceId === "jeffrey-epstein" || c.targetId === "jeffrey-epstein";
          if (!isEpstein) return false;
          const otherId = c.sourceId === "jeffrey-epstein" ? c.targetId : c.sourceId;
          const otherNode = nodes.find(n => n.id === otherId);
          return otherNode?.kind === "evidence";
        });
        if (epsteinEvidenceConn) {
          const bridgeId = epsteinEvidenceConn.sourceId === "jeffrey-epstein"
            ? epsteinEvidenceConn.targetId : epsteinEvidenceConn.sourceId;
          connections.push({
            id: `test-gates-bridge`,
            sourceId: gatesEmailId,
            targetId: bridgeId,
            type: "manual",
            label: "Related correspondence",
            strength: 2,
            verified: false,
          });
        } else {
          // No Epstein evidence exists yet — connect Gates email to any evidence
          // that's connected to another person, creating an indirect path
          const anyEvidenceConn = connections.find(c => {
            const sNode = nodes.find(n => n.id === c.sourceId);
            const tNode = nodes.find(n => n.id === c.targetId);
            return (sNode?.kind === "person" && tNode?.kind === "evidence") ||
                   (tNode?.kind === "person" && sNode?.kind === "evidence");
          });
          if (anyEvidenceConn) {
            const evidId = nodes.find(n => n.id === anyEvidenceConn.sourceId)?.kind === "evidence"
              ? anyEvidenceConn.sourceId : anyEvidenceConn.targetId;
            connections.push({
              id: `test-gates-bridge`,
              sourceId: gatesEmailId,
              targetId: evidId,
              type: "manual",
              label: "Related correspondence",
              strength: 2,
              verified: false,
            });
          }
        }
      }
    }

    // ── Orphan evidence node (no connections) ──
    const orphanPhotoRows = await jmail`
      SELECT id, raw_json FROM photos
      WHERE id NOT IN (SELECT photo_id FROM photo_faces)
      LIMIT 1
    `;
    if (orphanPhotoRows.length > 0) {
      const op = orphanPhotoRows[0];
      const opRj = (op.raw_json as Record<string, unknown>) ?? {};
      nodes.push({
        kind: "evidence",
        id: op.id as string,
        evidenceType: "photo",
        data: {
          id: op.id as string,
          type: "photo",
          title: "Photo — unidentified",
          snippet: ((opRj.image_description as string) ?? "").slice(0, 150),
          date: null,
          sender: null,
          score: 0.5,
          starCount: 0,
        } as SearchResult,
        position: { x: 1200, y: 800 },
      } as BoardEvidenceNode);
      // No connections — intentionally orphaned
    }

    return NextResponse.json({ nodes, connections });
  } catch (err) {
    console.error("Test board error:", err);
    return NextResponse.json({ error: "Failed to build test board" }, { status: 500 });
  }
}
