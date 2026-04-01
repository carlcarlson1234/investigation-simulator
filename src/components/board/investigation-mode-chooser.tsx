"use client";

import type { InvestigationMode } from "@/lib/investigation-types";

interface InvestigationModeChooserProps {
  onChoose: (mode: InvestigationMode) => void;
}

export function InvestigationModeChooser({ onChoose }: InvestigationModeChooserProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#030303]/98" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center max-w-xl w-full px-6">
        {/* Title */}
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-center leading-none">
          <span className="bg-gradient-to-r from-red-500 to-red-400 bg-clip-text text-transparent">
            Investigate
          </span>
          <br />
          <span className="text-white">Epstein</span>
        </h1>

        <p className="mt-5 text-lg text-[#888] text-center max-w-sm leading-relaxed">
          Explore seized emails, photos, and documents. Build connections. Follow leads.
        </p>

        {/* Buttons — stacked, clean */}
        <div className="mt-10 flex flex-col items-center gap-4 w-full max-w-xs">
          <button
            onClick={() => onChoose("start")}
            className="w-full h-14 rounded-lg bg-red-600 text-base font-black uppercase tracking-widest text-white shadow-xl shadow-red-600/25 transition hover:bg-red-700 hover:shadow-red-600/40 hover:scale-105 active:scale-100"
          >
            Start Investigation
          </button>
          <button
            onClick={() => onChoose("free")}
            className="w-full h-12 rounded-lg border border-[#333] text-sm font-bold uppercase tracking-widest text-[#888] transition hover:border-[#555] hover:text-white hover:scale-105"
          >
            Free Explore
          </button>
        </div>
      </div>
    </div>
  );
}
