// Board workspace types — client-side state for the investigation board

import type { Person, Evidence, EvidenceType, ConnectionType, SearchResult } from "./types";

// ─── Evidence Categories ────────────────────────────────────────────────────

export type EvidenceCategory = "Emails" | "Documents" | "Photos" | "iMessages";

export const EVIDENCE_CATEGORIES: EvidenceCategory[] = [
  "Emails",
  "Documents",
  "Photos",
  "iMessages",
];

export function getEvidenceCategory(type: EvidenceType): EvidenceCategory {
  switch (type) {
    case "email": return "Emails";
    case "document": return "Documents";
    case "photo": return "Photos";
    case "imessage": return "iMessages";
    default: return "Emails";
  }
}

// ─── Board Items ────────────────────────────────────────────────────────────

export interface BoardPosition {
  x: number;
  y: number;
}

export interface BoardPersonNode {
  kind: "person";
  id: string;
  data: Person;
  position: BoardPosition;
}

export interface BoardEvidenceNode {
  kind: "evidence";
  id: string;
  evidenceType: EvidenceType;
  data: SearchResult;
  fullData?: Evidence;
  position: BoardPosition;
}

export type BoardNode = BoardPersonNode | BoardEvidenceNode;

export interface BoardConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  label: string;
  strength: number;
  verified: boolean;
  note?: string;
}

// ─── Right Panel ────────────────────────────────────────────────────────────

export type RightPanelTab = "persons" | "details";

// ─── Timeline ───────────────────────────────────────────────────────────────

export interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  itemId: string;
  kind: "person" | "evidence";
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
};

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  email: "Email",
  document: "Document",
  photo: "Photo",
  imessage: "iMessage",
};

export const CONNECTION_TYPE_COLOR: Record<ConnectionType, string> = {
  manual: "#dc2626",
  email_thread: "#ef4444",
  photo_coappearance: "#f87171",
};

// Re-export SearchResult for convenience
export type { SearchResult } from "./types";
