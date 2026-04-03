"use client";

import { forwardRef, useRef, useCallback, useState, useEffect, useImperativeHandle, useMemo } from "react";
import type { BoardNode, BoardEvidenceNode, BoardConnection, FocusState } from "@/lib/board-types";
import type { Person, SearchResult, ArchiveStats, EvidenceType } from "@/lib/types";
import type { InvestigationStep } from "@/lib/investigation-types";
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
  onDirectConnection?: (fromId: string, toId: string) => void;
  onOpenSubjectView: (personId: string) => void;
  onOpenPhotoView: (photoId: string) => void;
  onUpdateConnection?: (connId: string, updates: Partial<BoardConnection>) => void;
  stats: ArchiveStats;
  firstPlacementMode?: boolean;
  onFirstPlacement?: (nodeId: string) => void;
  investigationStep?: InvestigationStep | null;
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
    onDirectConnection,
    onOpenSubjectView,
    onOpenPhotoView,
    onUpdateConnection,
    stats,
    firstPlacementMode,
    onFirstPlacement,
    investigationStep,
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

  /* ── Collapsed evidence groups ─────────────────────────────────────────── */
  // Key = "personId:evidenceType", value = whether collapsed
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  /* ── Selected connection ────────────────────────────────────────────────── */
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const selectedConnection = connections.find(c => c.id === selectedConnectionId) || null;

  /* ── Connect-drag state (handle-based) ──────────────────────────────────── */
  const [connectDrag, setConnectDrag] = useState<{
    sourceId: string; mouseX: number; mouseY: number;
  } | null>(null);

  const toggleCollapse = useCallback((personId: string, evType: EvidenceType) => {
    const key = `${personId}:${evType}`;
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* ── Compute evidence grouping per person ───────────────────────────────── */
  type EvidenceGroup = { type: EvidenceType; nodes: BoardEvidenceNode[] };
  const personEvidenceGroups = useMemo((): Record<string, EvidenceGroup[]> => {
    const groups: Record<string, EvidenceGroup[]> = {};
    // For each person node, find connected evidence nodes grouped by type
    const personNodes = nodes.filter(n => n.kind === "person");
    for (const pn of personNodes) {
      const connectedEvidenceIds = new Set(
        connections
          .filter(c => c.sourceId === pn.id || c.targetId === pn.id)
          .map(c => c.sourceId === pn.id ? c.targetId : c.sourceId)
      );
      const evidenceNodes = nodes.filter(
        (n): n is BoardEvidenceNode => n.kind === "evidence" && connectedEvidenceIds.has(n.id)
      );
      // Group by type
      const byType: Record<string, BoardEvidenceNode[]> = {};
      for (const en of evidenceNodes) {
        if (!byType[en.evidenceType]) byType[en.evidenceType] = [];
        byType[en.evidenceType].push(en);
      }
      groups[pn.id] = Object.entries(byType).map(([type, nodes]) => ({
        type: type as EvidenceType,
        nodes,
      }));
    }
    return groups;
  }, [nodes, connections]);

  // Which evidence node IDs are currently hidden (collapsed into their group)
  const hiddenNodeIds = useMemo(() => {
    const hidden = new Set<string>();
    for (const [personId, groups] of Object.entries(personEvidenceGroups)) {
      for (const group of groups) {
        const key = `${personId}:${group.type}`;
        if (collapsedGroups[key] && group.nodes.length >= 2) {
          for (const n of group.nodes) hidden.add(n.id);
        }
      }
    }
    return hidden;
  }, [personEvidenceGroups, collapsedGroups]);

  // Connected evidence counts per person (for display on card)
  const personEvidenceCounts = useMemo(() => {
    const counts: Record<string, { emails: number; documents: number; photos: number; total: number }> = {};
    for (const [personId, groups] of Object.entries(personEvidenceGroups)) {
      const c = { emails: 0, documents: 0, photos: 0, total: 0 };
      for (const g of groups) {
        if (g.type === "email") c.emails = g.nodes.length;
        else if (g.type === "document") c.documents = g.nodes.length;
        else if (g.type === "photo") c.photos = g.nodes.length;
        c.total += g.nodes.length;
      }
      counts[personId] = c;
    }
    return counts;
  }, [personEvidenceGroups]);
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

    const cardW = node.kind === "person" ? 260 : 190;
    const cardH = node.kind === "person" ? 260 : 140;

    // The centre of the card in world-space, then scaled
    const scaledX = (node.position.x + cardW / 2) * zoom;
    const scaledY = (node.position.y + cardH / 2) * zoom;

    // Scroll so that point lands in the centre of the viewport
    const scrollX = scaledX - vp.clientWidth / 2;
    const scrollY = scaledY - vp.clientHeight / 2;

    vp.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
  }, [nodes, zoom]);

  useImperativeHandle(ref, () => ({ centerOnNode }), [centerOnNode]);

  /* ── Pre-center viewport on mount ─────────────────────────────────────── */
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    // Start scrolled to center of world so the drop target is visible
    vp.scrollTo({
      left: (WORLD_W * zoom) / 2 - vp.clientWidth / 2,
      top: (WORLD_H * zoom) / 2 - vp.clientHeight / 2,
      behavior: "auto",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (connectDrag) setConnectDrag(null);
        else if (connectingFrom) onStartConnection("");
        else if (focusedNodeId) onFocusNode(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedNodeId, connectingFrom, connectDrag, onFocusNode, onStartConnection]);

  // ─── Connect-drag mouse tracking ──────────────────────────────────────

  const handleConnectHandleDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation();
      e.preventDefault();
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const worldX = (e.clientX - rect.left + vp.scrollLeft) / zoom;
      const worldY = (e.clientY - rect.top + vp.scrollTop) / zoom;
      setConnectDrag({ sourceId: nodeId, mouseX: worldX, mouseY: worldY });
    },
    [zoom]
  );

  useEffect(() => {
    if (!connectDrag) return;
    const onMove = (e: MouseEvent) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const worldX = (e.clientX - rect.left + vp.scrollLeft) / zoom;
      const worldY = (e.clientY - rect.top + vp.scrollTop) / zoom;
      setConnectDrag(prev => prev ? { ...prev, mouseX: worldX, mouseY: worldY } : null);
    };
    const onUp = (e: MouseEvent) => {
      // Use elementFromPoint for reliable hit detection
      const elUnder = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      let targetId: string | null = null;
      if (elUnder) {
        const handleEl = elUnder.closest("[data-connect-handle]");
        const cardEl = elUnder.closest(".board-node");
        if (handleEl) {
          targetId = handleEl.getAttribute("data-connect-handle");
        } else if (cardEl) {
          const handleInCard = cardEl.querySelector("[data-connect-handle]");
          if (handleInCard) targetId = handleInCard.getAttribute("data-connect-handle");
        }
      }
      if (targetId && targetId !== connectDrag.sourceId) {
        if (onDirectConnection) {
          onDirectConnection(connectDrag.sourceId, targetId);
        } else {
          onStartConnection(connectDrag.sourceId);
          requestAnimationFrame(() => onCompleteConnection(targetId!));
        }
      }
      setConnectDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [connectDrag, zoom, onStartConnection, onCompleteConnection, onDirectConnection]);

  // ─── Drop ─────────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
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
        let x = Math.max(0, (e.clientX - rect.left + vp.scrollLeft) / zoom - 90);
        let y = Math.max(0, (e.clientY - rect.top + vp.scrollTop) / zoom - 45);

        // First-placement: place where the user dropped, no forced snap

        if (parsed.kind === "person") {
          onAddPerson(parsed.id, x, y);
          if (firstPlacementMode && onFirstPlacement) {
            onFirstPlacement(parsed.id);
          }
        } else if (parsed.kind === "evidence" && parsed.data) {
          onAddEvidence(parsed.data as SearchResult, x, y);
        }
      } catch { /* ignore */ }
    },
    [zoom, onAddEvidence, onAddPerson, firstPlacementMode, onFirstPlacement]
  );

  // Returns the bottom-edge center of the card (where the handle is)
  function getNodeCenter(nodeId: string): { cx: number; cy: number } | null {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    // Try to measure actual DOM element for accurate height
    const handleEl = document.querySelector(`[data-connect-handle="${nodeId}"]`);
    if (handleEl) {
      const cardEl = handleEl.closest(".board-node") as HTMLElement | null;
      if (cardEl) {
        const w = cardEl.offsetWidth;
        const h = cardEl.offsetHeight;
        return { cx: node.position.x + w / 2, cy: node.position.y + h };
      }
    }
    // Fallback to estimates
    const w = node.kind === "person" ? 260 : 190;
    const h = node.kind === "person" ? 340 : 160;
    return { cx: node.position.x + w / 2, cy: node.position.y + h };
  }

  /* ── Computed sizes ───────────────────────────────────────────────────── */
  const sizerW = WORLD_W * zoom;
  const sizerH = WORLD_H * zoom;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] bg-[#0e0e0e] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-xl uppercase tracking-[0.08em] text-white" id="board-title">
            {archiveTitle}
          </h1>
          <span className={`evidence-badge border border-red-600/30 bg-red-600/10 text-red-500 text-[10px] transition-opacity duration-300 ${
            investigationStep ? "opacity-30" : ""
          }`}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            LIVE
          </span>
          <span className={`ml-auto font-[family-name:var(--font-mono)] text-[11px] text-[#555] tabular-nums tracking-wider transition-opacity duration-300 ${
            investigationStep ? "opacity-20" : ""
          }`}>
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
              {/* Red string connections — bright & thick */}
              <svg className="absolute inset-0" style={{ zIndex: 5, width: "100%", height: "100%", pointerEvents: "none" }}>
                <defs>
                  <filter id="string-glow">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="string-glow-strong">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
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
                  const isSelected = conn.id === selectedConnectionId;
                  return (
                    <g key={conn.id}>
                      {/* Invisible fat hit area for clicking */}
                      <line
                        x1={from.cx} y1={from.cy} x2={to.cx} y2={to.cy}
                        stroke="transparent"
                        strokeWidth={20}
                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedConnectionId(conn.id === selectedConnectionId ? null : conn.id);
                          onSelectNode(null);
                        }}
                      />
                      {/* Visible line — bright and thick */}
                      <line
                        x1={from.cx} y1={from.cy} x2={to.cx} y2={to.cy}
                        stroke={isSelected ? "#f87171" : "#ef4444"}
                        strokeWidth={isSelected ? 4 : isHighlight ? 3.5 : 3}
                        strokeOpacity={isSelected ? 1 : isHighlight ? 0.9 : vis === "faded" ? 0.08 : 0.7}
                        filter={isSelected ? "url(#string-glow-strong)" : isHighlight ? "url(#string-glow)" : "url(#string-glow)"}
                        strokeLinecap="round"
                        className="transition-all duration-300 pointer-events-none"
                      />
                      {/* Endpoint dots */}
                      <circle cx={from.cx} cy={from.cy} r={4} fill="#ef4444" fillOpacity={vis === "faded" ? 0.08 : 0.6} className="pointer-events-none" />
                      <circle cx={to.cx} cy={to.cy} r={4} fill="#ef4444" fillOpacity={vis === "faded" ? 0.08 : 0.6} className="pointer-events-none" />
                      {/* Note indicator dot at midpoint */}
                      {conn.note && (
                        <circle
                          cx={(from.cx + to.cx) / 2}
                          cy={(from.cy + to.cy) / 2}
                          r={5}
                          fill="#f87171"
                          className="pointer-events-none"
                        />
                      )}
                    </g>
                  );
                })}
                {/* Live connect-drag line */}
                {connectDrag && (() => {
                  const from = getNodeCenter(connectDrag.sourceId);
                  if (!from) return null;
                  return (
                    <line
                      x1={from.cx} y1={from.cy}
                      x2={connectDrag.mouseX} y2={connectDrag.mouseY}
                      stroke="#f87171"
                      strokeWidth={3}
                      strokeOpacity={0.8}
                      strokeDasharray="8 4"
                      strokeLinecap="round"
                      filter="url(#string-glow)"
                      className="pointer-events-none"
                    />
                  );
                })()}
              </svg>

              {/* Connection editor popup */}
              {selectedConnection && (() => {
                const from = getNodeCenter(selectedConnection.sourceId);
                const to = getNodeCenter(selectedConnection.targetId);
                if (!from || !to) return null;
                const mx = (from.cx + to.cx) / 2;
                const my = (from.cy + to.cy) / 2;
                return (
                  <ConnectionEditor
                    connection={selectedConnection}
                    x={mx}
                    y={my}
                    nodes={nodes}
                    onUpdate={(updates) => onUpdateConnection?.(selectedConnection.id, updates)}
                    onClose={() => setSelectedConnectionId(null)}
                  />
                );
              })()}
              {/* First-placement center drop zone */}
              {firstPlacementMode && nodes.length === 0 && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: WORLD_W / 2 - 150,
                    top: WORLD_H / 2 - 150,
                    width: 300,
                    height: 300,
                  }}
                >
                  <div className="w-full h-full rounded-full border-2 border-dashed border-red-500/20 animate-pulse flex items-center justify-center">
                    <div className="w-48 h-48 rounded-full border border-red-500/10 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-red-500/30 text-3xl mb-2">⬇</div>
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-red-500/25">
                          Drop Here
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Nodes */}
              {nodes.filter(n => !hiddenNodeIds.has(n.id)).map((node) => {
                const vis = getNodeVis(node.id);
                const opc = vis === "dimmed" ? "opacity-15" : vis === "second" ? "opacity-45" : "opacity-100";
                const isConnectSource = connectDrag?.sourceId === node.id;
                const isConnectTarget = connectDrag && connectDrag.sourceId !== node.id;
                return (
                  <div
                    key={node.id}
                    className={`board-node absolute select-none ${opc} ${
                      selectedNodeId === node.id ? "ring-2 ring-red-500/50 rounded-xl" : ""
                    } ${vis === "focused" ? "ring-2 ring-red-500 shadow-xl shadow-red-600/20 rounded-xl" : ""} ${
                      isConnectSource ? "ring-2 ring-red-400 shadow-xl shadow-red-500/30 rounded-xl" : ""
                    } ${isConnectTarget ? "ring-1 ring-dashed ring-red-500/30 hover:ring-red-400 hover:shadow-lg hover:shadow-red-500/20 rounded-xl" : ""
                    } ${connectingFrom && connectingFrom !== node.id ? "ring-1 ring-dashed ring-red-500/30 hover:ring-red-500/60 rounded-xl" : ""
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
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (node.kind === "person") onOpenSubjectView(node.id);
                      else if (node.kind === "evidence" && node.evidenceType === "photo") onOpenPhotoView(node.id);
                      else onFocusNode(node.id);
                    }}
                  >
                    {node.kind === "person" ? (
                      <PersonCard data={node.data} isSelected={selectedNodeId === node.id}
                        connectedEvidence={personEvidenceCounts[node.id]}
                        evidenceGroups={
                          (personEvidenceGroups[node.id] || []).map(g => ({ type: g.type, count: g.nodes.length }))
                        }
                        collapsedGroups={collapsedGroups}
                        onToggleCollapse={(evType) => toggleCollapse(node.id, evType)}
                        onFocus={() => onFocusNode(node.id)} />
                    ) : (
                      <EvidenceCard data={node.data} evidenceType={node.evidenceType} isSelected={selectedNodeId === node.id}
                        onFocus={() => onFocusNode(node.id)} />
                    )}
                    {/* Glowing connection handle at bottom center */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 -bottom-3 z-20 flex flex-col items-center"
                      data-connect-handle={node.id}
                      onMouseDown={(e) => handleConnectHandleDown(e, node.id)}
                    >
                      <div className={`w-6 h-6 rounded-full border-2 cursor-crosshair transition-all ${
                        isConnectSource
                          ? "bg-red-500 border-red-400 shadow-[0_0_16px_4px_rgba(239,68,68,0.6)]"
                          : isConnectTarget
                            ? "bg-red-500/60 border-red-400/80 shadow-[0_0_12px_3px_rgba(239,68,68,0.4)] scale-110"
                            : "bg-red-600/40 border-red-500/50 shadow-[0_0_8px_2px_rgba(239,68,68,0.25)] hover:bg-red-500/70 hover:shadow-[0_0_14px_4px_rgba(239,68,68,0.5)] hover:scale-110"
                      }`}>
                        <div className="w-full h-full rounded-full bg-red-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Collapsed evidence group nodes */}
              {Object.entries(personEvidenceGroups).map(([personId, groups]) =>
                groups.map(group => {
                  const key = `${personId}:${group.type}`;
                  if (!collapsedGroups[key] || group.nodes.length < 2) return null;
                  // Position the group card at the average position of the collapsed nodes
                  const avgX = group.nodes.reduce((s, n) => s + n.position.x, 0) / group.nodes.length;
                  const avgY = group.nodes.reduce((s, n) => s + n.position.y, 0) / group.nodes.length;
                  return (
                    <div
                      key={key}
                      className="board-node absolute select-none"
                      style={{ left: avgX, top: avgY, zIndex: 12 }}
                    >
                      <EvidenceGroupCard
                        evidenceType={group.type}
                        count={group.nodes.length}
                        isSelected={false}
                        onExpand={() => toggleCollapse(personId, group.type)}
                      />
                    </div>
                  );
                })
              )}

              {/* Drop target crosshair during onboarding */}
              {firstPlacementMode && nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                      <div className="w-56 h-56 rounded-full border-2 border-dashed border-red-500/25 flex items-center justify-center animate-pulse">
                        <div className="w-36 h-36 rounded-full border-2 border-dashed border-red-500/15 flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full bg-red-500/25" />
                        </div>
                      </div>
                      <div className="absolute top-1/2 left-0 w-full h-px bg-red-500/10" />
                      <div className="absolute top-0 left-1/2 w-px h-full bg-red-500/10" />
                    </div>
                    <h2 className="font-[family-name:var(--font-display)] text-5xl text-white/15 tracking-wider">
                      DROP HERE
                    </h2>
                  </div>
                </div>
              )}

              {/* Empty state — only in free explore, not during onboarding */}
              {nodes.length === 0 && !investigationStep && (
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
        <div className="absolute bottom-4 left-4 z-40 font-[family-name:var(--font-mono)] text-[10px] text-[#444] uppercase tracking-[0.15em] pointer-events-none select-none">
          Drag to pan · Ctrl+Scroll to zoom · Drag handles to connect
        </div>
      </div>
    </div>
  );
});

// ─── Person Card (large suspect dossier card) ──────────────────────────────

function PersonCard({ data, isSelected, onFocus, connectedEvidence, evidenceGroups, collapsedGroups, onToggleCollapse }: {
  data: Person; isSelected: boolean; onFocus: () => void;
  connectedEvidence?: { emails: number; documents: number; photos: number; total: number };
  evidenceGroups?: { type: EvidenceType; count: number }[];
  collapsedGroups?: Record<string, boolean>;
  onToggleCollapse?: (evType: EvidenceType) => void;
}) {
  return (
    <div className={`board-entity-card w-[260px] rounded-xl bg-[#111] border-2 cursor-grab active:cursor-grabbing transition-all ${
      isSelected ? "shadow-2xl shadow-red-600/20 border-red-500/40" : "shadow-xl shadow-black/60 border-[#222] hover:border-[#333]"
    }`}>
      {/* Photo area */}
      <div className="relative aspect-[4/3] rounded-t-xl overflow-hidden bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a]">
        {data.imageUrl ? (
          <>
            <img
              src={data.imageUrl}
              alt={data.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Hide broken image and show fallback silhouette
                const target = e.currentTarget;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div className="items-center justify-center h-full hidden">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-red-900/25">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <svg
              width="72"
              height="72"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-red-900/25"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        )}

        {/* Red gradient overlay at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#111] to-transparent" />

        {/* Label badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-[#0a0a0a]/80 border border-red-900/30 px-2 py-0.5 backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase tracking-[0.15em] text-red-500/80">
            POI
          </span>
        </div>

        {/* Photo count */}
        {data.photoCount > 0 && (
          <div className="absolute top-2 right-2 rounded bg-[#0a0a0a]/80 border border-[#333] px-1.5 py-0.5 backdrop-blur-sm flex items-center gap-1">
            <span className="text-[10px]">📸</span>
            <span className="text-[9px] font-bold text-[#999]">{data.photoCount}</span>
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="px-3.5 py-3">
        <h4 className="font-[family-name:var(--font-display)] text-lg leading-tight text-white tracking-wide">{data.name}</h4>
        {data.source && (
          <p className="mt-0.5 text-[9px] text-[#555]">{data.source}</p>
        )}

        {/* Evidence group badges with collapse toggle */}
        {evidenceGroups && evidenceGroups.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {evidenceGroups.filter(g => g.count >= 2).map(g => {
              const key = `${data.id}:${g.type}`;
              const isCollapsed = collapsedGroups?.[key];
              const icons: Record<string, string> = { email: "✉️", document: "📄", photo: "📸", imessage: "💬" };
              const labels: Record<string, string> = { email: "Emails", document: "Docs", photo: "Photos", imessage: "Msgs" };
              return (
                <button
                  key={g.type}
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleCollapse?.(g.type); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[9px] font-bold transition ${
                    isCollapsed
                      ? "border-red-600/20 bg-red-950/20 text-red-400/80"
                      : "border-[#2a2a2a] bg-[#0e0e0e] text-[#666] hover:border-[#444] hover:text-white"
                  }`}
                >
                  <span>{icons[g.type] || "📄"}</span>
                  <span>{g.count} {labels[g.type] || g.type}</span>
                  <span className="text-[8px] ml-0.5 opacity-60">
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Simple evidence count for groups with only 1 item */}
        {connectedEvidence && connectedEvidence.total > 0 && (
          <div className="mt-1.5 flex gap-2 text-[9px] font-bold text-[#444]">
            {connectedEvidence.emails === 1 && <span>✉️ 1 email</span>}
            {connectedEvidence.documents === 1 && <span>📄 1 doc</span>}
            {connectedEvidence.photos === 1 && <span>📸 1 photo</span>}
          </div>
        )}

        {/* Actions */}
        <div className="mt-2.5 flex gap-1.5 opacity-0 [.board-node:hover_&]:opacity-100 transition">
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onFocus(); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="rounded bg-red-600/10 border border-red-600/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-500/70 hover:bg-red-600/20 hover:text-red-400 transition">
            Focus
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Evidence Card (evidence file look) ─────────────────────────────────────

const PHOTO_CDN = "https://assets.getkino.com";

function EvidenceCard({ data, evidenceType, isSelected, onFocus }: {
  data: SearchResult; evidenceType: EvidenceType; isSelected: boolean; onFocus: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  // Photo evidence gets a big image card
  if (evidenceType === "photo") {
    const thumbnailUrl = `${PHOTO_CDN}/cdn-cgi/image/width=500,quality=80,format=auto/photos-deboned/${data.id}`;
    return (
      <div className={`board-evidence-card w-[280px] rounded-xl bg-[#111] border overflow-hidden cursor-grab active:cursor-grabbing ${
        isSelected ? "shadow-xl shadow-red-600/15 border-red-500/30" : "shadow-lg shadow-black/50 border-[#2a2a2a]"
      }`}>
        {/* Photo image */}
        <div className="relative bg-[#0a0a0a]" style={{ minHeight: imgError ? 80 : 200 }}>
          {!imgError ? (
            <img
              src={thumbnailUrl}
              alt={data.snippet || data.title}
              loading="lazy"
              className="w-full object-cover"
              style={{ maxHeight: 320 }}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex items-center justify-center h-20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-[#333]">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
          )}

          {/* Type badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-[#0a0a0a]/80 border border-[#333]/50 px-2 py-0.5 backdrop-blur-sm">
            <span className="text-sm">📸</span>
            <span className="text-[8px] font-black uppercase tracking-[0.15em] text-[#999]">
              Photo
            </span>
          </div>

          {/* Connection pin */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-red-500 bg-[#141414] z-10" />

          {/* Face badges from sender field (person names) */}
          {data.sender && (
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
              {data.sender.split(", ").slice(0, 3).map((name, i) => (
                <span
                  key={i}
                  className="rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-bold text-white"
                >
                  👤 {name}
                </span>
              ))}
              {data.sender.split(", ").length > 3 && (
                <span className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white/60">
                  +{data.sender.split(", ").length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Caption area */}
        <div className="px-3 py-2.5">
          <h4 className="text-[11px] font-bold leading-tight text-[#888] truncate">{data.title}</h4>
          {data.snippet && (
            <p className="mt-1 text-[10px] leading-relaxed text-[#555] line-clamp-2">{data.snippet}</p>
          )}

          {data.starCount > 0 && (
            <div className="mt-1 text-[9px] font-bold text-yellow-500/60">★ {data.starCount.toLocaleString()}</div>
          )}

          <div className="mt-2 flex gap-1.5 opacity-0 [.board-node:hover_&]:opacity-100 transition">
            <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onFocus(); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded bg-red-600/10 border border-red-600/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-500/70 hover:bg-red-600/20 hover:text-red-400 transition">
              Focus
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Non-photo evidence (email, document, imessage)
  return (
    <div className={`board-evidence-card w-[190px] rounded-lg bg-[#141414] border border-[#2a2a2a] p-3.5 pt-5 cursor-grab active:cursor-grabbing ${
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
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onFocus(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="rounded bg-red-600/10 border border-red-600/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-red-500/70 hover:bg-red-600/20 hover:text-red-400 transition">
          Focus
        </button>
      </div>
    </div>
  );
}

// ─── Evidence Group Card (collapsed evidence stack) ─────────────────────────

function EvidenceGroupCard({ 
  evidenceType, 
  count, 
  isSelected, 
  onExpand,
}: {
  evidenceType: EvidenceType;
  count: number;
  isSelected: boolean;
  onExpand: () => void;
}) {
  return (
    <div className={`board-evidence-group w-[140px] rounded-lg cursor-grab active:cursor-grabbing relative ${
      isSelected ? "shadow-xl shadow-red-600/15" : "shadow-lg shadow-black/50"
    }`}>
      {/* Stacked card effect */}
      <div className="absolute -top-1 left-1 right-1 h-2 rounded-t-lg bg-[#181818] border border-[#2a2a2a] border-b-0" />
      <div className="absolute -top-2 left-2 right-2 h-2 rounded-t-lg bg-[#1c1c1c] border border-[#2a2a2a] border-b-0" />

      {/* Main card */}
      <div className={`relative bg-[#141414] border p-3 rounded-lg ${
        isSelected ? "border-red-500/30" : "border-[#2a2a2a]"
      }`}>
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1a1a1a] border border-[#333] text-xl flex-shrink-0">
            {EVIDENCE_TYPE_ICON[evidenceType]}
          </div>
          <div>
            <p className="text-[15px] font-black text-white tabular-nums">{count}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-[#666]">
              {EVIDENCE_TYPE_LABEL[evidenceType]}{count !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex gap-1 opacity-0 [.board-node:hover_&]:opacity-100 transition">
          <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onExpand(); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex-1 rounded bg-[#1a1a1a] border border-[#333] px-2 py-1 text-[8px] font-black uppercase tracking-wider text-[#888] hover:text-white hover:bg-[#222] transition">
            Expand
          </button>
        </div>
      </div>
    </div>
  );
}


/* ─── Connection Editor Popup ─────────────────────────────────────────────── */

function ConnectionEditor({
  connection,
  x,
  y,
  nodes,
  onUpdate,
  onClose,
}: {
  connection: BoardConnection;
  x: number;
  y: number;
  nodes: BoardNode[];
  onUpdate: (updates: Partial<BoardConnection>) => void;
  onClose: () => void;
}) {
  const [noteText, setNoteText] = useState(connection.note || "");
  const [strength, setStrength] = useState(connection.strength);

  const sourceNode = nodes.find(n => n.id === connection.sourceId);
  const targetNode = nodes.find(n => n.id === connection.targetId);
  const sourceName = sourceNode ? (sourceNode.kind === "person" ? sourceNode.data.name : sourceNode.data.title) : connection.sourceId;
  const targetName = targetNode ? (targetNode.kind === "person" ? targetNode.data.name : targetNode.data.title) : connection.targetId;

  return (
    <div
      className="absolute z-40"
      style={{
        left: x - 160,
        top: y - 200,
        pointerEvents: "auto",
      }}
    >
      <div className="w-[320px] rounded-xl border border-[#2a2a2a] bg-[#0a0a0a]/98 backdrop-blur-md p-4 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-red-500/70">
            Connection
          </span>
          <button
            onClick={onClose}
            className="text-[#555] hover:text-white transition text-sm"
          >
            ✕
          </button>
        </div>

        {/* Connection endpoints */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold text-white truncate max-w-[120px]">{sourceName}</span>
          <span className="text-red-500/40">—</span>
          <span className="text-xs font-bold text-white truncate max-w-[120px]">{targetName}</span>
        </div>

        {/* Note input */}
        <div className="mb-3">
          <label className="block font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.15em] text-[#555] mb-1.5">
            Note
          </label>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. Frequently photographed together"
            className="w-full rounded-lg border border-[#2a2a2a] bg-[#141414] px-3 py-2 text-sm text-white placeholder:text-[#444] focus:border-red-600/40 focus:outline-none transition resize-none"
            rows={2}
          />
        </div>

        {/* Strength rating */}
        <div className="mb-4">
          <label className="block font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.15em] text-[#555] mb-1.5">
            Strength
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onClick={() => setStrength(s)}
                className={`w-9 h-9 rounded-lg border text-sm font-bold transition ${
                  s <= strength
                    ? "border-red-500/40 bg-red-600/20 text-red-400"
                    : "border-[#2a2a2a] bg-[#141414] text-[#444] hover:border-[#444] hover:text-[#888]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1 font-[family-name:var(--font-mono)] text-[8px] text-[#333]">
            <span>WEAK</span>
            <span>STRONG</span>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={() => {
            onUpdate({ note: noteText || undefined, strength });
            onClose();
          }}
          className="w-full rounded-lg bg-red-600/20 border border-red-600/30 py-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-red-400 hover:bg-red-600/30 hover:text-red-300 transition"
        >
          Save Connection
        </button>
      </div>
    </div>
  );
}
