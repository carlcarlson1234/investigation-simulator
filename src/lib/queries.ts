// Data access layer — reads from the Jmail archive database (read-only)

import { jmail } from "@/db/jmail";
import type {
  Person,
  SearchResult,
  EmailEvidence,
  DocumentEvidence,
  PhotoEvidence,
  IMessageEvidence,
  Evidence,
  ArchiveStats,
  ReleaseBatch,
  EvidenceType,
} from "./types";

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
  return {
    id: row.id as string,
    name: row.name as string,
    slug: (row.slug as string) ?? null,
    aliases: parseJsonbArray(row.aliases),
    description: (row.description as string) ?? null,
    imageUrl: (row.image_url as string) ?? null,
    emailAddresses: parseJsonbArray(row.email_addresses),
    photoCount: Number(rj.photo_count ?? 0),
    source: (rj.source as string) ?? null,
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
      LIMIT ${type === "all" ? Math.ceil(limit / 3) : limit}
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
      LIMIT ${type === "all" ? Math.ceil(limit / 3) : limit}
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
             raw_json->>'conversation_slug' as convo_slug,
             ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as score
      FROM imessage_messages
      WHERE search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY score DESC
      LIMIT ${type === "all" ? Math.ceil(limit / 3) : limit}
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
        score: Number(r.score),
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
    SELECT id, subject, sender, sender_name, recipients, cc, bcc,
           date, body, star_count, release_batch, source, raw_json
    FROM emails WHERE id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  const rj = (r.raw_json as Record<string, unknown>) ?? {};

  return {
    id: r.id as string,
    type: "email",
    title: (r.subject as string) || "(No subject)",
    snippet: ((rj.content_markdown as string) ?? "").slice(0, 200),
    date: formatDate((rj.sent_at as string) ?? null),
    source: r.source as string,
    releaseBatch: r.release_batch as string,
    starCount: Number(r.star_count ?? 0),
    sender: (r.sender as string) ?? "Unknown",
    senderName: (r.sender_name as string) ?? null,
    recipients: parseJsonbArray(rj.to_recipients),
    cc: parseJsonbArray(rj.cc_recipients),
    subject: (r.subject as string) || "(No subject)",
    body: (rj.content_markdown as string) ?? (r.body as string) ?? "",
    docId: (rj.doc_id as string) ?? null,
    isPromotional: Boolean(rj.is_promotional),
    epsteinIsSender: Boolean(rj.epstein_is_sender),
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

  return {
    id: r.id as string,
    type: "photo",
    title: (rj.original_filename as string) ?? (r.id as string),
    snippet: (rj.image_description as string) ?? "",
    date: null,
    source: (rj.source as string) ?? null,
    releaseBatch: (rj.release_batch as string) ?? null,
    starCount: 0,
    width: Number(rj.width ?? 0),
    height: Number(rj.height ?? 0),
    imageDescription: (rj.image_description as string) ?? null,
    sourceUrl: (rj.source_url as string) ?? null,
    contentType: (rj.content_type as string) ?? null,
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
