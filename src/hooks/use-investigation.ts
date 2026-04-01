"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { InvestigationMode, InvestigationStep, Nudge, ExpansionChoice } from "@/lib/investigation-types";
import type { BoardNode, BoardConnection } from "@/lib/board-types";
import type { SearchResult, Person } from "@/lib/types";
import {
  STARTER_PACKET,
  EXPANSION_CHOICES,
  EXPANSION_PEOPLE,
  getStepConfig,
} from "@/lib/investigation-starter";

export interface UseInvestigationReturn {
  mode: InvestigationMode;
  step: InvestigationStep;
  setMode: (mode: InvestigationMode) => void;
  advanceStep: () => void;
  skipStep: () => void;
  switchToFree: () => void;
  starterPacket: typeof STARTER_PACKET;
  stepConfig: ReturnType<typeof getStepConfig>;
  completedSteps: Set<InvestigationStep>;
  expansionChoices: ExpansionChoice[];
  chooseExpansion: (choiceId: string) => void;
  chosenExpansionId: string | null;
  expansionPeopleIds: string[];
  nudges: Nudge[];
  clusterComplete: boolean;
  isStartMode: boolean;
  /** The starter evidence items to show in the left panel */
  starterEvidence: SearchResult[];
  /** The suggested people IDs to highlight in the right panel */
  suggestedPeopleIds: string[];
}

const STEP_ORDER: InvestigationStep[] = [
  "place-first-person",
  "place-second-person",
  "create-link",
  "add-evidence",
  "link-evidence",
  "add-note",
  "classify-strength",
  "choose-expansion",
  "open-investigation",
];

export function useInvestigation(
  boardNodes: BoardNode[],
  boardConnections: BoardConnection[],
  people: Person[],
): UseInvestigationReturn {
  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  const initialMode: InvestigationMode = urlMode === "free" ? "free" : urlMode === "start" ? "start" : null;

  const [mode, setMode] = useState<InvestigationMode>(initialMode);
  const [step, setStep] = useState<InvestigationStep>("place-first-person");
  const [completedSteps, setCompletedSteps] = useState<Set<InvestigationStep>>(new Set());
  const [chosenExpansionId, setChosenExpansionId] = useState<string | null>(null);

  const isStartMode = mode === "start";

  // ─── Step advancement ─────────────────────────────────────────────────────

  const advanceStep = useCallback(() => {
    const currentIdx = STEP_ORDER.indexOf(step);
    if (currentIdx < STEP_ORDER.length - 1) {
      setCompletedSteps(prev => new Set([...prev, step]));
      setStep(STEP_ORDER[currentIdx + 1]);
    }
  }, [step]);

  const skipStep = useCallback(() => {
    // Skip current step (for optional steps like classify-strength)
    advanceStep();
  }, [advanceStep]);

  const switchToFree = useCallback(() => {
    setMode("free");
  }, []);

  // ─── Auto-detect step completion ──────────────────────────────────────────

  // Check if conditions for current step are met
  const autoDetectCompletion = useMemo(() => {
    if (!isStartMode) return false;

    switch (step) {
      case "place-first-person":
        return boardNodes.some(n => n.id === STARTER_PACKET.firstPerson.personId);
      case "place-second-person":
        return boardNodes.some(n => n.id === STARTER_PACKET.secondPerson.personId);
      case "create-link":
        return boardConnections.some(c => {
          const ids = [c.sourceId, c.targetId];
          return ids.includes(STARTER_PACKET.firstPerson.personId)
            && ids.includes(STARTER_PACKET.secondPerson.personId);
        });
      case "add-evidence":
        return boardNodes.some(n => n.kind === "evidence");
      case "link-evidence": {
        const evidenceNodes = boardNodes.filter(n => n.kind === "evidence");
        return evidenceNodes.some(en =>
          boardConnections.some(c =>
            (c.sourceId === en.id || c.targetId === en.id)
          )
        );
      }
      default:
        return false;
    }
  }, [step, boardNodes, boardConnections, isStartMode]);

  // ─── Expansion ────────────────────────────────────────────────────────────

  const chooseExpansion = useCallback((choiceId: string) => {
    setChosenExpansionId(choiceId);
    setCompletedSteps(prev => new Set([...prev, "choose-expansion"]));
    setStep("open-investigation");
  }, []);

  const expansionPeopleIds = useMemo(() => {
    if (!chosenExpansionId) return [];
    return EXPANSION_PEOPLE[chosenExpansionId] || [];
  }, [chosenExpansionId]);

  // ─── Contextual nudges ────────────────────────────────────────────────────

  const nudges = useMemo<Nudge[]>(() => {
    if (!isStartMode || step !== "open-investigation") return [];

    const result: Nudge[] = [];

    // Check for unlinked evidence
    const evidenceNodes = boardNodes.filter(n => n.kind === "evidence");
    const unlinked = evidenceNodes.filter(en =>
      !boardConnections.some(c => c.sourceId === en.id || c.targetId === en.id)
    );
    if (unlinked.length > 0) {
      result.push({
        id: "unlinked-evidence",
        message: `${unlinked.length} evidence item${unlinked.length > 1 ? "s" : ""} not linked to any person`,
        icon: "⚠️",
        actionLabel: "Review",
        actionType: "link",
      });
    }

    // Check for people with no connections
    const personNodes = boardNodes.filter(n => n.kind === "person");
    const isolated = personNodes.filter(pn =>
      !boardConnections.some(c => c.sourceId === pn.id || c.targetId === pn.id)
    );
    if (isolated.length > 0) {
      result.push({
        id: "isolated-person",
        message: `${isolated.length} person${isolated.length > 1 ? "s" : ""} with no connections yet`,
        icon: "👤",
        actionLabel: "Connect",
        actionType: "link",
      });
    }

    // Suggest expanding if board is small
    if (boardNodes.length < 6) {
      result.push({
        id: "expand-board",
        message: "Add more people or evidence to build a stronger picture",
        icon: "🔍",
        actionLabel: "Browse Evidence",
        actionType: "search",
      });
    }

    return result;
  }, [isStartMode, step, boardNodes, boardConnections]);

  // ─── Cluster completion detection ─────────────────────────────────────────

  const clusterComplete = useMemo(() => {
    return completedSteps.has("link-evidence") || completedSteps.has("add-note");
  }, [completedSteps]);

  // ─── Starter evidence for left panel ──────────────────────────────────────

  const starterEvidence = useMemo<SearchResult[]>(() => {
    if (!isStartMode) return [];
    return STARTER_PACKET.evidence.map(e => e.result);
  }, [isStartMode]);

  // ─── Suggested people for right panel ─────────────────────────────────────

  const suggestedPeopleIds = useMemo<string[]>(() => {
    if (!isStartMode) return [];

    switch (step) {
      case "place-first-person":
        return [STARTER_PACKET.firstPerson.personId];
      case "place-second-person":
        return [STARTER_PACKET.secondPerson.personId];
      default:
        if (chosenExpansionId) return expansionPeopleIds;
        return [];
    }
  }, [isStartMode, step, chosenExpansionId, expansionPeopleIds]);

  // ─── Step config ──────────────────────────────────────────────────────────

  const stepConfig = useMemo(() => getStepConfig(step), [step]);

  return {
    mode,
    step,
    setMode,
    advanceStep,
    skipStep,
    switchToFree,
    starterPacket: STARTER_PACKET,
    stepConfig,
    completedSteps,
    expansionChoices: EXPANSION_CHOICES,
    chooseExpansion,
    chosenExpansionId,
    expansionPeopleIds,
    nudges,
    clusterComplete,
    isStartMode,
    starterEvidence,
    suggestedPeopleIds,
    autoDetectCompletion,
  } as UseInvestigationReturn & { autoDetectCompletion: boolean };
}
