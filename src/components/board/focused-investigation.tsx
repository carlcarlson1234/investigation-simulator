"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { Person, SearchResult, ArchiveStats, Evidence } from "@/lib/types";
import type {
  BoardNode,
  BoardConnection,
  BoardEvidenceNode,
  FocusState,
} from "@/lib/board-types";
import type { FocusEvidenceItem } from "@/app/api/focus-evidence/route";
import { BoardCanvas } from "./board-canvas";
import type { BoardCanvasHandle } from "./board-canvas";
import { useBoardSounds } from "@/hooks/use-board-sounds";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InvestigationResult {
  personId: string;
  connectedEvidence: SearchResult[];
  dismissedEvidence: SearchResult[];
  uncertainEvidence: SearchResult[];
  newConnections: BoardConnection[];
  stats: {
    connectionsCreated: number;
    evidenceDismissed: number;
    markedUncertain: number;
    pointsEarned: number;
  };
}

interface FocusedInvestigationProps {
  person: Person;
  existingNodes: BoardNode[];
  existingConnections: BoardConnection[];
  stats: ArchiveStats;
  onComplete: (result: InvestigationResult) => void;
  onExit: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const NEW_EVIDENCE_COUNT = 6;
const PERSON_X = 1800;
const PERSON_Y = 1200;
const INNER_RADIUS = 280;
const OUTER_RADIUS = 500;

// ─── Component ──────────────────────────────────────────────────────────────

export function FocusedInvestigation({
  person,
  existingNodes,
  existingConnections,
  stats,
  onComplete,
  onExit,
}: FocusedInvestigationProps) {
  const { play } = useBoardSounds();
  const canvasRef = useRef<BoardCanvasHandle>(null);

  // ─── Phase ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"loading" | "investigating" | "summary">("loading");
  const [completedResult, setCompletedResult] = useState<InvestigationResult | null>(null);

  // ─── Local board state (person + existing connections) ────────────────
  const [focusNodes, setFocusNodes] = useState<BoardNode[]>(() => {
    const nodes: BoardNode[] = [
      { kind: "person" as const, id: person.id, data: person, position: { x: PERSON_X, y: PERSON_Y } },
    ];
    const directConns = existingConnections.filter(
      (c) => c.sourceId === person.id || c.targetId === person.id,
    );
    const connectedIds = new Set<string>();
    for (const c of directConns) {
      connectedIds.add(c.sourceId === person.id ? c.targetId : c.sourceId);
    }
    const connectedNodes = existingNodes.filter((n) => connectedIds.has(n.id));
    connectedNodes.forEach((n, i) => {
      const angle = -Math.PI / 2 + (i / Math.max(connectedNodes.length, 1)) * Math.PI * 2;
      nodes.push({
        ...n,
        position: {
          x: PERSON_X + Math.cos(angle) * INNER_RADIUS,
          y: PERSON_Y + Math.sin(angle) * INNER_RADIUS,
        },
      });
    });
    return nodes;
  });

  const [focusConnections, setFocusConnections] = useState<BoardConnection[]>(() =>
    existingConnections.filter((c) => c.sourceId === person.id || c.targetId === person.id),
  );

  // ─── Canvas interaction state ─────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // ─── Evidence focus view state ────────────────────────────────────────
  const [splitEvidenceId, setSplitEvidenceId] = useState<string | null>(null);
  const [fullEvidence, setFullEvidence] = useState<Evidence | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  // ─── Drag-to-connect state for evidence focus view ────────────────────
  const [dragState, setDragState] = useState<{ sourceId: string; mouseX: number; mouseY: number; handle: "top" | "bottom" } | null>(null);
  const [nearTarget, setNearTarget] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const topHandleRef = useRef<HTMLDivElement>(null);
  const bottomHandleRef = useRef<HTMLDivElement>(null);

  // ─── Evidence fetch state ─────────────────────────────────────────────
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newEvidenceIds, setNewEvidenceIds] = useState<Set<string>>(new Set());

  // ─── Derived ──────────────────────────────────────────────────────────
  const evidenceNodes = useMemo(
    () => focusNodes.filter((n): n is BoardEvidenceNode => n.kind === "evidence"),
    [focusNodes],
  );
  const newEvidenceNodes = useMemo(
    () => evidenceNodes.filter((n) => newEvidenceIds.has(n.id)),
    [evidenceNodes, newEvidenceIds],
  );
  const existingEvidenceNodes = useMemo(
    () => evidenceNodes.filter((n) => !newEvidenceIds.has(n.id)),
    [evidenceNodes, newEvidenceIds],
  );
  const existingPeopleNodes = useMemo(
    () => focusNodes.filter((n) => n.kind === "person" && n.id !== person.id),
    [focusNodes, person.id],
  );
  const connectedIds = useMemo(
    () => new Set([...focusConnections.map((c) => c.sourceId), ...focusConnections.map((c) => c.targetId)]),
    [focusConnections],
  );
  const newEvidenceConnections = focusConnections.filter(
    (c) => newEvidenceIds.has(c.sourceId) || newEvidenceIds.has(c.targetId),
  );
  const score = newEvidenceConnections.length * 100;

  const splitIndex = splitEvidenceId ? newEvidenceNodes.findIndex((n) => n.id === splitEvidenceId) : -1;
  const splitNode = splitIndex >= 0 ? newEvidenceNodes[splitIndex] : null;

  // ─── Focus state for BoardCanvas ──────────────────────────────────────
  const focusState = useMemo<FocusState | null>(() => {
    if (!focusedNodeId) return null;
    const directIds = new Set<string>();
    const edgeIds = new Set<string>();
    for (const c of focusConnections) {
      if (c.sourceId === focusedNodeId || c.targetId === focusedNodeId) {
        directIds.add(c.sourceId === focusedNodeId ? c.targetId : c.sourceId);
        edgeIds.add(c.id);
      }
    }
    return { nodeId: focusedNodeId, directIds, secondIds: new Set(), edgeIds };
  }, [focusedNodeId, focusConnections]);

  // ─── Fetch evidence ───────────────────────────────────────────────────
  const fetchEvidence = useCallback(async () => {
    try {
      const existingIds = [...existingNodes.map((n) => n.id), ...seenIdsRef.current];
      const res = await fetch("/api/focus-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, excludeIds: existingIds, wave: 1 }),
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const items = (data.items as FocusEvidenceItem[]).slice(0, NEW_EVIDENCE_COUNT);
      for (const item of items) seenIdsRef.current.add(item.id);
      setNewEvidenceIds(new Set(items.map((item) => item.id)));
      const newNodes: BoardNode[] = items.map((item, i) => {
        const angle = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
        return {
          kind: "evidence" as const,
          id: item.id,
          evidenceType: item.type,
          data: item as SearchResult,
          position: { x: PERSON_X + Math.cos(angle) * OUTER_RADIUS, y: PERSON_Y + Math.sin(angle) * OUTER_RADIUS },
        };
      });
      setFocusNodes((prev) => [...prev, ...newNodes]);
      setPhase("investigating");
    } catch (err) {
      console.error("Focus evidence fetch error:", err);
      setPhase("investigating");
    }
  }, [existingNodes, person.id]);

  useEffect(() => { fetchEvidence(); }, [fetchEvidence]);
  useEffect(() => {
    if (phase === "investigating") {
      const t = setTimeout(() => canvasRef.current?.centerOnNode(person.id), 800);
      return () => clearTimeout(t);
    }
  }, [phase, person.id]);

  // ─── Fetch full evidence for focus view ───────────────────────────────
  useEffect(() => {
    if (!splitEvidenceId || !splitNode) { setFullEvidence(null); return; }
    setLoadingEvidence(true);
    setFullEvidence(null);
    fetch(`/api/evidence/${encodeURIComponent(splitEvidenceId)}?type=${splitNode.evidenceType}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { setFullEvidence(data); setLoadingEvidence(false); })
      .catch(() => setLoadingEvidence(false));
  }, [splitEvidenceId, splitNode]);

  // ─── Drag-to-connect mechanics ────────────────────────────────────────
  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      setDragState((prev) => prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY } : null);
      // Proximity detection
      const targets = document.querySelectorAll("[data-connect-target]");
      let closest: string | null = null;
      let closestDist = 60; // px radius
      targets.forEach((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.sqrt((e.clientX - cx) ** 2 + (e.clientY - cy) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closest = (el as HTMLElement).getAttribute("data-connect-target");
        }
      });
      setNearTarget(closest);
    };
    const onUp = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      let targetId: string | null = null;
      if (el) {
        const targetEl = el.closest("[data-connect-target]");
        if (targetEl) targetId = targetEl.getAttribute("data-connect-target");
      }
      if (targetId && targetId !== dragState.sourceId) {
        const connId = `focus-${dragState.sourceId}-${targetId}`;
        setFocusConnections((prev) => {
          if (prev.some((c) => c.id === connId)) return prev;
          return [...prev, {
            id: connId, sourceId: dragState.sourceId, targetId,
            type: "manual" as const, label: "Linked in investigation", strength: 3, verified: true,
          }];
        });
        play("connection");
      }
      setDragState(null);
      setNearTarget(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragState, play]);

  // ─── ESC handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (splitEvidenceId) setSplitEvidenceId(null);
        else onExit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [splitEvidenceId, onExit]);

  // ─── Board callbacks ─────────────────────────────────────────────────
  const handleSelectNode = useCallback((id: string | null) => setSelectedNodeId(id), []);
  const handleFocusNode = useCallback((id: string | null) => {
    setFocusedNodeId(id);
    if (id) {
      const node = focusNodes.find((n) => n.id === id);
      if (node && node.kind === "evidence" && newEvidenceIds.has(node.id)) setSplitEvidenceId(id);
    }
  }, [focusNodes, newEvidenceIds]);
  const handleOpenPhotoView = useCallback((id: string) => {
    if (newEvidenceIds.has(id)) setSplitEvidenceId(id);
  }, [newEvidenceIds]);
  const handleMoveNode = useCallback((id: string, x: number, y: number) => {
    setFocusNodes((prev) => prev.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)));
  }, []);
  const handleBatchMoveNodes = useCallback((moves: Record<string, { x: number; y: number }>) => {
    setFocusNodes((prev) => prev.map((n) => (moves[n.id] ? { ...n, position: moves[n.id] } : n)));
  }, []);
  const handleStartConnection = useCallback((fromId: string) => setConnectingFrom(fromId), []);
  const handleCompleteConnection = useCallback((toId: string) => {
    if (!connectingFrom || connectingFrom === toId) { setConnectingFrom(null); return; }
    const connId = `focus-${connectingFrom}-${toId}`;
    setFocusConnections((prev) => {
      if (prev.some((c) => c.id === connId)) return prev;
      return [...prev, { id: connId, sourceId: connectingFrom, targetId: toId, type: "manual" as const, label: "Linked in investigation", strength: 3, verified: true }];
    });
    setConnectingFrom(null);
    play("connection");
  }, [connectingFrom, play]);
  const handleDirectConnection = useCallback((fromId: string, toId: string) => {
    const connId = `focus-${fromId}-${toId}`;
    setFocusConnections((prev) => {
      if (prev.some((c) => c.id === connId)) return prev;
      return [...prev, { id: connId, sourceId: fromId, targetId: toId, type: "manual" as const, label: "Linked in investigation", strength: 3, verified: true }];
    });
    play("connection");
  }, [play]);
  const noopStr = useCallback((_s: string) => {}, []);
  const noopResult = useCallback((_r: SearchResult, _x?: number, _y?: number) => {}, []);

  // ─── Evidence navigation ──────────────────────────────────────────────
  const goToEvidence = useCallback((direction: "prev" | "next") => {
    if (newEvidenceNodes.length === 0) return;
    let newIdx: number;
    if (splitIndex < 0) newIdx = 0;
    else if (direction === "prev") newIdx = Math.max(0, splitIndex - 1);
    else newIdx = Math.min(newEvidenceNodes.length - 1, splitIndex + 1);
    setSplitEvidenceId(newEvidenceNodes[newIdx].id);
  }, [newEvidenceNodes, splitIndex]);

  // ─── Complete investigation ─────────────────────────────────────────
  const handleComplete = useCallback(() => {
    const newConns = focusConnections.filter(
      (c) => newEvidenceIds.has(c.sourceId) || newEvidenceIds.has(c.targetId),
    );
    const connectedNewIds = new Set(newConns.map((c) => c.targetId));
    const connected = focusNodes
      .filter((n) => n.kind === "evidence" && connectedNewIds.has(n.id) && newEvidenceIds.has(n.id))
      .map((n) => n.data as SearchResult);
    const result: InvestigationResult = {
      personId: person.id, connectedEvidence: connected, dismissedEvidence: [], uncertainEvidence: [],
      newConnections: newConns,
      stats: { connectionsCreated: newConns.length, evidenceDismissed: 0, markedUncertain: 0, pointsEarned: score },
    };
    setPhase("summary");
    setSplitEvidenceId(null);
    setCompletedResult(result);
    play("discovery");
  }, [focusNodes, focusConnections, person.id, newEvidenceIds, score, play]);

  // ─── Helpers ──────────────────────────────────────────────────────────
  const isSplit = !!splitEvidenceId;
  const ev = fullEvidence as unknown as Record<string, unknown> | null;
  const isLinkedToEvidence = (targetId: string) => {
    if (!splitEvidenceId) return false;
    return focusConnections.some(
      (c) => (c.sourceId === splitEvidenceId && c.targetId === targetId) || (c.targetId === splitEvidenceId && c.sourceId === targetId),
    );
  };

  // Handle ref position for SVG line
  const getHandleCenter = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return null;
    const rect = ref.current.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="focus-mode-enter fixed inset-0 z-[100] flex flex-col bg-[#050505]">
      {/* Top chrome bar */}
      <div className="relative z-50 flex shrink-0 items-center justify-between border-b border-[#1a1a1a] bg-[#060606] px-5 py-3">
        <button onClick={isSplit ? () => setSplitEvidenceId(null) : onExit} className="flex items-center gap-2 text-[11px] text-[#555] transition hover:text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          {isSplit ? (
            <>
              <span className="text-[#444]">Main Board</span>
              <span className="text-[#333]">/</span>
              <span className="text-[#444]">Investigating {person.name}</span>
              <span className="text-[#333]">/</span>
              <span className="text-white">Evidence {splitIndex + 1} of {newEvidenceNodes.length}</span>
            </>
          ) : (
            <>
              <span className="text-[#444]">Main Board</span>
              <span className="text-[#333]">/</span>
              <span className="text-[#888]">Investigating <strong className="font-semibold text-white">{person.name}</strong></span>
            </>
          )}
        </button>
        <div className="flex items-center gap-4">
          <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-[#4ade80]">{score} pts</span>
          {(focusConnections.length > 0 || newEvidenceNodes.length > 0) && phase === "investigating" && (
            <button onClick={handleComplete} className="rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-4 py-1.5 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider text-[#E24B4A] transition hover:bg-[#E24B4A]/20">
              Complete Investigation
            </button>
          )}
        </div>
      </div>

      {/* ─── EVIDENCE FOCUS VIEW (4-band spatial layout) ───────────────── */}
      {isSplit && (phase === "investigating" || phase === "summary") && (
        <div className="flex flex-1 flex-col min-h-0 relative">
          {/* SVG overlay for drag lines */}
          <svg ref={svgRef} className="pointer-events-none absolute inset-0 z-40" style={{ width: "100%", height: "100%" }}>
            {dragState && (() => {
              const handlePos = dragState.handle === "top" ? getHandleCenter(topHandleRef) : getHandleCenter(bottomHandleRef);
              if (!handlePos) return null;
              return (
                <line x1={handlePos.x} y1={handlePos.y} x2={dragState.mouseX} y2={dragState.mouseY}
                  stroke={nearTarget ? "#4ade80" : "#f87171"} strokeWidth={nearTarget ? 4 : 3}
                  strokeOpacity={nearTarget ? 1 : 0.8} strokeDasharray={nearTarget ? "0" : "8 4"}
                  strokeLinecap="round" />
              );
            })()}
          </svg>

          {/* Band 1: People Zone (~220px) */}
          <div className="shrink-0 border-b border-[#1a1a1a] px-6 py-4">
            {/* Subject pinned center */}
            <div className="flex justify-center mb-3">
              <div
                data-connect-target={person.id}
                className={`flex flex-col items-center rounded-xl border-2 p-4 transition ${
                  nearTarget === person.id ? "border-[#4ade80]/60 bg-[#4ade80]/5 shadow-[0_0_20px_rgba(74,222,128,0.2)]"
                  : isLinkedToEvidence(person.id) ? "border-[#4ade80]/30 bg-[#4ade80]/5"
                  : "border-[#E24B4A]/30 bg-[#111]"
                }`}
              >
                {person.imageUrl ? (
                  <img src={person.imageUrl} alt={person.name} className="h-20 w-20 rounded-full border-2 border-[#E24B4A]/30 object-cover" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#E24B4A]/30 bg-[#1a1a1a] text-2xl">👤</div>
                )}
                <span className="mt-2 font-[family-name:var(--font-display)] text-[14px] tracking-wide text-white">{person.name}</span>
                <span className="text-[9px] text-[#555]">{focusConnections.length} connections</span>
              </div>
            </div>

            {/* Connected people row (scrollable) */}
            {existingPeopleNodes.length > 0 && (
              <div className="relative">
                <div className="flex gap-3 overflow-x-auto pb-1 justify-center" style={{ scrollbarWidth: "thin" }}>
                  {existingPeopleNodes.map((n) => (
                    <div
                      key={n.id}
                      data-connect-target={n.id}
                      className={`flex shrink-0 flex-col items-center gap-1.5 rounded-lg border p-2.5 transition ${
                        nearTarget === n.id ? "border-[#4ade80]/60 bg-[#4ade80]/5 shadow-[0_0_16px_rgba(74,222,128,0.2)]"
                        : isLinkedToEvidence(n.id) ? "border-[#4ade80]/30 bg-[#4ade80]/5"
                        : "border-[#2a2a2a] bg-[#0e0e0e]"
                      }`}
                    >
                      {n.kind === "person" && n.data.imageUrl ? (
                        <img src={n.data.imageUrl} alt={n.data.name} className="h-12 w-12 rounded-full border border-[#333] object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#333] bg-[#1a1a1a] text-sm">👤</div>
                      )}
                      <span className="text-center font-[family-name:var(--font-display)] text-[9px] leading-tight text-white/70 w-16 truncate">
                        {n.kind === "person" ? n.data.name : n.id}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Band 2: Evidence Zone (flexible) */}
          <div className="flex flex-1 min-h-0 flex-col items-center justify-center px-6 py-4">
            {/* Top connection node */}
            <div
              ref={topHandleRef}
              onMouseDown={(e) => {
                if (!splitEvidenceId) return;
                e.preventDefault();
                setDragState({ sourceId: splitEvidenceId, mouseX: e.clientX, mouseY: e.clientY, handle: "top" });
              }}
              className="mb-2 flex h-7 w-7 cursor-crosshair items-center justify-center rounded-full border-2 border-red-500/50 bg-red-600/40 shadow-[0_0_8px_2px_rgba(239,68,68,0.25)] transition hover:bg-red-500/70 hover:shadow-[0_0_14px_4px_rgba(239,68,68,0.5)] hover:scale-110 z-50"
            >
              <div className="h-2 w-2 rounded-full bg-red-400 animate-ping" style={{ animationDuration: "2s" }} />
            </div>

            {/* Evidence card */}
            <div className="w-full max-w-[700px] rounded-xl border border-[#E24B4A]/20 bg-[#0e0e0e] shadow-[0_0_30px_rgba(226,75,74,0.06)] overflow-hidden">
              {loadingEvidence && (
                <div className="flex h-48 items-center justify-center">
                  <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#555]">Loading...</span>
                </div>
              )}
              {!loadingEvidence && ev && (() => {
                const title = String(ev.title ?? splitNode?.data.title ?? "");
                const type = String(ev.type ?? splitNode?.evidenceType ?? "");
                const imageUrl = ev.imageUrl ? String(ev.imageUrl) : null;
                const imageDesc = ev.imageDescription ? String(ev.imageDescription) : null;
                const sender = ev.sender ? String(ev.senderName ?? ev.sender) : null;
                const recipients = Array.isArray(ev.recipients) ? (ev.recipients as string[]) : null;
                const body = ev.body ? String(ev.body) : null;
                const fulltext = ev.fulltext ? String(ev.fulltext) : null;
                const date = ev.date ? String(ev.date) : null;
                return (
                  <div>
                    {/* Metadata strip */}
                    <div className="flex items-center gap-3 border-b border-[#1a1a1a] px-5 py-3">
                      <span className="rounded bg-[#E24B4A]/10 px-2 py-0.5 font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase text-[#E24B4A]/70">{type}</span>
                      <h3 className="flex-1 truncate font-[family-name:var(--font-display)] text-[16px] tracking-wide text-white">{title}</h3>
                      {date && <span className="font-[family-name:var(--font-mono)] text-[9px] text-[#555]">{date}</span>}
                    </div>
                    {/* Content */}
                    <div className="max-h-[300px] overflow-y-auto">
                      {imageUrl && <img src={imageUrl} alt={title} className="w-full object-contain" />}
                      {imageDesc && <p className="px-5 py-3 text-[12px] leading-relaxed text-[#888]">{imageDesc}</p>}
                      {sender && (
                        <div className="border-b border-[#1a1a1a] px-5 py-2 text-[10px] text-[#777]">
                          <span className="text-[#555]">From:</span> {sender}
                          {recipients && <> · <span className="text-[#555]">To:</span> {recipients.join(", ")}</>}
                        </div>
                      )}
                      {body && <pre className="whitespace-pre-wrap px-5 py-4 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[#bbb]">{body}</pre>}
                      {fulltext && <pre className="whitespace-pre-wrap px-5 py-4 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[#bbb]">{fulltext}</pre>}
                    </div>
                  </div>
                );
              })()}
              {!loadingEvidence && !ev && splitEvidenceId && (
                <div className="flex h-48 items-center justify-center">
                  <span className="text-[11px] text-[#444]">No detail available</span>
                </div>
              )}
            </div>

            {/* Bottom connection node */}
            <div
              ref={bottomHandleRef}
              onMouseDown={(e) => {
                if (!splitEvidenceId) return;
                e.preventDefault();
                setDragState({ sourceId: splitEvidenceId, mouseX: e.clientX, mouseY: e.clientY, handle: "bottom" });
              }}
              className="mt-2 flex h-7 w-7 cursor-crosshair items-center justify-center rounded-full border-2 border-red-500/50 bg-red-600/40 shadow-[0_0_8px_2px_rgba(239,68,68,0.25)] transition hover:bg-red-500/70 hover:shadow-[0_0_14px_4px_rgba(239,68,68,0.5)] hover:scale-110 z-50"
            >
              <div className="h-2 w-2 rounded-full bg-red-400 animate-ping" style={{ animationDuration: "2s" }} />
            </div>

            {/* Prev / Next */}
            <div className="mt-3 flex items-center gap-4">
              <button onClick={() => goToEvidence("prev")} disabled={splitIndex <= 0}
                className="rounded-lg border border-[#2a2a2a] px-4 py-1.5 text-[10px] font-bold text-[#666] transition hover:bg-[#1a1a1a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                ← Prev
              </button>
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-[#555]">{splitIndex + 1} / {newEvidenceNodes.length}</span>
              {splitIndex < newEvidenceNodes.length - 1 ? (
                <button onClick={() => goToEvidence("next")}
                  className="rounded-lg border border-[#2a2a2a] px-4 py-1.5 text-[10px] font-bold text-[#666] transition hover:bg-[#1a1a1a] hover:text-white">
                  Next →
                </button>
              ) : (
                <button onClick={handleComplete}
                  className="rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-4 py-1.5 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider text-[#E24B4A] transition hover:bg-[#E24B4A]/20">
                  Finish
                </button>
              )}
            </div>
          </div>

          {/* Band 3: Documents Zone (~180px) */}
          <div className="shrink-0 border-t border-[#1a1a1a] px-6 py-4">
            <p className="mb-2 font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase tracking-[0.12em] text-[#555]">Evidence on File</p>
            <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              {existingEvidenceNodes.map((n) => (
                <div
                  key={n.id}
                  data-connect-target={n.id}
                  className={`flex shrink-0 flex-col gap-1 rounded-lg border p-3 w-[160px] transition ${
                    nearTarget === n.id ? "border-[#4ade80]/60 bg-[#4ade80]/5 shadow-[0_0_16px_rgba(74,222,128,0.2)]"
                    : isLinkedToEvidence(n.id) ? "border-[#4ade80]/30 bg-[#4ade80]/5"
                    : "border-[#2a2a2a] bg-[#0e0e0e]"
                  }`}
                >
                  <span className="text-xs">
                    {n.evidenceType === "photo" ? "📸" : n.evidenceType === "email" ? "✉️" : n.evidenceType === "document" ? "📄" : "💬"}
                  </span>
                  <span className="truncate text-[10px] text-white/70">{n.data.title}</span>
                  <span className="truncate text-[8px] text-[#555]">{n.data.snippet}</span>
                  {isLinkedToEvidence(n.id) && (
                    <span className="text-[7px] font-bold text-[#4ade80]">LINKED</span>
                  )}
                </div>
              ))}
              {/* Also show other new evidence (not the currently viewed one) */}
              {newEvidenceNodes.filter((n) => n.id !== splitEvidenceId).map((n) => (
                <button
                  key={n.id}
                  data-connect-target={n.id}
                  onClick={() => setSplitEvidenceId(n.id)}
                  className={`flex shrink-0 flex-col gap-1 rounded-lg border p-3 w-[160px] text-left transition ${
                    nearTarget === n.id ? "border-[#4ade80]/60 bg-[#4ade80]/5 shadow-[0_0_16px_rgba(74,222,128,0.2)]"
                    : isLinkedToEvidence(n.id) ? "border-[#E24B4A]/30 bg-[#E24B4A]/5"
                    : "border-[#E24B4A]/15 bg-[#0e0e0e] hover:border-[#E24B4A]/30"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-xs">
                      {n.evidenceType === "photo" ? "📸" : n.evidenceType === "email" ? "✉️" : n.evidenceType === "document" ? "📄" : "💬"}
                    </span>
                    <span className="rounded bg-[#E24B4A]/10 px-1 py-0.5 text-[6px] font-bold text-[#E24B4A]/60">NEW</span>
                  </div>
                  <span className="truncate text-[10px] text-white/70">{n.data.title}</span>
                  {isLinkedToEvidence(n.id) && (
                    <span className="text-[7px] font-bold text-[#4ade80]">LINKED</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── BOARD CANVAS (non-split mode) ─────────────────────────────── */}
      {!isSplit && (
        <div className="relative flex flex-col flex-1 min-h-0">
          {phase === "loading" && (
            <div className="flex h-full items-center justify-center">
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[#555]">Gathering evidence for {person.name}...</p>
            </div>
          )}
          {(phase === "investigating" || phase === "summary") && (
            <BoardCanvas
              ref={canvasRef}
              archiveTitle={`Investigating ${person.name}`}
              nodes={focusNodes} connections={focusConnections}
              selectedNodeId={selectedNodeId} focusedNodeId={focusedNodeId} focusState={focusState} connectingFrom={connectingFrom}
              onSelectNode={handleSelectNode} onFocusNode={handleFocusNode} onMoveNode={handleMoveNode} onBatchMoveNodes={handleBatchMoveNodes}
              onAddEvidence={noopResult} onAddPerson={noopStr}
              onStartConnection={handleStartConnection} onCompleteConnection={handleCompleteConnection} onDirectConnection={handleDirectConnection}
              onOpenSubjectView={noopStr} onOpenPhotoView={handleOpenPhotoView}
              stats={stats} score={score}
            />
          )}
          {/* Summary overlay */}
          {phase === "summary" && completedResult && (
            <div className="focus-summary-enter absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#111] p-8 shadow-2xl">
                <h2 className="text-center font-[family-name:var(--font-display)] text-2xl tracking-wide text-white">Investigation Complete</h2>
                <p className="mt-1 text-center text-[11px] text-[#555]">{person.name}</p>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-[#E24B4A]/5 p-3 text-center">
                    <div className="font-[family-name:var(--font-display)] text-2xl text-[#E24B4A]">{completedResult.stats.connectionsCreated}</div>
                    <div className="mt-0.5 text-[9px] text-[#666]">Connections</div>
                  </div>
                  <div className="rounded-lg bg-[#1a1a1a] p-3 text-center">
                    <div className="font-[family-name:var(--font-display)] text-2xl text-[#888]">{newEvidenceNodes.length}</div>
                    <div className="mt-0.5 text-[9px] text-[#666]">Evidence Reviewed</div>
                  </div>
                </div>
                <div className="mt-5 text-center">
                  <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-[#4ade80]">+{completedResult.stats.pointsEarned} pts</span>
                </div>
                {completedResult.connectedEvidence.length > 0 && (
                  <div className="mt-5">
                    <h4 className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[#555]">New Connections</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {completedResult.connectedEvidence.map((e) => (
                        <span key={e.id} className="rounded-full bg-[#E24B4A]/10 px-2 py-0.5 text-[9px] text-[#E24B4A]/80">{e.title}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-6 flex gap-3">
                  <button onClick={() => { navigator.clipboard.writeText(`OpenCase: ${person.name}\n${completedResult.stats.connectionsCreated} connections\n${completedResult.stats.pointsEarned} pts`); }}
                    className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2.5 text-[10px] font-bold text-[#888] transition hover:bg-[#222] hover:text-white">Share Results</button>
                  <button onClick={() => onComplete(completedResult)}
                    className="flex-1 rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/10 py-2.5 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider text-[#E24B4A] transition hover:bg-[#E24B4A]/20">Return to Board</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
