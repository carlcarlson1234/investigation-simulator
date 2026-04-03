// Data access layer — reads from the Jmail archive database (read-only)

import { jmail } from "@/db/jmail";
import type {
  Person,
  SearchResult,
  EmailEvidence,
  EmailListItem,
  DocumentEvidence,
  PhotoEvidence,
  PhotoListItem,
  IMessageEvidence,
  Evidence,
  ArchiveStats,
  ReleaseBatch,
  EvidenceType,
} from "./types";

// ─── Photo CDN ──────────────────────────────────────────────────────────────

const PHOTO_CDN = "https://assets.getkino.com";

function photoImageUrl(photoId: string): string {
  return `${PHOTO_CDN}/photos/${photoId}`;
}

function photoThumbnailUrl(photoId: string, width = 400): string {
  return `${PHOTO_CDN}/cdn-cgi/image/width=${width},quality=80,format=auto/photos-deboned/${photoId}`;
}

// ─── Archive Stats ──────────────────────────────────────────────────────────

export async function getArchiveStats(): Promise<ArchiveStats> {
  const rows = await jmail`
    SELECT
      (SELECT count(*)::int FROM emails) as email_count,
      (SELECT count(*)::int FROM documents) as doc_count,
      (SELECT count(*)::int FROM photos) as photo_count,
      (SELECT count(*)::int FROM people) as person_count,
      (SELECT count(*)::int FROM imessage_messages) as imessage_count,
      (SELECT count(*)::int FROM release_batches) as batch_count
  `;
  const r = rows[0];
  return {
    emailCount: r.email_count,
    documentCount: r.doc_count,
    photoCount: r.photo_count,
    personCount: r.person_count,
    imessageCount: r.imessage_count,
    releaseBatchCount: r.batch_count,
  };
}

// ─── People ─────────────────────────────────────────────────────────────────

export async function searchPeople(query: string, limit = 50): Promise<Person[]> {
  let rows;
  if (query.trim()) {
    rows = await jmail`
      SELECT id, name, slug, aliases, description, image_url, email_addresses, raw_json
      FROM people
      WHERE name ILIKE ${"%" + query + "%"}
      ORDER BY (raw_json->>'photo_count')::int DESC NULLS LAST
      LIMIT ${limit}
    `;
  } else {
    rows = await jmail`
      SELECT id, name, slug, aliases, description, image_url, email_addresses, raw_json
      FROM people
      ORDER BY (raw_json->>'photo_count')::int DESC NULLS LAST
      LIMIT ${limit}
    `;
  }
  return rows.map(mapPerson);
}

export async function getAllPeople(): Promise<Person[]> {
  const rows = await jmail`
    SELECT id, name, slug, aliases, description, image_url, email_addresses, raw_json
    FROM people
    ORDER BY name ASC
  `;
  return rows.map(mapPerson);
}

export async function getPersonById(id: string): Promise<Person | null> {
  const rows = await jmail`
    SELECT id, name, slug, aliases, description, image_url, email_addresses, raw_json
    FROM people
    WHERE id = ${id}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return mapPerson(rows[0]);
}

function mapPerson(row: Record<string, unknown>): Person {
  const rj = (row.raw_json as Record<string, unknown>) ?? {};
  const personId = row.id as string;
  // Use DB image_url if available, otherwise try local thumbnail (downloaded from jmail.world)
  const dbImageUrl = (row.image_url as string) ?? null;
  // Some thumbnails are avif (e.g., epstein), most are png
  const AVIF_PEOPLE = new Set(["jeffrey-epstein"]);
  const ext = AVIF_PEOPLE.has(personId) ? "avif" : "png";
  const thumbnailUrl = personId
    ? `/people-thumbnails/${personId}.${ext}`
    : null;
  return {
    id: personId,
    name: row.name as string,
    slug: (row.slug as string) ?? null,
    aliases: parseJsonbArray(row.aliases),
    description: (row.description as string) ?? null,
    imageUrl: dbImageUrl || thumbnailUrl,
    emailAddresses: parseJsonbArray(row.email_addresses),
    photoCount: Number(rj.photo_count ?? 0),
    source: (rj.source as string) ?? null,
  };
}

// ─── Email Browsing (inbox-style) ───────────────────────────────────────────

export type EmailSortBy = "newest" | "oldest";

export async function browseEmails(opts: {
  page?: number;
  pageSize?: number;
  sort?: EmailSortBy;
  search?: string;
  sender?: string;
  epsteinOnly?: boolean;
}): Promise<import("./types").EmailBrowseResult> {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 30, 100);
  const offset = (page - 1) * pageSize;
  const sort = opts.sort ?? "newest";

  // Build conditions
  const conditions: string[] = ["sent_at IS NOT NULL"];
  
  // We use raw SQL because postgres tagged templates don't support dynamic WHERE easily
  // But we can still use the tagged template with conditional fragments

  let rows;
  let countRows;

  if (opts.search?.trim()) {
    const tsQuery = opts.search
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter(Boolean)
      .join(" & ");

    if (!tsQuery) return { emails: [], total: 0, page, pageSize, hasMore: false };

    if (opts.epsteinOnly) {
      rows = await jmail`
        SELECT id, subject, sender, sent_at, left(body, 120) as body_preview,
               recipients, cc, epstein_is_sender, COALESCE(star_count, 0) as star_count
        FROM emails
        WHERE search_vector @@ to_tsquery('english', ${tsQuery})
          AND sent_at IS NOT NULL
          AND epstein_is_sender = true
        ORDER BY ${sort === "newest" ? jmail`sent_at DESC` : jmail`sent_at ASC`}
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      countRows = await jmail`
        SELECT count(*)::int as cnt FROM emails
        WHERE search_vector @@ to_tsquery('english', ${tsQuery})
          AND sent_at IS NOT NULL AND epstein_is_sender = true
      `;
    } else if (opts.sender) {
      rows = await jmail`
        SELECT id, subject, sender, sent_at, left(body, 120) as body_preview,
               recipients, cc, epstein_is_sender, COALESCE(star_count, 0) as star_count
        FROM emails
        WHERE search_vector @@ to_tsquery('english', ${tsQuery})
          AND sent_at IS NOT NULL
          AND sender ILIKE ${"%" + opts.sender + "%"}
        ORDER BY ${sort === "newest" ? jmail`sent_at DESC` : jmail`sent_at ASC`}
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      countRows = await jmail`
        SELECT count(*)::int as cnt FROM emails
        WHERE search_vector @@ to_tsquery('english', ${tsQuery})
          AND sent_at IS NOT NULL AND sender ILIKE ${"%" + opts.sender + "%"}
      `;
    } else {
      rows = await jmail`
        SELECT id, subject, sender, sent_at, left(body, 120) as body_preview,
               recipients, cc, epstein_is_sender, COALESCE(star_count, 0) as star_count
        FROM emails
        WHERE search_vector @@ to_tsquery('english', ${tsQuery})
          AND sent_at IS NOT NULL
        ORDER BY ${sort === "newest" ? jmail`sent_at DESC` : jmail`sent_at ASC`}
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      countRows = await jmail`
        SELECT count(*)::int as cnt FROM emails
        WHERE search_vector @@ to_tsquery('english', ${tsQuery}) AND sent_at IS NOT NULL
      `;
    }
  } else if (opts.sender) {
    rows = await jmail`
      SELECT id, subject, sender, sent_at, left(body, 120) as body_preview,
             recipients, cc, epstein_is_sender, COALESCE(star_count, 0) as star_count
      FROM emails
      WHERE sender ILIKE ${"%" + opts.sender + "%"}
        AND sent_at IS NOT NULL
      ORDER BY ${sort === "newest" ? jmail`sent_at DESC` : jmail`sent_at ASC`}
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    countRows = await jmail`
      SELECT count(*)::int as cnt FROM emails
      WHERE sender ILIKE ${"%" + opts.sender + "%"} AND sent_at IS NOT NULL
    `;
  } else if (opts.epsteinOnly) {
    rows = await jmail`
      SELECT id, subject, sender, sent_at, left(body, 120) as body_preview,
             recipients, cc, epstein_is_sender, COALESCE(star_count, 0) as star_count
      FROM emails
      WHERE epstein_is_sender = true AND sent_at IS NOT NULL
      ORDER BY ${sort === "newest" ? jmail`sent_at DESC` : jmail`sent_at ASC`}
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    countRows = await jmail`
      SELECT count(*)::int as cnt FROM emails
      WHERE epstein_is_sender = true AND sent_at IS NOT NULL
    `;
  } else {
    rows = await jmail`
      SELECT id, subject, sender, sent_at, left(body, 120) as body_preview,
             recipients, cc, epstein_is_sender, COALESCE(star_count, 0) as star_count
      FROM emails
      WHERE sent_at IS NOT NULL
      ORDER BY ${sort === "newest" ? jmail`sent_at DESC` : jmail`sent_at ASC`}
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    countRows = await jmail`
      SELECT count(*)::int as cnt FROM emails WHERE sent_at IS NOT NULL
    `;
  }

  const total = countRows[0]?.cnt ?? 0;

  const emails = rows.map((r: Record<string, unknown>) => {
    const recips = parseJsonbArray(r.recipients);
    const cc = parseJsonbArray(r.cc);
    return {
      id: r.id as string,
      subject: (r.subject as string) || "(No subject)",
      sender: (r.sender as string) || "Unknown",
      sentAt: r.sent_at ? new Date(r.sent_at as string).toISOString() : null,
      bodyPreview: ((r.body_preview as string) ?? "").replace(/\n/g, " ").trim(),
      recipientCount: recips.length,
      hasCc: cc.length > 0,
      epsteinIsSender: Boolean(r.epstein_is_sender),
      starCount: Number(r.star_count ?? 0),
    };
  });

  return {
    emails,
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
  };
}

// ─── Evidence Search ────────────────────────────────────────────────────────

export async function searchEvidence(
  query: string,
  type: EvidenceType | "all" = "all",
  limit = 20,
  offset = 0
): Promise<{ results: SearchResult[]; total: number }> {
  const results: SearchResult[] = [];
  let total = 0;

  if (!query.trim()) {
    // Return recent items if no query
    if (type === "all" || type === "email") {
      const rows = await jmail`
        SELECT id, subject, sender, raw_json->>'sent_at' as sent_at,
               COALESCE(star_count, 0) as star_count
        FROM emails
        WHERE subject IS NOT NULL AND subject != ''
        ORDER BY id DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      for (const r of rows) {
        results.push({
          id: r.id as string,
          type: "email",
          title: r.subject as string,
          snippet: (r.sender as string) ?? "Unknown sender",
          date: formatDate(r.sent_at as string),
          sender: r.sender as string,
          score: 0,
          starCount: Number(r.star_count ?? 0),
        });
      }
    }
    return { results, total: results.length };
  }

  // Build tsquery from user input
  const tsQuery = query
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .join(" & ");

  if (!tsQuery) return { results: [], total: 0 };

  // Search emails
  if (type === "all" || type === "email") {
    const emailRows = await jmail`
      SELECT id, subject, sender, raw_json->>'sent_at' as sent_at,
             COALESCE(star_count, 0) as star_count,
             ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as score
      FROM emails
      WHERE search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY score DESC
      LIMIT ${type === "all" ? Math.ceil(limit / 4) : limit}
      OFFSET ${type === "email" ? offset : 0}
    `;
    for (const r of emailRows) {
      results.push({
        id: r.id as string,
        type: "email",
        title: (r.subject as string) || "(No subject)",
        snippet: (r.sender as string) ?? "Unknown sender",
        date: formatDate(r.sent_at as string),
        sender: r.sender as string,
        score: Number(r.score),
        starCount: Number(r.star_count ?? 0),
      });
    }
  }

  // Search documents
  if (type === "all" || type === "document") {
    const docRows = await jmail`
      SELECT DISTINCT ON (df.doc_id) df.doc_id as id,
             d.raw_json->>'original_filename' as filename,
             d.volume,
             ts_rank(df.search_vector, to_tsquery('english', ${tsQuery})) as score,
             left(df.text, 150) as snippet
      FROM document_fulltext df
      JOIN documents d ON d.id = df.doc_id
      WHERE df.search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY df.doc_id, score DESC
      LIMIT ${type === "all" ? Math.ceil(limit / 4) : limit}
      OFFSET ${type === "document" ? offset : 0}
    `;
    for (const r of docRows) {
      results.push({
        id: r.id as string,
        type: "document",
        title: (r.filename as string) || (r.id as string),
        snippet: (r.snippet as string) ?? "",
        date: null,
        sender: (r.volume as string) ?? null,
        score: Number(r.score),
        starCount: 0,
      });
    }
  }

  // Search iMessages
  if (type === "all" || type === "imessage") {
    const msgRows = await jmail`
      SELECT id, sender, raw_json->>'text' as text,
             raw_json->>'timestamp' as timestamp,
             raw_json->>'conversation_slug' as convo_slug
      FROM imessage_messages
      WHERE raw_json->>'text' ILIKE ${"%" + query + "%"}
      ORDER BY id DESC
      LIMIT ${type === "all" ? Math.ceil(limit / 4) : limit}
      OFFSET ${type === "imessage" ? offset : 0}
    `;
    for (const r of msgRows) {
      results.push({
        id: r.id as string,
        type: "imessage",
        title: `iMessage — ${r.convo_slug ?? "conversation"}`,
        snippet: ((r.text as string) ?? "").slice(0, 150),
        date: formatDate(r.timestamp as string),
        sender: r.sender as string,
        score: 0.5,
        starCount: 0,
      });
    }
  }

  // Search photos by description
  if (type === "all" || type === "photo") {
    const photoRows = await jmail`
      SELECT id, raw_json
      FROM photos
      WHERE raw_json->>'image_description' ILIKE ${"%" + query + "%"}
      ORDER BY id
      LIMIT ${type === "all" ? Math.ceil(limit / 4) : limit}
      OFFSET ${type === "photo" ? offset : 0}
    `;

    // Batch fetch face names for matched photos
    const photoIds = photoRows.map((r: Record<string, unknown>) => r.id as string);
    let faceMap: Record<string, string[]> = {};
    if (photoIds.length > 0) {
      const faceRows = await jmail`
        SELECT pf.photo_id, p.name
        FROM photo_faces pf
        JOIN people p ON p.id = pf.person_id
        WHERE pf.photo_id = ANY(${photoIds})
      `;
      for (const fr of faceRows) {
        const pid = fr.photo_id as string;
        if (!faceMap[pid]) faceMap[pid] = [];
        faceMap[pid].push(fr.name as string);
      }
    }

    for (const r of photoRows) {
      const rj = (r.raw_json as Record<string, unknown>) ?? {};
      const desc = ((rj.image_description as string) ?? "").slice(0, 150);
      const faces = faceMap[r.id as string] ?? [];
      results.push({
        id: r.id as string,
        type: "photo",
        title: faces.length > 0 ? `Photo — ${faces.join(", ")}` : "Photo",
        snippet: desc,
        date: null,
        sender: faces.length > 0 ? faces.join(", ") : null,
        score: 0.5, // give a baseline relevance score
        starCount: 0,
      });
    }
  }

  // Sort all results by score
  results.sort((a, b) => b.score - a.score);
  total = results.length;

  return { results: results.slice(0, limit), total };
}

// ─── Single Evidence Fetch ──────────────────────────────────────────────────

export async function getEvidenceById(id: string, type: EvidenceType): Promise<Evidence | null> {
  switch (type) {
    case "email":
      return getEmailById(id);
    case "document":
      return getDocumentById(id);
    case "photo":
      return getPhotoById(id);
    case "imessage":
      return getIMessageById(id);
    default:
      return null;
  }
}

async function getEmailById(id: string): Promise<EmailEvidence | null> {
  const rows = await jmail`
    SELECT id, doc_id, subject, sender, sender_name, recipients, cc, bcc,
           sent_at, body, body_html, star_count, release_batch, source,
           epstein_is_sender, raw_json
    FROM emails WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  const rj = (r.raw_json as Record<string, unknown>) ?? {};

  return {
    id: r.id as string,
    type: "email",
    title: (r.subject as string) || "(No subject)",
    snippet: ((r.body as string) ?? "").slice(0, 200),
    date: formatDate(r.sent_at as string),
    source: r.source as string,
    releaseBatch: (r.release_batch as string) ?? (rj.email_drop_id as string) ?? null,
    starCount: Number(r.star_count ?? 0),
    sender: (r.sender as string) ?? "Unknown",
    senderName: (r.sender_name as string) ?? null,
    recipients: parseJsonbArray(r.recipients),
    cc: parseJsonbArray(r.cc),
    subject: (r.subject as string) || "(No subject)",
    body: (r.body as string) ?? "",
    docId: (r.doc_id as string) ?? (rj.doc_id as string) ?? null,
    isPromotional: Boolean(rj.is_promotional),
    epsteinIsSender: Boolean(r.epstein_is_sender),
  };
}

async function getDocumentById(id: string): Promise<DocumentEvidence | null> {
  const rows = await jmail`
    SELECT id, volume, raw_json FROM documents WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  const rj = (r.raw_json as Record<string, unknown>) ?? {};

  // Get fulltext
  const ftRows = await jmail`
    SELECT text FROM document_fulltext WHERE doc_id = ${id} ORDER BY page_number LIMIT 20
  `;
  const fulltext = ftRows.map((f) => f.text as string).join("\n\n");

  return {
    id: r.id as string,
    type: "document",
    title: (rj.original_filename as string) ?? (r.id as string),
    snippet: fulltext.slice(0, 200),
    date: null,
    source: (rj.source as string) ?? null,
    releaseBatch: (rj.release_batch as string) ?? null,
    starCount: 0,
    filename: (rj.original_filename as string) ?? "",
    volume: (r.volume as string) ?? null,
    pageCount: Number(rj.page_count ?? 1),
    path: (rj.path as string) ?? null,
    sourceUrl: (rj.source_url as string) ?? null,
    fulltext: fulltext || null,
  };
}

async function getPhotoById(id: string): Promise<PhotoEvidence | null> {
  const rows = await jmail`
    SELECT id, raw_json FROM photos WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  const rj = (r.raw_json as Record<string, unknown>) ?? {};
  const photoId = r.id as string;

  // Get face detections for this photo
  const faceRows = await jmail`
    SELECT pf.person_id, p.name FROM photo_faces pf
    JOIN people p ON p.id = pf.person_id
    WHERE pf.photo_id = ${photoId}
    ORDER BY pf.confidence::float DESC
  `;

  return {
    id: photoId,
    type: "photo",
    title: (rj.original_filename as string) ?? photoId,
    snippet: (rj.image_description as string) ?? "",
    date: null,
    source: (rj.source as string) ?? null,
    releaseBatch: (rj.release_batch as string) ?? null,
    starCount: 0,
    width: Number(rj.width ?? 0),
    height: Number(rj.height ?? 0),
    imageUrl: photoImageUrl(photoId),
    thumbnailUrl: photoThumbnailUrl(photoId),
    imageDescription: (rj.image_description as string) ?? null,
    sourceUrl: (rj.source_url as string) ?? null,
    contentType: (rj.content_type as string) ?? null,
    facesDetected: faceRows.map((f) => f.person_id as string),
  };
}

async function getIMessageById(id: string): Promise<IMessageEvidence | null> {
  const rows = await jmail`
    SELECT id, sender, raw_json FROM imessage_messages WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  const rj = (r.raw_json as Record<string, unknown>) ?? {};

  return {
    id: r.id as string,
    type: "imessage",
    title: `iMessage — ${(rj.conversation_slug as string) ?? ""}`,
    snippet: ((rj.text as string) ?? "").slice(0, 200),
    date: formatDate((rj.timestamp as string) ?? null),
    source: (rj.source_file as string) ?? null,
    releaseBatch: null,
    starCount: 0,
    sender: (r.sender as string) ?? "Unknown",
    body: (rj.text as string) ?? "",
    conversationSlug: (rj.conversation_slug as string) ?? "",
    timestamp: (rj.timestamp as string) ?? null,
  };
}

// ─── Files & Messages Browsing ──────────────────────────────────────────────

export interface FileListItem {
  id: string;
  kind: "document" | "imessage";
  title: string;
  snippet: string;
  date: string | null;
  sender: string | null;
  volume: string | null;
}

export async function browseFiles(opts: {
  page?: number;
  pageSize?: number;
}): Promise<{ files: FileListItem[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 30, 60);
  const half = Math.ceil(pageSize / 2);
  const offset = (page - 1) * half;

  // Fetch documents and imessages separately, then interleave
  const [docRows, msgRows, countRows] = await Promise.all([
    jmail`
      SELECT id, raw_json->>'original_filename' as filename, volume
      FROM documents
      ORDER BY id
      LIMIT ${half} OFFSET ${offset}
    `,
    jmail`
      SELECT id, sender, raw_json->>'text' as text,
             raw_json->>'conversation_slug' as convo_slug,
             raw_json->>'timestamp' as timestamp
      FROM imessage_messages
      ORDER BY id
      LIMIT ${half} OFFSET ${offset}
    `,
    jmail`
      SELECT
        (SELECT count(*)::int FROM documents) +
        (SELECT count(*)::int FROM imessage_messages) as cnt
    `,
  ]);

  const total = Number(countRows[0]?.cnt ?? 0);
  const files: FileListItem[] = [];

  for (const r of docRows) {
    files.push({
      id: r.id as string,
      kind: "document",
      title: (r.filename as string) || (r.id as string),
      snippet: "",
      date: null,
      sender: null,
      volume: (r.volume as string) || null,
    });
  }

  for (const r of msgRows) {
    files.push({
      id: r.id as string,
      kind: "imessage",
      title: `iMessage — ${(r.convo_slug as string) ?? "conversation"}`,
      snippet: ((r.text as string) ?? "").slice(0, 120),
      date: r.timestamp ? formatDate(r.timestamp as string) : null,
      sender: (r.sender as string) || null,
      volume: null,
    });
  }

  return { files, total, page, pageSize, hasMore: offset + files.length < total };
}

// ─── Release Batches ────────────────────────────────────────────────────────

export async function getReleaseBatches(): Promise<ReleaseBatch[]> {
  const rows = await jmail`
    SELECT id, name, release_date, document_count FROM release_batches ORDER BY id
  `;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    releaseDate: r.release_date ? new Date(r.release_date as string).toISOString().split("T")[0] : null,
    documentCount: r.document_count as number | null,
  }));
}

// ─── Photo Browsing (gallery-style) ─────────────────────────────────────────

export async function browsePhotos(opts: {
  page?: number;
  pageSize?: number;
  personId?: string;
  search?: string;
}): Promise<import("./types").PhotoBrowseResult> {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 24, 60);
  const offset = (page - 1) * pageSize;

  let rows;
  let countRows;

  if (opts.personId) {
    // Filter by person via photo_faces
    rows = await jmail`
      SELECT DISTINCT p.id, p.raw_json
      FROM photos p
      JOIN photo_faces pf ON pf.photo_id = p.id
      WHERE pf.person_id = ${opts.personId}
      ORDER BY p.id
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    countRows = await jmail`
      SELECT count(DISTINCT p.id)::int as cnt
      FROM photos p
      JOIN photo_faces pf ON pf.photo_id = p.id
      WHERE pf.person_id = ${opts.personId}
    `;
  } else if (opts.search?.trim()) {
    const tsQuery = opts.search
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
      .filter(Boolean)
      .join(" & ");

    if (!tsQuery) return { photos: [], total: 0, page, pageSize, hasMore: false };

    rows = await jmail`
      SELECT id, raw_json FROM photos
      WHERE raw_json->>'image_description' ILIKE ${"%" + opts.search + "%"}
      ORDER BY id
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    countRows = await jmail`
      SELECT count(*)::int as cnt FROM photos
      WHERE raw_json->>'image_description' ILIKE ${"%" + opts.search + "%"}
    `;
  } else {
    // All photos, most interesting first (ones with face detections)
    rows = await jmail`
      SELECT p.id, p.raw_json FROM photos p
      LEFT JOIN (
        SELECT photo_id, count(*)::int as face_count
        FROM photo_faces GROUP BY photo_id
      ) fc ON fc.photo_id = p.id
      ORDER BY fc.face_count DESC NULLS LAST, p.id
      LIMIT ${pageSize} OFFSET ${offset}
    `;
    countRows = await jmail`
      SELECT count(*)::int as cnt FROM photos
    `;
  }

  const total = countRows[0]?.cnt ?? 0;
  const photoIds = rows.map((r: Record<string, unknown>) => r.id as string);

  // Batch fetch face detections for all photos in this page
  let faceMap: Record<string, { personId: string; name: string }[]> = {};
  if (photoIds.length > 0) {
    const faceRows = await jmail`
      SELECT pf.photo_id, pf.person_id, p.name
      FROM photo_faces pf
      JOIN people p ON p.id = pf.person_id
      WHERE pf.photo_id = ANY(${photoIds})
      ORDER BY pf.confidence::float DESC
    `;
    for (const fr of faceRows) {
      const pid = fr.photo_id as string;
      if (!faceMap[pid]) faceMap[pid] = [];
      faceMap[pid].push({ personId: fr.person_id as string, name: fr.name as string });
    }
  }

  const photos: PhotoListItem[] = rows.map((r: Record<string, unknown>) => {
    const rj = (r.raw_json as Record<string, unknown>) ?? {};
    const id = r.id as string;
    const faces = faceMap[id] ?? [];
    return {
      id,
      thumbnailUrl: photoThumbnailUrl(id, 300),
      imageUrl: photoImageUrl(id),
      description: (rj.image_description as string) ?? "",
      width: Number(rj.width ?? 0),
      height: Number(rj.height ?? 0),
      facePeople: faces.map((f) => f.name),
      facePersonIds: faces.map((f) => f.personId),
    };
  });

  return {
    photos,
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseJsonbArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // not JSON, treat as single value
      return val ? [val] : [];
    }
  }
  return [];
}

function formatDate(val: string | null | undefined): string | null {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}
