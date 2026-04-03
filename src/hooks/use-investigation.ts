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
  score: number;
  /** The starter evidence items to show in the left panel */
  starterEvidence: SearchResult[];
  /** The suggested people IDs to highlight in the right panel */
  suggestedPeopleIds: string[];
  /** Whether the current step's completion condition is met */
  autoDetectCompletion: boolean;
}

const STEP_ORDER: InvestigationStep[] = [
  "welcome",
  "intro-people",
  "intro-board",
  "place-epstein",
  "intro-evidence",
  "place-evidence",
  "pick-person",
  "create-connection",
  "connection-confirmed",
  "open-investigation",
];

export function useInvestigation(
  boardNodes: BoardNode[],
  boardConnections: BoardConnection[],
  people: Person[],
  savedMode?: InvestigationMode | null,
): UseInvestigationReturn {
  const searchParams = useSearchParams();
  const urlMode = searchParams.get("mode");
  // Priority: saved session > URL param > default
  const initialMode: InvestigationMode = savedMode ?? (urlMode === "free" ? "free" : "start");

  const [mode, setMode] = useState<InvestigationMode>(initialMode);
  // If restoring a session with existing nodes, skip to open investigation
  const [step, setStep] = useState<InvestigationStep>(() =>
    savedMode && boardNodes.length > 0 ? "open-investigation" : "welcome"
  );
  const [completedSteps, setCompletedSteps] = useState<Set<InvestigationStep>>(new Set());
  const [chosenExpansionId, setChosenExpansionId] = useState<string | null>(null);
  const [score, setScore] = useState(0);

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
        return boardNodes.some(n => n.kind === "evidence");
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
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [step, advanceStep]);

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
    if (!isStartMode) return [];
    return STARTER_PACKET.evidence.map(e => e.result);
  }, [isStartMode]);

  // ─── Suggested people for right panel ─────────────────────────────────────

  const suggestedPeopleIds = useMemo<string[]>(() => {
    if (!isStartMode) return [];

    switch (step) {
      case "intro-people":
      case "intro-board":
      case "place-epstein":
        return [STARTER_PACKET.firstPerson.personId];
      case "pick-person":
        return STARTER_PACKET.secondPersonOptions.map(p => p.personId);
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
    score,
    starterEvidence,
    suggestedPeopleIds,
    autoDetectCompletion,
  };
}
