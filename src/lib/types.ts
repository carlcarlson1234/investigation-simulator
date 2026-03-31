// Core domain types for Investigation Simulator — backed by Jmail archive

// ─── Evidence Types ─────────────────────────────────────────────────────────

export type EvidenceType = "email" | "document" | "photo" | "imessage";

export type ConnectionType = "manual" | "email_thread" | "photo_coappearance";

// ─── Person (from jmail.people) ─────────────────────────────────────────────

export interface Person {
  id: string;          // text PK, e.g. "ghislaine-maxwell"
  name: string;
  slug: string | null;
  aliases: string[];   // from JSONB
  description: string | null;
  imageUrl: string | null;
  emailAddresses: string[];  // from JSONB
  photoCount: number;        // from raw_json->>'photo_count'
  source: string | null;     // from raw_json->>'source'
}

// ─── Evidence (union across 4 Jmail tables) ─────────────────────────────────

export interface EvidenceBase {
  id: string;
  type: EvidenceType;
  title: string;           // subject (email), filename (doc), id (photo), conversation (imessage)
  snippet: string;         // truncated content_markdown / text / image_description
  date: string | null;     // ISO date string
  source: string | null;
  releaseBatch: string | null;
  starCount: number;
}

export interface EmailEvidence extends EvidenceBase {
  type: "email";
  sender: string;
  senderName: string | null;
  recipients: string[];
  cc: string[];
  subject: string;
  body: string;            // content_markdown from raw_json
  docId: string | null;
  isPromotional: boolean;
  epsteinIsSender: boolean;
}

export interface DocumentEvidence extends EvidenceBase {
  type: "document";
  filename: string;
  volume: string | null;
  pageCount: number;
  path: string | null;         // from raw_json
  sourceUrl: string | null;
  fulltext: string | null;     // joined from document_fulltext
}

export interface PhotoEvidence extends EvidenceBase {
  type: "photo";
  width: number;
  height: number;
  imageDescription: string | null;  // from raw_json
  sourceUrl: string | null;
  contentType: string | null;
}

export interface IMessageEvidence extends EvidenceBase {
  type: "imessage";
  sender: string;         // "me" | "them"
  body: string;            // from raw_json->>'text'
  conversationSlug: string;
  timestamp: string | null;  // from raw_json
}

export type Evidence = EmailEvidence | DocumentEvidence | PhotoEvidence | IMessageEvidence;

// ─── Search Result (lightweight, for listing) ───────────────────────────────

export interface SearchResult {
  id: string;
  type: EvidenceType;
  title: string;
  snippet: string;
  date: string | null;
  sender: string | null;
  score: number;
  starCount: number;
}

// ─── Connection (user-created, stored in investigation_simulator DB) ────────

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  sourceKind: "person" | "evidence";
  targetKind: "person" | "evidence";
  type: ConnectionType;
  label: string;
  strength: number;     // 1-5
  verified: boolean;
}

// ─── Archive Stats ──────────────────────────────────────────────────────────

export interface ArchiveStats {
  emailCount: number;
  documentCount: number;
  photoCount: number;
  personCount: number;
  imessageCount: number;
  releaseBatchCount: number;
}

// ─── Release Batch ──────────────────────────────────────────────────────────

export interface ReleaseBatch {
  id: string;
  name: string;
  releaseDate: string | null;
  documentCount: number | null;
}
