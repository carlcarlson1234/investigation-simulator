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

  // When auto-detection fires, show the advance button with a brief delay
  useEffect(() => {
    if (autoDetected && !prevAutoRef.current) {
      setJustCompleted(true);
      setTimeout(() => setShowAdvanceBtn(true), 600);
      setTimeout(() => setJustCompleted(false), 1500);
    }
    prevAutoRef.current = autoDetected;
  }, [autoDetected]);

  // Reset advance button when step changes
  useEffect(() => {
    setShowAdvanceBtn(false);
  }, [step]);

  const stepIdx = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length - 1; // exclude open-investigation

  // ─── Open Investigation mode (just nudges) ────────────────────────────────
  if (step === "open-investigation") {
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2" style={{ pointerEvents: "auto" }}>
        {/* Completion Summary */}
        {clusterComplete && (
          <div className="rounded-xl border border-green-600/20 bg-[#0a0a0a]/90 backdrop-blur-sm px-5 py-3 shadow-lg mb-1 animate-in">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 text-sm">✓</span>
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-green-500/80">
                Starter Cluster Complete
              </span>
            </div>
            <div className="flex gap-4 text-[11px] font-bold text-[#888]">
              <span>👤 {nodeCount} nodes</span>
              <span>🔗 {connectionCount} links</span>
              <span>📄 {evidenceCount} evidence</span>
            </div>
          </div>
        )}

        {/* Nudges */}
        {nudges.length > 0 && (
          <div className="flex gap-2">
            {nudges.slice(0, 2).map(nudge => (
              <div
                key={nudge.id}
                className="rounded-lg border border-[#2a2a2a] bg-[#0e0e0e]/90 backdrop-blur-sm px-3 py-2 text-[10px] font-bold text-[#888] shadow flex items-center gap-2"
              >
                <span>{nudge.icon}</span>
                <span>{nudge.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Choose Expansion step ────────────────────────────────────────────────
  if (step === "choose-expansion") {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ pointerEvents: "none" }}>
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#0e0e0e]/95 backdrop-blur-md p-6 shadow-2xl shadow-black/50 max-w-md w-full" style={{ pointerEvents: "auto" }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-red-500/60">
              Step {stepIdx + 1}/{totalSteps}
            </span>
          </div>
          <h3 className="text-lg font-black text-white mb-1">{stepConfig.title}</h3>
          <p className="text-[12px] text-[#888] mb-5">{stepConfig.instruction}</p>

          <div className="space-y-2.5">
            {expansionChoices.map(choice => (
              <button
                key={choice.id}
                onClick={() => onChooseExpansion(choice.id)}
                className="w-full flex items-center gap-3 rounded-xl border border-[#2a2a2a] bg-[#141414] p-3.5 text-left hover:border-red-500/30 hover:bg-red-950/10 transition group"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a1a] border border-[#333] text-xl flex-shrink-0 group-hover:border-red-500/20">
                  {choice.icon}
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-white">{choice.label}</h4>
                  <p className="text-[10px] text-[#666] mt-0.5">{choice.description}</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto text-[#333] group-hover:text-red-500/50 transition flex-shrink-0">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>

          <button
            onClick={onSwitchToFree}
            className="mt-4 w-full text-center text-[10px] font-bold uppercase tracking-wider text-[#444] hover:text-[#999] transition py-2"
          >
            Switch to Free Explore →
          </button>
        </div>
      </div>
    );
  }

  // ─── Place First Person step (special: show the draggable card) ───────────
  if (step === "place-first-person" && firstPerson) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center" style={{ pointerEvents: "none" }}>
        {/* Instruction */}
        <div className="rounded-xl border border-[#2a2a2a] bg-[#0e0e0e]/95 backdrop-blur-md px-6 py-4 shadow-2xl shadow-black/50 mb-6 max-w-sm text-center" style={{ pointerEvents: "auto" }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.15em] text-red-500/60">
              Step 1/{totalSteps}
            </span>
          </div>
          <h3 className="text-lg font-black text-white mb-1">{stepConfig.title}</h3>
          <p className="text-[12px] text-[#888]">{stepConfig.instruction}</p>
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
          className="group cursor-grab active:cursor-grabbing rounded-xl border-2 border-red-500/40 bg-[#111] overflow-hidden shadow-2xl shadow-red-600/15 hover:shadow-red-600/25 hover:border-red-500/60 transition-all hover:scale-105 active:scale-95"
          style={{ pointerEvents: "auto", width: 220 }}
        >
          {/* Photo area */}
          <div className="relative h-48 bg-[#0a0a0a] overflow-hidden">
            {firstPerson.imageUrl ? (
              <img
                src={firstPerson.imageUrl}
                alt={firstPerson.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-red-900/30">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#111] to-transparent" />
            <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-[#0a0a0a]/80 border border-red-900/30 px-2 py-0.5 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[8px] font-black uppercase tracking-[0.15em] text-red-500/80">POI</span>
            </div>
          </div>

          {/* Name */}
          <div className="px-4 py-3">
            <h4 className="text-[15px] font-black text-white tracking-wide">{firstPerson.name}</h4>
            <p className="mt-1 text-[10px] text-[#666]">Subject of the archive</p>
            <div className="mt-2 flex items-center gap-1.5 text-[9px] font-bold text-red-400/60">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Drag onto the board
            </div>
          </div>
        </div>

        {/* Skip */}
        <button
          onClick={onSwitchToFree}
          className="mt-6 text-[10px] font-bold uppercase tracking-wider text-[#333] hover:text-[#888] transition"
          style={{ pointerEvents: "auto" }}
        >
          Switch to Free Explore →
        </button>
      </div>
    );
  }

  // ─── Standard step prompt (floating card) ─────────────────────────────────
  const positionClasses = {
    center: "bottom-6 left-1/2 -translate-x-1/2",
    left: "bottom-6 left-6",
    right: "bottom-6 right-6",
    bottom: "bottom-6 left-1/2 -translate-x-1/2",
  };

  return (
    <div
      className={`absolute ${positionClasses[stepConfig.position]} z-30`}
      style={{ pointerEvents: "auto" }}
    >
      <div className="rounded-xl border border-[#2a2a2a] bg-[#0e0e0e]/95 backdrop-blur-md px-5 py-3.5 shadow-2xl shadow-black/50 max-w-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
          </span>
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-red-500/60">
            Step {stepIdx + 1}/{totalSteps}
          </span>
        </div>

        <h3 className="text-[14px] font-black text-white leading-tight">{stepConfig.title}</h3>
        <p className="mt-1 text-[11px] text-[#888] leading-relaxed">{stepConfig.instruction}</p>

        {stepConfig.hint && (
          <p className="mt-1.5 text-[10px] text-[#555] italic">{stepConfig.hint}</p>
        )}

        {/* Progress + Actions */}
        <div className="mt-3 flex items-center gap-2">
          {/* Progress dots */}
          <div className="flex gap-1">
            {STEP_ORDER.slice(0, -1).map((s, i) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  completedSteps.has(s)
                    ? "w-3 bg-red-500"
                    : s === step
                    ? "w-3 bg-red-500/50"
                    : "w-1.5 bg-[#333]"
                }`}
              />
            ))}
          </div>

          <div className="ml-auto flex gap-1.5">
            {/* Auto-detected completion */}
            {showAdvanceBtn && (
              <button
                onClick={() => {
                  setShowAdvanceBtn(false);
                  onAdvance();
                }}
                className="rounded bg-red-600/20 border border-red-600/30 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-red-400 hover:bg-red-600/30 hover:text-red-300 transition animate-in"
              >
                Continue →
              </button>
            )}

            {/* Skip for optional steps */}
            {(step === "add-note" || step === "classify-strength") && !showAdvanceBtn && (
              <button
                onClick={onSkip}
                className="rounded border border-[#333] px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-[#555] hover:text-white hover:border-[#555] transition"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Just-completed flash */}
      {justCompleted && (
        <div className="absolute inset-0 rounded-xl border-2 border-green-500/50 animate-ping pointer-events-none" />
      )}
    </div>
  );
}
