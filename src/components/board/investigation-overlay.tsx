"use client";

import { useEffect, useRef, useState } from "react";
import type { InvestigationStep } from "@/lib/investigation-types";

interface InvestigationOverlayProps {
  step: InvestigationStep;
  autoDetected: boolean;
  onAdvance: () => void;
  onSkip: () => void;
  onSwitchToFree: () => void;
  score: number;
  [key: string]: unknown;
}

export function InvestigationOverlay({
  step,
  autoDetected,
  onAdvance,
  score,
}: InvestigationOverlayProps) {
  const [justCompleted, setJustCompleted] = useState(false);
  const prevAutoRef = useRef(false);

  useEffect(() => {
    if (autoDetected && !prevAutoRef.current) {
      setJustCompleted(true);
    }
    if (!autoDetected) {
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
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [autoDetected, justCompleted, onAdvance]);

  // ─── PLACE EPSTEIN ──────────────────────────────────────────────────
  if (step === "place-epstein") {
    return (
      <StepCard
        headline="DRAG EPSTEIN ONTO THE BOARD"
        sub="Find the highlighted card in the right panel and drag it here."
        arrow="right"
        score={score}
      />
    );
  }

  // ─── PLACE EVIDENCE ─────────────────────────────────────────────────
  if (step === "place-evidence") {
    return (
      <StepCard
        headline="ADD EVIDENCE"
        sub="Drag a piece of evidence from the left panel onto the board."
        arrow="left"
        score={score}
      />
    );
  }

  // ─── PICK PERSON ────────────────────────────────────────────────────
  if (step === "pick-person") {
    return (
      <StepCard
        headline="ADD A PERSON OF INTEREST"
        sub="Drag someone from the right panel onto the board."
        arrow="right"
        score={score}
      />
    );
  }

  // ─── CREATE CONNECTION ──────────────────────────────────────────────
  if (step === "create-connection") {
    return (
      <StepCard
        headline="CONNECT THE DOTS"
        sub="Drag from the glowing red handle on one card to another."
        score={score}
      />
    );
  }

  // ─── CONNECTION CONFIRMED ──────────────────────────────────────────
  if (step === "connection-confirmed") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        {/* Green flash overlay */}
        <div className="absolute inset-0 bg-green-900/20 animate-pulse" />

        {/* Celebration card */}
        <div className="relative z-10 max-w-lg text-center animate-scale-in" style={{ pointerEvents: "auto" }}>
          <div className="rounded-2xl border-2 border-green-500/40 bg-[#060606]/95 backdrop-blur-md p-8 shadow-2xl shadow-green-900/30">
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
              <strong className="text-green-300">50 other investigators</strong> made this same connection
            </p>

            {/* Points award */}
            <div className="inline-flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-6 py-3">
              <div className="text-center">
                <p className="font-[family-name:var(--font-mono)] text-xs text-green-400/70 uppercase tracking-[0.2em]">Points Earned</p>
                <p className="font-[family-name:var(--font-display)] text-3xl text-green-400 tracking-wider">+50</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/* ─── Step Instruction Card with directional arrow ────────────────────────── */

function StepCard({
  headline,
  sub,
  arrow,
  score,
}: {
  headline: string;
  sub: string;
  arrow?: "left" | "right";
  score: number;
}) {
  return (
    <>
      {/* Directional arrow overlay */}
      {arrow && (
        <div
          className="fixed z-40 pointer-events-none"
          style={{
            top: "50%",
            transform: "translateY(-50%)",
            ...(arrow === "right" ? { right: 356 } : { left: 356 }),
          }}
        >
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            fill="none"
            className="animate-bounce-arrow"
            style={{ transform: arrow === "left" ? "scaleX(-1)" : undefined }}
          >
            <path
              d="M15 40h45M45 20l20 20-20 20"
              stroke="#ef4444"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.7"
            />
          </svg>
        </div>
      )}

      {/* Instruction card at bottom center */}
      <div
        className="absolute z-40 pointer-events-none"
        style={{
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <div className="w-[480px] rounded-xl border border-[#1a1a1a] bg-[#060606]/95 backdrop-blur-md px-6 py-4 shadow-2xl shadow-black/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-red-500/60">
                Tutorial
              </span>
            </div>
            {score > 0 && (
              <div className="flex items-center gap-1.5 rounded bg-green-500/10 border border-green-500/20 px-2 py-0.5">
                <span className="font-[family-name:var(--font-mono)] text-[10px] text-green-400 font-bold">{score} pts</span>
              </div>
            )}
          </div>
          <h3 className="font-[family-name:var(--font-display)] text-xl text-white tracking-wider mb-1">
            {headline}
          </h3>
          <p className="text-sm text-[#777] leading-relaxed">{sub}</p>
        </div>
      </div>
    </>
  );
}
