// Investigation flow types — isolated from core app types

import type { Person, SearchResult } from "./types";

// ─── Mode ───────────────────────────────────────────────────────────────────

/** null = show chooser screen, "start" = guided flow, "free" = open sandbox */
export type InvestigationMode = "start" | "free" | null;

// ─── Step Progression ───────────────────────────────────────────────────────

export type InvestigationStep =
  | "place-first-person"      // Step 1: Drag Epstein onto the board
  | "place-second-person"     // Step 3: Place second anchor person
  | "create-link"             // Step 4: Connect the two people
  | "add-evidence"            // Step 5: Bring evidence onto the board
  | "link-evidence"           // Step 6: Connect evidence to a person
  | "add-note"                // Step 7: Add a descriptive note to a connection
  | "classify-strength"       // Step 8: Tag evidence strength (optional)
  | "choose-expansion"        // Step 9: Pick a follow-up direction
  | "open-investigation";     // Done — free investigation with suggestions

// ─── Starter Packet ─────────────────────────────────────────────────────────

export interface StarterPerson {
  personId: string;
  name: string;
  reason: string;           // Why this person is in the starter, e.g. "127 photo detections"
  stepLabel: string;        // What to show in the prompt
}

export interface StarterEvidence {
  result: SearchResult;
  reason: string;           // "Photo showing both subjects together"
  connectionHint: string;   // Which person(s) this relates to
}

export interface StarterPacket {
  firstPerson: StarterPerson;
  secondPerson: StarterPerson;
  evidence: StarterEvidence[];
}

// ─── Expansion ──────────────────────────────────────────────────────────────

export interface ExpansionChoice {
  id: string;
  icon: string;
  label: string;
  description: string;
}

export interface ExpansionPacket {
  choiceId: string;
  suggestedPeople: string[];       // person IDs
  suggestedEvidence: SearchResult[];
}

// ─── Nudges ─────────────────────────────────────────────────────────────────

export interface Nudge {
  id: string;
  message: string;
  icon: string;
  actionLabel?: string;
  actionType?: "search" | "expand-person" | "add-evidence" | "link";
  targetId?: string;
}

// ─── Full State ─────────────────────────────────────────────────────────────

export interface InvestigationState {
  mode: InvestigationMode;
  step: InvestigationStep;
  completedSteps: Set<InvestigationStep>;
  starterPacket: StarterPacket;
  nudges: Nudge[];
  expansionChoices: ExpansionChoice[];
  clusterComplete: boolean;
  /** Tracks which person IDs the user chose to skip (for expansion suggestions) */
  skippedPersonIds: Set<string>;
}
