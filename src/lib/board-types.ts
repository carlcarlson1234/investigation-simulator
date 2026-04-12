// Board workspace types — client-side state for the investigation board

import type { Person, EvidenceType, ConnectionType, SearchResult } from "./types";
import type { SeedEntity, EntityType } from "./entity-seed-data";

// ─── Evidence Categories ────────────────────────────────────────────────────

export type EvidenceCategory = "Emails" | "Documents" | "Photos" | "iMessages" | "FlightLogs" | "Videos";

export const EVIDENCE_CATEGORIES: EvidenceCategory[] = [
  "Emails",
  "Documents",
  "Photos",
  "iMessages",
  "FlightLogs",
  "Videos",
];

export function getEvidenceCategory(type: EvidenceType): EvidenceCategory {
  switch (type) {
    case "email": return "Emails";
    case "document": return "Documents";
    case "photo": return "Photos";
    case "imessage": return "iMessages";
    case "flight_log": return "FlightLogs";
    case "video": return "Videos";
    default: return "Emails";
  }
}

// ─── Board Items ────────────────────────────────────────────────────────────

export interface BoardPosition {
  x: number;
  y: number;
}

// Evidence pinned to a card or connection — a lightweight reference
export interface PinnedEvidence {
  id: string;
  type: EvidenceType;
  title: string;
  snippet: string;
  date: string | null;
  sender: string | null;
  starCount: number;
}

export interface BoardPersonNode {
  kind: "person";
  id: string;
  data: Person;
  position: BoardPosition;
  pinnedEvidence?: PinnedEvidence[];
}

export interface BoardEntityNode {
  kind: "entity";
  id: string;
  entityType: EntityType;
  data: SeedEntity;
  position: BoardPosition;
  pinnedEvidence?: PinnedEvidence[];
}

// Flights are entities sourced from the jmail flights table (4,292 rows),
// with a 1:1 relationship to a flight_log evidence record (auto-pinned on drop).
export interface BoardFlightNodeData {
  title: string;             // "2014-08-24 · TEB → LHR"
  date: string | null;
  departure: string | null;
  arrival: string | null;
  departureCode: string | null;
  arrivalCode: string | null;
  departureCity: string | null;
  arrivalCity: string | null;
  departureCountry: string | null;
  arrivalCountry: string | null;
  departureLat: number | null;
  departureLon: number | null;
  arrivalLat: number | null;
  arrivalLon: number | null;
  aircraft: string | null;
  pilot: string | null;
  flightNumber: string | null;
  passengers: string[];      // full passenger list as recorded in the flight log
  passengerCount: number;
  notes: string | null;
  distanceNm: number | null;
  durationMinutes: number | null;
  sourceDoc: string | null;
  // Display name fallback — some datasets use this
  name: string;              // same as title, for generic .data.name access
}

export interface BoardFlightNode {
  kind: "flight";
  id: string;                // same as the underlying flight_log id (1:1)
  data: BoardFlightNodeData;
  position: BoardPosition;
  pinnedEvidence?: PinnedEvidence[];  // seeded with the flight_log on drop
}

// A standalone investigation target for a piece of visual evidence —
// a photo or video the player wants to pin as its own "subject of inquiry"
// (e.g. a photo with unidentified faces, a mysterious video clip). Created
// by dropping the evidence on empty board space instead of on an existing
// card. The source evidence is auto-pinned as the node's starting evidence.
export interface BoardMediaNodeData {
  mediaType: "photo" | "video";
  title: string;
  thumbnailUrl: string | null;
  streamUrl: string | null;   // video only
  name: string;               // same as title, for generic .data.name access
}

export interface BoardMediaNode {
  kind: "media";
  id: string;                // same as the underlying photo/video evidence id (1:1)
  data: BoardMediaNodeData;
  position: BoardPosition;
  pinnedEvidence?: PinnedEvidence[];  // seeded with the source evidence on drop
}

export type BoardNode = BoardPersonNode | BoardEntityNode | BoardFlightNode | BoardMediaNode;

export interface BoardConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  label: string;
  strength: number;
  verified: boolean;
  note?: string;
  pinnedEvidence?: PinnedEvidence[];
}

// ─── Right Panel ────────────────────────────────────────────────────────────

export type RightPanelTab = "persons" | "places" | "orgs" | "events" | "flights";

// ─── Timeline ───────────────────────────────────────────────────────────────

export interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  itemId: string;
  kind: "person" | "entity";
  isRelatedToFocus?: boolean;
}

// ─── Focus ──────────────────────────────────────────────────────────────────

export interface FocusState {
  nodeId: string;
  directIds: Set<string>;
  secondIds: Set<string>;
  edgeIds: Set<string>;
}

// ─── Visual Type Maps ───────────────────────────────────────────────────────

export const EVIDENCE_TYPE_ICON: Record<EvidenceType, string> = {
  email: "✉️",
  document: "📄",
  photo: "📸",
  imessage: "💬",
  flight_log: "✈️",
  video: "🎬",
};

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  email: "Email",
  document: "Document",
  photo: "Photo",
  imessage: "iMessage",
  flight_log: "Flight Log",
  video: "Video",
};

export const CONNECTION_TYPE_COLOR: Record<ConnectionType, string> = {
  manual: "#dc2626",
  email_thread: "#ef4444",
  photo_coappearance: "#f87171",
};

// Re-export SearchResult for convenience
export type { SearchResult } from "./types";
