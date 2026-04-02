"use client";

import type { InvestigationMode } from "@/lib/investigation-types";

interface InvestigationModeChooserProps {
  onChoose: (mode: InvestigationMode) => void;
}

export function InvestigationModeChooser({ onChoose }: InvestigationModeChooserProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center vignette-red noise-overlay">
      {/* Deep noir background */}
      <div className="absolute inset-0 bg-[#040404]" />

      {/* Subtle animated red accent glow */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-[0.04] blur-3xl"
        style={{
          background: "radial-gradient(circle, #dc2626 0%, transparent 70%)",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Content — sits above vignette */}
      <div className="relative z-10 flex flex-col items-center max-w-xl w-full px-6">
        {/* Classified stamp watermark */}
        <div className="absolute -top-16 right-0 rotate-[-8deg] opacity-[0.04] select-none pointer-events-none">
          <span className="font-[family-name:var(--font-display)] text-[120px] text-red-500 leading-none tracking-wide">
            CLASSIFIED
          </span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3 mb-8">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[11px] font-medium uppercase tracking-[0.3em] text-red-500/50">
            Case File Active
          </span>
        </div>

        {/* Title — Bebas Neue display font */}
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(4rem,10vw,7rem)] leading-[0.85] tracking-[0.02em] text-center select-none">
          <span className="text-red-500">INVESTIGATE</span>
          <br />
          <span className="text-white">EPSTEIN</span>
        </h1>

        {/* Horizontal rule with dot */}
        <div className="flex items-center gap-4 mt-6 mb-6 w-full max-w-xs">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-red-900/30" />
          <div className="h-1.5 w-1.5 rounded-full bg-red-600/40" />
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-red-900/30" />
        </div>

        <p className="text-[15px] text-[#777] text-center max-w-sm leading-relaxed tracking-wide">
          Explore seized emails, photos, and documents.<br />
          Build connections. Follow leads.
        </p>

        {/* CTA Buttons */}
        <div className="mt-12 flex flex-col items-center gap-4 w-full max-w-xs">
          <button
            onClick={() => onChoose("start")}
            className="group w-full h-14 rounded-lg bg-red-600 text-[15px] font-black uppercase tracking-[0.2em] text-white shadow-2xl shadow-red-600/20 transition-all duration-300 hover:bg-red-500 hover:shadow-red-500/30 hover:scale-[1.03] active:scale-[0.98] relative overflow-hidden"
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <span className="relative">Begin Investigation</span>
          </button>

          <button
            onClick={() => onChoose("free")}
            className="w-full h-12 rounded-lg border border-[#2a2a2a] text-[13px] font-bold uppercase tracking-[0.2em] text-[#555] transition-all duration-300 hover:border-[#444] hover:text-[#aaa] hover:bg-white/[0.02] hover:scale-[1.02]"
          >
            Free Explore
          </button>
        </div>

        {/* Subtle bottom quote */}
        <p className="mt-16 font-[family-name:var(--font-mono)] text-[10px] text-[#333] uppercase tracking-[0.25em] text-center">
          1.7M+ emails &middot; 18K+ photos &middot; 474 persons of interest
        </p>
      </div>
    </div>
  );
}
