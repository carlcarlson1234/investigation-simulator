"use client";

import type { InvestigationMode } from "@/lib/investigation-types";

interface InvestigationModeChooserProps {
  onChoose: (mode: InvestigationMode) => void;
  stats: { emailCount: number; documentCount: number; photoCount: number; personCount: number };
}

export function InvestigationModeChooser({ onChoose, stats }: InvestigationModeChooserProps) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#030303]/98" />
      <div className="absolute inset-0 pointer-events-none scanline-overlay" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full px-6">
        {/* Badge */}
        <div className="flex items-center gap-2 mb-6">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-red-500/60">
            Investigation Ready
          </span>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-center leading-tight">
          <span className="bg-gradient-to-r from-red-500 to-red-400 bg-clip-text text-transparent">
            Investigate
          </span>
          <span className="text-white"> The Files</span>
        </h1>

        <p className="mt-4 text-[15px] text-[#888] text-center max-w-md leading-relaxed">
          <span className="text-white font-bold">{stats.emailCount.toLocaleString()}</span> emails, {" "}
          <span className="text-white font-bold">{stats.documentCount.toLocaleString()}</span> documents, {" "}
          <span className="text-white font-bold">{stats.photoCount.toLocaleString()}</span> photos, {" "}
          <span className="text-white font-bold">{stats.personCount}</span> persons of interest.
        </p>

        {/* Action Cards */}
        <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full max-w-lg">
          {/* Primary: Start Investigation */}
          <button
            onClick={() => onChoose("start")}
            className="group flex-1 relative overflow-hidden rounded-xl border border-red-600/30 bg-gradient-to-b from-red-600/15 to-red-950/20 p-6 text-left transition-all hover:border-red-500/50 hover:shadow-xl hover:shadow-red-600/10 hover:scale-[1.02] active:scale-[0.99]"
          >
            {/* Glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-red-600/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />

            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600/20 border border-red-600/30">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-red-500/60">
                  Recommended
                </span>
              </div>

              <h3 className="text-lg font-black text-white tracking-wide">
                Start Investigation
              </h3>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#888]">
                Begin with starter leads and step-by-step guidance. Learn the evidence-processing workflow while building your first case cluster.
              </p>

              <div className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-red-400 group-hover:gap-2.5 transition-all">
                Begin
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>

          {/* Secondary: Free Explore */}
          <button
            onClick={() => onChoose("free")}
            className="group flex-1 rounded-xl border border-[#2a2a2a] bg-[#111] p-6 text-left transition-all hover:border-[#444] hover:bg-[#151515] hover:scale-[1.02] active:scale-[0.99]"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1a1a1a] border border-[#333]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#666]">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>

            <h3 className="text-lg font-black text-white tracking-wide">
              Free Explore
            </h3>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#888]">
              Open-ended investigation. Browse the full archive manually and build connections at your own pace.
            </p>

            <div className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#555] group-hover:text-[#999] group-hover:gap-2.5 transition-all">
              Explore
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
