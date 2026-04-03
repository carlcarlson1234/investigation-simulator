// Curated starter data for the Start Investigation flow
// All content uses prominent, well-known figures clearly present in the dataset
// Uses neutral, evidence-based phrasing throughout

import type { StarterPacket, StarterPerson, StarterEvidence, ExpansionChoice, InvestigationStep } from "./investigation-types";
import type { SearchResult } from "./types";

// ─── Starter People ─────────────────────────────────────────────────────────

export const STARTER_FIRST_PERSON: StarterPerson = {
  personId: "jeffrey-epstein",
  name: "Jeffrey Epstein",
  reason: "Subject of the archive. Central figure in all documents, emails, and photos.",
  stepLabel: "Add the central figure to your investigation board",
};

export const STARTER_SECOND_PERSON_OPTIONS: StarterPerson[] = [
  {
    personId: "ghislaine-maxwell",
    name: "Ghislaine Maxwell",
    reason: "Most frequently appearing person in the archive. 127 photo detections across the dataset.",
    stepLabel: "Add the most connected associate",
  },
  {
    personId: "bill-clinton",
    name: "Bill Clinton",
    reason: "Former US President. Appears in multiple flight logs and photos in the archive.",
    stepLabel: "Add a prominent associate",
  },
];

// ─── Starter Evidence ───────────────────────────────────────────────────────

export const STARTER_EVIDENCE: StarterEvidence[] = [
  // Evidence linked to Maxwell
  {
    result: {
      id: "EFTA00003171-0.png",
      type: "photo",
      title: "EFTA00003171-0.png",
      snippet: "Ghislaine Maxwell and Jeffrey Epstein seated; Maxwell uses a phone, Epstein looks forward.",
      date: null,
      sender: "Ghislaine Maxwell",
      score: 100,
      starCount: 0,
    },
    reason: "Photo showing both subjects together",
    connectionHint: "ghislaine-maxwell",
  },
  // Evidence linked to Clinton
  {
    result: {
      id: "EFTA00001947-0.png",
      type: "photo",
      title: "EFTA00001947-0.png",
      snippet: "Photo from the archive showing prominent associate at a social event.",
      date: null,
      sender: "Bill Clinton",
      score: 90,
      starCount: 0,
    },
    reason: "Photo showing a prominent political figure in the archive",
    connectionHint: "bill-clinton",
  },
  {
    result: {
      id: "EFTA02333924-0",
      type: "email",
      title: "Fwd: New WTC Building!",
      snippet: "Email from G. Max forwarding architectural content.",
      date: null,
      sender: "G. Max",
      score: 80,
      starCount: 0,
    },
    reason: "Email sent from Ghislaine Maxwell's account",
    connectionHint: "ghislaine-maxwell",
  },
];

// ─── Starter Packet ─────────────────────────────────────────────────────────

export const STARTER_PACKET: StarterPacket = {
  firstPerson: STARTER_FIRST_PERSON,
  secondPersonOptions: STARTER_SECOND_PERSON_OPTIONS,
  evidence: STARTER_EVIDENCE,
};

// ─── Expansion Choices ──────────────────────────────────────────────────────

export const EXPANSION_CHOICES: ExpansionChoice[] = [
  {
    id: "expand-maxwell",
    icon: "👤",
    label: "Expand Ghislaine Maxwell",
    description: "Find more photos, emails, and connections involving Maxwell",
  },
  {
    id: "expand-associates",
    icon: "🔗",
    label: "Explore Other Associates",
    description: "See who else appears frequently in photos and correspondence",
  },
  {
    id: "expand-photos",
    icon: "📸",
    label: "Browse Photo Evidence",
    description: "Explore the 18,000+ photos in the archive for more connections",
  },
];

// ─── Suggested People for Expansion ─────────────────────────────────────────

export const EXPANSION_PEOPLE: Record<string, string[]> = {
  "expand-maxwell": [
    "bill-clinton",
    "prince-andrew-duke-of-york",
    "jean-luc-brunel",
    "kevin-spacey",
  ],
  "expand-associates": [
    "bill-clinton",
    "donald-trump",
    "bill-gates",
    "prince-andrew-duke-of-york",
    "steve-bannon",
  ],
  "expand-photos": [
    "ghislaine-maxwell",
    "bill-clinton",
    "steve-bannon",
    "jean-luc-brunel",
  ],
};

// ─── Step Config ────────────────────────────────────────────────────────────

export interface StepConfig {
  step: InvestigationStep;
  title: string;
  instruction: string;
  hint?: string;
  position: "center" | "left" | "right" | "bottom";
}

export const STEP_CONFIGS: StepConfig[] = [
  {
    step: "place-epstein",
    title: "Drag Epstein onto the Board",
    instruction: "Find the highlighted card in the right panel and drag it here.",
    position: "right",
  },
  {
    step: "place-evidence",
    title: "Add Evidence",
    instruction: "Drag a piece of evidence from the left panel onto the board.",
    position: "left",
  },
  {
    step: "pick-person",
    title: "Add a Person of Interest",
    instruction: "Drag someone from the right panel onto the board.",
    position: "right",
  },
  {
    step: "create-connection",
    title: "Connect the Dots",
    instruction: "Drag from the glowing red handle on one card to another.",
    position: "center",
  },
  {
    step: "connection-confirmed",
    title: "Connection Confirmed!",
    instruction: "",
    position: "center",
  },
  {
    step: "open-investigation",
    title: "Investigation Active",
    instruction: "Your investigation is underway. Explore freely.",
    position: "center",
  },
];

export function getStepConfig(step: InvestigationStep): StepConfig {
  return STEP_CONFIGS.find(c => c.step === step) || STEP_CONFIGS[0];
}
