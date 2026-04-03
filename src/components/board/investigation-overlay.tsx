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
        sub="Find the highlighted card in the right panel"
        arrow="right"
        score={score}
      />
    );
  }

  // ─── PLACE EVIDENCE ─────────────────────────────────────────────────
  if (step === "place-evidence") {
    return (
      <StepCard
        headline="DRAG EVIDENCE ONTO THE BOARD"
        sub="Grab a photo or email from the left panel"
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
        sub="Drag someone from the right panel onto the board"
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
        sub="Drag from the glowing red handle on one card to another"
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

  // ─── TUTORIAL COMPLETE ──────────────────────────────────────────────
  if (step === "tutorial-complete") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div className="absolute inset-0 bg-black/40" />

        <div className="relative z-10 max-w-xl text-center" style={{ pointerEvents: "auto" }}>
          <div className="rounded-2xl border border-red-500/30 bg-[#050505]/95 backdrop-blur-xl p-10 shadow-[0_0_60px_rgba(220,38,38,0.15)]">
            <h2 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl text-white tracking-wider leading-tight mb-6">
              YOU&apos;RE AN <span className="text-red-500">INVESTIGATOR</span> NOW
            </h2>

            <div className="space-y-3 text-left max-w-md mx-auto mb-8">
              <p className="text-[15px] text-[#aaa] leading-relaxed">
                <span className="text-green-400 font-bold">Earn points</span> when others make the same connections you do — and when you confirm theirs.
              </p>
              <p className="text-[15px] text-[#aaa] leading-relaxed">
                <span className="text-red-400 font-bold">Bonus points</span> for discovering new connections that go viral.
              </p>
              <p className="text-[15px] text-[#888] leading-relaxed">
                There are millions of files. Most have never been seen.
              </p>
            </div>

            <button
              onClick={onAdvance}
              className="group inline-flex items-center gap-3 rounded-xl border-2 border-red-500/40 bg-red-600/10 px-10 py-4 font-[family-name:var(--font-display)] text-2xl text-white tracking-wider hover:bg-red-600/20 hover:border-red-500/60 transition-all duration-300 hover:scale-105"
            >
              <span>GO INVESTIGATE</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400 group-hover:translate-x-1 transition-transform">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
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
      {/* Large directional arrow */}
      {arrow === "right" && (
        <div
          className="fixed z-40 pointer-events-none animate-bounce-arrow"
          style={{ top: 200, right: 350 }}
        >
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{ filter: "drop-shadow(0 0 12px rgba(239,68,68,0.6))" }}>
            <path
              d="M20 60h70M65 25l30 35-30 35"
              stroke="#ef4444"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      {arrow === "left" && (
        <div
          className="fixed z-40 pointer-events-none animate-bounce-arrow-left"
          style={{ top: 200, left: 350 }}
        >
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none" style={{ filter: "drop-shadow(0 0 12px rgba(239,68,68,0.6))" }}>
            <path
              d="M100 60H30M55 25L25 60l30 35"
              stroke="#ef4444"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Instruction text — top area */}
      <div className="fixed z-40 pointer-events-none" style={{ top: 64, left: 0, right: 0 }}>
        <div className="flex justify-center px-8">
          <div className="rounded-2xl border border-red-500/30 bg-[#050505]/95 backdrop-blur-xl px-12 py-6 shadow-[0_0_40px_rgba(220,38,38,0.15)]">
            {score > 0 && (
              <div className="flex items-center justify-center gap-1.5 rounded bg-green-500/10 border border-green-500/20 px-3 py-1 mb-4 mx-auto w-fit">
                <span className="font-[family-name:var(--font-mono)] text-xs text-green-400 font-bold">{score} pts</span>
              </div>
            )}
            <h2 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl text-white tracking-wider leading-tight mb-3 text-center">
              {headline}
            </h2>
            <p className="text-lg text-[#888] leading-relaxed text-center">{sub}</p>
          </div>
        </div>
      </div>
    </>
  );
}
