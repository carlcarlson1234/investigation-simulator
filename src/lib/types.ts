// Core domain types for Investigation Simulator — backed by Jmail archive

// ─── Evidence Types ─────────────────────────────────────────────────────────

export type EvidenceType = "email" | "document" | "photo" | "imessage" | "flight_log" | "video";

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
  imageUrl: string | null;          // CDN URL for the actual photo
  thumbnailUrl: string | null;      // CDN resized thumbnail
  imageDescription: string | null;  // from raw_json
  sourceUrl: string | null;
  contentType: string | null;
  facesDetected: string[];          // person IDs found in this photo
}

export interface IMessageEvidence extends EvidenceBase {
  type: "imessage";
  sender: string;         // "me" | "them"
  body: string;            // from raw_json->>'text'
  conversationSlug: string;
  timestamp: string | null;  // from raw_json
}

export interface VideoEvidence extends EvidenceBase {
  type: "video";
  filename: string;
  lengthSec: number | null;
  views: number;
  likes: number;
  hasThumbnail: boolean;
  isShorts: boolean;
  isNsfw: boolean;
  dataSet: number | null;
  commentCount: number;
  // Computed CDN URLs
  streamUrl: string;      // https://cdn.jmailarchive.org/{filename}
  thumbnailUrl: string | null;  // https://cdn.jmailarchive.org/thumbnails/{basename}.jpg
}

export interface FlightLogEvidence extends EvidenceBase {
  type: "flight_log";
  // Route
  departure: string | null;
  arrival: string | null;
  departureCode: string | null;
  departureName: string | null;
  departureCity: string | null;
  departureCountry: string | null;
  departureLat: number | null;
  departureLon: number | null;
  arrivalCode: string | null;
  arrivalName: string | null;
  arrivalCity: string | null;
  arrivalCountry: string | null;
  arrivalLat: number | null;
  arrivalLon: number | null;
  // Cargo
  passengers: string[];
  passengerCount: number;
  aircraft: string | null;
  pilot: string | null;
  flightNumber: string | null;
  notes: string | null;
  distanceNm: number | null;
  durationMinutes: number | null;
  sourceDoc: string | null;
}

export type Evidence = EmailEvidence | DocumentEvidence | PhotoEvidence | IMessageEvidence | FlightLogEvidence | VideoEvidence;

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

// ─── Email List Item (for inbox-style browsing) ─────────────────────────────

export interface EmailListItem {
  id: string;
  subject: string;
  sender: string;
  sentAt: string | null;       // ISO datetime
  bodyPreview: string;         // first ~120 chars of body
  recipientCount: number;
  hasCc: boolean;
  epsteinIsSender: boolean;
  starCount: number;
}

export interface EmailBrowseResult {
  emails: EmailListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ─── Photo List Item (for gallery-style browsing) ───────────────────────────

export interface PhotoListItem {
  id: string;
  thumbnailUrl: string;            // CDN resized thumbnail
  imageUrl: string;                // full-res CDN URL
  description: string;             // AI-generated image_description
  width: number;
  height: number;
  facePeople: string[];            // person names detected in this photo
  facePersonIds: string[];         // person IDs detected in this photo
}

export interface PhotoBrowseResult {
  photos: PhotoListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
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

// ─── Evidence Folder ────────────────────────────────────────────────────────

export type EvidenceFolderCategory = "direct" | "cryptic" | "fodder";

export interface EvidenceFolderItem extends SearchResult {
  folderCategory: EvidenceFolderCategory;
  thumbnailUrl?: string | null;
}
