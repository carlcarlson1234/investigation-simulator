// Board workspace types — client-side state for the investigation board

import type { Person, EvidenceType, ConnectionType, SearchResult } from "./types";
import type { SeedEntity, EntityType } from "./entity-seed-data";

// ─── Evidence Categories ────────────────────────────────────────────────────

export type EvidenceCategory = "Emails" | "Documents" | "Photos" | "iMessages" | "FlightLogs";

export const EVIDENCE_CATEGORIES: EvidenceCategory[] = [
  "Emails",
  "Documents",
  "Photos",
  "iMessages",
  "FlightLogs",
];

export function getEvidenceCategory(type: EvidenceType): EvidenceCategory {
  switch (type) {
    case "email": return "Emails";
    case "document": return "Documents";
    case "photo": return "Photos";
    case "imessage": return "iMessages";
    case "flight_log": return "FlightLogs";
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

export type BoardNode = BoardPersonNode | BoardEntityNode;

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

export type RightPanelTab = "persons" | "places" | "orgs" | "events";

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
};

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  email: "Email",
  document: "Document",
  photo: "Photo",
  imessage: "iMessage",
  flight_log: "Flight Log",
};

export const CONNECTION_TYPE_COLOR: Record<ConnectionType, string> = {
  manual: "#dc2626",
  email_thread: "#ef4444",
  photo_coappearance: "#f87171",
};

// Re-export SearchResult for convenience
export type { SearchResult } from "./types";
