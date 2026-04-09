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
const INNER_RADIUS = 280;  // existing connections
const OUTER_RADIUS = 500;  // new evidence

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

  // ─── Local board state (initialized with person + existing connections) ──
  const [focusNodes, setFocusNodes] = useState<BoardNode[]>(() => {
    const nodes: BoardNode[] = [
      { kind: "person" as const, id: person.id, data: person, position: { x: PERSON_X, y: PERSON_Y } },
    ];

    // Pull in existing direct connections from the main board
    const directConns = existingConnections.filter(
      (c) => c.sourceId === person.id || c.targetId === person.id,
    );
    const connectedIds = new Set<string>();
    for (const c of directConns) {
      const otherId = c.sourceId === person.id ? c.targetId : c.sourceId;
      connectedIds.add(otherId);
    }
    const connectedNodes = existingNodes.filter((n) => connectedIds.has(n.id));

    // Position existing connections in inner ring
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

  const [focusConnections, setFocusConnections] = useState<BoardConnection[]>(() => {
    // Include existing connections to this person
    return existingConnections.filter(
      (c) => c.sourceId === person.id || c.targetId === person.id,
    );
  });

  // ─── Canvas interaction state ─────────────────────────────────────────
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  // ─── Split-screen evidence viewer ─────────────────────────────────────
  const [splitEvidenceId, setSplitEvidenceId] = useState<string | null>(null);
  const [fullEvidence, setFullEvidence] = useState<Evidence | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  // ─── Evidence fetch state ─────────────────────────────────────────────
  const seenIdsRef = useRef<Set<string>>(new Set());

  // ─── Derived ──────────────────────────────────────────────────────────
  const evidenceNodes = useMemo(
    () => focusNodes.filter((n): n is BoardEvidenceNode => n.kind === "evidence"),
    [focusNodes],
  );
  const connectedEvidenceIds = useMemo(
    () => new Set(focusConnections.map((c) => c.targetId)),
    [focusConnections],
  );
  const unconnectedCount = evidenceNodes.filter((n) => !connectedEvidenceIds.has(n.id)).length;
  const score = focusConnections.length * 100;

  // Current split index for prev/next
  const splitIndex = splitEvidenceId ? evidenceNodes.findIndex((n) => n.id === splitEvidenceId) : -1;
  const splitNode = splitIndex >= 0 ? evidenceNodes[splitIndex] : null;

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

  // ─── Fetch 6 new evidence items (one-time) ─────────────────────────────
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

      // Position in a clean circle (outer ring, starting from 12 o'clock)
      const newNodes: BoardNode[] = items.map((item, i) => {
        const angle = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
        return {
          kind: "evidence" as const,
          id: item.id,
          evidenceType: item.type,
          data: item as SearchResult,
          position: {
            x: PERSON_X + Math.cos(angle) * OUTER_RADIUS,
            y: PERSON_Y + Math.sin(angle) * OUTER_RADIUS,
          },
        };
      });

      setFocusNodes((prev) => [...prev, ...newNodes]);
      setPhase("investigating");
    } catch (err) {
      console.error("Focus evidence fetch error:", err);
      setPhase("investigating");
    }
  }, [existingNodes, person.id]);

  useEffect(() => {
    fetchEvidence();
  }, [fetchEvidence]);

  // Center on person after evidence loads
  useEffect(() => {
    if (phase === "investigating") {
      const t = setTimeout(() => canvasRef.current?.centerOnNode(person.id), 800);
      return () => clearTimeout(t);
    }
  }, [phase, person.id]);

  // ─── Fetch full evidence detail for split viewer ──────────────────────
  useEffect(() => {
    if (!splitEvidenceId || !splitNode) {
      setFullEvidence(null);
      return;
    }
    setLoadingEvidence(true);
    setFullEvidence(null);
    fetch(`/api/evidence/${encodeURIComponent(splitEvidenceId)}?type=${splitNode.evidenceType}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setFullEvidence(data);
        setLoadingEvidence(false);
      })
      .catch(() => setLoadingEvidence(false));
  }, [splitEvidenceId, splitNode]);

  // Center camera on split evidence
  useEffect(() => {
    if (splitEvidenceId) {
      setTimeout(() => canvasRef.current?.centerOnNode(splitEvidenceId), 100);
    }
  }, [splitEvidenceId]);

  // ─── ESC handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (splitEvidenceId) {
          setSplitEvidenceId(null);
        } else {
          onExit();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [splitEvidenceId, onExit]);

  // ─── Board callbacks ─────────────────────────────────────────────────
  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const handleFocusNode = useCallback(
    (id: string | null) => {
      setFocusedNodeId(id);
      // Double-click on evidence (non-photo) triggers focus → open split viewer
      if (id) {
        const node = focusNodes.find((n) => n.id === id);
        if (node && node.kind === "evidence") {
          setSplitEvidenceId(id);
        }
      }
    },
    [focusNodes],
  );

  const handleOpenPhotoView = useCallback((id: string) => {
    // Double-click on photo evidence → open split viewer
    setSplitEvidenceId(id);
  }, []);

  const handleMoveNode = useCallback((id: string, x: number, y: number) => {
    setFocusNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)),
    );
  }, []);

  const handleBatchMoveNodes = useCallback((moves: Record<string, { x: number; y: number }>) => {
    setFocusNodes((prev) =>
      prev.map((n) => (moves[n.id] ? { ...n, position: moves[n.id] } : n)),
    );
  }, []);

  const handleStartConnection = useCallback((fromId: string) => {
    setConnectingFrom(fromId);
  }, []);

  const handleCompleteConnection = useCallback(
    (toId: string) => {
      if (!connectingFrom || connectingFrom === toId) {
        setConnectingFrom(null);
        return;
      }
      const connId = `focus-${connectingFrom}-${toId}`;
      setFocusConnections((prev) => {
        if (prev.some((c) => c.id === connId)) return prev;
        return [
          ...prev,
          {
            id: connId,
            sourceId: connectingFrom,
            targetId: toId,
            type: "manual" as const,
            label: "Linked in investigation",
            strength: 3,
            verified: true,
          },
        ];
      });
      setConnectingFrom(null);
      play("connection");
    },
    [connectingFrom, play],
  );

  const handleDirectConnection = useCallback(
    (fromId: string, toId: string) => {
      const connId = `focus-${fromId}-${toId}`;
      setFocusConnections((prev) => {
        if (prev.some((c) => c.id === connId)) return prev;
        return [
          ...prev,
          {
            id: connId,
            sourceId: fromId,
            targetId: toId,
            type: "manual" as const,
            label: "Linked in investigation",
            strength: 3,
            verified: true,
          },
        ];
      });
      play("connection");
    },
    [play],
  );

  const noopStr = useCallback((_s: string) => {}, []);
  const noopResult = useCallback((_r: SearchResult, _x?: number, _y?: number) => {}, []);

  // ─── Split-screen navigation ──────────────────────────────────────────
  const goToEvidence = useCallback(
    (direction: "prev" | "next") => {
      if (evidenceNodes.length === 0) return;
      let newIdx: number;
      if (splitIndex < 0) {
        newIdx = 0;
      } else if (direction === "prev") {
        newIdx = (splitIndex - 1 + evidenceNodes.length) % evidenceNodes.length;
      } else {
        newIdx = (splitIndex + 1) % evidenceNodes.length;
      }
      setSplitEvidenceId(evidenceNodes[newIdx].id);
    },
    [evidenceNodes, splitIndex],
  );

  // Connect current split evidence to person
  const connectSplitEvidence = useCallback(() => {
    if (!splitEvidenceId) return;
    const connId = `focus-${person.id}-${splitEvidenceId}`;
    setFocusConnections((prev) => {
      if (prev.some((c) => c.id === connId)) return prev;
      return [
        ...prev,
        {
          id: connId,
          sourceId: person.id,
          targetId: splitEvidenceId,
          type: "manual" as const,
          label: "Linked in investigation",
          strength: 3,
          verified: true,
        },
      ];
    });
    play("connection");
  }, [splitEvidenceId, person.id, play]);

  // ─── Complete investigation ─────────────────────────────────────────
  const handleComplete = useCallback(() => {
    const connectedEvIds = new Set(focusConnections.map((c) => c.targetId));
    const connected = focusNodes
      .filter((n) => n.kind === "evidence" && connectedEvIds.has(n.id))
      .map((n) => n.data as SearchResult);

    const result: InvestigationResult = {
      personId: person.id,
      connectedEvidence: connected,
      dismissedEvidence: [],
      uncertainEvidence: [],
      newConnections: focusConnections,
      stats: {
        connectionsCreated: focusConnections.length,
        evidenceDismissed: 0,
        markedUncertain: 0,
        pointsEarned: score,
      },
    };

    setPhase("summary");
    setSplitEvidenceId(null);
    setCompletedResult(result);
    play("discovery");
  }, [focusNodes, focusConnections, person.id, score, play]);

  // ─── Render ─────────────────────────────────────────────────────────
  const isSplit = !!splitEvidenceId;
  const isConnected = splitEvidenceId ? connectedEvidenceIds.has(splitEvidenceId) : false;
  // Safe accessor for the Evidence union type
  const ev = fullEvidence as unknown as Record<string, unknown> | null;

  return (
    <div className="focus-mode-enter fixed inset-0 z-[100] flex flex-col bg-[#050505]">
      {/* Top bar */}
      <div className="relative z-50 flex shrink-0 items-center justify-between border-b border-[#1a1a1a] px-5 py-3">
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-[11px] text-[#555] transition hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="text-[#444]">Main Board</span>
          <span className="text-[#333]">/</span>
          <span className="text-[#888]">Investigating <strong className="font-semibold text-white">{person.name}</strong></span>
        </button>

        <div className="flex items-center gap-4">
          <span className="font-[family-name:var(--font-mono)] text-[10px] text-[#555]">
            {focusConnections.length} connection{focusConnections.length !== 1 ? "s" : ""} · {evidenceNodes.length} evidence
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-[#4ade80]">
            {score} pts
          </span>
          {focusConnections.length > 0 && phase === "investigating" && (
            <button
              onClick={handleComplete}
              className="rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-4 py-1.5 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider text-[#E24B4A] transition hover:bg-[#E24B4A]/20"
            >
              Complete Investigation
            </button>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Split-screen evidence panel (left) */}
        {isSplit && (
          <div className="flex w-1/2 shrink-0 flex-col border-r border-[#1a1a1a] bg-[#080808]">
            {/* Split header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[#1a1a1a] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToEvidence("prev")}
                  className="rounded p-1 text-[#555] transition hover:bg-[#1a1a1a] hover:text-white"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="font-[family-name:var(--font-mono)] text-[10px] text-[#555]">
                  {splitIndex + 1} / {evidenceNodes.length}
                </span>
                <button
                  onClick={() => goToEvidence("next")}
                  className="rounded p-1 text-[#555] transition hover:bg-[#1a1a1a] hover:text-white"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {!isConnected && (
                  <button
                    onClick={connectSplitEvidence}
                    className="rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-3 py-1 font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase tracking-wider text-[#E24B4A] transition hover:bg-[#E24B4A]/20"
                  >
                    Connect
                  </button>
                )}
                {isConnected && (
                  <span className="font-[family-name:var(--font-mono)] text-[9px] font-bold text-[#E24B4A]">
                    LINKED
                  </span>
                )}
                <button
                  onClick={() => setSplitEvidenceId(null)}
                  className="rounded p-1 text-[#555] transition hover:bg-[#1a1a1a] hover:text-white"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Evidence content */}
            <div className="flex-1 overflow-y-auto p-5">
              {loadingEvidence && (
                <div className="flex h-32 items-center justify-center">
                  <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#555]">Loading...</span>
                </div>
              )}

              {!loadingEvidence && ev && (() => {
                const title = String(ev.title ?? splitNode?.data.title ?? "");
                const type = String(ev.type ?? splitNode?.evidenceType ?? "");
                const date = ev.date ? String(ev.date) : null;
                const imageUrl = ev.imageUrl ? String(ev.imageUrl) : null;
                const imageDesc = ev.imageDescription ? String(ev.imageDescription) : null;
                const sender = ev.sender ? String(ev.senderName ?? ev.sender) : null;
                const recipients = Array.isArray(ev.recipients) ? (ev.recipients as string[]) : null;
                const body = ev.body ? String(ev.body) : null;
                const fulltext = ev.fulltext ? String(ev.fulltext) : null;
                const faces = Array.isArray(ev.facesDetected) ? (ev.facesDetected as Array<{personId: string; name: string}>) : [];
                const filename = ev.filename ? String(ev.filename) : null;
                const volume = ev.volume ? String(ev.volume) : null;
                const pageCount = ev.pageCount ? Number(ev.pageCount) : null;

                return (
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-xl tracking-wide text-white">
                    {title}
                  </h3>

                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded bg-[#E24B4A]/10 px-2 py-0.5 font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase text-[#E24B4A]/70">
                      {type}
                    </span>
                    {date && (
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-[#555]">{date}</span>
                    )}
                  </div>

                  {imageUrl && (
                    <img src={imageUrl} alt={title} className="mt-4 w-full rounded-lg border border-[#2a2a2a] object-contain" />
                  )}

                  {imageDesc && (
                    <p className="mt-3 text-[12px] leading-relaxed text-[#888]">{imageDesc}</p>
                  )}

                  {sender && (
                    <div className="mt-4 space-y-1 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-3">
                      <p className="text-[10px] text-[#777]">
                        <span className="text-[#555]">From:</span> {sender}
                      </p>
                      {recipients && (
                        <p className="text-[10px] text-[#777]">
                          <span className="text-[#555]">To:</span> {recipients.join(", ")}
                        </p>
                      )}
                    </div>
                  )}

                  {body && (
                    <div className="mt-4 rounded-lg border border-[#1a1a1a] bg-[#060606] p-4">
                      <pre className="whitespace-pre-wrap font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[#bbb]">{body}</pre>
                    </div>
                  )}

                  {fulltext && (
                    <div className="mt-4 rounded-lg border border-[#1a1a1a] bg-[#060606] p-4">
                      <pre className="whitespace-pre-wrap font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[#bbb]">{fulltext}</pre>
                    </div>
                  )}

                  {faces.length > 0 && (
                    <div className="mt-4">
                      <h4 className="mb-2 font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase tracking-wider text-[#555]">
                        Detected Persons
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {faces.map((f) => (
                          <span key={f.personId} className="rounded-full bg-[#E24B4A]/10 px-2 py-0.5 text-[9px] text-[#E24B4A]/80">
                            {f.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {filename && (
                    <div className="mt-4 space-y-1 text-[10px] text-[#555]">
                      <p>File: {filename}</p>
                      {volume && <p>Volume: {volume}</p>}
                      {pageCount && <p>Pages: {pageCount}</p>}
                    </div>
                  )}
                </div>
                );
              })()}

              {!loadingEvidence && !ev && splitEvidenceId && (
                <div className="flex h-32 items-center justify-center">
                  <span className="text-[11px] text-[#444]">No detail available</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Board Canvas (right in split, full-width otherwise) */}
        <div className="relative flex flex-col flex-1 min-h-0">
          {phase === "loading" && (
            <div className="flex h-full items-center justify-center">
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[#555]">
                Gathering evidence for {person.name}...
              </p>
            </div>
          )}

          {(phase === "investigating" || phase === "summary") && (
            <BoardCanvas
              ref={canvasRef}
              archiveTitle={`Investigating ${person.name}`}
              nodes={focusNodes}
              connections={focusConnections}
              selectedNodeId={selectedNodeId}
              focusedNodeId={focusedNodeId}
              focusState={focusState}
              connectingFrom={connectingFrom}
              onSelectNode={handleSelectNode}
              onFocusNode={handleFocusNode}
              onMoveNode={handleMoveNode}
              onBatchMoveNodes={handleBatchMoveNodes}
              onAddEvidence={noopResult}
              onAddPerson={noopStr}
              onStartConnection={handleStartConnection}
              onCompleteConnection={handleCompleteConnection}
              onDirectConnection={handleDirectConnection}
              onOpenSubjectView={noopStr}
              onOpenPhotoView={handleOpenPhotoView}
              stats={stats}
              score={score}
            />
          )}

          {/* Summary overlay */}
          {phase === "summary" && completedResult && (
            <div className="focus-summary-enter absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#111] p-8 shadow-2xl">
                <h2 className="text-center font-[family-name:var(--font-display)] text-2xl tracking-wide text-white">
                  Investigation Complete
                </h2>
                <p className="mt-1 text-center text-[11px] text-[#555]">
                  {person.name}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-[#E24B4A]/5 p-3 text-center">
                    <div className="font-[family-name:var(--font-display)] text-2xl text-[#E24B4A]">
                      {completedResult.stats.connectionsCreated}
                    </div>
                    <div className="mt-0.5 text-[9px] text-[#666]">Connections</div>
                  </div>
                  <div className="rounded-lg bg-[#1a1a1a] p-3 text-center">
                    <div className="font-[family-name:var(--font-display)] text-2xl text-[#888]">
                      {evidenceNodes.length}
                    </div>
                    <div className="mt-0.5 text-[9px] text-[#666]">Evidence Reviewed</div>
                  </div>
                </div>

                <div className="mt-5 text-center">
                  <span className="font-[family-name:var(--font-mono)] text-lg font-bold text-[#4ade80]">
                    +{completedResult.stats.pointsEarned} pts
                  </span>
                </div>

                {completedResult.connectedEvidence.length > 0 && (
                  <div className="mt-5">
                    <h4 className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[#555]">
                      New Connections
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {completedResult.connectedEvidence.map((e) => (
                        <span
                          key={e.id}
                          className="rounded-full bg-[#E24B4A]/10 px-2 py-0.5 text-[9px] text-[#E24B4A]/80"
                        >
                          {e.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `OpenCase Investigation: ${person.name}\n${completedResult.stats.connectionsCreated} connections found\n${completedResult.stats.pointsEarned} points earned`,
                      );
                    }}
                    className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2.5 text-[10px] font-bold text-[#888] transition hover:bg-[#222] hover:text-white"
                  >
                    Share Results
                  </button>
                  <button
                    onClick={() => onComplete(completedResult)}
                    className="flex-1 rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/10 py-2.5 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider text-[#E24B4A] transition hover:bg-[#E24B4A]/20"
                  >
                    Return to Board
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
