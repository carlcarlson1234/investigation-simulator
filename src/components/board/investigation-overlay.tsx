"use client";

import { useEffect, useRef, useState } from "react";
import type { InvestigationStep, ExpansionChoice, Nudge } from "@/lib/investigation-types";
import type { StepConfig } from "@/lib/investigation-starter";
import type { Person } from "@/lib/types";

interface InvestigationOverlayProps {
  step: InvestigationStep;
  stepConfig: StepConfig;
  completedSteps: Set<InvestigationStep>;
  autoDetected: boolean;
  onAdvance: () => void;
  onSkip: () => void;
  onSwitchToFree: () => void;
  firstPerson: Person | undefined;
  onAddPerson: (personId: string) => void;
  expansionChoices: ExpansionChoice[];
  onChooseExpansion: (choiceId: string) => void;
  clusterComplete: boolean;
  nudges: Nudge[];
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

  // ─── Open Investigation (nudges only) ─────────────────────────────────
  if (step === "open-investigation") {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3" style={{ pointerEvents: "auto" }}>
        {clusterComplete && (
          <div className="rounded-xl border border-green-600/20 bg-[#0a0a0a]/90 backdrop-blur-sm px-6 py-4 shadow-lg animate-in">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-500 text-lg">✓</span>
              <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] text-green-500/80">
                Starter Cluster Complete
              </span>
            </div>
            <div className="flex gap-5 text-sm font-bold text-[#666]">
              <span>👤 {nodeCount}</span>
              <span>🔗 {connectionCount}</span>
              <span>📄 {evidenceCount}</span>
            </div>
          </div>
        )}
        {nudges.length > 0 && (
          <div className="flex gap-3">
            {nudges.slice(0, 2).map(nudge => (
              <div key={nudge.id} className="rounded-lg border border-[#2a2a2a] bg-[#0e0e0e]/90 backdrop-blur-sm px-4 py-3 text-sm text-[#888] shadow flex items-center gap-2">
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
        <div className="rounded-2xl border border-[#2a2a2a] bg-[#0e0e0e]/95 backdrop-blur-md p-8 shadow-2xl max-w-lg w-full" style={{ pointerEvents: "auto" }}>
          <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] text-red-500/60">
            Step {stepIdx + 1}/{totalSteps}
          </span>
          <h3 className="font-[family-name:var(--font-display)] text-3xl text-white mt-2 mb-1 tracking-wide">{stepConfig.title}</h3>
          <p className="text-sm text-[#888] mb-6">{stepConfig.instruction}</p>

          <div className="space-y-3">
            {expansionChoices.map(choice => (
              <button
                key={choice.id}
                onClick={() => onChooseExpansion(choice.id)}
                className="w-full flex items-center gap-4 rounded-xl border border-[#2a2a2a] bg-[#141414] p-4 text-left hover:border-red-500/30 hover:bg-red-950/10 transition group"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1a1a1a] text-2xl flex-shrink-0 group-hover:bg-red-950/20">
                  {choice.icon}
                </div>
                <div className="flex-1">
                  <h4 className="text-base font-bold text-white">{choice.label}</h4>
                  <p className="text-xs text-[#555] mt-0.5">{choice.description}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#333] group-hover:text-red-500/50 transition flex-shrink-0">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>

          <button onClick={onSwitchToFree} className="mt-5 w-full text-center font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[#444] hover:text-[#999] transition py-2">
            Switch to Free Explore →
          </button>
        </div>
      </div>
    );
  }

  // ─── PLACE FIRST PERSON ───────────────────────────────────────────────
  // Card floats as a fixed element, NOT overlapping the panel
  if (step === "place-first-person" && firstPerson) {
    return (
      <div className="absolute inset-0 z-30" style={{ pointerEvents: "none" }}>
        {/* ── Center: Obvious drop target ── */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-6" style={{ pointerEvents: "none" }}>
            {/* Pulsing target ring */}
            <div className="relative">
              <div className="w-48 h-48 rounded-full border-2 border-dashed border-red-500/20 flex items-center justify-center animate-pulse">
                <div className="w-32 h-32 rounded-full border-2 border-dashed border-red-500/10 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-red-500/20" />
                </div>
              </div>
              {/* Crosshair lines */}
              <div className="absolute top-1/2 left-0 w-full h-px bg-red-500/8" />
              <div className="absolute top-0 left-1/2 w-px h-full bg-red-500/8" />
            </div>

            {/* Drop zone label */}
            <div className="text-center">
              <h2 className="font-[family-name:var(--font-display)] text-4xl text-white/20 tracking-wider">
                DROP TARGET
              </h2>
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-white/10 uppercase tracking-[0.2em] mt-2">
                Drag person card here to begin
              </p>
            </div>
          </div>
        </div>

        {/* ── Right side: Floating card with arrow ── */}
        {/* Positioned absolutely, to the left of the right panel */}
        <div
          className="absolute flex items-center gap-5"
          style={{
            right: "340px", /* Right panel is w-80 (320px) + 20px gap */
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "auto",
          }}
        >
          {/* Animated arrow pointing left */}
          <div className="flex flex-col items-center gap-1.5 animate-bounce-left">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-red-500 drop-shadow-[0_0_8px_rgba(220,38,38,0.4)]">
              <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.2em] text-red-500/60">
              Drag
            </span>
          </div>

          {/* The person card */}
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(
                "application/board-item",
                JSON.stringify({ kind: "person", id: firstPerson.id })
              );
              e.dataTransfer.effectAllowed = "copy";
            }}
            className="group cursor-grab active:cursor-grabbing rounded-xl border-2 border-red-500/40 bg-[#0e0e0e] overflow-hidden shadow-2xl shadow-red-900/30 hover:shadow-red-600/40 hover:border-red-500/60 transition-all duration-300 hover:scale-105 active:scale-95"
            style={{ width: 220 }}
          >
            {/* Photo */}
            <div className="relative h-48 bg-[#080808] overflow-hidden">
              {firstPerson.imageUrl ? (
                <img
                  src={firstPerson.imageUrl}
                  alt={firstPerson.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-red-900/20">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0e0e0e] to-transparent" />

              {/* POI badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded bg-black/70 border border-red-900/40 px-2 py-1 backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase tracking-[0.15em] text-red-500/80">POI</span>
              </div>
            </div>

            {/* Info */}
            <div className="px-4 py-4">
              <h4 className="font-[family-name:var(--font-display)] text-2xl text-white tracking-wide leading-none">{firstPerson.name}</h4>
              <p className="mt-1.5 text-xs text-[#555]">Subject of the archive</p>
              <div className="mt-3 flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] text-red-400/60 uppercase tracking-[0.15em]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500/50">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Drag onto board
              </div>
            </div>
          </div>
        </div>

        {/* ── Step indicator — bottom center ── */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3" style={{ pointerEvents: "auto" }}>
          <div className="rounded-lg border border-[#222] bg-[#0a0a0a]/90 backdrop-blur-sm px-5 py-3 flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] text-[#666]">
              Step 1/{totalSteps}
            </span>
            <span className="text-[#333]">|</span>
            <span className="text-sm text-[#999]">
              Drag the card onto the board
            </span>
          </div>
          <button
            onClick={onSwitchToFree}
            className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[#333] hover:text-[#888] transition"
            style={{ pointerEvents: "auto" }}
          >
            Switch to Free Explore →
          </button>
        </div>
      </div>
    );
  }

  // ─── Standard step prompt ─────────────────────────────────────────────
  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30"
      style={{ pointerEvents: "auto" }}
    >
      <div className="rounded-xl border border-[#222] bg-[#0a0a0a]/95 backdrop-blur-md px-6 py-5 shadow-2xl max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] text-red-500/60">
            Step {stepIdx + 1}/{totalSteps}
          </span>
        </div>

        <h3 className="font-[family-name:var(--font-display)] text-2xl text-white tracking-wide leading-none">{stepConfig.title}</h3>
        <p className="mt-2 text-sm text-[#888] leading-relaxed">{stepConfig.instruction}</p>

        {stepConfig.hint && (
          <p className="mt-2 font-[family-name:var(--font-mono)] text-[10px] text-[#444] tracking-wide">{stepConfig.hint}</p>
        )}

        {/* Progress + Actions */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex gap-1.5">
            {STEP_ORDER.slice(0, -1).map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  completedSteps.has(s)
                    ? "w-5 bg-red-500"
                    : s === step
                    ? "w-5 bg-red-500/40"
                    : "w-1.5 bg-[#2a2a2a]"
                }`}
              />
            ))}
          </div>

          <div className="ml-auto flex gap-2">
            {showAdvanceBtn && (
              <button
                onClick={() => { setShowAdvanceBtn(false); onAdvance(); }}
                className="rounded-lg bg-red-600/20 border border-red-600/30 px-4 py-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-red-400 hover:bg-red-600/30 hover:text-red-300 transition animate-in"
              >
                Continue →
              </button>
            )}
            {(step === "add-note" || step === "classify-strength") && !showAdvanceBtn && (
              <button
                onClick={onSkip}
                className="rounded-lg border border-[#333] px-4 py-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-[#555] hover:text-white hover:border-[#555] transition"
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
