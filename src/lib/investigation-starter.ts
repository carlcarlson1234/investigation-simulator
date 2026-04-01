// Curated starter data for the Start Investigation flow
// All content uses prominent, well-known figures clearly present in the dataset
// Uses neutral, evidence-based phrasing throughout

import type { StarterPacket, StarterPerson, StarterEvidence, ExpansionChoice } from "./investigation-types";
import type { SearchResult } from "./types";

// ─── Starter People ─────────────────────────────────────────────────────────

export const STARTER_FIRST_PERSON: StarterPerson = {
  personId: "jeffrey-epstein",
  name: "Jeffrey Epstein",
  reason: "Subject of the archive. Central figure in all documents, emails, and photos.",
  stepLabel: "Add the central figure to your investigation board",
};

export const STARTER_SECOND_PERSON: StarterPerson = {
  personId: "ghislaine-maxwell",
  name: "Ghislaine Maxwell",
  reason: "Most frequently appearing person in the archive. 127 photo detections across the dataset.",
  stepLabel: "Add the most connected associate",
};

// ─── Starter Evidence ───────────────────────────────────────────────────────

export const STARTER_EVIDENCE: StarterEvidence[] = [
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
    connectionHint: "Connects both Jeffrey Epstein and Ghislaine Maxwell",
  },
  {
    result: {
      id: "EFTA00001947-0.png",
      type: "photo",
      title: "EFTA00001947-0.png",
      snippet: "Letter addressed to Ghislaine mentioning Jeffrey Epstein.",
      date: null,
      sender: "Ghislaine Maxwell",
      score: 90,
      starCount: 0,
    },
    reason: "Letter mentioning both subjects by name",
    connectionHint: "Document referencing both Jeffrey Epstein and Ghislaine Maxwell",
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
    connectionHint: "Email from Ghislaine Maxwell in the archive",
  },
];

// ─── Starter Packet ─────────────────────────────────────────────────────────

export const STARTER_PACKET: StarterPacket = {
  firstPerson: STARTER_FIRST_PERSON,
  secondPerson: STARTER_SECOND_PERSON,
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

import type { InvestigationStep } from "./investigation-types";

export interface StepConfig {
  step: InvestigationStep;
  title: string;
  instruction: string;
  hint?: string;
  position: "center" | "left" | "right" | "bottom";
}

export const STEP_CONFIGS: StepConfig[] = [
  {
    step: "place-first-person",
    title: "Begin Your Investigation",
    instruction: "Drag the person card below onto the board to set your first anchor point.",
    hint: "This is the central figure in the archive",
    position: "center",
  },
  {
    step: "place-second-person",
    title: "Add a Connected Person",
    instruction: "Add the suggested person from the right panel to the board.",
    hint: "Look for the highlighted person card in the panel on the right",
    position: "right",
  },
  {
    step: "create-link",
    title: "Create a Connection",
    instruction: "Click 'Link' on one person card, then click the other person to connect them.",
    hint: "Connections show relationships between people on the board",
    position: "center",
  },
  {
    step: "add-evidence",
    title: "Add Supporting Evidence",
    instruction: "Drag the highlighted evidence item from the left panel onto the board.",
    hint: "Evidence items support and document the connections you've found",
    position: "left",
  },
  {
    step: "link-evidence",
    title: "Link Evidence to a Person",
    instruction: "Click 'Link' on the evidence card, then click a person to connect them.",
    hint: "Linking evidence to people builds a documented investigation",
    position: "center",
  },
  {
    step: "add-note",
    title: "Add a Note",
    instruction: "Double-click a connection line to add a short description of the relationship.",
    hint: "Example: 'Frequently photographed together' or 'Recipient of correspondence'",
    position: "center",
  },
  {
    step: "classify-strength",
    title: "Classify Evidence Strength",
    instruction: "Optionally tag the connection strength: Direct, Suggestive, or Context Only.",
    hint: "You can skip this step",
    position: "center",
  },
  {
    step: "choose-expansion",
    title: "Choose Your Next Lead",
    instruction: "Pick one direction to expand your investigation.",
    hint: "The app will suggest relevant people and evidence to review",
    position: "center",
  },
  {
    step: "open-investigation",
    title: "Investigation Active",
    instruction: "Your starter cluster is complete. Continue exploring freely — suggestions appear as you work.",
    position: "center",
  },
];

export function getStepConfig(step: InvestigationStep): StepConfig {
  return STEP_CONFIGS.find(c => c.step === step) || STEP_CONFIGS[0];
}
