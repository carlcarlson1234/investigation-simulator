"use client";

import { forwardRef, useRef, useCallback, useState, useEffect } from "react";
import type { BoardNode, BoardConnection, FocusState } from "@/lib/board-types";
import type { Person, SearchResult, ArchiveStats, EvidenceType } from "@/lib/types";
import {
  EVIDENCE_TYPE_ICON,
  EVIDENCE_TYPE_LABEL,
  CONNECTION_TYPE_COLOR,
} from "@/lib/board-types";

interface BoardCanvasProps {
  archiveTitle: string;
  archiveSubtitle: string;
  nodes: BoardNode[];
  connections: BoardConnection[];
  selectedNodeId: string | null;
  focusedNodeId: string | null;
  focusState: FocusState | null;
  connectingFrom: string | null;
  onSelectNode: (id: string | null) => void;
  onFocusNode: (id: string | null) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onAddEvidence: (result: SearchResult, x?: number, y?: number) => void;
  onAddPerson: (personId: string, x?: number, y?: number) => void;
  onStartConnection: (fromId: string) => void;
  onCompleteConnection: (toId: string) => void;
  stats: ArchiveStats;
}

export const BoardCanvas = forwardRef<HTMLDivElement, BoardCanvasProps>(function BoardCanvas(
  {
    archiveTitle,
    archiveSubtitle,
    nodes,
    connections,
    selectedNodeId,
    focusedNodeId,
    focusState,
    connectingFrom,
    onSelectNode,
    onFocusNode,
    onMoveNode,
    onAddEvidence,
    onAddPerson,
    onStartConnection,
    onCompleteConnection,
    stats,
  },
  ref
) {
  const internalRef = useRef<HTMLDivElement>(null);
  const canvasEl = (ref as React.RefObject<HTMLDivElement>) ?? internalRef;

  const [dragState, setDragState] = useState<{
    nodeId: string; offsetX: number; offsetY: number;
  } | null>(null);
  const [dropHighlight, setDropHighlight] = useState(false);

  // ─── Focus visibility ──────────────────────────────────────────────────

  function getNodeVis(nodeId: string): "focused" | "direct" | "second" | "dimmed" | "normal" {
    if (!focusState) return "normal";
    if (nodeId === focusState.nodeId) return "focused";
    if (focusState.directIds.has(nodeId)) return "direct";
    if (focusState.secondIds.has(nodeId)) return "second";
    return "dimmed";
  }

  function getEdgeVis(connId: string): "highlight" | "faded" | "normal" {
    if (!focusState) return "normal";
    if (focusState.edgeIds.has(connId)) return "highlight";
    return "faded";
  }

  // ─── Node dragging ─────────────────────────────────────────────────────

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      e.preventDefault();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const rect = canvasEl.current?.getBoundingClientRect();
      if (!rect) return;
      const scrollEl = canvasEl.current!;
      setDragState({
        nodeId,
        offsetX: e.clientX - rect.left + scrollEl.scrollLeft - node.position.x,
        offsetY: e.clientY - rect.top + scrollEl.scrollTop - node.position.y,
      });
      onSelectNode(nodeId);
    },
    [nodes, onSelectNode, canvasEl]
  );

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      const rect = canvasEl.current?.getBoundingClientRect();
      if (!rect) return;
      const scrollEl = canvasEl.current!;
      onMoveNode(dragState.nodeId,
        Math.max(0, e.clientX - rect.left + scrollEl.scrollLeft - dragState.offsetX),
        Math.max(0, e.clientY - rect.top + scrollEl.scrollTop - dragState.offsetY));
    };
    const onUp = () => setDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragState, onMoveNode, canvasEl]);

  // ─── ESC ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (connectingFrom) onStartConnection(""); // cancel
        else if (focusedNodeId) onFocusNode(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedNodeId, connectingFrom, onFocusNode, onStartConnection]);

  // ─── Drop from panels ─────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropHighlight(true);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropHighlight(false);
      const raw = e.dataTransfer.getData("application/board-item");
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        const rect = canvasEl.current?.getBoundingClientRect();
        if (!rect) return;
        const scrollEl = canvasEl.current!;
        const x = Math.max(0, e.clientX - rect.left + scrollEl.scrollLeft - 85);
        const y = Math.max(0, e.clientY - rect.top + scrollEl.scrollTop - 40);

        if (parsed.kind === "person") {
          onAddPerson(parsed.id, x, y);
        } else if (parsed.kind === "evidence" && parsed.data) {
          onAddEvidence(parsed.data as SearchResult, x, y);
        }
      } catch { /* ignore */ }
    },
    [onAddEvidence, onAddPerson, canvasEl]
  );

  function getNodeCenter(nodeId: string): { cx: number; cy: number } | null {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    return { cx: node.position.x + 85, cy: node.position.y + 40 };
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-[#0d0e0c] px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold uppercase tracking-[0.12em] text-foreground/80" id="board-title">
            {archiveTitle}
          </h1>
          <span className="evidence-badge border border-accent/20 bg-accent/5 text-accent">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            LIVE
          </span>
          <span className="ml-auto text-[9px] text-muted/40 tabular-nums">
            {stats.emailCount.toLocaleString()} emails · {stats.documentCount.toLocaleString()} docs · {stats.photoCount.toLocaleString()} photos · {stats.personCount} persons
          </span>
        </div>
      </div>

      {/* Focus bar */}
      {focusedNodeId && (
        <div className="flex-shrink-0 flex items-center gap-2 border-b border-accent/20 bg-accent/5 px-4 py-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent">
            <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
            Focused: {(() => {
              const n = nodes.find((n) => n.id === focusedNodeId);
              if (!n) return "Unknown";
              return n.kind === "person" ? n.data.name : n.data.title;
            })()}
          </span>
          <button onClick={() => onFocusNode(null)} className="ml-auto text-[9px] text-accent/60 hover:text-accent transition">
            ESC to clear ×
          </button>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasEl}
        className={`board-canvas relative flex-1 overflow-auto dot-grid ${
          dropHighlight ? "ring-2 ring-accent/20 ring-inset" : ""
        } ${connectingFrom ? "cursor-crosshair" : ""}`}
        onClick={() => onSelectNode(null)}
        onDragOver={handleDragOver}
        onDragLeave={() => setDropHighlight(false)}
        onDrop={handleDrop}
        id="board-canvas"
        style={{ minWidth: "2000px", minHeight: "1500px" }}
      >
        {/* Lines */}
        <svg className="pointer-events-none absolute inset-0" style={{ zIndex: 0, width: "100%", height: "100%" }}>
          {connections.map((conn) => {
            const from = getNodeCenter(conn.sourceId);
            const to = getNodeCenter(conn.targetId);
            if (!from || !to) return null;
            const color = CONNECTION_TYPE_COLOR[conn.type] ?? "#c8a55a";
            const vis = getEdgeVis(conn.id);
            return (
              <line key={conn.id}
                x1={from.cx} y1={from.cy} x2={to.cx} y2={to.cy}
                stroke={color}
                strokeWidth={vis === "highlight" ? 2 : 1}
                strokeOpacity={vis === "highlight" ? 0.6 : vis === "faded" ? 0.06 : 0.2}
                strokeDasharray={conn.verified ? "none" : "6 4"}
                className="transition-all duration-300"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          const vis = getNodeVis(node.id);
          const opc = vis === "dimmed" ? "opacity-15" : vis === "second" ? "opacity-45" : "opacity-100";
          return (
            <div
              key={node.id}
              className={`board-node absolute select-none transition-all duration-300 ${opc} ${
                selectedNodeId === node.id ? "ring-1 ring-accent/50" : ""
              } ${vis === "focused" ? "ring-2 ring-accent shadow-lg shadow-accent/15" : ""} ${
                connectingFrom && connectingFrom !== node.id ? "ring-1 ring-dashed ring-accent/20 hover:ring-accent/50" : ""
              }`}
              style={{
                left: node.position.x, top: node.position.y,
                zIndex: vis === "focused" ? 30 : selectedNodeId === node.id ? 20 : vis === "dimmed" ? 5 : 10,
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              onClick={(e) => {
                e.stopPropagation();
                if (connectingFrom) onCompleteConnection(node.id);
                else onSelectNode(node.id);
              }}
              onDoubleClick={(e) => { e.stopPropagation(); onFocusNode(node.id); }}
            >
              {node.kind === "person" ? (
                <PersonCard data={node.data} isSelected={selectedNodeId === node.id}
                  onConnect={() => onStartConnection(node.id)} onFocus={() => onFocusNode(node.id)} />
              ) : (
                <EvidenceCard data={node.data} evidenceType={node.evidenceType} isSelected={selectedNodeId === node.id}
                  onConnect={() => onStartConnection(node.id)} onFocus={() => onFocusNode(node.id)} />
              )}
            </div>
          );
        })}

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ position: "fixed" }}>
            <div className="text-center opacity-40">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 text-muted/30">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p className="text-xs text-muted/40 uppercase tracking-wider font-semibold">No evidence on board</p>
              <p className="text-[10px] text-muted/30 mt-1">Search on the left · Drag people from the right</p>
            </div>
          </div>
        )}

        {connectingFrom && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 rounded border border-accent/30 bg-accent/10 px-4 py-2 text-xs text-accent backdrop-blur-sm font-semibold uppercase tracking-wider">
            Click target to connect · ESC to cancel
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Person Card ────────────────────────────────────────────────────────────

function PersonCard({ data, isSelected, onConnect, onFocus }: {
  data: Person; isSelected: boolean; onConnect: () => void; onFocus: () => void;
}) {
  return (
    <div className={`board-entity-card w-[170px] rounded border border-amber-700/20 bg-[#111210] p-3 cursor-grab active:cursor-grabbing ${
      isSelected ? "shadow-lg shadow-accent/15" : "shadow-md shadow-black/40"
    }`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-600 flex-shrink-0" />
        <span className="text-[7px] font-bold uppercase tracking-[0.15em] text-muted/50">Person of Interest</span>
      </div>
      <h4 className="text-xs font-bold leading-tight text-foreground/90">{data.name}</h4>
      {data.photoCount > 0 && (
        <p className="mt-0.5 text-[8px] text-muted/40">{data.photoCount} photos in archive</p>
      )}
      {data.source && <p className="mt-0.5 text-[8px] text-muted/40">{data.source}</p>}

      <div className="mt-2 flex gap-1 opacity-0 [.board-node:hover_&]:opacity-100 transition">
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onConnect(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded bg-accent/10 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-accent/60 hover:bg-accent/20 hover:text-accent transition">Link</button>
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onFocus(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded bg-accent/10 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-accent/60 hover:bg-accent/20 hover:text-accent transition">Focus</button>
      </div>
    </div>
  );
}

// ─── Evidence Card ──────────────────────────────────────────────────────────

function EvidenceCard({ data, evidenceType, isSelected, onConnect, onFocus }: {
  data: SearchResult; evidenceType: EvidenceType; isSelected: boolean; onConnect: () => void; onFocus: () => void;
}) {
  return (
    <div className={`board-evidence-card w-[170px] rounded border border-border bg-[#111210] p-2.5 cursor-grab active:cursor-grabbing ${
      isSelected ? "shadow-lg shadow-accent/15" : "shadow-md shadow-black/40"
    }`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs">{EVIDENCE_TYPE_ICON[evidenceType]}</span>
        <span className="text-[7px] font-bold uppercase tracking-[0.15em] text-muted/50">
          {EVIDENCE_TYPE_LABEL[evidenceType]}
        </span>
      </div>
      <h4 className="text-[10px] font-bold leading-tight text-foreground/90 line-clamp-2">{data.title}</h4>
      {data.date && <p className="mt-0.5 text-[8px] text-muted/40 tabular-nums">{data.date}</p>}
      {data.sender && <p className="mt-0.5 text-[8px] text-muted/40 truncate">{data.sender}</p>}
      <p className="mt-1 text-[8px] leading-relaxed text-muted/30 line-clamp-2">{data.snippet}</p>

      {data.starCount > 0 && (
        <div className="mt-1 text-[7px] text-amber-500/50">★ {data.starCount.toLocaleString()}</div>
      )}

      <div className="mt-1.5 flex gap-1 opacity-0 [.board-node:hover_&]:opacity-100 transition">
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onConnect(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded bg-accent/10 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-accent/60 hover:bg-accent/20 hover:text-accent transition">Link</button>
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onFocus(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded bg-accent/10 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-accent/60 hover:bg-accent/20 hover:text-accent transition">Focus</button>
      </div>
    </div>
  );
}
