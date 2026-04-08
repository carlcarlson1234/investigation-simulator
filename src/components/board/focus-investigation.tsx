"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { Person, SearchResult } from "@/lib/types";
import type { BoardNode, BoardConnection, BoardPersonNode } from "@/lib/board-types";
import type { FocusEvidenceItem } from "@/app/api/focus-evidence/route";
import { useBoardSounds } from "@/hooks/use-board-sounds";

// ─── Types ──────────────────────────────────────────────────────────────────

type EvidenceState = "unexamined" | "connected" | "dismissed" | "uncertain";

interface FocusEvidence {
  item: FocusEvidenceItem;
  state: EvidenceState;
  /** Position in the orbit around the person */
  angle: number;
  /** Distance from center */
  radius: number;
  /** Is the card expanded for reading? */
  expanded: boolean;
}

interface FocusInvestigationProps {
  person: Person;
  /** Existing board state for context */
  existingNodes: BoardNode[];
  existingConnections: BoardConnection[];
  /** Called when investigation completes — returns new connections + evidence to add */
  onComplete: (result: InvestigationResult) => void;
  /** Called to exit without completing */
  onExit: () => void;
}

export interface InvestigationResult {
  personId: string;
  /** Evidence that was connected to the person */
  connectedEvidence: SearchResult[];
  /** Evidence that was dismissed */
  dismissedEvidence: SearchResult[];
  /** Evidence marked uncertain (for follow-up) */
  uncertainEvidence: SearchResult[];
  /** New BoardConnections to add to the main board */
  newConnections: BoardConnection[];
  /** Stats for the summary screen */
  stats: {
    connectionsCreated: number;
    evidenceDismissed: number;
    markedUncertain: number;
    pointsEarned: number;
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ORBIT_RADIUS_BASE = 280;
const ORBIT_RADIUS_VARIANCE = 60;
const PERSON_SIZE = 300;
const EVIDENCE_SIZE = { w: 220, h: 180 };
const POINTS_PER_CONNECTION = 100;
const POINTS_PER_DISMISS = 25;

// ─── Component ──────────────────────────────────────────────────────────────

export function FocusInvestigation({
  person,
  existingNodes,
  existingConnections,
  onComplete,
  onExit,
}: FocusInvestigationProps) {
  const { play } = useBoardSounds();

  // ─── State ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"loading" | "investigating" | "completing" | "summary">("loading");
  const [evidence, setEvidence] = useState<FocusEvidence[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [dragLine, setDragLine] = useState<{ fromId: string; x: number; y: number } | null>(null);
  const [totalPointsEarned, setTotalPointsEarned] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [wave, setWave] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 1200, h: 800 });

  // Person center position
  const personCenter = useMemo(() => ({
    x: canvasSize.w / 2,
    y: canvasSize.h * 0.28,
  }), [canvasSize]);

  // ─── Measure canvas ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ─── Fetch initial evidence ─────────────────────────────────────────────
  const fetchEvidence = useCallback(async () => {
    try {
      const existingEvidenceIds = existingNodes
        .filter(n => n.kind === "evidence")
        .map(n => n.id);

      const res = await fetch("/api/focus-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: person.id,
          excludeIds: [...existingEvidenceIds, ...seenIds],
        }),
      });

      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const items: FocusEvidenceItem[] = data.items;

      // Position evidence in orbit around the person
      const newEvidence: FocusEvidence[] = items.map((item, i) => {
        const angle = (i / items.length) * 2 * Math.PI - Math.PI / 2;
        const radius = ORBIT_RADIUS_BASE + (Math.random() - 0.5) * ORBIT_RADIUS_VARIANCE;
        return {
          item,
          state: "unexamined" as const,
          angle,
          radius,
          expanded: false,
        };
      });

      setEvidence(prev => [...prev, ...newEvidence]);
      setSeenIds(prev => {
        const next = new Set(prev);
        items.forEach((i: FocusEvidenceItem) => next.add(i.id));
        return next;
      });
      setPhase("investigating");
      play("discovery");
    } catch (err) {
      console.error("Focus evidence fetch error:", err);
      setPhase("investigating");
    }
  }, [person.id, existingNodes, seenIds, play]);

  useEffect(() => {
    if (phase === "loading") fetchEvidence();
  }, [phase, fetchEvidence]);

  // ─── Evidence position calculation ──────────────────────────────────────
  const getEvidencePos = useCallback((ev: FocusEvidence) => {
    return {
      x: personCenter.x + Math.cos(ev.angle) * ev.radius,
      y: personCenter.y + Math.sin(ev.angle) * ev.radius + 40,
    };
  }, [personCenter]);

  // ─── Actions ────────────────────────────────────────────────────────────
  const connectEvidence = useCallback((evidenceId: string) => {
    setEvidence(prev => prev.map(ev =>
      ev.item.id === evidenceId ? { ...ev, state: "connected" as const, expanded: false } : ev
    ));
    setTotalPointsEarned(p => p + POINTS_PER_CONNECTION);
    setExpandedId(null);
    play("connection");
  }, [play]);

  const dismissEvidence = useCallback((evidenceId: string) => {
    setEvidence(prev => prev.map(ev =>
      ev.item.id === evidenceId ? { ...ev, state: "dismissed" as const, expanded: false } : ev
    ));
    setTotalPointsEarned(p => p + POINTS_PER_DISMISS);
    setExpandedId(null);
    play("drop");
  }, [play]);

  const markUncertain = useCallback((evidenceId: string) => {
    setEvidence(prev => prev.map(ev =>
      ev.item.id === evidenceId ? { ...ev, state: "uncertain" as const, expanded: false } : ev
    ));
    setExpandedId(null);
  }, []);

  const toggleExpand = useCallback((evidenceId: string) => {
    setExpandedId(prev => prev === evidenceId ? null : evidenceId);
  }, []);

  // ─── Fetch more evidence when most are processed ───────────────────────
  const unexaminedCount = evidence.filter(e => e.state === "unexamined").length;
  const totalCount = evidence.length;
  useEffect(() => {
    if (phase !== "investigating") return;
    if (totalCount > 0 && unexaminedCount <= 1 && wave < 4) {
      // Fetch another wave
      setWave(w => w + 1);
      fetchEvidence();
    }
  }, [unexaminedCount, totalCount, wave, phase, fetchEvidence]);

  // ─── Complete investigation ─────────────────────────────────────────────
  const handleComplete = useCallback(() => {
    setPhase("summary");
    play("discovery");

    const connected = evidence.filter(e => e.state === "connected");
    const dismissed = evidence.filter(e => e.state === "dismissed");
    const uncertain = evidence.filter(e => e.state === "uncertain");

    const result: InvestigationResult = {
      personId: person.id,
      connectedEvidence: connected.map(e => e.item),
      dismissedEvidence: dismissed.map(e => e.item),
      uncertainEvidence: uncertain.map(e => e.item),
      newConnections: connected.map((e, i) => ({
        id: `focus-${person.id}-${e.item.id}-${Date.now()}-${i}`,
        sourceId: person.id,
        targetId: e.item.id,
        type: "manual" as const,
        label: "Focused investigation",
        strength: e.item.relevance === "direct" ? 5 : e.item.relevance === "tangential" ? 3 : 2,
        verified: false,
      })),
      stats: {
        connectionsCreated: connected.length,
        evidenceDismissed: dismissed.length,
        markedUncertain: uncertain.length,
        pointsEarned: totalPointsEarned,
      },
    };

    // Small delay to show summary, then return result
    setTimeout(() => {
      // Result is stored for the summary display
      resultRef.current = result;
    }, 100);
  }, [evidence, person.id, totalPointsEarned, play]);

  const resultRef = useRef<InvestigationResult | null>(null);

  const handleFinish = useCallback(() => {
    if (resultRef.current) {
      onComplete(resultRef.current);
    } else {
      onExit();
    }
  }, [onComplete, onExit]);

  // ─── Stats ──────────────────────────────────────────────────────────────
  const connectedCount = evidence.filter(e => e.state === "connected").length;
  const dismissedCount = evidence.filter(e => e.state === "dismissed").length;
  const uncertainCount = evidence.filter(e => e.state === "uncertain").length;

  // ─── Connection line rendering ──────────────────────────────────────────
  const connectedEvidence = evidence.filter(e => e.state === "connected");

  // ─── Relevance colors ──────────────────────────────────────────────────
  const relevanceColor = (r: string) => {
    switch (r) {
      case "direct": return "#E24B4A";
      case "tangential": return "#F59E0B";
      case "temporal": return "#3B82F6";
      case "wildcard": return "#8B5CF6";
      default: return "#666";
    }
  };

  const relevanceLabel = (r: string) => {
    switch (r) {
      case "direct": return "Direct";
      case "tangential": return "Tangential";
      case "temporal": return "Temporal";
      case "wildcard": return "Wildcard";
      default: return "";
    }
  };

  const stateOpacity = (s: EvidenceState) => {
    switch (s) {
      case "connected": return "opacity-100";
      case "dismissed": return "opacity-25";
      case "uncertain": return "opacity-70";
      default: return "opacity-100";
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  // Summary screen
  if (phase === "summary") {
    const r = resultRef.current;
    const stats = r?.stats ?? { connectionsCreated: connectedCount, evidenceDismissed: dismissedCount, markedUncertain: uncertainCount, pointsEarned: totalPointsEarned };

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95">
        <div className="focus-summary-enter w-full max-w-lg mx-4">
          {/* Summary card */}
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#111] overflow-hidden shadow-2xl shadow-black/80">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#E24B4A]/20 via-[#E24B4A]/5 to-transparent px-8 py-6 border-b border-[#2a2a2a]">
              <div className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-[0.2em] text-[#E24B4A]/60 mb-2">
                Investigation Complete
              </div>
              <h2 className="text-2xl font-bold text-white">
                {person.name}
              </h2>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-px bg-[#1a1a1a]">
              <div className="bg-[#111] px-6 py-5 text-center">
                <div className="text-3xl font-bold text-[#E24B4A]">{stats.connectionsCreated}</div>
                <div className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-[#666] mt-1">Connections</div>
              </div>
              <div className="bg-[#111] px-6 py-5 text-center">
                <div className="text-3xl font-bold text-[#555]">{stats.evidenceDismissed}</div>
                <div className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-[#666] mt-1">Dismissed</div>
              </div>
              <div className="bg-[#111] px-6 py-5 text-center">
                <div className="text-3xl font-bold text-amber-500">{stats.markedUncertain}</div>
                <div className="text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-[#666] mt-1">Follow-up</div>
              </div>
            </div>

            {/* Points */}
            <div className="px-8 py-5 border-t border-[#1a1a1a] flex items-center justify-between">
              <span className="text-[11px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-[#888]">
                Investigation points
              </span>
              <span className="text-xl font-bold text-[#E24B4A]">+{stats.pointsEarned}</span>
            </div>

            {/* Connected evidence list */}
            {r && r.connectedEvidence.length > 0 && (
              <div className="px-8 py-4 border-t border-[#1a1a1a]">
                <div className="text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-[0.15em] text-[#555] mb-2">
                  New connections
                </div>
                <div className="space-y-1.5">
                  {r.connectedEvidence.slice(0, 6).map(ev => (
                    <div key={ev.id} className="flex items-center gap-2 text-[11px]">
                      <span className="text-[#E24B4A]">●</span>
                      <span className="text-[#aaa] truncate">{ev.title}</span>
                      <span className="text-[9px] text-[#555] ml-auto flex-shrink-0 uppercase">{ev.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="px-8 py-6 border-t border-[#1a1a1a] flex gap-3">
              <button
                onClick={handleFinish}
                className="flex-1 rounded-lg bg-[#E24B4A] py-3 text-sm font-bold uppercase tracking-[0.08em] text-white hover:bg-[#d43e3d] transition"
              >
                Return to Board
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#080808] focus-mode-enter">
      {/* Breadcrumb + controls bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 py-3">
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-[12px] font-[family-name:var(--font-mono)] text-[#666] hover:text-white transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="uppercase tracking-[0.1em]">Main Board</span>
          <span className="text-[#333] mx-1">/</span>
          <span className="text-[#E24B4A]">Investigating {person.name}</span>
        </button>

        <div className="flex items-center gap-4">
          {/* Score */}
          <div className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-1.5">
            <span className="text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-[#666]">Points</span>
            <span className="text-sm font-bold text-[#E24B4A] tabular-nums">+{totalPointsEarned}</span>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#111] px-3 py-1.5">
            <span className="text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-[#666]">
              {connectedCount} connected
            </span>
            <span className="text-[#333]">·</span>
            <span className="text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-[#555]">
              {unexaminedCount} remaining
            </span>
          </div>

          {/* Complete button */}
          <button
            onClick={handleComplete}
            disabled={connectedCount === 0 && dismissedCount === 0}
            className="rounded-lg bg-[#E24B4A] px-5 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white hover:bg-[#d43e3d] transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Complete Investigation
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="absolute inset-0 top-14 overflow-hidden"
      >
        {/* Subtle grid background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, #1a1a1a 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* SVG connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          <defs>
            <filter id="focus-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Connected evidence lines */}
          {connectedEvidence.map(ev => {
            const pos = getEvidencePos(ev);
            return (
              <g key={`conn-${ev.item.id}`}>
                <line
                  x1={personCenter.x}
                  y1={personCenter.y}
                  x2={pos.x}
                  y2={pos.y}
                  stroke="#E24B4A"
                  strokeWidth="2"
                  opacity="0.6"
                  filter="url(#focus-glow)"
                  className="focus-connection-draw"
                />
                <line
                  x1={personCenter.x}
                  y1={personCenter.y}
                  x2={pos.x}
                  y2={pos.y}
                  stroke="#E24B4A"
                  strokeWidth="1"
                  opacity="0.9"
                  className="focus-connection-draw"
                />
              </g>
            );
          })}

          {/* Drag line */}
          {dragLine && (
            <line
              x1={dragLine.x}
              y1={dragLine.y}
              x2={personCenter.x}
              y2={personCenter.y}
              stroke="#E24B4A"
              strokeWidth="2"
              strokeDasharray="6 4"
              opacity="0.5"
            />
          )}
        </svg>

        {/* Person card — center top */}
        <div
          className="absolute z-10 focus-person-enter"
          style={{
            left: personCenter.x - 140,
            top: personCenter.y - 80,
            width: 280,
          }}
        >
          <div className="rounded-xl border-2 border-[#E24B4A]/40 bg-[#111] shadow-2xl shadow-[#E24B4A]/10 overflow-hidden">
            {/* Red top accent */}
            <div className="h-1.5 bg-gradient-to-r from-[#E24B4A] to-[#E24B4A]/50" />

            <div className="p-4">
              <div className="flex items-center gap-3">
                {/* Photo */}
                {person.imageUrl ? (
                  <img
                    src={person.imageUrl}
                    alt={person.name}
                    className="w-16 h-16 rounded-lg object-cover border border-[#2a2a2a]"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center text-2xl text-[#333]">
                    👤
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-white">{person.name}</h3>
                  {person.description && (
                    <p className="text-[10px] text-[#666] mt-0.5 line-clamp-2">{person.description}</p>
                  )}
                </div>
              </div>

              {/* Investigation stats */}
              <div className="flex gap-3 mt-3 pt-3 border-t border-[#1a1a1a]">
                <span className="text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-[#E24B4A]">
                  {connectedCount} connected
                </span>
                {uncertainCount > 0 && (
                  <span className="text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-amber-500">
                    {uncertainCount} uncertain
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {phase === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-3 text-[#666]">
              <span className="h-3 w-3 rounded-full bg-[#E24B4A] animate-pulse" />
              <span className="text-sm font-[family-name:var(--font-mono)] uppercase tracking-[0.12em]">
                Gathering evidence...
              </span>
            </div>
          </div>
        )}

        {/* Evidence cards */}
        {evidence.map((ev, i) => {
          const pos = getEvidencePos(ev);
          const isExpanded = expandedId === ev.item.id;
          const color = relevanceColor(ev.item.relevance);

          return (
            <div
              key={ev.item.id}
              className={`absolute z-10 transition-all duration-500 ease-out ${stateOpacity(ev.state)} focus-evidence-enter`}
              style={{
                left: ev.state === "dismissed" ? canvasSize.w + 50 : pos.x - (isExpanded ? 175 : EVIDENCE_SIZE.w / 2),
                top: pos.y - EVIDENCE_SIZE.h / 2,
                width: isExpanded ? 350 : EVIDENCE_SIZE.w,
                animationDelay: `${i * 100}ms`,
              }}
            >
              <div
                className={`rounded-lg border overflow-hidden cursor-pointer transition-all duration-200 ${
                  ev.state === "connected"
                    ? "border-[#E24B4A]/40 bg-[#111] shadow-lg shadow-[#E24B4A]/10"
                    : ev.state === "uncertain"
                    ? "border-amber-500/40 bg-[#111] shadow-lg shadow-amber-500/10"
                    : "border-[#2a2a2a] bg-[#111] hover:border-[#444] shadow-lg shadow-black/50"
                }`}
                onClick={() => ev.state !== "dismissed" && toggleExpand(ev.item.id)}
              >
                {/* Top color accent by relevance */}
                <div className="h-0.5" style={{ backgroundColor: color }} />

                {/* Content */}
                <div className="p-3">
                  {/* Type + relevance badge */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px]">
                      {ev.item.type === "email" ? "✉️" : ev.item.type === "photo" ? "📸" : ev.item.type === "document" ? "📄" : "💬"}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: color + "20", color: color }}
                    >
                      {relevanceLabel(ev.item.relevance)}
                    </span>
                    {ev.state === "connected" && (
                      <span className="text-[8px] font-bold text-[#E24B4A] uppercase ml-auto">Connected</span>
                    )}
                    {ev.state === "uncertain" && (
                      <span className="text-[8px] font-bold text-amber-500 uppercase ml-auto">Uncertain</span>
                    )}
                  </div>

                  {/* Photo thumbnail */}
                  {ev.item.type === "photo" && ev.item.thumbnailUrl && (
                    <div className={`rounded overflow-hidden mb-2 ${isExpanded ? "h-40" : "h-20"}`}>
                      <img
                        src={ev.item.thumbnailUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    </div>
                  )}

                  {/* Title */}
                  <div className={`font-bold text-white ${isExpanded ? "text-sm" : "text-[11px] truncate"}`}>
                    {ev.item.title}
                  </div>

                  {/* Snippet — shows more when expanded */}
                  <div className={`text-[#777] mt-1 ${
                    isExpanded
                      ? "text-[12px] leading-relaxed max-h-60 overflow-y-auto"
                      : "text-[10px] line-clamp-2"
                  }`}>
                    {ev.item.snippet}
                  </div>

                  {/* Sender / date */}
                  {(ev.item.sender || ev.item.date) && (
                    <div className="flex items-center gap-2 mt-2 text-[9px] text-[#555]">
                      {ev.item.sender && <span>{ev.item.sender}</span>}
                      {ev.item.date && <span className="tabular-nums">{ev.item.date}</span>}
                    </div>
                  )}

                  {/* Action buttons — visible when expanded and unexamined */}
                  {isExpanded && ev.state === "unexamined" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-[#1a1a1a]">
                      <button
                        onClick={(e) => { e.stopPropagation(); connectEvidence(ev.item.id); }}
                        className="flex-1 rounded-lg bg-[#E24B4A]/15 border border-[#E24B4A]/30 py-2 text-[10px] font-bold uppercase tracking-wider text-[#E24B4A] hover:bg-[#E24B4A]/25 transition"
                      >
                        Connect
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); markUncertain(ev.item.id); }}
                        className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-500 hover:bg-amber-500/20 transition"
                      >
                        ?
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); dismissEvidence(ev.item.id); }}
                        className="rounded-lg bg-[#1a1a1a] border border-[#333] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#666] hover:text-white hover:border-[#555] transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Re-examine buttons for uncertain items */}
                  {isExpanded && ev.state === "uncertain" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-[#1a1a1a]">
                      <button
                        onClick={(e) => { e.stopPropagation(); connectEvidence(ev.item.id); }}
                        className="flex-1 rounded-lg bg-[#E24B4A]/15 border border-[#E24B4A]/30 py-2 text-[10px] font-bold uppercase tracking-wider text-[#E24B4A] hover:bg-[#E24B4A]/25 transition"
                      >
                        Connect
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); dismissEvidence(ev.item.id); }}
                        className="flex-1 rounded-lg bg-[#1a1a1a] border border-[#333] py-2 text-[10px] font-bold uppercase tracking-wider text-[#666] hover:text-white transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty state when all evidence processed */}
        {phase === "investigating" && unexaminedCount === 0 && uncertainCount === 0 && wave >= 4 && (
          <div className="absolute bottom-8 inset-x-0 flex justify-center">
            <div className="rounded-xl border border-[#2a2a2a] bg-[#111]/90 backdrop-blur-sm px-6 py-4 text-center">
              <p className="text-[12px] text-[#888]">All evidence examined</p>
              <button
                onClick={handleComplete}
                className="mt-2 rounded-lg bg-[#E24B4A] px-6 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-white hover:bg-[#d43e3d] transition"
              >
                Complete Investigation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
