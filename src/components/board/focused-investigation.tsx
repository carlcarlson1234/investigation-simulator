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

  // ─── Local board state ────────────────────────────────────────────────
  const [focusNodes, setFocusNodes] = useState<BoardNode[]>(() => {
    const nodes: BoardNode[] = [
      { kind: "person" as const, id: person.id, data: person, position: { x: PERSON_X, y: PERSON_Y } },
    ];
    const directConns = existingConnections.filter((c) => c.sourceId === person.id || c.targetId === person.id);
    const connectedIds = new Set<string>();
    for (const c of directConns) connectedIds.add(c.sourceId === person.id ? c.targetId : c.sourceId);
    existingNodes.filter((n) => connectedIds.has(n.id)).forEach((n, i, arr) => {
      const angle = -Math.PI / 2 + (i / Math.max(arr.length, 1)) * Math.PI * 2;
      nodes.push({ ...n, position: { x: PERSON_X + Math.cos(angle) * INNER_RADIUS, y: PERSON_Y + Math.sin(angle) * INNER_RADIUS } });
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

  // ─── Focus mode state ─────────────────────────────────────────────────
  const [focusEvidenceId, setFocusEvidenceId] = useState<string | null>(null);
  const [fullEvidence, setFullEvidence] = useState<Evidence | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [newEvidenceIds, setNewEvidenceIds] = useState<Set<string>>(new Set());

  // Right panel state
  const [openSection, setOpenSection] = useState<"people" | "evidence" | null>(null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [comparisonEvidence, setComparisonEvidence] = useState<Evidence | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Force SVG line re-render after accordion opens (DOM needs a frame to mount)
  const [lineRefresh, setLineRefresh] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setLineRefresh((n) => n + 1));
    return () => cancelAnimationFrame(t);
  }, [openSection]);

  // Drag-to-connect
  const [dragState, setDragState] = useState<{ sourceId: string; mouseX: number; mouseY: number } | null>(null);
  const [nearTarget, setNearTarget] = useState<string | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // ─── Evidence fetch + staggered reveal ─────────────────────────────────
  const seenIdsRef = useRef<Set<string>>(new Set());
  const pendingEvidenceRef = useRef<FocusEvidenceItem[]>([]);
  const [revealingId, setRevealingId] = useState<string | null>(null);

  // ─── Derived ──────────────────────────────────────────────────────────
  const evidenceNodes = useMemo(() => focusNodes.filter((n): n is BoardEvidenceNode => n.kind === "evidence"), [focusNodes]);
  const newEvidenceNodes = useMemo(() => evidenceNodes.filter((n) => newEvidenceIds.has(n.id)), [evidenceNodes, newEvidenceIds]);
  const existingEvidenceNodes = useMemo(() => evidenceNodes.filter((n) => !newEvidenceIds.has(n.id)), [evidenceNodes, newEvidenceIds]);
  const existingPeopleNodes = useMemo(() => focusNodes.filter((n) => n.kind === "person" && n.id !== person.id), [focusNodes, person.id]);
  const newEvidenceConns = focusConnections.filter((c) => newEvidenceIds.has(c.sourceId) || newEvidenceIds.has(c.targetId));
  const score = newEvidenceConns.length * 100;

  const focusIndex = focusEvidenceId ? newEvidenceNodes.findIndex((n) => n.id === focusEvidenceId) : -1;
  const focusNode = focusIndex >= 0 ? newEvidenceNodes[focusIndex] : null;

  const isLinked = (targetId: string) => {
    if (!focusEvidenceId) return false;
    return focusConnections.some((c) =>
      (c.sourceId === focusEvidenceId && c.targetId === targetId) ||
      (c.targetId === focusEvidenceId && c.sourceId === targetId),
    );
  };

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

  // ─── Fetch new evidence ───────────────────────────────────────────────
  const fetchEvidence = useCallback(async () => {
    try {
      const excludeIds = [...existingNodes.map((n) => n.id), ...seenIdsRef.current];
      const res = await fetch("/api/focus-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, excludeIds, wave: 1 }),
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      const items = (data.items as FocusEvidenceItem[]).slice(0, NEW_EVIDENCE_COUNT);
      for (const item of items) seenIdsRef.current.add(item.id);
      setNewEvidenceIds(new Set(items.map((i) => i.id)));
      // Store items for staggered reveal
      pendingEvidenceRef.current = items;
      setPhase("investigating");
    } catch { setPhase("investigating"); }
  }, [existingNodes, person.id]);

  useEffect(() => { fetchEvidence(); }, [fetchEvidence]);
  // Auto-arrange ego-wide when entering board mode
  const hasArrangedRef = useRef(false);
  useEffect(() => {
    if (phase === "investigating" && !focusEvidenceId) {
      if (!hasArrangedRef.current) {
        // First time: expand groups → arrange → fit → then reveal new evidence one by one
        const t0 = setTimeout(() => canvasRef.current?.expandAllGroups(), 400);
        const t1 = setTimeout(() => canvasRef.current?.arrangeEgoWide(), 800);
        const t2 = setTimeout(() => canvasRef.current?.zoomFit(), 1400);
        // Stagger new evidence reveal after layout settles
        const revealTimers: ReturnType<typeof setTimeout>[] = [];
        const items = pendingEvidenceRef.current;
        const REVEAL_DELAY = 1800; // start after layout
        const REVEAL_INTERVAL = 800; // between each item
        items.forEach((item, i) => {
          revealTimers.push(setTimeout(() => {
            const angle = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
            const node: BoardNode = {
              kind: "evidence" as const, id: item.id, evidenceType: item.type, data: item as SearchResult,
              position: { x: PERSON_X + Math.cos(angle) * OUTER_RADIUS, y: PERSON_Y + Math.sin(angle) * OUTER_RADIUS },
            };
            setFocusNodes((prev) => [...prev, node]);
            setRevealingId(item.id);
            // Re-arrange, then center camera on the new card
            setTimeout(() => {
              canvasRef.current?.arrangeEgoWide();
              setTimeout(() => canvasRef.current?.centerOnNode(item.id), 400);
            }, 100);
          }, REVEAL_DELAY + i * REVEAL_INTERVAL));
        });
        // Clear arrow after last reveal
        revealTimers.push(setTimeout(() => setRevealingId(null), REVEAL_DELAY + items.length * REVEAL_INTERVAL + 1500));
        hasArrangedRef.current = true;
        return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); revealTimers.forEach(clearTimeout); };
      } else {
        // Subsequent returns from split: just zoom-fit
        const t = setTimeout(() => canvasRef.current?.zoomFit(), 300);
        return () => clearTimeout(t);
      }
    }
  }, [phase, focusEvidenceId]);

  // ─── Fetch full evidence for focus view ───────────────────────────────
  useEffect(() => {
    if (!focusEvidenceId || !focusNode) { setFullEvidence(null); return; }
    setLoadingEvidence(true); setFullEvidence(null);
    fetch(`/api/evidence/${encodeURIComponent(focusEvidenceId)}?type=${focusNode.evidenceType}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setFullEvidence(d); setLoadingEvidence(false); })
      .catch(() => setLoadingEvidence(false));
  }, [focusEvidenceId, focusNode]);

  // ─── Fetch comparison evidence ────────────────────────────────────────
  useEffect(() => {
    if (!comparisonId) { setComparisonEvidence(null); return; }
    const node = existingEvidenceNodes.find((n) => n.id === comparisonId);
    if (!node) return;
    setLoadingComparison(true); setComparisonEvidence(null);
    fetch(`/api/evidence/${encodeURIComponent(comparisonId)}?type=${node.evidenceType}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setComparisonEvidence(d); setLoadingComparison(false); })
      .catch(() => setLoadingComparison(false));
  }, [comparisonId, existingEvidenceNodes]);

  // ─── Drag-to-connect ──────────────────────────────────────────────────
  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      setDragState((p) => p ? { ...p, mouseX: e.clientX, mouseY: e.clientY } : null);
      const targets = document.querySelectorAll("[data-connect-target]");
      let closest: string | null = null;
      let closestDist = 60;
      targets.forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const dist = Math.sqrt((e.clientX - (r.left + r.width / 2)) ** 2 + (e.clientY - (r.top + r.height / 2)) ** 2);
        if (dist < closestDist) { closestDist = dist; closest = (el as HTMLElement).getAttribute("data-connect-target"); }
      });
      setNearTarget(closest);
    };
    const onUp = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      let targetId: string | null = null;
      if (el) { const t = el.closest("[data-connect-target]"); if (t) targetId = t.getAttribute("data-connect-target"); }
      if (targetId && targetId !== dragState.sourceId) {
        const connId = `focus-${dragState.sourceId}-${targetId}`;
        setFocusConnections((prev) => {
          if (prev.some((c) => c.id === connId)) return prev;
          return [...prev, { id: connId, sourceId: dragState.sourceId, targetId, type: "manual" as const, label: "Linked in investigation", strength: 3, verified: true }];
        });
        play("connection");
      }
      setDragState(null); setNearTarget(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragState, play]);

  // ─── ESC handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (comparisonId) setComparisonId(null);
        else if (focusEvidenceId) setFocusEvidenceId(null);
        else onExit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [comparisonId, focusEvidenceId, onExit]);

  // ─── Board callbacks ─────────────────────────────────────────────────
  const handleSelectNode = useCallback((id: string | null) => setSelectedNodeId(id), []);
  const handleFocusNode = useCallback((id: string | null) => {
    setFocusedNodeId(id);
    // Double-click on any evidence or person opens split view
    if (id) setFocusEvidenceId(newEvidenceNodes.length > 0 ? newEvidenceNodes[0].id : null);
  }, [newEvidenceNodes]);
  const handleOpenPhotoView = useCallback((_id: string) => {
    // Open split view starting at first new evidence
    if (newEvidenceNodes.length > 0) setFocusEvidenceId(newEvidenceNodes[0].id);
  }, [newEvidenceNodes]);
  const handleMoveNode = useCallback((id: string, x: number, y: number) => { setFocusNodes((p) => p.map((n) => n.id === id ? { ...n, position: { x, y } } : n)); }, []);
  const handleBatchMoveNodes = useCallback((moves: Record<string, { x: number; y: number }>) => { setFocusNodes((p) => p.map((n) => moves[n.id] ? { ...n, position: moves[n.id] } : n)); }, []);
  const handleStartConnection = useCallback((fromId: string) => setConnectingFrom(fromId), []);
  const handleCompleteConnection = useCallback((toId: string) => {
    if (!connectingFrom || connectingFrom === toId) { setConnectingFrom(null); return; }
    const connId = `focus-${connectingFrom}-${toId}`;
    setFocusConnections((p) => { if (p.some((c) => c.id === connId)) return p; return [...p, { id: connId, sourceId: connectingFrom, targetId: toId, type: "manual" as const, label: "Linked in investigation", strength: 3, verified: true }]; });
    setConnectingFrom(null); play("connection");
  }, [connectingFrom, play]);
  const handleDirectConnection = useCallback((fromId: string, toId: string) => {
    const connId = `focus-${fromId}-${toId}`;
    setFocusConnections((p) => { if (p.some((c) => c.id === connId)) return p; return [...p, { id: connId, sourceId: fromId, targetId: toId, type: "manual" as const, label: "Linked in investigation", strength: 3, verified: true }]; });
    play("connection");
  }, [play]);
  const noopStr = useCallback((_s: string) => {}, []);
  const noopResult = useCallback((_r: SearchResult, _x?: number, _y?: number) => {}, []);

  // ─── Navigation ───────────────────────────────────────────────────────
  const goToEvidence = useCallback((dir: "prev" | "next") => {
    if (newEvidenceNodes.length === 0) return;
    let idx = focusIndex < 0 ? 0 : dir === "prev" ? Math.max(0, focusIndex - 1) : Math.min(newEvidenceNodes.length - 1, focusIndex + 1);
    setFocusEvidenceId(newEvidenceNodes[idx].id);
    setComparisonId(null);
  }, [newEvidenceNodes, focusIndex]);

  // ─── Complete ─────────────────────────────────────────────────────────
  const handleComplete = useCallback(() => {
    const newConns = focusConnections.filter((c) => newEvidenceIds.has(c.sourceId) || newEvidenceIds.has(c.targetId));
    const connected = focusNodes.filter((n) => n.kind === "evidence" && newEvidenceIds.has(n.id) && newConns.some((c) => c.targetId === n.id)).map((n) => n.data as SearchResult);
    setPhase("summary"); setFocusEvidenceId(null); setComparisonId(null);
    const result: InvestigationResult = {
      personId: person.id, connectedEvidence: connected, dismissedEvidence: [], uncertainEvidence: [],
      newConnections: newConns, stats: { connectionsCreated: newConns.length, evidenceDismissed: 0, markedUncertain: 0, pointsEarned: score },
    };
    setCompletedResult(result); play("discovery");
  }, [focusNodes, focusConnections, newEvidenceIds, person.id, score, play]);

  // ─── Evidence content renderer ────────────────────────────────────────
  const renderEvidenceContent = (ev: Record<string, unknown> | null, loading: boolean, fallbackTitle?: string) => {
    if (loading) return <div className="flex h-full items-center justify-center"><span className="font-[family-name:var(--font-mono)] text-[11px] text-[#555]">Loading...</span></div>;
    if (!ev) return <div className="flex h-full items-center justify-center"><span className="text-[11px] text-[#444]">No detail available</span></div>;
    const title = String(ev.title ?? fallbackTitle ?? "");
    const type = String(ev.type ?? "");
    const date = ev.date ? String(ev.date) : null;
    const imageUrl = ev.imageUrl ? String(ev.imageUrl) : null;
    const imageDesc = ev.imageDescription ? String(ev.imageDescription) : null;
    const sender = ev.sender ? String(ev.senderName ?? ev.sender) : null;
    const recipients = Array.isArray(ev.recipients) ? (ev.recipients as string[]) : null;
    const body = ev.body ? String(ev.body) : null;
    const fulltext = ev.fulltext ? String(ev.fulltext) : null;
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b border-[#1a1a1a] px-5 py-3 shrink-0">
          <span className="rounded bg-[#E24B4A]/10 px-2 py-0.5 font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase text-[#E24B4A]/70">{type}</span>
          <h3 className="flex-1 truncate font-[family-name:var(--font-display)] text-[16px] tracking-wide text-white">{title}</h3>
          {date && <span className="font-[family-name:var(--font-mono)] text-[9px] text-[#555]">{date}</span>}
        </div>
        <div className="flex-1 overflow-y-auto">
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
  };

  const isFocus = !!focusEvidenceId;
  const isComparison = !!comparisonId;

  // ─── Render ─────────────────────────────────────────────────────────
  return (
    <div className="focus-mode-enter fixed inset-0 z-[100] flex flex-col bg-[#050505]">
      {/* Top chrome */}
      <div className="relative z-50 flex shrink-0 items-center justify-between border-b border-[#1a1a1a] bg-[#060606] px-5 py-3">
        <button onClick={isFocus ? () => { setFocusEvidenceId(null); setComparisonId(null); } : onExit} className="flex items-center gap-2 text-[11px] text-[#555] transition hover:text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          <span className="text-[#444]">Main Board</span>
          <span className="text-[#333]">/</span>
          <span className="text-[#444]">Investigating {person.name}</span>
          {isFocus && <><span className="text-[#333]">/</span><span className="text-white font-semibold">Evidence {focusIndex + 1} of {newEvidenceNodes.length}</span></>}
        </button>
        <div className="flex items-center gap-4">
          <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-[#4ade80]">{score} pts</span>
          {phase === "investigating" && (
            <button onClick={handleComplete} className="rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-4 py-1.5 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider text-[#E24B4A] transition hover:bg-[#E24B4A]/20">
              Finish Investigation
            </button>
          )}
        </div>
      </div>

      {/* ═══ FOCUS MODE: Split-screen evidence evaluation ═══════════════ */}
      {isFocus && (phase === "investigating" || phase === "summary") && (
        <div ref={splitContainerRef} className="flex flex-1 min-h-0 relative">
          {/* SVG drag line + persistent connection lines */}
          <svg className="pointer-events-none absolute inset-0 z-40" data-refresh={lineRefresh} style={{ width: "100%", height: "100%" }}>
            {/* Persistent connection lines from current evidence to targets */}
            {focusEvidenceId && handleRef.current && splitContainerRef.current && focusConnections
              .filter((c) => c.sourceId === focusEvidenceId || c.targetId === focusEvidenceId)
              .map((c) => {
                const targetId = c.sourceId === focusEvidenceId ? c.targetId : c.sourceId;
                // Only show line if target is visible (Clinton is always visible,
                // others only when their accordion section is open)
                const isSubject = targetId === person.id;
                const isPerson = existingPeopleNodes.some((n) => n.id === targetId);
                const isEvidence = existingEvidenceNodes.some((n) => n.id === targetId);
                if (!isSubject && isPerson && openSection !== "people") return null;
                if (!isSubject && isEvidence && openSection !== "evidence") return null;
                const targetEl = document.querySelector(`[data-connect-target="${targetId}"]`) as HTMLElement | null;
                if (!targetEl || !handleRef.current || !splitContainerRef.current) return null;
                // Check element is actually rendered (has size)
                const tr = targetEl.getBoundingClientRect();
                if (tr.width === 0 || tr.height === 0) return null;
                const box = splitContainerRef.current.getBoundingClientRect();
                const hr = handleRef.current.getBoundingClientRect();
                return (
                  <line key={c.id}
                    x1={hr.left - box.left + hr.width / 2} y1={hr.top - box.top + hr.height / 2}
                    x2={tr.left - box.left + tr.width / 2} y2={tr.top - box.top + tr.height / 2}
                    stroke="#4ade80" strokeWidth={2} strokeOpacity={0.6} strokeLinecap="round" />
                );
              })}
            {/* Active drag line */}
            {dragState && handleRef.current && splitContainerRef.current && (() => {
              const box = splitContainerRef.current!.getBoundingClientRect();
              const r = handleRef.current!.getBoundingClientRect();
              const hx = r.left - box.left + r.width / 2;
              const hy = r.top - box.top + r.height / 2;
              return <line x1={hx} y1={hy} x2={dragState.mouseX - box.left} y2={dragState.mouseY - box.top}
                stroke={nearTarget ? "#4ade80" : "#f87171"} strokeWidth={nearTarget ? 4 : 3}
                strokeOpacity={nearTarget ? 1 : 0.8} strokeDasharray={nearTarget ? "0" : "8 4"} strokeLinecap="round" />;
            })()}
          </svg>

          {/* ── LEFT PANEL: New evidence ───────────────────────────────── */}
          <div className="flex w-1/2 shrink-0 flex-col border-r border-[#1a1a1a] bg-[#080808] relative">
            <div className="flex-1 min-h-0 flex flex-col p-5">
              <div className="flex-1 min-h-0 rounded-xl border border-[#E24B4A]/15 bg-[#0a0a0a] shadow-[0_0_40px_rgba(226,75,74,0.04)] overflow-hidden">
                {renderEvidenceContent(fullEvidence as unknown as Record<string, unknown> | null, loadingEvidence, focusNode?.data.title)}
              </div>
            </div>
            {/* Prev / Next */}
            {!isComparison && (
              <div className="flex items-center justify-center gap-4 border-t border-[#1a1a1a] py-3 shrink-0">
                <button onClick={() => goToEvidence("prev")} disabled={focusIndex <= 0}
                  className="rounded-lg border border-[#2a2a2a] px-4 py-1.5 text-[10px] font-bold text-[#666] transition hover:bg-[#1a1a1a] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">← Prev</button>
                <span className="font-[family-name:var(--font-mono)] text-[10px] text-[#555]">{focusIndex + 1} / {newEvidenceNodes.length}</span>
                {focusIndex < newEvidenceNodes.length - 1 ? (
                  <button onClick={() => goToEvidence("next")} className="rounded-lg border border-[#2a2a2a] px-4 py-1.5 text-[10px] font-bold text-[#666] transition hover:bg-[#1a1a1a] hover:text-white">Next →</button>
                ) : (
                  <button onClick={handleComplete} className="rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-4 py-1.5 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider text-[#E24B4A] transition hover:bg-[#E24B4A]/20">Finish</button>
                )}
              </div>
            )}
            {/* Connection node — right edge, vertically centered */}
            <div
              ref={handleRef}
              onMouseDown={(e) => { if (!focusEvidenceId) return; e.preventDefault(); setDragState({ sourceId: focusEvidenceId, mouseX: e.clientX, mouseY: e.clientY }); }}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-50 flex h-8 w-8 cursor-crosshair items-center justify-center rounded-full border-2 border-red-500/50 bg-red-600/40 shadow-[0_0_10px_3px_rgba(239,68,68,0.3)] transition hover:bg-red-500/70 hover:shadow-[0_0_16px_5px_rgba(239,68,68,0.5)] hover:scale-110"
            >
              <div className="h-2.5 w-2.5 rounded-full bg-red-400 animate-ping" style={{ animationDuration: "2s" }} />
            </div>
          </div>

          {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
          {!isComparison ? (
            /* Default: Clinton + collapsible sections */
            <div className="flex w-1/2 flex-col min-h-0 bg-[#070707]">
              {/* Clinton — pinned, sticky */}
              <div className="shrink-0 border-b border-[#1a1a1a] p-5">
                <div
                  data-connect-target={person.id}
                  className={`flex items-center gap-4 rounded-xl border-2 p-4 transition ${
                    nearTarget === person.id ? "border-[#4ade80]/60 bg-[#4ade80]/5 shadow-[0_0_20px_rgba(74,222,128,0.2)]"
                    : isLinked(person.id) ? "border-[#4ade80]/30 bg-[#4ade80]/5"
                    : "border-[#E24B4A]/25 bg-[#111]"
                  }`}
                >
                  {person.imageUrl ? (
                    <img src={person.imageUrl} alt={person.name} className="h-16 w-16 rounded-full border-2 border-[#E24B4A]/30 object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#E24B4A]/30 bg-[#1a1a1a] text-2xl">👤</div>
                  )}
                  <div>
                    <h3 className="font-[family-name:var(--font-display)] text-[18px] tracking-wide text-white">{person.name}</h3>
                    <p className="text-[10px] text-[#555]">{focusConnections.length} connections · Subject</p>
                  </div>
                  {isLinked(person.id) && <span className="ml-auto text-[8px] font-bold text-[#4ade80]">LINKED</span>}
                </div>
              </div>

              {/* Collapsible sections */}
              <div className="flex-1 overflow-y-auto">
                {/* People section */}
                <button onClick={() => setOpenSection(openSection === "people" ? null : "people")}
                  className="flex w-full items-center justify-between border-b border-[#1a1a1a] px-5 py-3 text-left transition hover:bg-[#0e0e0e]">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.1em] text-[#666]">
                    Connect to people in {person.name.split(" ")[0]}&apos;s network
                  </span>
                  <span className="text-[#444]">{openSection === "people" ? "▾" : "▸"}</span>
                </button>
                {openSection === "people" && (
                  <div className="border-b border-[#1a1a1a] p-3 space-y-2 max-h-[50vh] overflow-y-auto">
                    {existingPeopleNodes.length === 0 && <p className="text-[10px] text-[#444] px-2">No connected people yet</p>}
                    {existingPeopleNodes.map((n) => (
                      <div key={n.id} data-connect-target={n.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 transition ${
                          nearTarget === n.id ? "border-[#4ade80]/60 bg-[#4ade80]/5" : isLinked(n.id) ? "border-[#4ade80]/30 bg-[#4ade80]/5" : "border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333]"
                        }`}>
                        {n.kind === "person" && n.data.imageUrl ? (
                          <img src={n.data.imageUrl} alt={n.data.name} className="h-10 w-10 rounded-full border border-[#333] object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#333] bg-[#1a1a1a] text-sm">👤</div>
                        )}
                        <span className="font-[family-name:var(--font-display)] text-[12px] tracking-wide text-white/80">{n.kind === "person" ? n.data.name : n.id}</span>
                        {isLinked(n.id) && <span className="ml-auto text-[7px] font-bold text-[#4ade80]">LINKED</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Evidence section */}
                <button onClick={() => setOpenSection(openSection === "evidence" ? null : "evidence")}
                  className="flex w-full items-center justify-between border-b border-[#1a1a1a] px-5 py-3 text-left transition hover:bg-[#0e0e0e]">
                  <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.1em] text-[#666]">
                    Connect to evidence in {person.name.split(" ")[0]}&apos;s file
                  </span>
                  <span className="text-[#444]">{openSection === "evidence" ? "▾" : "▸"}</span>
                </button>
                {openSection === "evidence" && (
                  <div className="border-b border-[#1a1a1a] p-3 space-y-1.5 max-h-[50vh] overflow-y-auto">
                    {existingEvidenceNodes.length === 0 && <p className="text-[10px] text-[#444] px-2">No evidence on file yet</p>}
                    {existingEvidenceNodes.map((n) => (
                      <div key={n.id} data-connect-target={n.id}
                        className={`flex items-center gap-2 rounded-lg border p-2.5 transition ${
                          nearTarget === n.id ? "border-[#4ade80]/60 bg-[#4ade80]/5" : isLinked(n.id) ? "border-[#4ade80]/30 bg-[#4ade80]/5" : "border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#333]"
                        }`}>
                        <span className="text-xs shrink-0">
                          {n.evidenceType === "photo" ? "📸" : n.evidenceType === "email" ? "✉️" : n.evidenceType === "document" ? "📄" : "💬"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] text-white/70">{n.data.title}</span>
                          {n.data.snippet && <span className="block truncate text-[8px] text-[#555]">{n.data.snippet}</span>}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setComparisonId(n.id); }}
                          className="shrink-0 rounded border border-[#333] px-2 py-0.5 text-[8px] font-bold text-[#666] transition hover:bg-[#1a1a1a] hover:text-white">
                          View
                        </button>
                        {isLinked(n.id) && <span className="shrink-0 text-[7px] font-bold text-[#4ade80]">LINKED</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Comparison mode: existing document fills right panel */
            <div className="flex w-1/2 flex-col min-h-0 bg-[#080808]" data-connect-target={comparisonId ?? undefined}>
              <div className="flex items-center justify-between border-b border-[#1a1a1a] px-4 py-2.5 shrink-0">
                <span className="font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase tracking-[0.1em] text-[#555]">Comparing with existing evidence</span>
                <button onClick={() => setComparisonId(null)} className="rounded p-1 text-[#555] transition hover:bg-[#1a1a1a] hover:text-white">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 p-5">
                <div className={`h-full rounded-xl border bg-[#0a0a0a] overflow-hidden transition ${
                  nearTarget === comparisonId ? "border-[#4ade80]/60 shadow-[0_0_20px_rgba(74,222,128,0.15)]" : isLinked(comparisonId!) ? "border-[#4ade80]/30" : "border-[#2a2a2a]"
                }`}>
                  {renderEvidenceContent(comparisonEvidence as unknown as Record<string, unknown> | null, loadingComparison)}
                </div>
              </div>
              {isLinked(comparisonId!) && (
                <div className="flex justify-center pb-3">
                  <span className="rounded-full bg-[#4ade80]/10 px-3 py-1 text-[9px] font-bold text-[#4ade80]">LINKED to current evidence</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ BOARD CANVAS (non-focus mode) ══════════════════════════════ */}
      {!isFocus && (
        <div className="relative flex flex-col flex-1 min-h-0">
          {phase === "loading" && (
            <div className="flex h-full items-center justify-center"><p className="font-[family-name:var(--font-mono)] text-[11px] text-[#555]">Gathering evidence for {person.name}...</p></div>
          )}
          {(phase === "investigating" || phase === "summary") && (
            <BoardCanvas ref={canvasRef} archiveTitle={`Investigating ${person.name}`}
              nodes={focusNodes} connections={focusConnections}
              selectedNodeId={selectedNodeId} focusedNodeId={focusedNodeId} focusState={focusState} connectingFrom={connectingFrom}
              onSelectNode={handleSelectNode} onFocusNode={handleFocusNode} onMoveNode={handleMoveNode} onBatchMoveNodes={handleBatchMoveNodes}
              onAddEvidence={noopResult} onAddPerson={noopStr}
              onStartConnection={handleStartConnection} onCompleteConnection={handleCompleteConnection} onDirectConnection={handleDirectConnection}
              onOpenSubjectView={noopStr} onOpenPhotoView={handleOpenPhotoView} initialHideOrphans={false} stats={stats} score={score} />
          )}
          {/* New evidence indicator — centered banner + camera centers on card */}
          {revealingId && (
            <div className="pointer-events-none absolute inset-x-0 top-16 z-50 flex justify-center">
              <div className="animate-bounce flex items-center gap-2 rounded-xl bg-[#E24B4A] px-5 py-2.5 shadow-lg shadow-[#E24B4A]/30">
                <span className="font-[family-name:var(--font-mono)] text-[13px] font-bold uppercase tracking-wider text-white">
                  New Evidence Found
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </div>
            </div>
          )}
          {phase === "summary" && completedResult && (
            <div className="focus-summary-enter absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#111] p-8 shadow-2xl">
                <h2 className="text-center font-[family-name:var(--font-display)] text-2xl tracking-wide text-white">Investigation Complete</h2>
                <p className="mt-1 text-center text-[11px] text-[#555]">{person.name}</p>
                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-[#E24B4A]/5 p-3 text-center"><div className="font-[family-name:var(--font-display)] text-2xl text-[#E24B4A]">{completedResult.stats.connectionsCreated}</div><div className="mt-0.5 text-[9px] text-[#666]">Connections</div></div>
                  <div className="rounded-lg bg-[#1a1a1a] p-3 text-center"><div className="font-[family-name:var(--font-display)] text-2xl text-[#888]">{newEvidenceNodes.length}</div><div className="mt-0.5 text-[9px] text-[#666]">Evidence Reviewed</div></div>
                </div>
                <div className="mt-5 text-center"><span className="font-[family-name:var(--font-mono)] text-lg font-bold text-[#4ade80]">+{completedResult.stats.pointsEarned} pts</span></div>
                {completedResult.connectedEvidence.length > 0 && (
                  <div className="mt-5"><h4 className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[#555]">New Connections</h4>
                    <div className="flex flex-wrap gap-1.5">{completedResult.connectedEvidence.map((e) => <span key={e.id} className="rounded-full bg-[#E24B4A]/10 px-2 py-0.5 text-[9px] text-[#E24B4A]/80">{e.title}</span>)}</div>
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
