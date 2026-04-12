"use client";

import { useEffect } from "react";
import { MISSIONS } from "@/lib/missions";
import type { Mission } from "@/lib/missions";

interface LeadsModalProps {
  onClose: () => void;
  onStartMission: (mission: Mission) => void;
}

// Thumbnail paths for the key people in each investigation.
// Person images live at /people-thumbnails/{id}.{ext}.
const PERSON_THUMBS: Record<string, { src: string; name: string }> = {
  "jeffrey-epstein": { src: "/people-thumbnails/jeffrey-epstein.avif", name: "Jeffrey Epstein" },
  "ghislaine-maxwell": { src: "/people-thumbnails/ghislaine-maxwell.png", name: "Ghislaine Maxwell" },
  "bill-clinton": { src: "/people-thumbnails/bill-clinton.png", name: "Bill Clinton" },
  "kevin-spacey": { src: "/people-thumbnails/kevin-spacey.png", name: "Kevin Spacey" },
  "chris-tucker": { src: "/people-thumbnails/chris-tucker.png", name: "Chris Tucker" },
};

export function LeadsModal({ onClose, onStartMission }: LeadsModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="leads-modal-enter fixed inset-0 z-[100] flex flex-col">
      {/* Backdrop — near-black */}
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

        {/* Header */}
        <div className="text-center px-8 mb-8">
          <h1 className="font-[family-name:var(--font-display)] text-[42px] tracking-[0.1em] text-white uppercase">
            Investigations
          </h1>
          <p className="mt-2 text-[14px] text-[#555]">
            Choose a case. Examine the evidence. Build the board.
          </p>
        </div>

        {/* Investigation cards */}
        <div className="mx-auto flex w-full max-w-[800px] flex-col gap-8 px-8 pb-16">
          {MISSIONS.map((mission) => (
            <InvestigationCard
              key={mission.id}
              mission={mission}
              onStart={() => onStartMission(mission)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function InvestigationCard({
  mission,
  onStart,
}: {
  mission: Mission;
  onStart: () => void;
}) {
  const people = mission.suggestedPeople
    .map((id) => PERSON_THUMBS[id])
    .filter(Boolean);

  // Use the event entity image as the cover
  // The Africa trip is event-09 → /entity-images/event-09.jpg
  const eventImageMap: Record<string, string> = {
    "africa-trip-2002": "/entity-images/event-09.jpg",
  };
  const coverImage = eventImageMap[mission.id] ?? null;

  return (
    <button
      onClick={onStart}
      className="leads-card-enter group relative w-full rounded-2xl border border-[#E24B4A]/20 bg-gradient-to-b from-[#1a0808] to-[#0a0505] overflow-hidden transition hover:border-[#E24B4A]/50 hover:shadow-[0_0_60px_-10px_rgba(226,75,74,0.3)] text-left"
    >
      {/* Cover image — the event entity photo */}
      {coverImage && (
        <div className="relative w-full h-56 overflow-hidden">
          <img
            src={coverImage}
            alt={mission.title}
            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity duration-500 group-hover:scale-[1.03] transition-transform"
          />
          {/* Dark gradient over image */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0a0505]" />
          {/* Red vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#E24B4A]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>
      )}

      {/* Title + description */}
      <div className="px-8 pt-4 pb-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#E24B4A]/60 mb-2 font-[family-name:var(--font-mono)]">
          {mission.subtitle}
        </p>
        <h2
          className="font-[family-name:var(--font-display)] text-[36px] leading-[0.95] tracking-wide text-white group-hover:text-[#E24B4A] transition-colors duration-300"
        >
          {mission.title}
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-[#777] max-w-[600px]">
          {mission.description}
        </p>
      </div>

      {/* People semicircle */}
      {people.length > 0 && (
        <div className="px-8 pt-4 pb-6">
          <div className="flex items-end justify-center gap-1">
            {people.map((person, i) => {
              // Create a gentle arc: items at edges are slightly lower
              const center = (people.length - 1) / 2;
              const dist = Math.abs(i - center);
              const yOffset = dist * dist * 4; // quadratic curve

              return (
                <div
                  key={person.name}
                  className="flex flex-col items-center gap-1.5 transition-transform duration-300 group-hover:translate-y-[-4px]"
                  style={{
                    transform: `translateY(${yOffset}px)`,
                    transitionDelay: `${i * 40}ms`,
                  }}
                >
                  <div className="relative">
                    <img
                      src={person.src}
                      alt={person.name}
                      className="w-24 h-24 rounded-full border-2 border-[#333] object-cover grayscale group-hover:grayscale-0 transition-all duration-500 shadow-lg shadow-black/50"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                    {/* Red ring on hover */}
                    <div className="absolute inset-0 rounded-full border-2 border-[#E24B4A]/0 group-hover:border-[#E24B4A]/60 transition-all duration-500" />
                  </div>
                  <span className="text-[10px] text-[#555] group-hover:text-[#999] transition-colors font-[family-name:var(--font-mono)] uppercase tracking-wider whitespace-nowrap">
                    {person.name.split(" ").pop()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom accent line */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-[#E24B4A]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </button>
  );
}
