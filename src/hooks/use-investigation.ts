"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
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
  score: number;
  /** The starter evidence items to show in the left panel */
  starterEvidence: SearchResult[];
  /** The suggested people IDs to highlight in the right panel */
  suggestedPeopleIds: string[];
  /** Whether the current step's completion condition is met */
  autoDetectCompletion: boolean;
}

const STEP_ORDER: InvestigationStep[] = [
  "place-epstein",
  "place-evidence",
  "pick-person",
  "create-connection",
  "connection-confirmed",
  "tutorial-complete",
  "open-investigation",
];

export function useInvestigation(
  boardNodes: BoardNode[],
  boardConnections: BoardConnection[],
  people: Person[],
  savedMode?: InvestigationMode | null,
  urlMode?: string | null,
): UseInvestigationReturn {
  // Priority: saved session > URL param > default to free explore
  const initialMode: InvestigationMode = savedMode ?? (urlMode === "start" ? "start" : "free");

  const [mode, setMode] = useState<InvestigationMode>(initialMode);
  // Free mode always skips to open board; start mode begins at welcome
  const [step, setStep] = useState<InvestigationStep>(() => {
    if (savedMode && boardNodes.length > 0) return "open-investigation";
    if (initialMode === "free") return "open-investigation";
    return "place-epstein";
  });
  const [completedSteps, setCompletedSteps] = useState<Set<InvestigationStep>>(new Set());
  const [chosenExpansionId, setChosenExpansionId] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  // Track that user went through the tutorial (persists after switching to free)
  const [didTutorial] = useState(() => initialMode === "start");

  const isStartMode = mode === "start";

  // ─── Step advancement ─────────────────────────────────────────────────────

  const advanceStep = useCallback(() => {
    const currentIdx = STEP_ORDER.indexOf(step);
    if (currentIdx < STEP_ORDER.length - 1) {
      setCompletedSteps(prev => new Set([...prev, step]));

      const nextStep = STEP_ORDER[currentIdx + 1];
      // Award points on connection-confirmed
      if (nextStep === "connection-confirmed") {
        setScore(50);
      }
      setStep(nextStep);
    }
  }, [step]);

  const skipStep = useCallback(() => {
    advanceStep();
  }, [advanceStep]);

  const switchToFree = useCallback(() => {
    setMode("free");
  }, []);

  // ─── Auto-detect step completion ──────────────────────────────────────────

  const autoDetectCompletion = useMemo(() => {
    if (!isStartMode) return false;

    switch (step) {
      case "place-epstein":
        return boardNodes.some(n => n.id === STARTER_PACKET.firstPerson.personId);
      case "place-evidence":
        // Evidence is now pinned to cards/connections; count any pinned evidence
        return boardNodes.some(n => (n.pinnedEvidence?.length ?? 0) > 0)
          || boardConnections.some(c => (c.pinnedEvidence?.length ?? 0) > 0);
      case "pick-person": {
        const optionIds = STARTER_PACKET.secondPersonOptions.map(p => p.personId);
        return boardNodes.some(n => optionIds.includes(n.id));
      }
      case "create-connection":
        return boardConnections.length > 0;
      default:
        return false;
    }
  }, [step, boardNodes, boardConnections, isStartMode]);

  // Auto-advance on connection-confirmed after 3 seconds
  useEffect(() => {
    if (step === "connection-confirmed") {
      const timer = setTimeout(() => {
        advanceStep();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step, advanceStep]);

  // Switch to free mode when tutorial ends
  useEffect(() => {
    if (step === "open-investigation" && mode === "start") {
      setMode("free");
    }
  }, [step, mode]);

  // ─── Expansion ────────────────────────────────────────────────────────────

  const chooseExpansion = useCallback((choiceId: string) => {
    setChosenExpansionId(choiceId);
    setCompletedSteps(prev => new Set([...prev, "open-investigation"]));
  }, []);

  const expansionPeopleIds = useMemo(() => {
    if (!chosenExpansionId) return [];
    return EXPANSION_PEOPLE[chosenExpansionId] || [];
  }, [chosenExpansionId]);

  // ─── Contextual nudges ────────────────────────────────────────────────────

  const nudges = useMemo<Nudge[]>(() => {
    if (!isStartMode || step !== "open-investigation") return [];

    const result: Nudge[] = [];

    // Evidence nodes no longer exist — nudges about unlinked evidence removed.

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
    return completedSteps.has("create-connection");
  }, [completedSteps]);

  // ─── Starter evidence for left panel ──────────────────────────────────────

  const starterEvidence = useMemo<SearchResult[]>(() => {
    if (!isStartMode && !didTutorial) return [];
    return STARTER_PACKET.evidence.map(e => e.result);
  }, [isStartMode, didTutorial]);

  // ─── Suggested people for right panel ─────────────────────────────────────

  const suggestedPeopleIds = useMemo<string[]>(() => {
    if (!isStartMode && !didTutorial) return [];

    switch (step) {
      case "place-epstein":
        return [STARTER_PACKET.firstPerson.personId];
      case "pick-person":
        return STARTER_PACKET.secondPersonOptions.map(p => p.personId);
      default: {
        // After tutorial, show all starter people as suggestions
        const ids = [
          STARTER_PACKET.firstPerson.personId,
          ...STARTER_PACKET.secondPersonOptions.map(p => p.personId),
        ];
        if (chosenExpansionId) ids.push(...expansionPeopleIds);
        return ids;
      }
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
    score,
    starterEvidence,
    suggestedPeopleIds,
    autoDetectCompletion,
  };
}
