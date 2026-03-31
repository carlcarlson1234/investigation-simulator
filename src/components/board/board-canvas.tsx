"use client";

import { forwardRef, useRef, useCallback, useState, useEffect, useImperativeHandle } from "react";
import type { BoardNode, BoardConnection, FocusState } from "@/lib/board-types";
import type { Person, SearchResult, ArchiveStats, EvidenceType } from "@/lib/types";
import {
  EVIDENCE_TYPE_ICON,
  EVIDENCE_TYPE_LABEL,
} from "@/lib/board-types";

/* ── Zoom constants ─────────────────────────────────────────────────────── */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 1;
const WORLD_W = 4000;
const WORLD_H = 3000;

/* ── Public handle so parent can call centerOnNode ──────────────────────── */
export interface BoardCanvasHandle {
  centerOnNode: (nodeId: string) => void;
}

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

export const BoardCanvas = forwardRef<BoardCanvasHandle, BoardCanvasProps>(function BoardCanvas(
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
  /* ── Refs ──────────────────────────────────────────────────────────────── */
  const viewportRef = useRef<HTMLDivElement>(null);   // the outer scrollable viewport

  /* ── Zoom state ────────────────────────────────────────────────────────── */
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  /* ── Drag-to-pan state ─────────────────────────────────────────────────── */
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  /* ── Node drag state ───────────────────────────────────────────────────── */
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

  /* ── Center-on-node (exposed via ref) ──────────────────────────────────── */
  const centerOnNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    const vp = viewportRef.current;
    if (!node || !vp) return;

    const cardW = 190;
    const cardH = node.kind === "person" ? 120 : 140;

    // The centre of the card in world-space, then scaled
    const scaledX = (node.position.x + cardW / 2) * zoom;
    const scaledY = (node.position.y + cardH / 2) * zoom;

    // Scroll so that point lands in the centre of the viewport
    const scrollX = scaledX - vp.clientWidth / 2;
    const scrollY = scaledY - vp.clientHeight / 2;

    vp.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
  }, [nodes, zoom]);

  useImperativeHandle(ref, () => ({ centerOnNode }), [centerOnNode]);

  /* ── Zoom helpers ──────────────────────────────────────────────────────── */
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const zoomReset = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
    viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }, []);
  const zoomFit = useCallback(() => {
    if (!viewportRef.current || nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + 190);
      maxY = Math.max(maxY, n.position.y + 140);
    }
    const padding = 80;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    const vp = viewportRef.current;
    const fitZoom = clampZoom(Math.min(vp.clientWidth / contentW, vp.clientHeight / contentH));
    setZoom(fitZoom);
    requestAnimationFrame(() => {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      vp.scrollTo({
        left: cx * fitZoom - vp.clientWidth / 2,
        top: cy * fitZoom - vp.clientHeight / 2,
        behavior: "smooth",
      });
    });
  }, [nodes]);

  /* ── Wheel-to-zoom (Ctrl+scroll) ────────────────────────────────────────── */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom((prev) => {
          const next = clampZoom(prev + delta);
          const rect = vp.getBoundingClientRect();
          const cursorX = e.clientX - rect.left;
          const cursorY = e.clientY - rect.top;
          // World-space point under cursor
          const worldX = (vp.scrollLeft + cursorX) / prev;
          const worldY = (vp.scrollTop + cursorY) / prev;
          // After zoom, keep that world point under cursor
          requestAnimationFrame(() => {
            vp.scrollLeft = worldX * next - cursorX;
            vp.scrollTop = worldY * next - cursorY;
          });
          return next;
        });
      }
      // Without Ctrl: natural scroll = pan (handled by overflow:auto)
    };

    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  /* ── Click-drag-to-pan ─────────────────────────────────────────────────── */

  // Helper: is the target a background element (not a card/button)?
  const isBackgroundTarget = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof HTMLElement)) return false;
    // Allow pan if clicking on: the viewport, the sizer, the world div, the SVG, or the dot-grid
    const el = target as HTMLElement;
    if (el.id === "board-viewport") return true;
    if (el.id === "board-sizer") return true;
    if (el.id === "board-world") return true;
    if (el.tagName === "svg" || el.tagName === "SVG") return true;
    // Check if this is the dot-grid background
    if (el.classList.contains("dot-grid")) return true;
    return false;
  }, []);

  const handleViewportMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle-click always pans; left-click pans if on background
    if (e.button === 1 || (e.button === 0 && isBackgroundTarget(e.target))) {
      e.preventDefault();
      setIsPanning(true);
      const vp = viewportRef.current!;
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: vp.scrollLeft,
        scrollTop: vp.scrollTop,
      };
    }
  }, [isBackgroundTarget]);

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      vp.scrollLeft = panStart.current.scrollLeft - dx;
      vp.scrollTop = panStart.current.scrollTop - dy;
    };
    const onUp = () => setIsPanning(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isPanning]);

  // ─── Node dragging ─────────────────────────────────────────────────────

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      e.preventDefault();
      const node = nodes.find((n) => n.id === nodeId);
      const vp = viewportRef.current;
      if (!node || !vp) return;

      const rect = vp.getBoundingClientRect();
      const worldX = (e.clientX - rect.left + vp.scrollLeft) / zoom;
      const worldY = (e.clientY - rect.top + vp.scrollTop) / zoom;

      setDragState({
        nodeId,
        offsetX: worldX - node.position.x,
        offsetY: worldY - node.position.y,
      });
      onSelectNode(nodeId);
    },
    [nodes, zoom, onSelectNode]
  );

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e: MouseEvent) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const worldX = (e.clientX - rect.left + vp.scrollLeft) / zoom;
      const worldY = (e.clientY - rect.top + vp.scrollTop) / zoom;
      onMoveNode(
        dragState.nodeId,
        Math.max(0, worldX - dragState.offsetX),
        Math.max(0, worldY - dragState.offsetY)
      );
    };
    const onUp = () => setDragState(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragState, zoom, onMoveNode]);

  // ─── ESC ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (connectingFrom) onStartConnection("");
        else if (focusedNodeId) onFocusNode(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedNodeId, connectingFrom, onFocusNode, onStartConnection]);

  // ─── Drop ─────────────────────────────────────────────────────────────

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
        const vp = viewportRef.current;
        if (!vp) return;
        const rect = vp.getBoundingClientRect();
        const x = Math.max(0, (e.clientX - rect.left + vp.scrollLeft) / zoom - 90);
        const y = Math.max(0, (e.clientY - rect.top + vp.scrollTop) / zoom - 45);

        if (parsed.kind === "person") onAddPerson(parsed.id, x, y);
        else if (parsed.kind === "evidence" && parsed.data) onAddEvidence(parsed.data as SearchResult, x, y);
      } catch { /* ignore */ }
    },
    [zoom, onAddEvidence, onAddPerson]
  );

  function getNodeCenter(nodeId: string): { cx: number; cy: number } | null {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    return { cx: node.position.x + 95, cy: node.position.y + 50 };
  }

  /* ── Computed sizes ───────────────────────────────────────────────────── */
  const sizerW = WORLD_W * zoom;
  const sizerH = WORLD_H * zoom;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] bg-[#0e0e0e] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-black uppercase tracking-[0.1em] text-white" id="board-title">
            {archiveTitle}
          </h1>
          <span className="evidence-badge border border-red-600/30 bg-red-600/10 text-red-500 text-[10px]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            LIVE
          </span>
          <span className="ml-auto text-[10px] font-bold text-[#555] tabular-nums tracking-wider">
            {stats.emailCount.toLocaleString()} emails · {stats.documentCount.toLocaleString()} docs · {stats.photoCount.toLocaleString()} photos
          </span>
        </div>
      </div>

      {/* Focus bar */}
      {focusedNodeId && (
        <div className="flex-shrink-0 flex items-center gap-2 border-b border-red-600/20 bg-red-600/5 px-5 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-bold uppercase tracking-wider text-red-400">
            Focused: {(() => {
              const n = nodes.find((n) => n.id === focusedNodeId);
              if (!n) return "Unknown";
              return n.kind === "person" ? n.data.name : n.data.title;
            })()}
          </span>
          <button onClick={() => onFocusNode(null)} className="ml-auto text-xs font-bold text-red-500/60 hover:text-red-400 transition uppercase tracking-wider">
            ESC ×
          </button>
        </div>
      )}

      {/* ── Canvas area (viewport + scrollable sizer + scaled world) ──────── */}
      <div className="relative flex-1 overflow-hidden">
        {/*
          VIEWPORT: The scrollable container. overflow:auto creates scrollbars.
          The sizer div inside provides scrollable dimensions.
        */}
        <div
          ref={viewportRef}
          id="board-viewport"
          className={`absolute inset-0 overflow-auto ${
            isPanning ? "cursor-grabbing" : "cursor-grab"
          } ${connectingFrom ? "!cursor-crosshair" : ""}`}
          onMouseDown={handleViewportMouseDown}
          onClick={(e) => {
            // Only deselect when clicking on background, not after a pan
            if (isBackgroundTarget(e.target)) {
              onSelectNode(null);
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={() => setDropHighlight(false)}
          onDrop={handleDrop}
        >
          {/*
            SIZER: An in-flow div whose width/height = world * zoom.
            This is what creates the correct scroll area.
            position: relative so it actually takes up space in the flow.
          */}
          <div
            id="board-sizer"
            style={{
              position: "relative",
              width: sizerW,
              height: sizerH,
            }}
          >
            {/*
              WORLD: The actual content, positioned at 0,0, at its natural
              size (WORLD_W × WORLD_H), then scaled by CSS transform.
              Because transformOrigin is 0 0, it scales from the top-left,
              and the sizer above ensures the scroll area matches.
            */}
            <div
              id="board-world"
              className={`dot-grid absolute top-0 left-0 ${dropHighlight ? "ring-2 ring-red-600/30 ring-inset" : ""}`}
              style={{
                width: WORLD_W,
                height: WORLD_H,
                transformOrigin: "0 0",
                transform: `scale(${zoom})`,
              }}
            >
              {/* Red string connections */}
              <svg className="pointer-events-none absolute inset-0" style={{ zIndex: 0, width: "100%", height: "100%" }}>
                <defs>
                  <filter id="string-glow">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {connections.map((conn) => {
                  const from = getNodeCenter(conn.sourceId);
                  const to = getNodeCenter(conn.targetId);
                  if (!from || !to) return null;
                  const vis = getEdgeVis(conn.id);
                  const isHighlight = vis === "highlight";
                  return (
                    <g key={conn.id}>
                      <line
                        x1={from.cx} y1={from.cy} x2={to.cx} y2={to.cy}
                        stroke="#dc2626"
                        strokeWidth={isHighlight ? 2.5 : 1.5}
                        strokeOpacity={isHighlight ? 0.8 : vis === "faded" ? 0.06 : 0.35}
                        strokeDasharray={conn.verified ? "none" : "none"}
                        filter={isHighlight ? "url(#string-glow)" : undefined}
                        className="transition-all duration-300"
                      />
                    </g>
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
                    className={`board-node absolute select-none ${opc} ${
                      selectedNodeId === node.id ? "ring-2 ring-red-500/50" : ""
                    } ${vis === "focused" ? "ring-2 ring-red-500 shadow-xl shadow-red-600/20" : ""} ${
                      connectingFrom && connectingFrom !== node.id ? "ring-1 ring-dashed ring-red-500/30 hover:ring-red-500/60" : ""
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
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-600/10 border border-red-600/20">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-500/50">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <p className="text-sm font-bold uppercase tracking-widest text-[#555]">
                      No evidence on board
                    </p>
                    <p className="text-xs text-[#444] mt-1.5">
                      Search evidence left · Drag persons from right
                    </p>
                  </div>
                </div>
              )}

              {connectingFrom && (
                <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 rounded border-2 border-red-600/40 bg-red-600/15 px-5 py-2.5 text-sm font-bold text-red-400 backdrop-blur-sm uppercase tracking-wider">
                  Click target to connect · ESC to cancel
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Zoom controls (floating bottom-right) ─────────────────────────── */}
        <div className="absolute bottom-4 right-4 z-40 flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#141414]/90 backdrop-blur-sm p-1 shadow-xl shadow-black/50">
          <button
            onClick={zoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="flex h-8 w-8 items-center justify-center rounded text-[#888] hover:bg-[#222] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>

          <button
            onClick={zoomReset}
            className="flex h-8 min-w-[52px] items-center justify-center rounded px-2 text-[11px] font-bold tabular-nums text-[#999] hover:bg-[#222] hover:text-white transition"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            onClick={zoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="flex h-8 w-8 items-center justify-center rounded text-[#888] hover:bg-[#222] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Zoom in"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>

          <div className="mx-0.5 h-5 w-px bg-[#333]" />

          <button
            onClick={zoomFit}
            disabled={nodes.length === 0}
            className="flex h-8 w-8 items-center justify-center rounded text-[#888] hover:bg-[#222] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Fit all nodes"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>

        {/* ── Pan hint ───────────────────────────────────────────────────────── */}
        <div className="absolute bottom-4 left-4 z-40 text-[9px] font-bold text-[#444] uppercase tracking-wider pointer-events-none select-none">
          Drag to pan · Ctrl+Scroll to zoom
        </div>
      </div>
    </div>
  );
});

// ─── Person Card (suspect card look) ────────────────────────────────────────

function PersonCard({ data, isSelected, onConnect, onFocus }: {
  data: Person; isSelected: boolean; onConnect: () => void; onFocus: () => void;
}) {
  return (
    <div className={`board-entity-card w-[190px] rounded bg-[#141414] border border-[#2a2a2a] p-4 pt-5 cursor-grab active:cursor-grabbing ${
      isSelected ? "shadow-xl shadow-red-600/15 border-red-500/30" : "shadow-lg shadow-black/50"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-red-500/70">
          Person of Interest
        </span>
      </div>
      <h4 className="text-sm font-black leading-tight text-white">{data.name}</h4>
      {data.photoCount > 0 && (
        <p className="mt-1 text-[10px] font-bold text-[#666]">
          📸 {data.photoCount} photos on file
        </p>
      )}

      <div className="mt-3 flex gap-1.5 opacity-0 [.board-node:hover_&]:opacity-100 transition">
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onConnect(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded bg-red-600/10 border border-red-600/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-500/70 hover:bg-red-600/20 hover:text-red-400 transition">
          Link
        </button>
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onFocus(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded bg-red-600/10 border border-red-600/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-500/70 hover:bg-red-600/20 hover:text-red-400 transition">
          Focus
        </button>
      </div>
    </div>
  );
}

// ─── Evidence Card (evidence file look) ─────────────────────────────────────

function EvidenceCard({ data, evidenceType, isSelected, onConnect, onFocus }: {
  data: SearchResult; evidenceType: EvidenceType; isSelected: boolean; onConnect: () => void; onFocus: () => void;
}) {
  return (
    <div className={`board-evidence-card w-[190px] rounded bg-[#141414] border border-[#2a2a2a] p-3.5 pt-5 cursor-grab active:cursor-grabbing ${
      isSelected ? "shadow-xl shadow-red-600/15 border-red-500/30" : "shadow-lg shadow-black/50"
    }`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-sm">{EVIDENCE_TYPE_ICON[evidenceType]}</span>
        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#666]">
          {EVIDENCE_TYPE_LABEL[evidenceType]}
        </span>
      </div>
      <h4 className="text-[12px] font-bold leading-tight text-white line-clamp-2">{data.title}</h4>
      {data.date && <p className="mt-1 text-[10px] font-bold text-[#555] tabular-nums">{data.date}</p>}
      {data.sender && <p className="mt-0.5 text-[10px] text-[#555] truncate">{data.sender}</p>}
      <p className="mt-1.5 text-[10px] leading-relaxed text-[#444] line-clamp-2">{data.snippet}</p>

      {data.starCount > 0 && (
        <div className="mt-1.5 text-[9px] font-bold text-yellow-500/60">★ {data.starCount.toLocaleString()}</div>
      )}

      <div className="mt-2 flex gap-1.5 opacity-0 [.board-node:hover_&]:opacity-100 transition">
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onConnect(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded bg-red-600/10 border border-red-600/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-500/70 hover:bg-red-600/20 hover:text-red-400 transition">
          Link
        </button>
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onFocus(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded bg-red-600/10 border border-red-600/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-500/70 hover:bg-red-600/20 hover:text-red-400 transition">
          Focus
        </button>
      </div>
    </div>
  );
}
