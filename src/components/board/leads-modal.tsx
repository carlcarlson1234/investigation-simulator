"use client";

import { useEffect } from "react";
import type { LeadDefinition } from "@/lib/lead-types";
import type { Person } from "@/lib/types";
import { MISSIONS } from "@/lib/missions";
import type { Mission } from "@/lib/missions";

interface LeadsModalProps {
  leads: LeadDefinition[];
  boardPeople: Person[];
  onClose: () => void;
  onEvidencePack: () => void;
  onFocusedInvestigation: (personId: string) => void;
  onStartMission?: (mission: Mission) => void;
}

export function LeadsModal({
  leads,
  boardPeople,
  onClose,
  onEvidencePack,
  onFocusedInvestigation,
  onStartMission,
}: LeadsModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const focusLead = leads.find((l) => l.type === "focused-investigation");
  const evidenceLead = leads.find((l) => l.type === "evidence-pack");

  return (
    <div className="leads-modal-enter fixed inset-0 z-[100] flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#030303]/98" />

      {/* Content */}
      <div className="relative z-10 flex flex-1 flex-col overflow-y-auto">
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between px-8 py-5">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-[13px] text-[#555] transition hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <span className="text-[11px] text-[#333]">ESC</span>
        </div>

        {/* Vertical stack */}
        <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-6 px-8 pb-10">
          {/* Missions — curated investigation scenarios */}
          {MISSIONS.length > 0 && (
            <div className="leads-card-enter rounded-2xl border border-[#2a2a2a] bg-[#111] p-8">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-4xl">🗂️</span>
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-[32px] leading-tight tracking-wide text-white">
                    Missions
                  </h2>
                  <p className="mt-1 text-[15px] leading-relaxed text-[#666]">
                    Curated investigations with real evidence packs. Start here.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {MISSIONS.map((mission) => (
                  <button
                    key={mission.id}
                    onClick={() => onStartMission?.(mission)}
                    className="group text-left rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-5 transition hover:border-[#E24B4A]/40 hover:bg-[#E24B4A]/5"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5">✈️</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-wide text-white group-hover:text-[#E24B4A] transition">
                          {mission.title}
                        </h3>
                        <p className="mt-0.5 text-[12px] text-[#777] font-[family-name:var(--font-mono)] uppercase tracking-wider">
                          {mission.subtitle}
                        </p>
                        <p className="mt-2 text-[13px] text-[#555] leading-relaxed line-clamp-3">
                          {mission.description}
                        </p>
                        <div className="mt-3 flex items-center gap-3 text-[10px] text-[#444] font-[family-name:var(--font-mono)] uppercase tracking-wider">
                          <span className={`rounded-full px-2 py-0.5 border ${
                            mission.difficulty === "introductory"
                              ? "border-green-500/30 text-green-400/80"
                              : mission.difficulty === "intermediate"
                              ? "border-amber-500/30 text-amber-400/80"
                              : "border-red-500/30 text-red-400/80"
                          }`}>
                            {mission.difficulty}
                          </span>
                          <span>~{mission.estimatedMinutes} min</span>
                          <span>{mission.allEvidenceIds.length} evidence items</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}

                {/* Coming Soon placeholder */}
                <div className="rounded-xl border border-dashed border-[#222] bg-[#0a0a0a]/50 p-5 flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-2xl opacity-30">🔒</span>
                    <p className="mt-2 text-[12px] text-[#333] font-[family-name:var(--font-mono)] uppercase tracking-wider">
                      More missions coming soon
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Focused Investigation — takes up most of the space */}
          {focusLead && (
            <div className="leads-card-enter flex-1 rounded-2xl border border-[#2a2a2a] bg-[#111] p-8">
              <div className="flex items-center gap-4">
                <span className="text-4xl">🔍</span>
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-[32px] leading-tight tracking-wide text-white">
                    {focusLead.title}
                  </h2>
                  <p className="mt-1 text-[15px] leading-relaxed text-[#666]">
                    {focusLead.description}
                  </p>
                </div>
              </div>

              {/* Person picker — big photos */}
              {boardPeople.length > 0 ? (
                <div className="mt-8">
                  <p className="mb-4 font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.12em] text-[#555]">
                    Choose a subject
                  </p>
                  <div className="flex flex-wrap gap-5">
                    {boardPeople.map((person) => (
                      <button
                        key={person.id}
                        onClick={() => onFocusedInvestigation(person.id)}
                        className="group flex flex-col items-center gap-3 rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] p-4 transition hover:border-[#E24B4A]/40 hover:bg-[#E24B4A]/5"
                      >
                        {person.imageUrl ? (
                          <img
                            src={person.imageUrl}
                            alt={person.name}
                            className="h-24 w-24 rounded-full border-2 border-[#333] object-cover transition group-hover:border-[#E24B4A]/50"
                          />
                        ) : (
                          <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#333] bg-[#1a1a1a] text-3xl">
                            👤
                          </div>
                        )}
                        <span className="text-center font-[family-name:var(--font-display)] text-[14px] leading-tight tracking-wide text-white/80 group-hover:text-white">
                          {person.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-8 text-center text-[14px] text-[#444]">
                  Add people to your board first
                </p>
              )}
            </div>
          )}

          {/* Evidence Pack — smaller, below */}
          {evidenceLead && (
            <div className="leads-card-enter shrink-0 rounded-2xl border border-[#2a2a2a] bg-[#111] p-6" style={{ animationDelay: "0.06s" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-3xl">📦</span>
                  <div>
                    <h2 className="font-[family-name:var(--font-display)] text-[24px] leading-tight tracking-wide text-white">
                      {evidenceLead.title}
                    </h2>
                    <p className="mt-0.5 text-[13px] text-[#666]">
                      {evidenceLead.description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onEvidencePack}
                  className="shrink-0 rounded-xl border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-8 py-3 font-[family-name:var(--font-mono)] text-[12px] font-bold uppercase tracking-[0.1em] text-[#E24B4A] transition hover:border-[#E24B4A]/50 hover:bg-[#E24B4A]/20"
                >
                  Follow Lead
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
