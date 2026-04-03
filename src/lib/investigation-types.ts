// Investigation flow types — isolated from core app types

import type { Person, SearchResult } from "./types";

// ─── Mode ───────────────────────────────────────────────────────────────────

/** null = show chooser screen, "start" = guided flow, "free" = open sandbox */
export type InvestigationMode = "start" | "free" | null;

// ─── Step Progression ───────────────────────────────────────────────────────

export type InvestigationStep =
  | "welcome"                 // Fullscreen cinematic intro
  | "intro-people"            // Right panel slides in — "this is where people are"
  | "intro-board"             // Board revealed — "this is the board"
  | "place-epstein"           // Drag Epstein from right panel onto board
  | "intro-evidence"          // Left panel appears — "this is the evidence"
  | "place-evidence"          // Drag a piece of evidence onto board
  | "pick-person"             // Pick Clinton or Maxwell from right panel
  | "create-connection"       // Connect two nodes
  | "connection-confirmed"    // Green glow celebration + points
  | "open-investigation";     // Done — free investigation

// ─── Starter Packet ─────────────────────────────────────────────────────────

export interface StarterPerson {
  personId: string;
  name: string;
  reason: string;           // Why this person is in the starter
  stepLabel: string;        // What to show in the prompt
}

export interface StarterEvidence {
  result: SearchResult;
  reason: string;           // "Photo showing both subjects together"
  connectionHint: string;   // Which person(s) this relates to
}

export interface StarterPacket {
  firstPerson: StarterPerson;
  secondPersonOptions: StarterPerson[];  // Multiple choices for step 7
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
  score: number;
  /** Tracks which person IDs the user chose to skip (for expansion suggestions) */
  skippedPersonIds: Set<string>;
}
