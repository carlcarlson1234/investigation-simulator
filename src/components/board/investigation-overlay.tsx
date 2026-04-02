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

/* ──────────────────────────────────────────────────────────────────────────
 *  STEP-SPECIFIC DESCRIPTIONS — bigger, clearer, human-readable
 * ──────────────────────────────────────────────────────────────────────── */
const STEP_HEADLINES: Record<InvestigationStep, { headline: string; sub: string }> = {
  "place-first-person": {
    headline: "PLACE YOUR FIRST SUBJECT",
    sub: "Drag the person card onto the board to begin your investigation.",
  },
  "place-second-person": {
    headline: "ADD A SECOND PERSON",
    sub: "Drag a suggested person from the right panel onto the board.",
  },
  "create-link": {
    headline: "CONNECT TWO PEOPLE",
    sub: "Click one person, then click another to create a connection.",
  },
  "add-evidence": {
    headline: "ATTACH EVIDENCE",
    sub: "Drag an email or document from the left panel onto the board.",
  },
  "link-evidence": {
    headline: "LINK EVIDENCE TO A PERSON",
    sub: "Drag the evidence onto a person card to create a connection.",
  },
  "add-note": {
    headline: "ADD A NOTE",
    sub: "Click a connection line and type a note to record your observations.",
  },
  "classify-strength": {
    headline: "CLASSIFY STRENGTH",
    sub: "Rate the connection strength to indicate how strong the evidence is.",
  },
  "choose-expansion": {
    headline: "CHOOSE YOUR NEXT LEAD",
    sub: "Pick a direction to expand your investigation.",
  },
  "open-investigation": {
    headline: "INVESTIGATION OPEN",
    sub: "You now have full access. Follow leads and build your case.",
  },
};

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
  const headlines = STEP_HEADLINES[step];

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
        {/* Scrim to focus attention */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
        <div className="relative rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a]/98 backdrop-blur-md p-8 shadow-2xl max-w-lg w-full" style={{ pointerEvents: "auto" }}>
          <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] text-red-500/60">
            Step {stepIdx + 1}/{totalSteps}
          </span>
          <h3 className="font-[family-name:var(--font-display)] text-4xl text-white mt-2 mb-1 tracking-wide">{headlines.headline}</h3>
          <p className="text-sm text-[#888] mb-6">{headlines.sub}</p>

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
  if (step === "place-first-person" && firstPerson) {
    return (
      <div className="absolute inset-0 z-30" style={{ pointerEvents: "none" }}>
        {/* ── Light scrim over the board to focus attention ── */}
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />

        {/* ── Center: Obvious drop target ── */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-6" style={{ pointerEvents: "none" }}>
            {/* Pulsing target ring */}
            <div className="relative">
              <div className="w-56 h-56 rounded-full border-2 border-dashed border-red-500/25 flex items-center justify-center animate-pulse">
                <div className="w-36 h-36 rounded-full border-2 border-dashed border-red-500/15 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full bg-red-500/25" />
                </div>
              </div>
              {/* Crosshair lines */}
              <div className="absolute top-1/2 left-0 w-full h-px bg-red-500/10" />
              <div className="absolute top-0 left-1/2 w-px h-full bg-red-500/10" />
            </div>

            {/* Drop zone label */}
            <div className="text-center">
              <h2 className="font-[family-name:var(--font-display)] text-5xl text-white/15 tracking-wider">
                DROP HERE
              </h2>
            </div>
          </div>
        </div>

        {/* ── Right side: Floating card with arrow ── */}
        <div
          className="absolute flex items-center gap-5"
          style={{
            right: "340px",
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "auto",
          }}
        >
          {/* Animated arrow pointing left */}
          <div className="flex flex-col items-center gap-1.5 animate-bounce-left">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" className="text-red-500 drop-shadow-[0_0_12px_rgba(220,38,38,0.5)]">
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

        {/* ── LARGE instruction overlay — PRIMARY command on screen ── */}
        <StepInstructionOverlay
          stepIdx={stepIdx}
          totalSteps={totalSteps}
          headline={headlines.headline}
          sub={headlines.sub}
          showAdvanceBtn={showAdvanceBtn}
          onAdvance={() => { setShowAdvanceBtn(false); onAdvance(); }}
          onSwitchToFree={onSwitchToFree}
          justCompleted={justCompleted}
          completedSteps={completedSteps}
          step={step}
        />
      </div>
    );
  }

  // ─── Standard step (steps 2-7) ────────────────────────────────────────
  return (
    <div className="absolute inset-0 z-30" style={{ pointerEvents: "none" }}>
      {/* Light scrim over the board during non-panel steps */}
      {(step === "create-link" || step === "link-evidence" || step === "add-note" || step === "classify-strength") && (
        <div className="absolute inset-0 bg-black/15 pointer-events-none" />
      )}

      <StepInstructionOverlay
        stepIdx={stepIdx}
        totalSteps={totalSteps}
        headline={headlines.headline}
        sub={headlines.sub}
        showAdvanceBtn={showAdvanceBtn}
        onAdvance={() => { setShowAdvanceBtn(false); onAdvance(); }}
        onSwitchToFree={onSwitchToFree}
        onSkip={(step === "add-note" || step === "classify-strength") && !showAdvanceBtn ? onSkip : undefined}
        justCompleted={justCompleted}
        completedSteps={completedSteps}
        step={step}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  StepInstructionOverlay — the LARGE, primary step instruction card
 *  This is the main visual command on screen during each onboarding step.
 * ──────────────────────────────────────────────────────────────────────────── */

function StepInstructionOverlay({
  stepIdx,
  totalSteps,
  headline,
  sub,
  showAdvanceBtn,
  onAdvance,
  onSwitchToFree,
  onSkip,
  justCompleted,
  completedSteps,
  step,
}: {
  stepIdx: number;
  totalSteps: number;
  headline: string;
  sub: string;
  showAdvanceBtn: boolean;
  onAdvance: () => void;
  onSwitchToFree: () => void;
  onSkip?: (() => void) | undefined;
  justCompleted: boolean;
  completedSteps: Set<InvestigationStep>;
  step: InvestigationStep;
}) {
  return (
    <div
      className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 w-[560px] max-w-[90vw]"
      style={{ pointerEvents: "auto" }}
    >
      <div className="relative rounded-2xl border border-[#1a1a1a] bg-[#060606]/98 backdrop-blur-xl px-8 py-7 shadow-2xl shadow-black/50">
        {/* Ambient red glow at top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />

        {/* Step indicator row */}
        <div className="flex items-center gap-3 mb-4">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.2em] text-red-500/70">
            Step {stepIdx + 1} of {totalSteps}
          </span>
          {/* Progress dots */}
          <div className="ml-auto flex gap-1.5">
            {STEP_ORDER.slice(0, -1).map((s) => (
              <div
                key={s}
                className={`rounded-full transition-all duration-300 ${
                  completedSteps.has(s)
                    ? "w-4 h-1.5 bg-red-500"
                    : s === step
                    ? "w-4 h-1.5 bg-red-500/40"
                    : "w-1.5 h-1.5 bg-[#2a2a2a]"
                }`}
              />
            ))}
          </div>
        </div>

        {/* HEADLINE — the primary command */}
        <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,4vw,2.25rem)] text-white tracking-wide leading-[1.1]">
          {headline}
        </h2>

        {/* Instruction */}
        <p className="mt-3 text-base text-[#999] leading-relaxed">
          {sub}
        </p>

        {/* Action buttons */}
        <div className="mt-5 flex items-center gap-3">
          {showAdvanceBtn && (
            <button
              onClick={onAdvance}
              className="rounded-lg bg-red-600 px-5 py-2.5 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.15em] text-white shadow-lg shadow-red-600/20 hover:bg-red-500 hover:shadow-red-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Continue →
            </button>
          )}
          {onSkip && (
            <button
              onClick={onSkip}
              className="rounded-lg border border-[#333] px-5 py-2.5 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.15em] text-[#555] hover:text-white hover:border-[#555] transition"
            >
              Skip
            </button>
          )}
          <button
            onClick={onSwitchToFree}
            className="ml-auto font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[#333] hover:text-[#888] transition"
          >
            Free Explore →
          </button>
        </div>
      </div>

      {/* Completion flash */}
      {justCompleted && (
        <div className="absolute inset-0 rounded-2xl border-2 border-green-500/50 animate-ping pointer-events-none" />
      )}
    </div>
  );
}
