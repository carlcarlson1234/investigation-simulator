"use client";

import { useState, useEffect, useCallback } from "react";
import type { Mission, MissionContextCard } from "@/lib/missions";
import type { SearchResult } from "@/lib/types";
import {
  EVIDENCE_TYPE_ICON,
  EVIDENCE_TYPE_LABEL,
} from "@/lib/board-types";

// ─── Mission Phase ──────────────────────────────────────────────────────────

export type MissionPhase =
  | "drag-event"      // waiting for player to drop the event on the board
  | "context-cards"   // showing news context cards one at a time
  | "evidence-pack"   // unwrapping + examining the evidence pack
  | "investigate"     // player is freely building the board
  | "complete";       // investigation finished

interface MissionOverlayProps {
  mission: Mission;
  phase: MissionPhase;
  onPhaseComplete: (nextPhase: MissionPhase) => void;
  onAddEvidence: (result: SearchResult) => void;
}

export function MissionOverlay({
  mission,
  phase,
  onPhaseComplete,
  onAddEvidence,
}: MissionOverlayProps) {
  if (phase === "context-cards") {
    return (
      <ContextCardsPhase
        cards={mission.contextCards}
        onComplete={() => onPhaseComplete("evidence-pack")}
      />
    );
  }

  if (phase === "evidence-pack") {
    return (
      <EvidencePackPhase
        mission={mission}
        onComplete={() => onPhaseComplete("investigate")}
        onAddEvidence={onAddEvidence}
      />
    );
  }

  return null;
}

// ─── Context Cards Phase ────────────────────────────────────────────────────
// Shows each context card one at a time with a fade/slide animation.
// Player clicks "Next" or the card to advance. After the last card,
// transitions to the evidence pack phase.

function ContextCardsPhase({
  cards,
  onComplete,
}: {
  cards: MissionContextCard[];
  onComplete: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    setEntering(true);
    const t = setTimeout(() => setEntering(false), 50);
    return () => clearTimeout(t);
  }, [currentIndex]);

  const advance = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      onComplete();
    }
  }, [currentIndex, cards.length, onComplete]);

  // Keyboard: Enter or Space to advance
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advance]);

  const card = cards[currentIndex];
  if (!card) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div
        className={`relative max-w-[640px] w-full mx-6 transition-all duration-500 ${
          entering ? "opacity-0 translate-y-8 scale-95" : "opacity-100 translate-y-0 scale-100"
        }`}
      >
        {/* Card count */}
        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-[0.15em] text-[#555]">
            Intelligence Briefing
          </span>
          <span className="text-[10px] font-[family-name:var(--font-mono)] text-[#444] tabular-nums">
            {currentIndex + 1} / {cards.length}
          </span>
        </div>

        {/* The card itself */}
        <div
          className="rounded-2xl border border-[#E24B4A]/30 bg-gradient-to-b from-[#1a0a0a] to-[#0a0505] p-8 shadow-2xl shadow-black/80 cursor-pointer"
          onClick={advance}
        >
          {/* Red accent line at top */}
          <div className="w-16 h-1 rounded-full bg-[#E24B4A]/60 mb-6" />

          <h2 className="font-[family-name:var(--font-display)] text-[28px] tracking-wide text-white mb-4">
            {card.title}
          </h2>

          <p className="text-[16px] leading-relaxed text-[#ccc]">
            {card.body}
          </p>

          {/* Source attribution */}
          <div className="mt-6 flex items-center gap-2">
            <span className="text-[10px] text-[#555]">Source:</span>
            <a
              href={card.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[#E24B4A]/70 hover:text-[#E24B4A] transition underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {card.sourceLabel}
            </a>
          </div>
        </div>

        {/* Continue button */}
        <div className="flex justify-center mt-6">
          <button
            onClick={advance}
            className="flex items-center gap-3 rounded-xl border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-8 py-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#E24B4A] transition hover:bg-[#E24B4A]/20 hover:border-[#E24B4A]/50"
          >
            {currentIndex < cards.length - 1 ? "Continue" : "Open Evidence Pack"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Skip option */}
        <div className="flex justify-center mt-3">
          <button
            onClick={onComplete}
            className="text-[11px] text-[#444] hover:text-[#888] transition"
          >
            Skip briefing →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Evidence Pack Phase ────────────────────────────────────────────────────
// Sealed envelope → unwrap → cards fan out → player examines each → starts
// investigating.

type PackState = "sealed" | "unwrapping" | "cards" | "examining";

function EvidencePackPhase({
  mission,
  onComplete,
  onAddEvidence,
}: {
  mission: Mission;
  onComplete: () => void;
  onAddEvidence: (result: SearchResult) => void;
}) {
  const [packState, setPackState] = useState<PackState>("sealed");
  const [examinedIds, setExaminedIds] = useState<Set<string>>(new Set());
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // Build the evidence cards from the mission's core + context tiers
  const evidenceCards = buildEvidenceCards(mission);

  const handleUnseal = () => {
    setPackState("unwrapping");
    setTimeout(() => setPackState("cards"), 800);
  };

  const handleExamine = (id: string) => {
    setSelectedCard(id);
    setExaminedIds((prev) => new Set(prev).add(id));
  };

  const handleAddToBoard = (card: EvidenceCard) => {
    onAddEvidence({
      id: card.id,
      type: card.type,
      title: card.title,
      snippet: card.snippet,
      date: card.date,
      sender: card.sender,
      score: 0,
      starCount: 0,
    });
    setSelectedCard(null);
  };

  // Sealed state
  if (packState === "sealed") {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-6">
          <p className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-[0.2em] text-[#E24B4A]/60">
            Evidence Pack
          </p>
          <button
            onClick={handleUnseal}
            className="group relative"
          >
            {/* Sealed envelope */}
            <div className="w-64 h-44 rounded-xl border-2 border-[#E24B4A]/40 bg-gradient-to-br from-[#1a0a08] to-[#0a0505] flex flex-col items-center justify-center gap-3 transition-all duration-300 group-hover:border-[#E24B4A]/70 group-hover:shadow-[0_0_60px_-10px_rgba(226,75,74,0.5)] group-hover:scale-105">
              <span className="text-6xl">📁</span>
              <span className="text-[11px] font-black uppercase tracking-[0.15em] text-[#E24B4A]/80">
                Classified
              </span>
            </div>
            {/* Pulse ring */}
            <div className="absolute inset-0 rounded-xl border-2 border-[#E24B4A]/30 animate-ping" style={{ animationDuration: "2s" }} />
          </button>
          <p className="text-[14px] text-[#888]">Click to open the evidence pack</p>
        </div>
      </div>
    );
  }

  // Unwrapping animation
  if (packState === "unwrapping") {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="w-64 h-44 rounded-xl border-2 border-[#E24B4A]/60 bg-gradient-to-br from-[#1a0a08] to-[#0a0505] flex items-center justify-center animate-pulse">
            <span className="text-5xl">📂</span>
          </div>
          <p className="text-[12px] text-[#E24B4A] animate-pulse font-[family-name:var(--font-mono)] uppercase tracking-wider">
            Unsealing...
          </p>
        </div>
      </div>
    );
  }

  // Examining a specific card
  if (selectedCard) {
    const card = evidenceCards.find((c) => c.id === selectedCard);
    if (card) {
      return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6">
          <div className="relative max-w-[600px] w-full rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a] shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-start gap-3">
              <span className="text-[18px]">{EVIDENCE_TYPE_ICON[card.type]}</span>
              <div className="flex-1 min-w-0">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#666]">
                  {EVIDENCE_TYPE_LABEL[card.type]}
                </span>
                <h3 className="text-[16px] font-bold text-white leading-tight mt-0.5">{card.title}</h3>
                {card.date && <p className="text-[11px] text-[#555] tabular-nums mt-0.5">{card.date}</p>}
                {card.sender && <p className="text-[11px] text-[#777] mt-0.5">{card.sender}</p>}
              </div>
            </div>

            {/* Preview content */}
            <div className="px-6 py-5 max-h-[400px] overflow-y-auto">
              {card.type === "photo" && (
                <img
                  src={`https://assets.getkino.com/cdn-cgi/image/width=500,quality=80,format=auto/photos-deboned/${card.id}`}
                  alt={card.title}
                  className="w-full rounded-lg"
                />
              )}
              {card.snippet && (
                <p className="text-[13px] leading-relaxed text-[#ccc] whitespace-pre-wrap">
                  {card.snippet}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="border-t border-[#1a1a1a] px-6 py-4 flex items-center gap-3">
              <button
                onClick={() => handleAddToBoard(card)}
                className="flex-1 rounded-lg bg-[#E24B4A]/15 border border-[#E24B4A]/30 py-2.5 text-[12px] font-bold uppercase tracking-wider text-[#E24B4A] hover:bg-[#E24B4A]/25 transition"
              >
                + Add to Board
              </button>
              <button
                onClick={() => setSelectedCard(null)}
                className="rounded-lg bg-[#1a1a1a] border border-[#333] px-6 py-2.5 text-[12px] font-bold text-[#888] hover:text-white transition"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // Cards fanned out
  return (
    <div className="fixed inset-0 z-[150] flex flex-col bg-black/85 backdrop-blur-sm">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 py-5">
        <div>
          <p className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-[0.2em] text-[#E24B4A]/60">
            Evidence Pack · {evidenceCards.length} items
          </p>
          <p className="text-[12px] text-[#666] mt-1">
            Examine each piece. Add what matters to your board.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-[#555] tabular-nums font-[family-name:var(--font-mono)]">
            {examinedIds.size} / {evidenceCards.length} examined
          </span>
          <button
            onClick={onComplete}
            className="rounded-xl border border-green-500/30 bg-green-500/10 px-6 py-2.5 text-[12px] font-bold uppercase tracking-wider text-green-400 hover:bg-green-500/20 transition"
          >
            Start Investigating →
          </button>
        </div>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-8 pb-10">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {evidenceCards.map((card, i) => {
            const examined = examinedIds.has(card.id);
            const isPhoto = card.type === "photo";
            return (
              <button
                key={card.id}
                onClick={() => handleExamine(card.id)}
                className={`group relative rounded-xl border overflow-hidden transition-all duration-300 text-left ${
                  examined
                    ? "border-[#333] bg-[#0a0a0a] opacity-60"
                    : "border-[#E24B4A]/20 bg-gradient-to-b from-[#1a0808] to-[#0a0505] hover:border-[#E24B4A]/50 hover:scale-[1.03] hover:shadow-[0_0_30px_-5px_rgba(226,75,74,0.3)]"
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {/* Thumbnail area */}
                <div className="aspect-[4/3] bg-[#0a0505] flex items-center justify-center overflow-hidden">
                  {isPhoto ? (
                    <img
                      src={`https://assets.getkino.com/cdn-cgi/image/width=200,quality=70,format=auto/photos-deboned/${card.id}`}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <span className="text-4xl opacity-40 group-hover:opacity-70 transition">
                      {EVIDENCE_TYPE_ICON[card.type]}
                    </span>
                  )}
                </div>

                {/* Label */}
                <div className="px-2 py-1.5">
                  <p className="text-[9px] text-[#888] line-clamp-2 leading-tight">
                    {card.title}
                  </p>
                </div>

                {/* Examined badge */}
                {examined && (
                  <div className="absolute top-1.5 right-1.5 rounded-full bg-green-500/20 border border-green-500/40 w-5 h-5 flex items-center justify-center">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Evidence Card Helpers ──────────────────────────────────────────────────

interface EvidenceCard {
  id: string;
  type: "email" | "document" | "photo" | "imessage" | "flight_log" | "video";
  title: string;
  snippet: string;
  date: string | null;
  sender: string | null;
  tier: "core" | "context" | "ambiguous" | "redHerring";
}

function buildEvidenceCards(mission: Mission): EvidenceCard[] {
  const cards: EvidenceCard[] = [];
  const pack = mission.evidencePack;

  function addTier(
    tier: "core" | "context" | "ambiguous" | "redHerring",
    data: typeof pack.core,
  ) {
    for (const id of data.emails) {
      cards.push({ id, type: "email", title: id, snippet: "", date: null, sender: null, tier });
    }
    for (const id of data.photos) {
      // Strip extension for display
      const cleanId = id.replace(/\.\w+$/, "");
      cards.push({ id, type: "photo", title: cleanId, snippet: "", date: null, sender: null, tier });
    }
    for (const id of data.flights) {
      cards.push({ id, type: "flight_log", title: id, snippet: "", date: null, sender: null, tier });
    }
    for (const id of data.documents) {
      cards.push({ id, type: "document", title: id, snippet: "", date: null, sender: null, tier });
    }
    for (const id of data.videos) {
      cards.push({ id, type: "video", title: id, snippet: "", date: null, sender: null, tier });
    }
  }

  addTier("core", pack.core);
  addTier("context", pack.context);
  addTier("ambiguous", pack.ambiguous);
  addTier("redHerring", pack.redHerring);

  // Shuffle so tiers are mixed — player can't tell which is which
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return cards;
}
