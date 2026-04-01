"use client";

import { useEffect, useRef, useState } from "react";
import type { InvestigationStep, ExpansionChoice, Nudge } from "@/lib/investigation-types";
import type { StepConfig } from "@/lib/investigation-starter";
import type { Person, SearchResult } from "@/lib/types";

interface InvestigationOverlayProps {
  step: InvestigationStep;
  stepConfig: StepConfig;
  completedSteps: Set<InvestigationStep>;
  autoDetected: boolean;
  onAdvance: () => void;
  onSkip: () => void;
  onSwitchToFree: () => void;
  // First-placement
  firstPerson: Person | undefined;
  onAddPerson: (personId: string) => void;
  // Expansion
  expansionChoices: ExpansionChoice[];
  onChooseExpansion: (choiceId: string) => void;
  clusterComplete: boolean;
  // Nudges
  nudges: Nudge[];
  // Board state for summary
  nodeCount: number;
  connectionCount: number;
  evidenceCount: number;
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

export function InvestigationOverlay({
  step,
  stepConfig,
  completedSteps,
  autoDetected,
  onAdvance,
  onSkip,
  onSwitchToFree,
  firstPerson,
  onAddPerson,
  expansionChoices,
  onChooseExpansion,
  clusterComplete,
  nudges,
  nodeCount,
  connectionCount,
  evidenceCount,
}: InvestigationOverlayProps) {
  const [showAdvanceBtn, setShowAdvanceBtn] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const prevAutoRef = useRef(false);

  useEffect(() => {
    if (autoDetected && !prevAutoRef.current) {
      setJustCompleted(true);
      setTimeout(() => setShowAdvanceBtn(true), 600);
      setTimeout(() => setJustCompleted(false), 1500);
    }
    prevAutoRef.current = autoDetected;
  }, [autoDetected]);

  useEffect(() => {
    setShowAdvanceBtn(false);
  }, [step]);

  const stepIdx = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length - 1;

  // ─── Open Investigation (just nudges) ─────────────────────────────────
  if (step === "open-investigation") {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3" style={{ pointerEvents: "auto" }}>
        {clusterComplete && (
          <div className="rounded-xl border border-green-600/20 bg-[#0a0a0a]/90 backdrop-blur-sm px-6 py-4 shadow-lg animate-in">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 text-lg">✓</span>
              <span className="text-xs font-black uppercase tracking-wider text-green-500/80">
                Starter Cluster Complete
              </span>
            </div>
            <div className="flex gap-5 text-sm font-bold text-[#888]">
              <span>👤 {nodeCount} nodes</span>
              <span>🔗 {connectionCount} links</span>
              <span>📄 {evidenceCount} evidence</span>
            </div>
          </div>
        )}
        {nudges.length > 0 && (
          <div className="flex gap-3">
            {nudges.slice(0, 2).map(nudge => (
              <div key={nudge.id} className="rounded-lg border border-[#2a2a2a] bg-[#0e0e0e]/90 backdrop-blur-sm px-4 py-3 text-sm font-bold text-[#888] shadow flex items-center gap-2">
                <span className="text-lg">{nudge.icon}</span>
                <span>{nudge.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Choose Expansion ─────────────────────────────────────────────────
  if (step === "choose-expansion") {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ pointerEvents: "none" }}>
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#0e0e0e]/95 backdrop-blur-md p-8 shadow-2xl shadow-black/50 max-w-lg w-full" style={{ pointerEvents: "auto" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-red-500/60">
              Step {stepIdx + 1}/{totalSteps}
            </span>
          </div>
          <h3 className="text-2xl font-black text-white mb-2">{stepConfig.title}</h3>
          <p className="text-sm text-[#888] mb-6">{stepConfig.instruction}</p>

          <div className="space-y-3">
            {expansionChoices.map(choice => (
              <button
                key={choice.id}
                onClick={() => onChooseExpansion(choice.id)}
                className="w-full flex items-center gap-4 rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 text-left hover:border-red-500/30 hover:bg-red-950/10 transition group"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1a1a1a] border border-[#333] text-2xl flex-shrink-0 group-hover:border-red-500/20">
                  {choice.icon}
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">{choice.label}</h4>
                  <p className="text-xs text-[#666] mt-0.5">{choice.description}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto text-[#333] group-hover:text-red-500/50 transition flex-shrink-0">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>

          <button onClick={onSwitchToFree} className="mt-5 w-full text-center text-xs font-bold uppercase tracking-wider text-[#444] hover:text-[#999] transition py-2">
            Switch to Free Explore →
          </button>
        </div>
      </div>
    );
  }

  // ─── Place First Person: Card on the RIGHT with big arrow ─────────────
  if (step === "place-first-person" && firstPerson) {
    return (
      <div className="absolute inset-0 z-30 flex items-center" style={{ pointerEvents: "none" }}>
        {/* Semi-transparent hint overlay on board center */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center" style={{ pointerEvents: "auto" }}>
            <div className="mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-red-500/40">
                Step 1/{totalSteps}
              </span>
            </div>
            <h2 className="text-3xl font-black text-white/30 mb-2">
              Drop Here
            </h2>
            <p className="text-lg text-white/15">
              ← Drag from the right
            </p>
          </div>
        </div>

        {/* Right-side anchor: big arrow + draggable card */}
        <div className="flex-shrink-0 flex items-center gap-4 pr-8" style={{ pointerEvents: "auto" }}>
          {/* Big animated arrow pointing LEFT */}
          <div className="flex flex-col items-center gap-2 animate-bounce-left">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-black uppercase tracking-wider text-red-500/60">
              Drag
            </span>
          </div>

          {/* Draggable Person Card */}
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/board-item",
                JSON.stringify({ kind: "person", id: firstPerson.id })
              );
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="group cursor-grab active:cursor-grabbing rounded-xl border-2 border-red-500/50 bg-[#111] overflow-hidden shadow-2xl shadow-red-600/20 hover:shadow-red-600/40 hover:border-red-500/70 transition-all hover:scale-105 active:scale-95"
            style={{ width: 240 }}
          >
            {/* Photo */}
            <div className="relative h-52 bg-[#0a0a0a] overflow-hidden">
              {firstPerson.imageUrl ? (
                <img src={firstPerson.imageUrl} alt={firstPerson.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-red-900/30">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#111] to-transparent" />
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-md bg-[#0a0a0a]/80 border border-red-900/30 px-2.5 py-1 backdrop-blur-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-wider text-red-500/80">POI</span>
              </div>
            </div>

            {/* Name */}
            <div className="px-5 py-4">
              <h4 className="text-xl font-black text-white tracking-wide">{firstPerson.name}</h4>
              <p className="mt-1 text-sm text-[#666]">Subject of the archive</p>
              <div className="mt-3 flex items-center gap-2 text-xs font-black text-red-400/70 uppercase tracking-wider">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Drag onto the board
              </div>
            </div>
          </div>
        </div>

        {/* Skip link */}
        <button
          onClick={onSwitchToFree}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold uppercase tracking-wider text-[#333] hover:text-[#888] transition"
          style={{ pointerEvents: "auto" }}
        >
          Switch to Free Explore →
        </button>
      </div>
    );
  }

  // ─── Standard step prompt (bigger text) ───────────────────────────────
  const positionClasses = {
    center: "bottom-8 left-1/2 -translate-x-1/2",
    left: "bottom-8 left-8",
    right: "bottom-8 right-8",
    bottom: "bottom-8 left-1/2 -translate-x-1/2",
  };

  return (
    <div
      className={`absolute ${positionClasses[stepConfig.position]} z-30`}
      style={{ pointerEvents: "auto" }}
    >
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0e0e0e]/95 backdrop-blur-md px-6 py-5 shadow-2xl shadow-black/50 max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-xs font-black uppercase tracking-wider text-red-500/60">
            Step {stepIdx + 1}/{totalSteps}
          </span>
        </div>

        <h3 className="text-xl font-black text-white leading-tight">{stepConfig.title}</h3>
        <p className="mt-1.5 text-sm text-[#888] leading-relaxed">{stepConfig.instruction}</p>

        {stepConfig.hint && (
          <p className="mt-2 text-xs text-[#555] italic">{stepConfig.hint}</p>
        )}

        {/* Progress + Actions */}
        <div className="mt-4 flex items-center gap-3">
          {/* Progress dots */}
          <div className="flex gap-1.5">
            {STEP_ORDER.slice(0, -1).map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  completedSteps.has(s)
                    ? "w-4 bg-red-500"
                    : s === step
                    ? "w-4 bg-red-500/50"
                    : "w-2 bg-[#333]"
                }`}
              />
            ))}
          </div>

          <div className="ml-auto flex gap-2">
            {showAdvanceBtn && (
              <button
                onClick={() => { setShowAdvanceBtn(false); onAdvance(); }}
                className="rounded-lg bg-red-600/20 border border-red-600/30 px-4 py-2 text-xs font-black uppercase tracking-wider text-red-400 hover:bg-red-600/30 hover:text-red-300 transition animate-in"
              >
                Continue →
              </button>
            )}
            {(step === "add-note" || step === "classify-strength") && !showAdvanceBtn && (
              <button
                onClick={onSkip}
                className="rounded-lg border border-[#333] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#555] hover:text-white hover:border-[#555] transition"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>

      {justCompleted && (
        <div className="absolute inset-0 rounded-xl border-2 border-green-500/50 animate-ping pointer-events-none" />
      )}
    </div>
  );
}
