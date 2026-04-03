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
  score: number;
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

export function InvestigationOverlay({
  step,
  autoDetected,
  onAdvance,
  onSwitchToFree,
  score,
}: InvestigationOverlayProps) {
  const [showAdvanceBtn, setShowAdvanceBtn] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const prevAutoRef = useRef(false);

  useEffect(() => {
    if (autoDetected && !prevAutoRef.current) {
      setJustCompleted(true);
      const timer = setTimeout(() => {
        setShowAdvanceBtn(true);
      }, 800);
      return () => clearTimeout(timer);
    }
    if (!autoDetected) {
      setShowAdvanceBtn(false);
      setJustCompleted(false);
    }
    prevAutoRef.current = autoDetected;
  }, [autoDetected]);

  // Auto-advance on detected completion
  useEffect(() => {
    if (autoDetected && justCompleted) {
      const timer = setTimeout(() => {
        onAdvance();
        setJustCompleted(false);
        setShowAdvanceBtn(false);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [autoDetected, justCompleted, onAdvance]);

  const stepIdx = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length - 1; // exclude open-investigation

  // ─── WELCOME SCREEN ─────────────────────────────────────────────────
  if (step === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]">
        {/* Background grid pattern */}
        <div className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: "radial-gradient(circle, #dc2626 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 text-center max-w-2xl px-8">
          {/* Classified stamp */}
          <div className="mb-8 inline-flex items-center gap-2 rounded border border-red-900/30 bg-red-950/20 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-[family-name:var(--font-mono)] text-xs font-bold uppercase tracking-[0.3em] text-red-500/80">
              Classified Investigation
            </span>
          </div>

          {/* Main title */}
          <h1 className="font-[family-name:var(--font-display)] text-6xl md:text-7xl text-white tracking-wider leading-tight mb-6">
            INVESTIGATE THE
            <br />
            <span className="text-red-500">REAL EPSTEIN FILES</span>
          </h1>

          <p className="text-lg text-[#666] mb-12 leading-relaxed max-w-lg mx-auto">
            Explore 1.7 million emails, 18,000+ photos, and thousands of documents from the public archive.
          </p>

          {/* Start button */}
          <button
            onClick={onAdvance}
            className="group relative inline-flex items-center gap-3 rounded-xl border-2 border-red-500/40 bg-red-600/10 px-10 py-4 font-[family-name:var(--font-display)] text-2xl text-white tracking-wider hover:bg-red-600/20 hover:border-red-500/60 transition-all duration-300 hover:scale-105"
          >
            <span>BEGIN INVESTIGATION</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400 group-hover:translate-x-1 transition-transform">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>

          {/* Free explore link */}
          <div className="mt-8">
            <button
              onClick={onSwitchToFree}
              className="font-[family-name:var(--font-mono)] text-[11px] text-[#444] hover:text-[#888] uppercase tracking-[0.2em] transition"
            >
              or explore freely →
            </button>
          </div>
        </div>

        {/* Decorative corner marks */}
        <div className="absolute top-6 left-6 w-8 h-8 border-l-2 border-t-2 border-red-900/30" />
        <div className="absolute top-6 right-6 w-8 h-8 border-r-2 border-t-2 border-red-900/30" />
        <div className="absolute bottom-6 left-6 w-8 h-8 border-l-2 border-b-2 border-red-900/30" />
        <div className="absolute bottom-6 right-6 w-8 h-8 border-r-2 border-b-2 border-red-900/30" />
      </div>
    );
  }

  // ─── INTRO: PEOPLE PANEL ────────────────────────────────────────────
  if (step === "intro-people") {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        {/* Dark overlay on left/center where panels aren't visible yet */}
        <div className="absolute inset-0 bg-black/60" />

        {/* Highlight box over right panel */}
        <div className="absolute right-0 top-12 bottom-0 w-[340px] bg-transparent ring-2 ring-red-500/30 ring-inset" />

        {/* Instruction card — center */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "auto" }}>
          <div className="max-w-md text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded bg-red-950/40 border border-red-900/30 px-3 py-1">
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-red-400/80 uppercase tracking-[0.2em]">
                Step {stepIdx + 1} of {totalSteps}
              </span>
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-4xl text-white tracking-wider mb-3">
              PEOPLE INDEX
            </h2>
            <p className="text-base text-[#888] mb-2">
              This panel lists every person identified in the archive files.
            </p>
            <p className="text-sm text-[#555] mb-8">
              You&apos;ll drag people from here onto the board.
            </p>
            {/* Arrow pointing right */}
            <div className="flex items-center justify-center gap-3 mb-8 text-red-500/60">
              <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.15em]">See the panel</span>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-bounce-right">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <button
              onClick={onAdvance}
              className="rounded-lg border border-red-500/30 bg-red-600/15 px-8 py-3 font-[family-name:var(--font-display)] text-lg text-white tracking-wider hover:bg-red-600/25 transition"
            >
              CONTINUE
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── INTRO: BOARD ───────────────────────────────────────────────────
  if (step === "intro-board") {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        {/* Light scrim */}
        <div className="absolute inset-0 bg-black/30" />

        {/* Instruction — center */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "auto" }}>
          <div className="max-w-lg text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded bg-red-950/40 border border-red-900/30 px-3 py-1">
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-red-400/80 uppercase tracking-[0.2em]">
                Step {stepIdx + 1} of {totalSteps}
              </span>
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-4xl text-white tracking-wider mb-3">
              THE INVESTIGATION BOARD
            </h2>
            <p className="text-base text-[#888] mb-8">
              This is your board — drag people and evidence here to map connections between them.
            </p>
            <button
              onClick={onAdvance}
              className="rounded-lg border border-red-500/30 bg-red-600/15 px-8 py-3 font-[family-name:var(--font-display)] text-lg text-white tracking-wider hover:bg-red-600/25 transition"
            >
              CONTINUE
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── PLACE EPSTEIN ──────────────────────────────────────────────────
  if (step === "place-epstein") {
    return (
      <StepInstructionCard
        stepIdx={stepIdx}
        totalSteps={totalSteps}
        headline="PLACE YOUR FIRST SUBJECT"
        sub="Drag the highlighted person from the right panel onto the board."
        score={score}
      />
    );
  }

  // ─── INTRO: EVIDENCE PANEL ──────────────────────────────────────────
  if (step === "intro-evidence") {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute inset-0 bg-black/30" />

        {/* Highlight box over left panel */}
        <div className="absolute left-0 top-12 bottom-0 w-[340px] bg-transparent ring-2 ring-red-500/30 ring-inset" />

        <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: "auto" }}>
          <div className="max-w-md text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded bg-red-950/40 border border-red-900/30 px-3 py-1">
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-red-400/80 uppercase tracking-[0.2em]">
                Step {stepIdx + 1} of {totalSteps}
              </span>
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-4xl text-white tracking-wider mb-3">
              EVIDENCE INBOX
            </h2>
            <p className="text-base text-[#888] mb-2">
              Emails, photos, and documents from the archive appear here.
            </p>
            <p className="text-sm text-[#555] mb-8">
              Drag evidence onto the board to support your connections.
            </p>
            <div className="flex items-center justify-center gap-3 mb-8 text-red-500/60">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-bounce rotate-180">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span className="font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.15em]">See the panel</span>
            </div>
            <button
              onClick={onAdvance}
              className="rounded-lg border border-red-500/30 bg-red-600/15 px-8 py-3 font-[family-name:var(--font-display)] text-lg text-white tracking-wider hover:bg-red-600/25 transition"
            >
              CONTINUE
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── PLACE EVIDENCE ─────────────────────────────────────────────────
  if (step === "place-evidence") {
    return (
      <StepInstructionCard
        stepIdx={stepIdx}
        totalSteps={totalSteps}
        headline="ADD EVIDENCE"
        sub="Drag a piece of evidence from the left panel onto the board."
        score={score}
      />
    );
  }

  // ─── PICK PERSON ────────────────────────────────────────────────────
  if (step === "pick-person") {
    return (
      <StepInstructionCard
        stepIdx={stepIdx}
        totalSteps={totalSteps}
        headline="ADD A PERSON OF INTEREST"
        sub="Pick someone from the right panel — who do you want to investigate?"
        score={score}
      />
    );
  }

  // ─── CREATE CONNECTION ──────────────────────────────────────────────
  if (step === "create-connection") {
    return (
      <StepInstructionCard
        stepIdx={stepIdx}
        totalSteps={totalSteps}
        headline="CONNECT THE DOTS"
        sub="Drag from the glowing handle on one card to another to create a connection."
        score={score}
      />
    );
  }

  // ─── CONNECTION CONFIRMED 🎉 ───────────────────────────────────────
  if (step === "connection-confirmed") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        {/* Green flash overlay */}
        <div className="absolute inset-0 bg-green-900/20 animate-pulse" />

        {/* Celebration card */}
        <div className="relative z-10 max-w-lg text-center animate-scale-in" style={{ pointerEvents: "auto" }}>
          <div className="rounded-2xl border-2 border-green-500/40 bg-[#0a0a0a]/95 backdrop-blur-md p-8 shadow-2xl shadow-green-900/30">
            {/* Success icon */}
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/15 border-2 border-green-500/30">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-400">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>

            <h2 className="font-[family-name:var(--font-display)] text-4xl text-green-400 tracking-wider mb-3">
              CONNECTION CONFIRMED
            </h2>

            <p className="text-lg text-[#999] mb-6">
              🎉 <strong className="text-green-300">50 other investigators</strong> have made this same connection!
            </p>

            {/* Points award */}
            <div className="inline-flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-6 py-3">
              <span className="text-2xl">🏆</span>
              <div className="text-left">
                <p className="font-[family-name:var(--font-mono)] text-xs text-green-400/70 uppercase tracking-[0.2em]">Points Earned</p>
                <p className="font-[family-name:var(--font-display)] text-3xl text-green-400 tracking-wider">+50</p>
              </div>
            </div>

            <p className="mt-6 font-[family-name:var(--font-mono)] text-[10px] text-[#555] uppercase tracking-[0.15em]">
              Continuing in a moment...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}

/* ─── Step Instruction Card (bottom overlay) ───────────────────────────────── */

function StepInstructionCard({
  stepIdx,
  totalSteps,
  headline,
  sub,
  score,
}: {
  stepIdx: number;
  totalSteps: number;
  headline: string;
  sub: string;
  score: number;
}) {
  return (
    <div
      className="absolute z-40"
      style={{
        bottom: 32,
        left: "50%",
        transform: "translateX(-50%)",
        pointerEvents: "auto",
      }}
    >
      <div className="w-[560px] rounded-2xl border border-[#222] bg-[#0a0a0a]/95 backdrop-blur-md p-6 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-red-500/70">
              Step {stepIdx + 1} / {totalSteps}
            </span>
          </div>
          {score > 0 && (
            <div className="flex items-center gap-1.5 rounded bg-green-500/10 border border-green-500/20 px-2 py-0.5">
              <span className="text-sm">🏆</span>
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-green-400 font-bold">{score} pts</span>
            </div>
          )}
        </div>
        <h3 className="font-[family-name:var(--font-display)] text-2xl text-white tracking-wider mb-1">
          {headline}
        </h3>
        <p className="text-sm text-[#888] leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}
