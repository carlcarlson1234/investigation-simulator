"use client";

import { forwardRef, useRef, useCallback, useState, useEffect, useImperativeHandle, useMemo } from "react";
import { createPortal } from "react-dom";
import type { BoardNode, BoardConnection, BoardFlightNodeData, BoardMediaNodeData, FocusState, PinnedEvidence } from "@/lib/board-types";
import type { Person, SearchResult, ArchiveStats, EvidenceType, Evidence } from "@/lib/types";
import { SEED_ENTITIES } from "@/lib/entity-seed-data";
import type { SeedEntity } from "@/lib/entity-seed-data";
import type { InvestigationStep } from "@/lib/investigation-types";
import {
  EVIDENCE_TYPE_ICON,
  EVIDENCE_TYPE_LABEL,
} from "@/lib/board-types";
import { useBoardSounds } from "@/hooks/use-board-sounds";
import { FlightRouteMap } from "./flight-route-map";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

cytoscape.use(fcose);

/* ── Zoom constants ─────────────────────────────────────────────────────── */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 1;
const BASE_WORLD_W = 4000;
const BASE_WORLD_H = 3000;

/* ── Node pinned-evidence layout constants ─────────────────────────────── */
// Photos orbit the card perimeter at ~80px per chip, max 2 per side.
// The bottom side is reserved for the category stack row so it has room
// to wrap as more categories are added in the future.
const ORBITAL_CHIP = 80;
const ORBITAL_SPACING = 12;
const ORBITAL_PER_SIDE = 2;
const ORBITAL_SIDES = 3; // right, left, top only (bottom reserved for stack row)
const ORBITAL_MAX = ORBITAL_PER_SIDE * ORBITAL_SIDES; // 6
const STACK_BADGE_H = 32;
const STACK_BADGE_W = 60;
const STACK_BADGE_GAP = 6;
const DETAIL_CARD_MAX_W = 600;

type NodePinPartition = {
  orbitalPhotos: PinnedEvidence[];
  overflowPhotos: PinnedEvidence[];
  emails: PinnedEvidence[];
  documents: PinnedEvidence[];
  imessages: PinnedEvidence[];
  flightLogs: PinnedEvidence[];
  videos: PinnedEvidence[];
};

function partitionNodeEvidence(pinned: PinnedEvidence[] | undefined): NodePinPartition {
  const out: NodePinPartition = {
    orbitalPhotos: [],
    overflowPhotos: [],
    emails: [],
    documents: [],
    imessages: [],
    flightLogs: [],
    videos: [],
  };
  if (!pinned) return out;
  for (const ev of pinned) {
    if (ev.type === "photo") {
      if (out.orbitalPhotos.length < ORBITAL_MAX) out.orbitalPhotos.push(ev);
      else out.overflowPhotos.push(ev);
    } else if (ev.type === "email") out.emails.push(ev);
    else if (ev.type === "document") out.documents.push(ev);
    else if (ev.type === "imessage") out.imessages.push(ev);
    else if (ev.type === "flight_log") out.flightLogs.push(ev);
    else if (ev.type === "video") out.videos.push(ev);
  }
  return out;
}

// Effective on-board footprint of a node, accounting for orbital photo chips
// (right/left/top sides) and the category stack-row below the card. Used by
// the drag-repulsion and drop-nudge physics so cards don't visually overlap
// each other's pinned evidence.
function getEffectiveCardFootprint(
  baseW: number,
  baseH: number,
  pinned: PinnedEvidence[] | undefined,
): { w: number; h: number; offsetX: number; offsetY: number } {
  const part = partitionNodeEvidence(pinned);
  const orb = part.orbitalPhotos.length;
  // Orbital chips extend ORBITAL_CHIP + ~2px breathing room outward per side.
  const EXT = ORBITAL_CHIP + 4;
  const extRight = orb >= 1 ? EXT : 0;               // side 0: right
  const extLeft = orb >= ORBITAL_PER_SIDE + 1 ? EXT : 0; // side 1: left
  const extTop = orb >= ORBITAL_PER_SIDE * 2 + 1 ? EXT : 0; // side 2: top

  // Category stack row below the card. Wraps when there are more badges
  // than fit in one row.
  const badgeCount =
    (part.overflowPhotos.length > 0 ? 1 : 0) +
    (part.emails.length > 0 ? 1 : 0) +
    (part.documents.length > 0 ? 1 : 0) +
    (part.imessages.length > 0 ? 1 : 0);
  const badgesPerRow = Math.max(1, Math.floor((baseW + STACK_BADGE_GAP) / (STACK_BADGE_W + STACK_BADGE_GAP)));
  const stackRows = badgeCount > 0 ? Math.ceil(badgeCount / badgesPerRow) : 0;
  const stackExt = stackRows > 0 ? stackRows * STACK_BADGE_H + (stackRows - 1) * STACK_BADGE_GAP + 10 : 0;

  return {
    w: baseW + extLeft + extRight,
    h: baseH + extTop + stackExt,
    // offset from base (x, y) to the top-left of the effective footprint
    offsetX: -extLeft,
    offsetY: -extTop,
  };
}

/* ── Public handle so parent can call centerOnNode ──────────────────────── */
export interface BoardCanvasHandle {
  centerOnNode: (nodeId: string) => void;
  zoomFit: () => void;
  arrangeEgoWide: () => void;
  expandAllGroups: () => void;
}

interface BoardCanvasProps {
  archiveTitle: string;
  nodes: BoardNode[];
  connections: BoardConnection[];
  selectedNodeId: string | null;
  focusedNodeId: string | null;
  focusState: FocusState | null;
  connectingFrom: string | null;
  onSelectNode: (id: string | null) => void;
  onFocusNode: (id: string | null) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onBatchMoveNodes?: (moves: Record<string, { x: number; y: number }>) => void;
  onAddPerson: (personId: string, x?: number, y?: number) => void;
  onAddEntity?: (entity: SeedEntity, x?: number, y?: number) => void;
  onAddFlight?: (
    data: BoardFlightNodeData,
    autoPinnedEvidence: PinnedEvidence,
    x?: number,
    y?: number,
  ) => void;
  onAddMedia?: (
    data: BoardMediaNodeData,
    autoPinnedEvidence: PinnedEvidence,
    x?: number,
    y?: number,
  ) => void;
  onPinEvidenceToCard?: (cardId: string, result: SearchResult) => void;
  onPinEvidenceToConnection?: (connId: string, result: SearchResult) => void;
  onStartConnection: (fromId: string) => void;
  onCompleteConnection: (toId: string) => void;
  onDirectConnection?: (fromId: string, toId: string) => void;
  onOpenSubjectView: (personId: string) => void;
  onOpenPhotoView: (photoId: string) => void;
  onUpdateConnection?: (connId: string, updates: Partial<BoardConnection>) => void;
  onDeleteConnection?: (connId: string) => void;
  spotlightFocusState?: { nodeIds: Set<string>; directIds: Set<string>; edgeIds: Set<string> } | null;
  spotlightPulseId?: string | null;
  reintegratingIds?: Set<string>;
  initialHideOrphans?: boolean;
  stats: ArchiveStats;
  score: number;
  firstPlacementMode?: boolean;
  onFirstPlacement?: (nodeId: string) => void;
  investigationStep?: InvestigationStep | null;
}

export const BoardCanvas = forwardRef<BoardCanvasHandle, BoardCanvasProps>(function BoardCanvas(
  {
    archiveTitle,
    nodes,
    connections,
    selectedNodeId,
    focusedNodeId,
    focusState,
    connectingFrom,
    onSelectNode,
    onFocusNode,
    onMoveNode,
    onBatchMoveNodes,
    onAddPerson,
    onAddEntity,
    onAddFlight,
    onAddMedia,
    onPinEvidenceToCard,
    onPinEvidenceToConnection,
    onStartConnection,
    onCompleteConnection,
    onDirectConnection,
    onOpenSubjectView,
    onOpenPhotoView,
    onUpdateConnection,
    onDeleteConnection,
    spotlightFocusState,
    spotlightPulseId,
    reintegratingIds,
    initialHideOrphans,
    stats,
    score,
    firstPlacementMode,
    onFirstPlacement,
    investigationStep,
  },
  ref
) {
  /* ── Sounds ────────────────────────────────────────────────────────────── */
  const { play: playSound, muted: soundMuted, toggleMute: toggleSoundMute } = useBoardSounds();

  /* ── Score glow + new connection flash ─────────────────────────────────── */
  const [scoreGlow, setScoreGlow] = useState(false);
  const [newConnectionId, setNewConnectionId] = useState<string | null>(null);
  const prevScoreRef = useRef(score);
  const prevConnectionCountRef = useRef(connections.length);
  useEffect(() => {
    if (score > prevScoreRef.current) {
      setScoreGlow(true);
      const t = setTimeout(() => setScoreGlow(false), 1200);
      prevScoreRef.current = score;
      return () => clearTimeout(t);
    }
    prevScoreRef.current = score;
  }, [score]);
  useEffect(() => {
    if (connections.length > prevConnectionCountRef.current) {
      const newest = connections[connections.length - 1];
      if (newest) {
        setNewConnectionId(newest.id);
        const t = setTimeout(() => setNewConnectionId(null), 1200);
        prevConnectionCountRef.current = connections.length;
        return () => clearTimeout(t);
      }
    }
    prevConnectionCountRef.current = connections.length;
  }, [connections]);

  /* ── Refs ──────────────────────────────────────────────────────────────── */
  const viewportRef = useRef<HTMLDivElement>(null);   // the outer scrollable viewport
  const parallaxRef = useRef<HTMLDivElement>(null);   // the slower-moving background layer

  /* ── Zoom state ────────────────────────────────────────────────────────── */
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  // Bumped after zoom/scroll to force connection endpoint recomputation
  const [connRefresh, setConnRefresh] = useState(0);

  /* ── Parallax depth factor (surface scrolls at this fraction of content) */
  const PARALLAX_SPEED = 0.2;

  /* ── Drag-to-pan state ─────────────────────────────────────────────────── */
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  /* ── Node drag state ───────────────────────────────────────────────────── */
  const [dragState, setDragState] = useState<{
    nodeId: string; offsetX: number; offsetY: number;
  } | null>(null);
  // Detail panel is separate from node selection — only opens on a pure click
  // (mousedown → mouseup without drag movement), never during a click-drag.
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const didDragRef = useRef(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });

  /* ── Collapsed evidence groups (legacy no-op, evidence is now pinned) ──── */
  const collapsedGroups = useMemo<Record<string, boolean>>(() => ({}), []);

  /* ── Selected connection ────────────────────────────────────────────────── */
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [focusedConnectionId, setFocusedConnectionId] = useState<string | null>(null);
  const [focusedPinnedEvidence, setFocusedPinnedEvidence] = useState<PinnedEvidence | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const selectedConnection = connections.find(c => c.id === selectedConnectionId) || null;

  /* ── Connect-drag state (handle-based) ──────────────────────────────────── */
  const [connectDrag, setConnectDrag] = useState<{
    sourceId: string; mouseX: number; mouseY: number;
  } | null>(null);

  /* ── Interaction polish state ─────────────────────────────────────────── */
  const [droppingNodeId, setDroppingNodeId] = useState<string | null>(null);
  const [justDroppedNodeId, setJustDroppedNodeId] = useState<string | null>(null);
  const [dropRipple, setDropRipple] = useState<{ x: number; y: number } | null>(null);
  const [nearbyTargetId, setNearbyTargetId] = useState<string | null>(null);
  const [connectionSnapping, setConnectionSnapping] = useState(false);
  const dragVelocityRef = useRef({ vx: 0, vy: 0, lastX: 0, lastY: 0 });
  const dragRotationRef = useRef(0);
  const repelOffsetsRef = useRef<Record<string, { dx: number; dy: number }>>({});
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const toggleCollapse = useCallback((_personId: string, _evType: EvidenceType) => {}, []);
  const expandAll = useCallback(() => {}, []);
  const hasCollapsed = false;
  const expandAllGroups = useCallback(() => {}, []);

  // No evidence nodes anymore — hiddenNodeIds stays for API compatibility.
  const hiddenNodeIds = useMemo(() => new Set<string>(), []);

  // Orphan nodes — no connections at all
  const orphanNodeIds = useMemo(() => {
    const connected = new Set<string>();
    for (const c of connections) {
      connected.add(c.sourceId);
      connected.add(c.targetId);
    }
    const orphans = new Set<string>();
    for (const n of nodes) {
      if (!connected.has(n.id)) orphans.add(n.id);
    }
    return orphans;
  }, [nodes, connections]);

  // Pinned evidence counts per node (from pinnedEvidence arrays on nodes)
  const personEvidenceCounts = useMemo(() => {
    const counts: Record<string, { emails: number; documents: number; photos: number; total: number }> = {};
    for (const n of nodes) {
      const pinned = n.pinnedEvidence || [];
      const c = { emails: 0, documents: 0, photos: 0, total: pinned.length };
      for (const e of pinned) {
        if (e.type === "email") c.emails += 1;
        else if (e.type === "document") c.documents += 1;
        else if (e.type === "photo") c.photos += 1;
      }
      counts[n.id] = c;
    }
    return counts;
  }, [nodes]);

  // Connection count per person (for node scaling)
  const personConnectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const conn of connections) {
      counts[conn.sourceId] = (counts[conn.sourceId] ?? 0) + 1;
      counts[conn.targetId] = (counts[conn.targetId] ?? 0) + 1;
    }
    return counts;
  }, [connections]);

  // Importance scale factor per person node
  const getNodeScale = useCallback((nodeId: string): number => {
    const connCount = personConnectionCounts[nodeId] ?? 0;
    const evCount = personEvidenceCounts[nodeId]?.total ?? 0;
    return 1.0 + Math.min(0.25, (connCount + evCount) * 0.02);
  }, [personConnectionCounts, personEvidenceCounts]);

  // Card dimensions accounting for importance scaling
  const getScaledCardSize = useCallback((node: BoardNode): { w: number; h: number } => {
    const baseW = node.kind === "person" ? 260 : node.kind === "entity" ? 220 : node.kind === "flight" ? 210 : node.kind === "media" ? 180 : 190;
    const baseH = node.kind === "person" ? 300 : node.kind === "entity" ? 180 : node.kind === "flight" ? 170 : node.kind === "media" ? 160 : 160;
    const scale = node.kind === "person" ? getNodeScale(node.id) : 1;
    return { w: baseW * scale, h: baseH * scale };
  }, [getNodeScale]);

  const [dropHighlight, setDropHighlight] = useState(false);

  // ─── Focus visibility ──────────────────────────────────────────────────

  function getNodeVis(nodeId: string): "focused" | "direct" | "second" | "dimmed" | "normal" {
    // Spotlight takes precedence when active
    if (spotlightFocusState) {
      if (spotlightFocusState.nodeIds.has(nodeId)) return "focused";
      if (spotlightFocusState.directIds.has(nodeId)) return "direct";
      return "dimmed";
    }
    const fs = (pathFocus && !showAllInCompare) ? pathFocus : (!pathFocus ? focusState : null);
    if (!fs) return "normal";
    // Nodes added after compare started are always visible
    if (pathFocus && compareNodeIdsRef.current && !compareNodeIdsRef.current.has(nodeId)) return "normal";
    if (nodeId === fs.nodeId) return "focused";
    if (fs.directIds.has(nodeId)) return "direct";
    if (fs.secondIds.has(nodeId)) return "second";
    return "dimmed";
  }

  function getEdgeVis(connId: string): "highlight" | "faded" | "normal" {
    // Spotlight takes precedence when active
    if (spotlightFocusState) {
      if (spotlightFocusState.edgeIds.has(connId)) return "highlight";
      return "faded";
    }
    const fs = (pathFocus && !showAllInCompare) ? pathFocus : (!pathFocus ? focusState : null);
    if (!fs) return "normal";
    if (fs.edgeIds.has(connId)) return "highlight";
    return "faded";
  }

  /* ── Center-on-node (exposed via ref) ──────────────────────────────────── */
  const centerOnNode = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    const vp = viewportRef.current;
    if (!node || !vp) return;

    const cardW = node.kind === "person" ? 260 : node.kind === "entity" ? 220 : node.kind === "flight" ? 210 : node.kind === "media" ? 180 : 190;
    const cardH = node.kind === "person" ? 260 : node.kind === "entity" ? 160 : node.kind === "flight" ? 160 : node.kind === "media" ? 160 : 140;

    // The centre of the card in world-space, then scaled
    const scaledX = (node.position.x + cardW / 2) * zoom;
    const scaledY = (node.position.y + cardH / 2) * zoom;

    // Scroll so that point lands in the centre of the viewport
    const scrollX = scaledX - vp.clientWidth / 2;
    const scrollY = scaledY - vp.clientHeight / 2;

    vp.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
  }, [nodes, zoom]);

  // (useImperativeHandle is after zoomFit below)

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

  // Refresh connection endpoints after zoom changes (DOM needs a frame to reflow)
  useEffect(() => {
    const t1 = requestAnimationFrame(() => setConnRefresh(n => n + 1));
    // Also refresh after smooth scroll completes (~400ms)
    const t2 = setTimeout(() => setConnRefresh(n => n + 1), 450);
    return () => { cancelAnimationFrame(t1); clearTimeout(t2); };
  }, [zoom]);

  /* ── Zoom helpers ──────────────────────────────────────────────────────── */
  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const zoomReset = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
    viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }, []);
  const zoomFit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    // Read all card bounds directly from the DOM for accuracy
    const cards = vp.querySelectorAll<HTMLElement>("[data-node-id]");
    if (cards.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    for (const el of cards) {
      // Skip hidden/dimmed cards (compare mode puts off-path nodes far away)
      const classes = el.className;
      if (classes.includes("opacity-0") || classes.includes("opacity-15")) continue;
      const x = parseFloat(el.style.left) || 0;
      const y = parseFloat(el.style.top) || 0;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
      count++;
    }
    if (count === 0) return;
    const padding = 60;
    const contentW = maxX - minX + padding * 2;
    const contentH = maxY - minY + padding * 2;
    // Use the minimal zoom that fits everything — don't zoom in past 1.0
    const fitZoom = clampZoom(Math.min(1, vp.clientWidth / contentW, vp.clientHeight / contentH));
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
  }, []);

  // (useImperativeHandle is after arrangeEgoWide below)

  /* ── Auto-arrange (multiple modes) ───────────────────────────────────── */
  const [isArranging, setIsArranging] = useState(false);
  const [pathPicker, setPathPicker] = useState<{ open: boolean; selected: string[] }>({ open: false, selected: [] });
  const [pathFocus, setPathFocus] = useState<FocusState | null>(null);
  const [pathDrillNode, setPathDrillNode] = useState<string | null>(null);
  const [showAllInCompare, setShowAllInCompare] = useState(false);
  const [hideOrphans, setHideOrphans] = useState(initialHideOrphans ?? false);
  const compareNodeIdsRef = useRef<Set<string> | null>(null);
  // Default path focus (5 core columns) and full focus (includes indirect)
  const pathDefaultFocusRef = useRef<FocusState | null>(null);
  const pathFullFocusRef = useRef<FocusState | null>(null);
  // Saved positions before drill-down so we can restore them
  const pathSavedPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  // Measure actual card dimensions from the DOM, with scaled fallback
  const getCardSize = useCallback((nodeId: string) => {
    const el = viewportRef.current?.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement | null;
    if (el) return { w: el.offsetWidth, h: el.offsetHeight };
    // Fallback: use scaled estimates for person nodes
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (node) {
      const scale = node.kind === "person" ? getNodeScale(node.id) : 1;
      const baseW = node.kind === "person" ? 260 : node.kind === "entity" ? 220 : node.kind === "flight" ? 210 : 190;
      const baseH = node.kind === "person" ? 300 : node.kind === "entity" ? 180 : node.kind === "flight" ? 170 : 160;
      return { w: baseW * scale, h: baseH * scale };
    }
    return { w: 260, h: 300 };
  }, [getNodeScale]);

  // Only zoom-to-fit if any node card is outside the visible viewport
  const zoomFitIfNeeded = useCallback((newPositions: Record<string, { x: number; y: number }>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const scrollL = vp.scrollLeft;
    const scrollT = vp.scrollTop;
    const viewW = vp.clientWidth;
    const viewH = vp.clientHeight;
    for (const [id, pos] of Object.entries(newPositions)) {
      const s = getCardSize(id);
      const left = pos.x * zoom;
      const top = pos.y * zoom;
      const right = (pos.x + s.w) * zoom;
      const bottom = (pos.y + s.h) * zoom;
      if (left < scrollL || top < scrollT || right > scrollL + viewW || bottom > scrollT + viewH) {
        zoomFit();
        return;
      }
    }
  }, [zoom, getCardSize, zoomFit]);

  const arrangeGrid = useCallback(() => {
    if (!onBatchMoveNodes || nodes.length < 2) return;
    setPathFocus(null); setPathDrillNode(null); setShowAllInCompare(false); compareNodeIdsRef.current = null;
    const pos: Record<string, { x: number; y: number }> = {};

    // Use actual viewport size to compute optimal grid
    const vp = viewportRef.current;
    const vpW = vp ? vp.clientWidth / zoom : 2000;
    const vpH = vp ? vp.clientHeight / zoom : 1500;

    const sizes = new Map<string, { w: number; h: number }>();
    let maxW = 0, maxH = 0;
    for (const node of nodes) {
      const s = getCardSize(node.id);
      sizes.set(node.id, s);
      if (s.w > maxW) maxW = s.w;
      if (s.h > maxH) maxH = s.h;
    }

    const GAP = 50;
    const CELL_W = maxW;
    const CELL_H = maxH;
    // Compute columns to fill viewport width, minimum 2
    const cols = Math.max(2, Math.floor((vpW - 80) / (CELL_W + GAP)));
    const rows = Math.ceil(nodes.length / cols);
    // Center the grid in the viewport
    const gridW = cols * (CELL_W + GAP) - GAP;
    const gridH = rows * (CELL_H + GAP) - GAP;
    const startX = Math.max(40, (vpW - gridW) / 2);
    const startY = Math.max(60, (vpH - gridH) / 2);

    const ordered = [...nodes].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "person" ? -1 : 1;
      return 0;
    });

    ordered.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const { w: cardW, h: cardH } = sizes.get(node.id) ?? { w: maxW, h: maxH };
      pos[node.id] = {
        x: startX + col * (CELL_W + GAP) + (CELL_W - cardW) / 2,
        y: startY + row * (CELL_H + GAP) + (CELL_H - cardH) / 2,
      };
    });

    setIsArranging(true);
    onBatchMoveNodes(pos);
    setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
  }, [nodes, onBatchMoveNodes, zoomFitIfNeeded, getCardSize, zoom]);

  const arrangeSplit = useCallback(() => {
    if (!onBatchMoveNodes || nodes.length < 2) return;
    setPathFocus(null); setPathDrillNode(null); setShowAllInCompare(false); compareNodeIdsRef.current = null;
    const pos: Record<string, { x: number; y: number }> = {};

    const vp = viewportRef.current;
    const vpW = vp ? vp.clientWidth / zoom : 2000;
    const vpH = vp ? vp.clientHeight / zoom : 1500;

    const people = nodes.filter(n => n.kind === "person");
    const evidence = nodes.filter(n => n.kind !== "person");

    const GAP = 50;

    // Measure max card sizes per group
    const sizes = new Map<string, { w: number; h: number }>();
    let maxPersonW = 0, maxPersonH = 0;
    for (const node of people) {
      const s = getCardSize(node.id);
      sizes.set(node.id, s);
      if (s.w > maxPersonW) maxPersonW = s.w;
      if (s.h > maxPersonH) maxPersonH = s.h;
    }
    maxPersonW = maxPersonW || 260;
    maxPersonH = maxPersonH || 300;

    let maxEvW = 0, maxEvH = 0;
    for (const node of evidence) {
      const s = getCardSize(node.id);
      sizes.set(node.id, s);
      if (s.w > maxEvW) maxEvW = s.w;
      if (s.h > maxEvH) maxEvH = s.h;
    }
    maxEvW = maxEvW || 190;
    maxEvH = maxEvH || 220;

    // People: horizontal row across the top
    const personRowW = people.length * (maxPersonW + GAP) - GAP;
    const personStartX = Math.max(40, (vpW - personRowW) / 2);

    // Evidence: horizontal rows below people
    const evCols = Math.max(1, Math.floor((vpW - 80) / (maxEvW + GAP)));
    const evRows = Math.ceil(evidence.length / evCols);
    const evRowW = Math.min(evidence.length, evCols) * (maxEvW + GAP) - GAP;
    const evStartX = Math.max(40, (vpW - evRowW) / 2);

    // Vertical: center both sections in viewport
    const SECTION_GAP = 80;
    const totalH = maxPersonH + SECTION_GAP + evRows * (maxEvH + GAP) - GAP;
    const startY = Math.max(60, (vpH - totalH) / 2);

    // Place people in a horizontal row
    people.forEach((node, i) => {
      const s = sizes.get(node.id) ?? { w: maxPersonW, h: maxPersonH };
      pos[node.id] = {
        x: personStartX + i * (maxPersonW + GAP) + (maxPersonW - s.w) / 2,
        y: startY + (maxPersonH - s.h) / 2,
      };
    });

    // Place evidence in horizontal rows below
    const evTopY = startY + maxPersonH + SECTION_GAP;
    evidence.forEach((node, i) => {
      const col = i % evCols;
      const row = Math.floor(i / evCols);
      const s = sizes.get(node.id) ?? { w: maxEvW, h: maxEvH };
      pos[node.id] = {
        x: evStartX + col * (maxEvW + GAP) + (maxEvW - s.w) / 2,
        y: evTopY + row * (maxEvH + GAP) + (maxEvH - s.h) / 2,
      };
    });

    setIsArranging(true);
    onBatchMoveNodes(pos);
    setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
  }, [nodes, onBatchMoveNodes, getCardSize, zoomFitIfNeeded, zoom]);

  // Stack unconnected nodes in a column to the right of main layout
  const stackSidebar = (
    orphanIds: string[],
    pos: Record<string, { x: number; y: number }>,
  ) => {
    if (orphanIds.length === 0) return;
    // Find rightmost edge of already-placed nodes
    let maxRight = 0;
    for (const p of Object.values(pos)) {
      const id = Object.entries(pos).find(([, v]) => v === p)?.[0];
      const s = id ? getCardSize(id) : { w: 260, h: 300 };
      if (p.x + s.w > maxRight) maxRight = p.x + s.w;
    }
    const sideX = maxRight + 120;
    let sideY = 80;
    for (const id of orphanIds) {
      const s = getCardSize(id);
      pos[id] = { x: sideX, y: sideY };
      sideY += s.h + 30;
    }
  };

  const arrangeForce = useCallback(() => {
    if (!onBatchMoveNodes || nodes.length < 2) return;
    setPathFocus(null); setPathDrillNode(null); setShowAllInCompare(false); compareNodeIdsRef.current = null;

    // Measure card sizes
    const sizes = new Map<string, { w: number; h: number }>();
    for (const node of nodes) sizes.set(node.id, getCardSize(node.id));

    // Find which nodes have at least one connection
    const hasConnection = new Set<string>();
    for (const c of connections) {
      hasConnection.add(c.sourceId);
      hasConnection.add(c.targetId);
    }

    const connectedNodes = nodes.filter(n => hasConnection.has(n.id));
    const orphanNodes = nodes.filter(n => !hasConnection.has(n.id));

    // Only simulate connected nodes
    type Body = { id: string; x: number; y: number; vx: number; vy: number; w: number; h: number };
    const bodies: Body[] = connectedNodes.map((n) => {
      const s = sizes.get(n.id) ?? { w: 260, h: 300 };
      return {
        id: n.id,
        x: n.position.x + s.w / 2,
        y: n.position.y + s.h / 2,
        vx: 0, vy: 0,
        w: s.w, h: s.h,
      };
    });

    const ITERATIONS = 200;
    const REPULSION = 200000;
    const ATTRACTION = 0.005;
    const REST_LENGTH = 180;
    const DAMPING = 0.85;
    const MIN_DIST = 60;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const temp = 1 - iter / ITERATIONS;

      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MIN_DIST) dist = MIN_DIST;
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force * temp;
          const fy = (dy / dist) * force * temp;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }

      for (const conn of connections) {
        const a = bodies.find(b => b.id === conn.sourceId);
        const b = bodies.find(b => b.id === conn.targetId);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;
        const force = ATTRACTION * (dist - REST_LENGTH) * temp;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      for (const body of bodies) {
        body.vx *= DAMPING;
        body.vy *= DAMPING;
        body.x += body.vx;
        body.y += body.vy;
      }
    }

    // Center the result in the viewport
    const vp = viewportRef.current;
    const vpW = vp ? vp.clientWidth / zoom : 2000;
    const vpH = vp ? vp.clientHeight / zoom : 1500;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of bodies) {
      if (b.x - b.w / 2 < minX) minX = b.x - b.w / 2;
      if (b.y - b.h / 2 < minY) minY = b.y - b.h / 2;
      if (b.x + b.w / 2 > maxX) maxX = b.x + b.w / 2;
      if (b.y + b.h / 2 > maxY) maxY = b.y + b.h / 2;
    }
    const layoutW = maxX - minX;
    const layoutH = maxY - minY;
    const offsetX = Math.max(40, (vpW - layoutW) / 2) - minX;
    const offsetY = Math.max(60, (vpH - layoutH) / 2) - minY;

    const pos: Record<string, { x: number; y: number }> = {};
    for (const b of bodies) {
      pos[b.id] = {
        x: b.x + offsetX - b.w / 2,
        y: b.y + offsetY - b.h / 2,
      };
    }

    // Stack orphans in a column to the right
    stackSidebar(orphanNodes.map(n => n.id), pos);

    setIsArranging(true);
    onBatchMoveNodes(pos);
    setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
  }, [nodes, connections, onBatchMoveNodes, getCardSize, zoomFitIfNeeded, zoom]);

  // ── WIDE NETWORK: viewport-filling force-directed layout ────────────────
  // Like Network but actively fills the available viewport space with higher
  // repulsion, aspect-ratio-aware forces, and a final scale-to-fit pass.
  const arrangeWideNetwork = useCallback(() => {
    if (!onBatchMoveNodes || nodes.length < 2) return;
    setPathFocus(null); setPathDrillNode(null); setShowAllInCompare(false); compareNodeIdsRef.current = null;

    const vp = viewportRef.current;
    const vpW = vp ? vp.clientWidth / zoom : 2000;
    const vpH = vp ? vp.clientHeight / zoom : 1500;
    const MARGIN = 60;
    const targetW = vpW - MARGIN * 2;
    const targetH = vpH - MARGIN * 2;
    const aspectRatio = targetW / targetH; // > 1 means wider than tall

    // Measure card sizes
    const sizes = new Map<string, { w: number; h: number }>();
    for (const node of nodes) sizes.set(node.id, getCardSize(node.id));

    // Separate connected vs orphan
    const hasConnection = new Set<string>();
    for (const c of connections) {
      hasConnection.add(c.sourceId);
      hasConnection.add(c.targetId);
    }
    const connectedNodes = nodes.filter(n => hasConnection.has(n.id));
    const orphanNodes = nodes.filter(n => !hasConnection.has(n.id));

    // Initialize bodies spread across the target area (not clustered)
    type Body = { id: string; x: number; y: number; vx: number; vy: number; w: number; h: number };
    const bodies: Body[] = connectedNodes.map((n, i) => {
      const s = sizes.get(n.id) ?? { w: 260, h: 300 };
      // Spread initial positions across the target rectangle
      const angle = (i / connectedNodes.length) * 2 * Math.PI;
      const spreadR = Math.min(targetW, targetH) * 0.35;
      return {
        id: n.id,
        x: targetW / 2 + Math.cos(angle) * spreadR * (0.5 + Math.random() * 0.5),
        y: targetH / 2 + Math.sin(angle) * spreadR * (0.5 + Math.random() * 0.5),
        vx: 0, vy: 0,
        w: s.w, h: s.h,
      };
    });

    // Build adjacency lookup for O(1) edge checks
    const edgeSet = new Set<string>();
    for (const c of connections) {
      edgeSet.add(`${c.sourceId}|${c.targetId}`);
      edgeSet.add(`${c.targetId}|${c.sourceId}`);
    }

    const ITERATIONS = 300;
    const REPULSION = 500000; // Much higher than standard network
    const ATTRACTION = 0.003;
    const REST_LENGTH = 250; // Longer rest length for more spacing
    const DAMPING = 0.82;
    const MIN_DIST = 80;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const temp = 1 - (iter / ITERATIONS) * 0.8; // Never drops below 0.2

      // Repulsion between all pairs
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          // Stretch horizontal distances to encourage wide layout
          const effDx = dx * (1 / Math.sqrt(aspectRatio));
          const effDy = dy * Math.sqrt(aspectRatio);
          let dist = Math.sqrt(effDx * effDx + effDy * effDy);
          if (dist < MIN_DIST) dist = MIN_DIST;
          const force = REPULSION / (dist * dist);
          const fx = (dx / (Math.sqrt(dx * dx + dy * dy) || 1)) * force * temp;
          const fy = (dy / (Math.sqrt(dx * dx + dy * dy) || 1)) * force * temp;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }

      // Attraction along edges
      for (const conn of connections) {
        const a = bodies.find(b => b.id === conn.sourceId);
        const b = bodies.find(b => b.id === conn.targetId);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;
        const force = ATTRACTION * (dist - REST_LENGTH) * temp;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      // Gentle gravity toward center to prevent drift
      const cx = targetW / 2, cy = targetH / 2;
      const GRAVITY = 0.0003 * temp;
      for (const body of bodies) {
        body.vx += (cx - body.x) * GRAVITY;
        body.vy += (cy - body.y) * GRAVITY;
      }

      // Apply velocities
      for (const body of bodies) {
        body.vx *= DAMPING;
        body.vy *= DAMPING;
        body.x += body.vx;
        body.y += body.vy;
      }
    }

    // Overlap repulsion passes
    const OVERLAP_PASSES = 30;
    const OVERLAP_PUSH = 0.35;
    const PADDING = 35;
    for (let pass = 0; pass < OVERLAP_PASSES; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          const overlapX = (a.w / 2 + b.w / 2 + PADDING) - Math.abs(a.x - b.x);
          const overlapY = (a.h / 2 + b.h / 2 + PADDING) - Math.abs(a.y - b.y);
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              const push = overlapX * OVERLAP_PUSH;
              const dir = a.x < b.x ? -1 : 1;
              a.x += dir * push; b.x -= dir * push;
            } else {
              const push = overlapY * OVERLAP_PUSH;
              const dir = a.y < b.y ? -1 : 1;
              a.y += dir * push; b.y -= dir * push;
            }
          }
        }
      }
    }

    // Scale-to-fit: compute bounding box and scale to fill viewport
    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
    for (const b of bodies) {
      if (b.x - b.w / 2 < bMinX) bMinX = b.x - b.w / 2;
      if (b.y - b.h / 2 < bMinY) bMinY = b.y - b.h / 2;
      if (b.x + b.w / 2 > bMaxX) bMaxX = b.x + b.w / 2;
      if (b.y + b.h / 2 > bMaxY) bMaxY = b.y + b.h / 2;
    }
    const layoutW = bMaxX - bMinX;
    const layoutH = bMaxY - bMinY;

    // Scale to fill the target area (use the smaller scale to preserve aspect)
    const scaleX = layoutW > 0 ? targetW / layoutW : 1;
    const scaleY = layoutH > 0 ? targetH / layoutH : 1;
    const scale = Math.min(scaleX, scaleY, 1.5); // cap at 1.5x to avoid over-scaling small layouts

    // Apply scale and center
    const scaledW = layoutW * scale;
    const scaledH = layoutH * scale;
    const offsetX = MARGIN + (targetW - scaledW) / 2;
    const offsetY = MARGIN + (targetH - scaledH) / 2;

    const pos: Record<string, { x: number; y: number }> = {};
    for (const b of bodies) {
      pos[b.id] = {
        x: offsetX + (b.x - b.w / 2 - bMinX) * scale,
        y: offsetY + (b.y - b.h / 2 - bMinY) * scale,
      };
    }

    // Stack orphans along the bottom edge
    if (orphanNodes.length > 0) {
      const orphanY = offsetY + scaledH + 60;
      let ox = MARGIN;
      for (const n of orphanNodes) {
        const s = sizes.get(n.id) ?? { w: 200, h: 200 };
        pos[n.id] = { x: ox, y: orphanY };
        ox += s.w + 40;
        if (ox > vpW - MARGIN) { ox = MARGIN; /* wrap won't happen often */ }
      }
    }

    setIsArranging(true);
    onBatchMoveNodes(pos);
    setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
  }, [nodes, connections, onBatchMoveNodes, getCardSize, zoomFitIfNeeded, zoom]);

  // ── LAB MODE: experimental layout algorithm ─────────────────────────────
  // Swap the algorithm inside this function to test different approaches.
  // Does NOT affect any other organize mode.
  const arrangeTest = useCallback(() => {
    if (!onBatchMoveNodes || nodes.length < 2) return;
    setPathFocus(null); setPathDrillNode(null); setShowAllInCompare(false); compareNodeIdsRef.current = null;

    // Measure card sizes
    const sizes = new Map<string, { w: number; h: number }>();
    for (const node of nodes) sizes.set(node.id, getCardSize(node.id));

    const hasConnection = new Set<string>();
    for (const c of connections) {
      hasConnection.add(c.sourceId);
      hasConnection.add(c.targetId);
    }
    const connectedNodes = nodes.filter(n => hasConnection.has(n.id));
    const orphanNodes = nodes.filter(n => !hasConnection.has(n.id));

    // ═══════════════════════════════════════════════════════════════════════
    // fCoSE (constrained force-directed) via Cytoscape.js
    // iVis-at-Bilkent — spectral init + force-directed refinement
    // ═══════════════════════════════════════════════════════════════════════

    // Build cytoscape elements
    const cyNodes: cytoscape.ElementDefinition[] = connectedNodes.map((n) => {
      const s = sizes.get(n.id) ?? { w: 260, h: 300 };
      return {
        group: "nodes" as const,
        data: { id: n.id, width: s.w, height: s.h },
        position: { x: n.position.x + s.w / 2, y: n.position.y + s.h / 2 },
      };
    });

    const usedEdgeKeys = new Set<string>();
    const cyEdges: cytoscape.ElementDefinition[] = [];
    for (const c of connections) {
      const key = `${c.sourceId}-${c.targetId}`;
      if (usedEdgeKeys.has(key)) continue;
      if (!connectedNodes.some(n => n.id === c.sourceId) || !connectedNodes.some(n => n.id === c.targetId)) continue;
      usedEdgeKeys.add(key);
      cyEdges.push({
        group: "edges" as const,
        data: { id: `e-${c.id}`, source: c.sourceId, target: c.targetId },
      });
    }

    // Run fCoSE headlessly (styleEnabled: true so node dimensions are respected)
    const cy = cytoscape({
      elements: [...cyNodes, ...cyEdges],
      headless: true,
      styleEnabled: true,
      style: cyNodes.map((n) => ({
        selector: `#${CSS.escape(n.data.id as string)}`,
        style: { width: n.data.width as number, height: n.data.height as number },
      })),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layout = cy.layout({
      name: "fcose",
      quality: "proof",
      randomize: true,
      animate: false,
      fit: false,
      padding: 50,
      nodeSeparation: 150,
      nodeRepulsion: () => 10000,
      idealEdgeLength: () => 250,
      edgeElasticity: () => 0.35,
      numIter: 5000,
      gravity: 0.12,
      gravityRange: 3.8,
      packComponents: true,
      nodeDimensionsIncludeLabels: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    layout.run();

    // Post-process: pull outliers toward the center of mass
    // Only affects nodes that are far from the group — doesn't touch the core layout
    let cx = 0, cy2 = 0, count = 0;
    cy.nodes().forEach((node) => {
      const p = node.position();
      cx += p.x; cy2 += p.y; count++;
    });
    cx /= count || 1; cy2 /= count || 1;

    // Find the average distance from center
    let avgDist = 0;
    cy.nodes().forEach((node) => {
      const p = node.position();
      avgDist += Math.sqrt((p.x - cx) ** 2 + (p.y - cy2) ** 2);
    });
    avgDist /= count || 1;

    // Anything beyond 1.8x the average distance gets pulled in aggressively
    const OUTLIER_THRESHOLD = 1.5;
    const PULL_STRENGTH = 0.75; // pull 75% of the way toward the threshold boundary
    cy.nodes().forEach((node) => {
      const p = node.position();
      const dx = p.x - cx, dy = p.y - cy2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = avgDist * OUTLIER_THRESHOLD;
      if (dist > maxDist) {
        const scale = maxDist / dist;
        const newX = cx + dx * (scale + (1 - scale) * (1 - PULL_STRENGTH));
        const newY = cy2 + dy * (scale + (1 - scale) * (1 - PULL_STRENGTH));
        node.position({ x: newX, y: newY });
      }
    });

    // Read positions back, normalize to top-left at (100, 80)
    let minX = Infinity, minY = Infinity;
    cy.nodes().forEach((node) => {
      const p = node.position();
      const s = sizes.get(node.id()) ?? { w: 260, h: 300 };
      if (p.x - s.w / 2 < minX) minX = p.x - s.w / 2;
      if (p.y - s.h / 2 < minY) minY = p.y - s.h / 2;
    });
    const offsetX = 100 - minX, offsetY = 80 - minY;

    const pos: Record<string, { x: number; y: number }> = {};
    cy.nodes().forEach((node) => {
      const p = node.position();
      const s = sizes.get(node.id()) ?? { w: 260, h: 300 };
      pos[node.id()] = { x: p.x + offsetX - s.w / 2, y: p.y + offsetY - s.h / 2 };
    });

    cy.destroy();

    // ═══════════════════════════════════════════════════════════════════════

    stackSidebar(orphanNodes.map(n => n.id), pos);
    setIsArranging(true);
    onBatchMoveNodes(pos);
    setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
  }, [nodes, connections, onBatchMoveNodes, getCardSize, zoomFitIfNeeded]);

  // ── LAB 2: Fruchterman-Reingold force-directed layout ────────────────────
  // Ported from github.com/Samuelk0nrad/sociogram (Kotlin → TypeScript)
  // Pure simulation — no Cytoscape dependency.
  const arrangeTest2 = useCallback(() => {
    if (!onBatchMoveNodes || nodes.length < 2) return;
    setPathFocus(null); setPathDrillNode(null); setShowAllInCompare(false); compareNodeIdsRef.current = null;

    const sizes = new Map<string, { w: number; h: number }>();
    for (const node of nodes) sizes.set(node.id, getCardSize(node.id));

    const hasConnection = new Set<string>();
    for (const c of connections) {
      hasConnection.add(c.sourceId);
      hasConnection.add(c.targetId);
    }
    const connectedNodes = nodes.filter(n => hasConnection.has(n.id));
    const orphanNodes = nodes.filter(n => !hasConnection.has(n.id));

    if (connectedNodes.length === 0) return;

    // ═══════════════════════════════════════════════════════════════════════
    // Fruchterman-Reingold simulation
    // ═══════════════════════════════════════════════════════════════════════

    // Simulation area — scaled up to give large cards room to breathe
    // Compute average card diagonal to scale the sim space
    let avgCardDiag = 0;
    for (const n of connectedNodes) {
      const s = sizes.get(n.id) ?? { w: 260, h: 300 };
      avgCardDiag += Math.sqrt(s.w * s.w + s.h * s.h);
    }
    avgCardDiag /= connectedNodes.length;
    const simW = Math.max(4000, connectedNodes.length * avgCardDiag * 0.8);
    const simH = Math.max(3000, connectedNodes.length * avgCardDiag * 0.6);
    const maxDist = Math.sqrt(simW * simW + simH * simH);
    // k = ideal edge length — scaled to card size so nodes don't stack
    const k = avgCardDiag * 2.8;

    // Build body array with random initial positions
    type FRBody = { id: string; x: number; y: number; fx: number; fy: number; w: number; h: number };
    const bodies: FRBody[] = connectedNodes.map((n) => {
      const s = sizes.get(n.id) ?? { w: 260, h: 300 };
      return {
        id: n.id,
        x: Math.random() * simW,
        y: Math.random() * simH,
        fx: 0, fy: 0,
        w: s.w, h: s.h,
      };
    });
    const bodyMap = new Map<string, FRBody>();
    for (const b of bodies) bodyMap.set(b.id, b);

    // Build edge list (deduplicated, connected only)
    const edgeSet = new Set<string>();
    const frEdges: { src: FRBody; tgt: FRBody; weight: number }[] = [];
    for (const c of connections) {
      const key = [c.sourceId, c.targetId].sort().join("||");
      if (edgeSet.has(key)) continue;
      const src = bodyMap.get(c.sourceId);
      const tgt = bodyMap.get(c.targetId);
      if (!src || !tgt) continue;
      edgeSet.add(key);
      frEdges.push({ src, tgt, weight: c.strength || 1 });
    }

    // Pre-build adjacency lookup for O(1) edge detection
    const adjacency = new Map<string, Set<string>>();
    for (const b of bodies) adjacency.set(b.id, new Set());
    for (const e of frEdges) {
      adjacency.get(e.src.id)!.add(e.tgt.id);
      adjacency.get(e.tgt.id)!.add(e.src.id);
    }

    // Simulation parameters
    const ITERATIONS = 500;
    let temperature = 2.0;
    const COOLING_FACTOR = 0.97;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // Calculate forces for each node
      for (const v of bodies) {
        v.fx = 0; v.fy = 0;
        const forces: { x: number; y: number }[] = [];
        const vAdj = adjacency.get(v.id)!;

        for (const u of bodies) {
          if (v === u) continue;
          const dx = u.x - v.x;
          const dy = u.y - v.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);

          if (vAdj.has(u.id)) {
            // Attractive force: d²/k (or -k/(d*d) when close)
            const edgeWeight = frEdges.find(e =>
              (e.src === v && e.tgt === u) || (e.src === u && e.tgt === v)
            )?.weight ?? 1;
            const newK = k / edgeWeight;
            let force = dist > k ? (dist * dist) / newK : -(newK / (dist * dist));
            force = Math.min(force, maxDist);
            forces.push({ x: v.x + force * dx / dist, y: v.y + force * dy / dist });
          } else {
            // Repulsive force: -k²/d
            const force = -(k * k) / dist;
            forces.push({ x: v.x + force * dx / dist, y: v.y + force * dy / dist });
          }
        }

        if (forces.length > 0) {
          v.fx = forces.reduce((s, f) => s + f.x, 0) / forces.length;
          v.fy = forces.reduce((s, f) => s + f.y, 0) / forces.length;
        }
      }

      // Apply forces with cooling
      for (const v of bodies) {
        const dx = v.fx - v.x;
        const dy = v.fy - v.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
        const factor = dist * temperature;
        const newX = v.x + factor * dx / dist;
        const newY = v.y + factor * dy / dist;
        // Clamp to simulation bounds
        v.x = Math.max(0, Math.min(simW, newX));
        v.y = Math.max(0, Math.min(simH, newY));
      }

      // Cool down
      temperature = Math.max(temperature * COOLING_FACTOR, 0.01);
    }

    // ── Post-process step 1: compact spread ──────────────────────────────
    // Pull ALL nodes toward center of mass to tighten the layout.
    // Outer nodes get pulled more aggressively (proportional to distance).
    let cx = 0, cy2 = 0;
    for (const b of bodies) { cx += b.x; cy2 += b.y; }
    cx /= bodies.length; cy2 /= bodies.length;

    // Global compaction: shrink distance from center by a factor
    const COMPACT_FACTOR = 0.55; // pull 45% closer to center
    for (const b of bodies) {
      b.x = cx + (b.x - cx) * COMPACT_FACTOR;
      b.y = cy2 + (b.y - cy2) * COMPACT_FACTOR;
    }

    // Extra pull on outliers beyond 1.5x average distance
    let avgDist = 0;
    for (const b of bodies) avgDist += Math.sqrt((b.x - cx) ** 2 + (b.y - cy2) ** 2);
    avgDist /= bodies.length;
    const OUTLIER_THRESHOLD = 1.5;
    const OUTLIER_PULL = 0.7;
    for (const b of bodies) {
      const dx = b.x - cx, dy = b.y - cy2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxD = avgDist * OUTLIER_THRESHOLD;
      if (dist > maxD) {
        const scale = maxD / dist;
        b.x = cx + dx * (scale + (1 - scale) * (1 - OUTLIER_PULL));
        b.y = cy2 + dy * (scale + (1 - scale) * (1 - OUTLIER_PULL));
      }
    }

    // ── Post-process step 2: gentle overlap repulsion ──────────────────
    // A few passes of pushing overlapping cards apart, but softly.
    const OVERLAP_PASSES = 25;
    const OVERLAP_PUSH = 0.3; // push 30% of the overlap per pass
    const PADDING = 30; // minimum gap between cards
    for (let pass = 0; pass < OVERLAP_PASSES; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          // Check bounding-box overlap (with padding)
          const overlapX = (a.w / 2 + b.w / 2 + PADDING) - Math.abs(a.x - b.x);
          const overlapY = (a.h / 2 + b.h / 2 + PADDING) - Math.abs(a.y - b.y);
          if (overlapX > 0 && overlapY > 0) {
            // Push apart along the axis of least overlap
            if (overlapX < overlapY) {
              const push = overlapX * OVERLAP_PUSH;
              const dir = a.x < b.x ? -1 : 1;
              a.x += dir * push;
              b.x -= dir * push;
            } else {
              const push = overlapY * OVERLAP_PUSH;
              const dir = a.y < b.y ? -1 : 1;
              a.y += dir * push;
              b.y -= dir * push;
            }
          }
        }
      }
    }

    // Center the force layout in the viewport
    const forceVp = viewportRef.current;
    const forceVpW = forceVp ? forceVp.clientWidth / zoom : 2000;
    const forceVpH = forceVp ? forceVp.clientHeight / zoom : 1500;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of bodies) {
      if (b.x - b.w / 2 < minX) minX = b.x - b.w / 2;
      if (b.y - b.h / 2 < minY) minY = b.y - b.h / 2;
      if (b.x + b.w / 2 > maxX) maxX = b.x + b.w / 2;
      if (b.y + b.h / 2 > maxY) maxY = b.y + b.h / 2;
    }
    const layoutW = maxX - minX;
    const layoutH = maxY - minY;
    const offX = Math.max(40, (forceVpW - layoutW) / 2) - minX;
    const offY = Math.max(40, (forceVpH - layoutH) / 2) - minY;

    const pos: Record<string, { x: number; y: number }> = {};
    for (const b of bodies) {
      pos[b.id] = { x: b.x + offX - b.w / 2, y: b.y + offY - b.h / 2 };
    }

    // ═══════════════════════════════════════════════════════════════════════

    stackSidebar(orphanNodes.map(n => n.id), pos);
    setIsArranging(true);
    onBatchMoveNodes(pos);
    setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
  }, [nodes, connections, onBatchMoveNodes, getCardSize, zoomFitIfNeeded]);

  const arrangeEgo = useCallback(() => {
    if (!onBatchMoveNodes || nodes.length < 2) return;
    setPathFocus(null); setPathDrillNode(null); setShowAllInCompare(false); compareNodeIdsRef.current = null;

    // Pick ego: selected node (prefer person), or most-connected person
    const people = nodes.filter(n => n.kind === "person");
    if (people.length === 0) return;

    // Build adjacency
    const neighbors: Record<string, Set<string>> = {};
    for (const n of nodes) neighbors[n.id] = new Set();
    for (const c of connections) {
      if (neighbors[c.sourceId]) neighbors[c.sourceId].add(c.targetId);
      if (neighbors[c.targetId]) neighbors[c.targetId].add(c.sourceId);
    }

    const ego = (selectedNodeId && people.find(p => p.id === selectedNodeId))
      ? selectedNodeId
      : people.sort((a, b) => (neighbors[b.id]?.size ?? 0) - (neighbors[a.id]?.size ?? 0))[0].id;

    // BFS outward from ego to build rings by distance
    const placed = new Set<string>([ego]);
    const rings: string[][] = [];
    let frontier = [ego];

    while (frontier.length > 0) {
      const nextFrontier: string[] = [];
      for (const id of frontier) {
        for (const nId of (neighbors[id] || [])) {
          if (!placed.has(nId)) {
            placed.add(nId);
            nextFrontier.push(nId);
          }
        }
      }
      if (nextFrontier.length > 0) rings.push(nextFrontier);
      frontier = nextFrontier;
    }

    // Orphans: not reachable from ego
    const orphans: string[] = [];
    for (const n of nodes) {
      if (!placed.has(n.id)) orphans.push(n.id);
    }

    // Measure max card height per ring for clearance
    const ringMaxH: number[] = rings.map(ids => {
      let maxH = 0;
      for (const id of ids) {
        const s = getCardSize(id);
        if (s.h > maxH) maxH = s.h;
      }
      return maxH;
    });

    // Calculate radius per ring — tight but no overlap
    const ringRadii: number[] = [];
    const egoSize = getCardSize(ego);
    let prevRadius = 0;
    for (let i = 0; i < rings.length; i++) {
      const count = rings[i].length;
      const maxH = ringMaxH[i];
      // Circumference must fit all cards with small gaps
      const minFromSpacing = (count * 300) / (2 * Math.PI);
      // Must clear previous ring
      const clearance = i === 0 ? egoSize.h / 2 + maxH / 2 + 30 : ringMaxH[i - 1] / 2 + maxH / 2 + 30;
      const minFromPrev = prevRadius + clearance;
      const r = Math.max(minFromSpacing, minFromPrev);
      ringRadii.push(r);
      prevRadius = r;
    }

    const maxR = ringRadii.length > 0 ? ringRadii[ringRadii.length - 1] : 200;
    // Center the ego layout in the viewport
    const vp = viewportRef.current;
    const vpW = vp ? vp.clientWidth / zoom : 2000;
    const vpH = vp ? vp.clientHeight / zoom : 1500;
    const centerX = Math.max(maxR + 300, vpW / 2);
    const centerY = Math.max(maxR + 300, vpH / 2);

    const pos: Record<string, { x: number; y: number }> = {};
    pos[ego] = { x: centerX - egoSize.w / 2, y: centerY - egoSize.h / 2 };

    // Place each ring evenly around the center, offset each ring's start angle
    for (let i = 0; i < rings.length; i++) {
      const ids = rings[i];
      const radius = ringRadii[i];
      const angleStep = (2 * Math.PI) / ids.length;
      // Rotate each ring so cards don't line up radially with the ring inside
      const startAngle = -Math.PI / 2 + (i % 2 === 1 ? angleStep / 2 : 0);
      ids.forEach((id, j) => {
        const angle = startAngle + j * angleStep;
        const s = getCardSize(id);
        pos[id] = {
          x: centerX + Math.cos(angle) * radius - s.w / 2,
          y: centerY + Math.sin(angle) * radius - s.h / 2,
        };
      });
    }

    // Normalize so nothing goes past the top/left edge
    let minX = Infinity, minY = Infinity;
    for (const p of Object.values(pos)) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
    }
    const shiftX = minX < 80 ? 80 - minX : 0;
    const shiftY = minY < 80 ? 80 - minY : 0;
    if (shiftX || shiftY) {
      for (const p of Object.values(pos)) {
        p.x += shiftX;
        p.y += shiftY;
      }
    }

    // Stack orphans to the right
    stackSidebar(orphans, pos);

    setIsArranging(true);
    onBatchMoveNodes(pos);
    setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
  }, [nodes, connections, selectedNodeId, onBatchMoveNodes, getCardSize, zoomFit]);

  // Ego layout optimized for wide — ego on left, columns spreading right
  const arrangeEgoWide = useCallback(() => {
    if (!onBatchMoveNodes || nodes.length < 2) return;
    setPathFocus(null); setPathDrillNode(null); setShowAllInCompare(false); compareNodeIdsRef.current = null;

    const people = nodes.filter(n => n.kind === "person");
    if (people.length === 0) return;

    const neighbors: Record<string, Set<string>> = {};
    for (const n of nodes) neighbors[n.id] = new Set();
    for (const c of connections) {
      if (neighbors[c.sourceId]) neighbors[c.sourceId].add(c.targetId);
      if (neighbors[c.targetId]) neighbors[c.targetId].add(c.sourceId);
    }

    const ego = (selectedNodeId && people.find(p => p.id === selectedNodeId))
      ? selectedNodeId
      : people.sort((a, b) => (neighbors[b.id]?.size ?? 0) - (neighbors[a.id]?.size ?? 0))[0].id;

    // BFS levels from ego
    const placed = new Set<string>([ego]);
    const bfsLevels: string[][] = [];
    let frontier = [ego];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const nId of (neighbors[id] || [])) {
          if (!placed.has(nId)) { placed.add(nId); next.push(nId); }
        }
      }
      if (next.length > 0) bfsLevels.push(next);
      frontier = next;
    }

    const orphans: string[] = [];
    for (const n of nodes) { if (!placed.has(n.id)) orphans.push(n.id); }

    // Split large BFS levels into visual columns (max 4 items per column)
    const MAX_PER_COL = 4;
    const visualColumns: string[][] = [];
    for (const level of bfsLevels) {
      // Sort: people first, then evidence
      const sorted = [...level].sort((a, b) => {
        const aNode = nodes.find(n => n.id === a);
        const bNode = nodes.find(n => n.id === b);
        if (aNode?.kind === "person" && bNode?.kind !== "person") return -1;
        if (aNode?.kind !== "person" && bNode?.kind === "person") return 1;
        return 0;
      });
      for (let i = 0; i < sorted.length; i += MAX_PER_COL) {
        visualColumns.push(sorted.slice(i, i + MAX_PER_COL));
      }
    }

    const H_GAP = 30;
    const V_GAP = 12;
    const START_X = 80;
    const START_Y = 80;

    const pos: Record<string, { x: number; y: number }> = {};
    const egoSize = getCardSize(ego);

    // Measure each visual column
    const colWidths: number[] = visualColumns.map((col) => {
      let maxW = 0;
      for (const id of col) { const s = getCardSize(id); if (s.w > maxW) maxW = s.w; }
      return maxW;
    });
    const colHeights: number[] = visualColumns.map((col) => {
      let h = 0;
      for (let i = 0; i < col.length; i++) { h += getCardSize(col[i]).h + (i > 0 ? V_GAP : 0); }
      return h;
    });
    const maxColHeight = Math.max(...colHeights, egoSize.h);

    // Center ego vertically
    pos[ego] = { x: START_X, y: START_Y + Math.max(0, maxColHeight / 2 - egoSize.h / 2) };

    let colX = START_X + egoSize.w + H_GAP;
    for (let ci = 0; ci < visualColumns.length; ci++) {
      const col = visualColumns[ci];
      const colH = colHeights[ci];
      let y = START_Y + Math.max(0, maxColHeight / 2 - colH / 2);
      for (const id of col) {
        const s = getCardSize(id);
        pos[id] = { x: colX, y };
        y += s.h + V_GAP;
      }
      colX += colWidths[ci] + H_GAP;
    }

    // Orphans after last column
    if (orphans.length > 0) {
      let y = START_Y;
      for (const id of orphans) {
        const s = getCardSize(id);
        pos[id] = { x: colX + H_GAP, y };
        y += s.h + V_GAP;
      }
    }

    setIsArranging(true);
    onBatchMoveNodes(pos);
    setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
  }, [nodes, connections, selectedNodeId, onBatchMoveNodes, getCardSize, zoomFit]);

  useImperativeHandle(ref, () => ({ centerOnNode, zoomFit, arrangeEgoWide, expandAllGroups }), [centerOnNode, zoomFit, arrangeEgoWide, expandAllGroups]);

  const arrangePath = useCallback((nodeAId: string, nodeBId: string) => {
    if (!onBatchMoveNodes || nodes.length < 2) return;

    // Snapshot current node IDs so newly added cards stay visible
    compareNodeIdsRef.current = new Set(nodes.map(n => n.id));

    // Build adjacency with connection references
    const adj: Record<string, { neighbor: string; connId: string; strength: number }[]> = {};
    for (const n of nodes) adj[n.id] = [];
    for (const c of connections) {
      if (adj[c.sourceId]) adj[c.sourceId].push({ neighbor: c.targetId, connId: c.id, strength: c.strength });
      if (adj[c.targetId]) adj[c.targetId].push({ neighbor: c.sourceId, connId: c.id, strength: c.strength });
    }

    // BFS to find all shortest paths (max length 6)
    type Path = { nodes: string[]; edges: string[]; totalStrength: number };
    const MAX_LEN = 6;
    const allPaths: Path[] = [];
    const queue: Path[] = [{ nodes: [nodeAId], edges: [], totalStrength: 0 }];
    let shortestLen = Infinity;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const last = current.nodes[current.nodes.length - 1];

      if (last === nodeBId) {
        if (current.nodes.length <= shortestLen + 2) { // allow paths up to 2 longer than shortest
          if (current.nodes.length < shortestLen) shortestLen = current.nodes.length;
          allPaths.push(current);
        }
        continue;
      }

      if (current.nodes.length >= MAX_LEN) continue;
      if (current.nodes.length > shortestLen + 2) continue;

      for (const edge of (adj[last] || [])) {
        if (current.nodes.includes(edge.neighbor)) continue;
        queue.push({
          nodes: [...current.nodes, edge.neighbor],
          edges: [...current.edges, edge.connId],
          totalStrength: current.totalStrength + edge.strength,
        });
      }
    }

    // Sort by total strength (descending), keep best for layout spine
    allPaths.sort((a, b) => b.totalStrength - a.totalStrength);
    const bestPaths = allPaths.slice(0, 5);

    // Also find ALL nodes that sit between A and B:
    // any node reachable from A that can also reach B (within max hops)
    const reachFromA = new Set<string>();
    const reachFromB = new Set<string>();
    const bfsReach = (startId: string, result: Set<string>) => {
      const q = [startId];
      result.add(startId);
      const visited = new Set([startId]);
      let depth = 0;
      let frontier = [startId];
      while (frontier.length > 0 && depth < MAX_LEN) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const edge of (adj[id] || [])) {
            if (!visited.has(edge.neighbor)) {
              visited.add(edge.neighbor);
              result.add(edge.neighbor);
              next.push(edge.neighbor);
            }
          }
        }
        frontier = next;
        depth++;
      }
    };
    bfsReach(nodeAId, reachFromA);
    bfsReach(nodeBId, reachFromB);

    // Nodes between A and B: reachable from both
    const betweenNodes = new Set<string>();
    for (const nId of reachFromA) {
      if (reachFromB.has(nId)) betweenNodes.add(nId);
    }

    // Edges between "between" nodes
    const betweenEdges = new Set<string>();
    for (const c of connections) {
      if (betweenNodes.has(c.sourceId) && betweenNodes.has(c.targetId)) {
        betweenEdges.add(c.id);
      }
    }

    // Use betweenNodes/betweenEdges as the highlighted set
    const pathNodeIds = betweenNodes;
    const pathEdgeIds = betweenEdges;

    if (bestPaths.length === 0) {
      // No path found — just put them side by side
      const sA = getCardSize(nodeAId);
      const sB = getCardSize(nodeBId);
      const pos: Record<string, { x: number; y: number }> = {};
      pos[nodeAId] = { x: 100, y: 200 };
      pos[nodeBId] = { x: 100 + sA.w + 400, y: 200 };
      let offY = 200 + Math.max(sA.h, sB.h) + 100;
      for (const n of nodes) {
        if (n.id === nodeAId || n.id === nodeBId) continue;
        const s = getCardSize(n.id);
        pos[n.id] = { x: 100, y: offY };
        offY += s.h + 30;
      }
      setPathFocus({
        nodeId: nodeAId,
        directIds: new Set([nodeBId]),
        secondIds: new Set(),
        edgeIds: new Set(),
      });
      setIsArranging(true);
      onBatchMoveNodes(pos);
      setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
      return;
    }

    // Build ordered sequence from best path + all between-nodes
    const ordered: string[] = [...bestPaths[0].nodes];

    // Add all between-nodes that aren't already in ordered
    for (const nId of betweenNodes) {
      if (!ordered.includes(nId)) ordered.push(nId);
    }

    const pos: Record<string, { x: number; y: number }> = {};
    const startY = 80;
    const GAP_Y = 50;

    const sA = getCardSize(nodeAId);
    const sB = getCardSize(nodeBId);

    // Build full adjacency for categorization (all connections, not just path)
    const fullAdj: Record<string, Set<string>> = {};
    for (const n of nodes) fullAdj[n.id] = new Set();
    for (const c of connections) {
      if (fullAdj[c.sourceId]) fullAdj[c.sourceId].add(c.targetId);
      if (fullAdj[c.targetId]) fullAdj[c.targetId].add(c.sourceId);
    }

    // Categorize all intermediates into 5 buckets:
    // 1. directShared: connected to BOTH A and B directly
    // 2. transitiveA: connected to A directly, connects to shared evidence (not B)
    // 3. indirectA: connected to shared evidence but NOT to A or B — closer to A's side
    // 4. indirectB: mirror of indirectA on B's side
    // 5. transitiveB: connected to B directly, connects to shared evidence (not A)
    const intermediates = ordered.filter(id => id !== nodeAId && id !== nodeBId);

    const directShared: string[] = [];
    const transitiveA: string[] = [];
    const transitiveB: string[] = [];
    const exclusiveA: string[] = []; // connected to A only, no link to shared evidence
    const exclusiveB: string[] = []; // connected to B only, no link to shared evidence
    const indirectA: string[] = [];
    const indirectB: string[] = [];

    // First pass: find direct shared
    for (const nId of intermediates) {
      const connToA = fullAdj[nId]?.has(nodeAId) || false;
      const connToB = fullAdj[nId]?.has(nodeBId) || false;
      if (connToA && connToB) directShared.push(nId);
    }
    const directSharedSet = new Set(directShared);

    // Second pass: categorize the rest
    for (const nId of intermediates) {
      if (directSharedSet.has(nId)) continue;
      const connToA = fullAdj[nId]?.has(nodeAId) || false;
      const connToB = fullAdj[nId]?.has(nodeBId) || false;
      const connToShared = [...(fullAdj[nId] || [])].some(id => directSharedSet.has(id));

      if (connToA && !connToB) {
        // Connected to A but not B — is it also linked to shared evidence?
        if (connToShared) transitiveA.push(nId);
        else exclusiveA.push(nId);
      } else if (connToB && !connToA) {
        if (connToShared) transitiveB.push(nId);
        else exclusiveB.push(nId);
      } else if (!connToA && !connToB && connToShared) {
        const neighborsConnectA = [...(fullAdj[nId] || [])].some(nb => fullAdj[nb]?.has(nodeAId));
        if (neighborsConnectA) indirectA.push(nId);
        else indirectB.push(nId);
      } else if (connToA) {
        if (connToShared) transitiveA.push(nId);
        else exclusiveA.push(nId);
      } else if (connToB) {
        if (connToShared) transitiveB.push(nId);
        else exclusiveB.push(nId);
      } else {
        const dA = reachFromA.has(nId) ? 1 : 999;
        const dB = reachFromB.has(nId) ? 1 : 999;
        if (dA <= dB) indirectA.push(nId); else indirectB.push(nId);
      }
    }

    // Measure column widths
    const maxColW = (ids: string[]) => {
      let m = 0;
      for (const id of ids) { const s = getCardSize(id); if (s.w > m) m = s.w; }
      return m || 0;
    };

    // Person columns include exclusive evidence stacked below
    const wColA = Math.max(sA.w, maxColW(exclusiveA));
    const wTransA = maxColW(transitiveA);
    const wIndA = maxColW(indirectA);
    const wDirect = maxColW(directShared) || 200;
    const wIndB = maxColW(indirectB);
    const wTransB = maxColW(transitiveB);
    const wColB = Math.max(sB.w, maxColW(exclusiveB));
    const COL_GAP = 160;

    // Calculate each side's total span from person edge to center edge
    // A side: [person A half] + gap + [transA] + gap + [indirectA] + gap + [center half]
    let spanA = wColA / 2 + COL_GAP + wDirect / 2;
    if (wTransA > 0) spanA += wTransA + COL_GAP;
    if (wIndA > 0) spanA += wIndA + COL_GAP;

    let spanB = wColB / 2 + COL_GAP + wDirect / 2;
    if (wTransB > 0) spanB += wTransB + COL_GAP;
    if (wIndB > 0) spanB += wIndB + COL_GAP;

    // Use the larger span for both sides so center is equidistant
    const span = Math.max(spanA, spanB);

    // Place center column, centered in viewport
    const vp = viewportRef.current;
    const vpW = vp ? vp.clientWidth / zoom : 2000;
    const col4X = Math.max(100 + span, vpW / 2); // center of direct column

    // A side: place columns right-to-left from center
    let curLeft = col4X - wDirect / 2 - COL_GAP;
    const col3X = wIndA > 0 ? (curLeft - wIndA / 2) : -1; if (wIndA > 0) curLeft -= wIndA + COL_GAP;
    const col2X = wTransA > 0 ? (curLeft - wTransA / 2) : -1; if (wTransA > 0) curLeft -= wTransA + COL_GAP;
    const col1X = curLeft - wColA / 2;

    // B side: place columns left-to-right from center
    let curRight = col4X + wDirect / 2 + COL_GAP;
    const col5X = wIndB > 0 ? (curRight + wIndB / 2) : -1; if (wIndB > 0) curRight += wIndB + COL_GAP;
    const col6X = wTransB > 0 ? (curRight + wTransB / 2) : -1; if (wTransB > 0) curRight += wTransB + COL_GAP;
    const col7X = curRight + wColB / 2;

    // Person A and B at top (equidistant from center)
    const colACenterX = col1X + wColA / 2;
    const colBCenterX = col7X;
    pos[nodeAId] = { x: colACenterX - sA.w / 2, y: startY };
    pos[nodeBId] = { x: colBCenterX - sB.w / 2, y: startY };

    // Exclusive A: stack below Person A in the same column
    let exclAY = startY + sA.h + GAP_Y;
    for (const nId of exclusiveA) {
      const s = getCardSize(nId);
      pos[nId] = { x: colACenterX - s.w / 2, y: exclAY };
      exclAY += s.h + GAP_Y;
    }

    // Exclusive B: stack below Person B in the same column
    let exclBY = startY + sB.h + GAP_Y;
    for (const nId of exclusiveB) {
      const s = getCardSize(nId);
      pos[nId] = { x: colBCenterX - s.w / 2, y: exclBY };
      exclBY += s.h + GAP_Y;
    }

    // Direct shared in center column
    const directStartY = startY + Math.max(sA.h, sB.h) + GAP_Y + 40;
    let dy = directStartY;
    const directPositions: Record<string, { x: number; y: number }> = {};
    for (const nId of directShared) {
      const s = getCardSize(nId);
      pos[nId] = { x: col4X - s.w / 2, y: dy };
      directPositions[nId] = { x: col4X, y: dy + s.h / 2 };
      dy += s.h + GAP_Y;
    }

    // Place transitive nodes on the diagonal between person and shared evidence
    const personACenter = { x: colACenterX, y: startY + sA.h / 2 };
    const personBCenter = { x: colBCenterX, y: startY + sB.h / 2 };

    const placeOnDiagonal = (ids: string[], colCenterX: number, personCenter: { x: number; y: number }) => {
      if (colCenterX < 0 || ids.length === 0) return;
      for (const nId of ids) {
        const s = getCardSize(nId);
        let targetCenter = { x: col4X, y: directStartY + 100 };
        for (const dId of directShared) {
          if (fullAdj[nId]?.has(dId)) {
            targetCenter = directPositions[dId] || targetCenter;
            break;
          }
          for (const nb of (fullAdj[nId] || [])) {
            if (fullAdj[nb]?.has(dId) && directPositions[dId]) {
              targetCenter = directPositions[dId];
              break;
            }
          }
        }
        const dx = targetCenter.x - personCenter.x;
        const t = dx !== 0 ? (colCenterX - personCenter.x) / dx : 0.5;
        const lineY = personCenter.y + t * (targetCenter.y - personCenter.y);
        pos[nId] = { x: colCenterX - s.w / 2, y: lineY - s.h / 2 };
      }
    };

    placeOnDiagonal(transitiveA, col2X, personACenter);
    placeOnDiagonal(transitiveB, col6X, personBCenter);

    // Place indirect nodes aligned with the shared evidence they connect to
    const placeIndirect = (ids: string[], colX: number) => {
      if (colX < 0 || ids.length === 0) return;
      for (const nId of ids) {
        const s = getCardSize(nId);
        let targetY = directStartY + 100;
        for (const dId of directShared) {
          if (fullAdj[nId]?.has(dId) && directPositions[dId]) {
            targetY = directPositions[dId].y;
            break;
          }
          for (const nb of (fullAdj[nId] || [])) {
            if (fullAdj[nb]?.has(dId) && directPositions[dId]) {
              targetY = directPositions[dId].y;
              break;
            }
          }
        }
        pos[nId] = { x: colX - s.w / 2, y: targetY - s.h / 2 };
      }
    };

    placeIndirect(indirectA, col3X);
    placeIndirect(indirectB, col5X);

    // De-overlap pass: within each column group, push cards apart if they overlap
    const deOverlapColumn = (ids: string[]) => {
      if (ids.length < 2) return;
      const sorted = [...ids].filter(id => pos[id]).sort((a, b) => pos[a].y - pos[b].y);
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevBottom = pos[prev].y + getCardSize(prev).h + 30;
        if (pos[curr].y < prevBottom) {
          pos[curr] = { ...pos[curr], y: prevBottom };
        }
      }
    };

    deOverlapColumn(exclusiveA);
    deOverlapColumn(transitiveA);
    deOverlapColumn(indirectA);
    deOverlapColumn(directShared);
    deOverlapColumn(indirectB);
    deOverlapColumn(transitiveB);
    deOverlapColumn(exclusiveB);

    // Off-path nodes: stack below center column, dimmed
    const allYs = Object.values(pos).map(p => p.y + 400);
    const offStartY = Math.max(...allYs, directStartY) + 60;
    let offY = offStartY;
    const offPathNodes = nodes.filter(n => !pathNodeIds.has(n.id));
    for (const n of offPathNodes) {
      const s = getCardSize(n.id);
      pos[n.id] = { x: col4X - s.w / 2, y: offY };
      offY += s.h + 30;
    }

    // Default focus: core columns (A, exclusiveA, transitiveA, directShared, transitiveB, exclusiveB, B)
    const coreNodeIds = new Set([nodeAId, nodeBId, ...exclusiveA, ...exclusiveB, ...transitiveA, ...transitiveB, ...directShared]);
    const coreEdgeIds = new Set<string>();
    for (const c of connections) {
      if (coreNodeIds.has(c.sourceId) && coreNodeIds.has(c.targetId)) {
        coreEdgeIds.add(c.id);
      }
    }
    const defaultFocus: FocusState = {
      nodeId: nodeAId,
      directIds: new Set([...coreNodeIds].filter(id => id !== nodeAId)),
      secondIds: new Set(),
      edgeIds: coreEdgeIds,
    };
    // Full focus includes indirect nodes too (for drill-down)
    const fullFocus: FocusState = {
      nodeId: nodeAId,
      directIds: new Set([...pathNodeIds].filter(id => id !== nodeAId)),
      secondIds: new Set(),
      edgeIds: pathEdgeIds,
    };
    pathDefaultFocusRef.current = defaultFocus;
    pathFullFocusRef.current = fullFocus;
    setPathFocus(defaultFocus);
    setPathDrillNode(null);

    setIsArranging(true);
    onBatchMoveNodes(pos);
    setTimeout(() => { setIsArranging(false); zoomFit(); }, 350);
  }, [nodes, connections, onBatchMoveNodes, getCardSize, zoomFit]);

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

  /* ── Parallax background ───────────────────────────────────────────────── */
  useEffect(() => {
    const vp = viewportRef.current;
    const bg = parallaxRef.current;
    if (!vp || !bg) return;

    const update = () => {
      bg.style.backgroundPosition = `${-vp.scrollLeft * PARALLAX_SPEED}px ${-vp.scrollTop * PARALLAX_SPEED}px`;
    };

    update();
    vp.addEventListener("scroll", update, { passive: true });
    return () => vp.removeEventListener("scroll", update);
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
      // Reset drag-distance tracking so we can tell a click apart from a drag.
      didDragRef.current = false;
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
      playSound("pickup");
      dragVelocityRef.current = { vx: 0, vy: 0, lastX: e.clientX, lastY: e.clientY };
      dragRotationRef.current = 0;
      repelOffsetsRef.current = {};
    },
    [nodes, zoom, onSelectNode, playSound]
  );

  useEffect(() => {
    if (!dragState) return;
    // Post-orbit / stack-row layout: effective footprints already include
    // pinned-evidence extents, so we only need a modest breathing room here.
    const REPEL_RADIUS = 24;
    const REPEL_STRENGTH = 8;
    const onMove = (e: MouseEvent) => {
      const vp = viewportRef.current;
      if (!vp) return;
      // Flag the interaction as a drag once the pointer has moved past a small
      // threshold from the mousedown point. This keeps the detail panel from
      // opening when the user is actually repositioning a card.
      if (!didDragRef.current) {
        const dxStart = e.clientX - mouseDownPosRef.current.x;
        const dyStart = e.clientY - mouseDownPosRef.current.y;
        if (dxStart * dxStart + dyStart * dyStart > 16) { // > 4px
          didDragRef.current = true;
        }
      }
      const rect = vp.getBoundingClientRect();
      const worldX = (e.clientX - rect.left + vp.scrollLeft) / zoom;
      const worldY = (e.clientY - rect.top + vp.scrollTop) / zoom;
      const nx = Math.max(0, worldX - dragState.offsetX);
      const ny = Math.max(0, worldY - dragState.offsetY);
      onMoveNode(dragState.nodeId, nx, ny);

      // Velocity tracking for rotation
      const vx = e.clientX - dragVelocityRef.current.lastX;
      dragVelocityRef.current = { ...dragVelocityRef.current, vx, lastX: e.clientX, lastY: e.clientY };
      dragRotationRef.current = Math.max(-1, Math.min(1, vx * 0.15));

      // Repel nearby cards. Use the effective footprint (base + orbital
      // photo chips + category stack row) so the repulsion respects every
      // node's actual visual extent, not just the base card.
      const dragged = nodesRef.current.find(n => n.id === dragState.nodeId);
      if (dragged) {
        const ds = getScaledCardSize(dragged);
        const dEff = getEffectiveCardFootprint(ds.w, ds.h, dragged.pinnedEvidence);
        const dcx = nx + dEff.offsetX + dEff.w / 2;
        const dcy = ny + dEff.offsetY + dEff.h / 2;
        const offsets: Record<string, { dx: number; dy: number }> = {};
        for (const other of nodesRef.current) {
          if (other.id === dragState.nodeId) continue;
          const os = getScaledCardSize(other);
          const oEff = getEffectiveCardFootprint(os.w, os.h, other.pinnedEvidence);
          const ocx = other.position.x + oEff.offsetX + oEff.w / 2;
          const ocy = other.position.y + oEff.offsetY + oEff.h / 2;
          const ddx = ocx - dcx;
          const ddy = ocy - dcy;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy);
          // Use axis-aware minimum distance: half-widths along x, half-heights
          // along y. This prevents a card's tall stack row from also inflating
          // its horizontal repel radius.
          const minDx = (dEff.w + oEff.w) / 2;
          const minDy = (dEff.h + oEff.h) / 2;
          // Interpolate between the two based on angle so repulsion is a
          // smooth ellipse around the effective rectangle.
          const t = dist > 0 ? Math.abs(ddx) / dist : 0;
          const minDist = minDx * t + minDy * (1 - t) + REPEL_RADIUS;
          if (dist < minDist && dist > 0) {
            const force = ((minDist - dist) / minDist) * REPEL_STRENGTH;
            offsets[other.id] = { dx: (ddx / dist) * force, dy: (ddy / dist) * force };
          }
        }
        repelOffsetsRef.current = offsets;
      }
    };
    const onUp = () => {
      // Nudge if overlapping another card's EFFECTIVE footprint (base card
      // plus orbital photo chips and the category stack row).
      const dragged = nodes.find(n => n.id === dragState.nodeId);
      if (dragged) {
        const PAD = 8;
        const ds = getScaledCardSize(dragged);
        const dEff = getEffectiveCardFootprint(ds.w, ds.h, dragged.pinnedEvidence);
        let { x, y } = dragged.position;
        let nudged = false;
        // Effective AABB of the dragged node, in world coords
        let dL = x + dEff.offsetX - PAD;
        let dT = y + dEff.offsetY - PAD;
        let dR = dL + dEff.w + PAD * 2;
        let dB = dT + dEff.h + PAD * 2;
        for (const other of nodes) {
          if (other.id === dragState.nodeId) continue;
          const os = getScaledCardSize(other);
          const oEff = getEffectiveCardFootprint(os.w, os.h, other.pinnedEvidence);
          const oL = other.position.x + oEff.offsetX;
          const oT = other.position.y + oEff.offsetY;
          const oR = oL + oEff.w;
          const oB = oT + oEff.h;
          if (dL < oR && dR > oL && dT < oB && dB > oT) {
            const overlapR = dR - oL;
            const overlapL = oR - dL;
            const overlapD = dB - oT;
            const overlapU = oB - dT;
            const minOverlap = Math.min(overlapR, overlapL, overlapD, overlapU);
            if (minOverlap === overlapR) x -= overlapR;
            else if (minOverlap === overlapL) x += overlapL;
            else if (minOverlap === overlapD) y -= overlapD;
            else y += overlapU;
            // Recompute effective bounds after the nudge for subsequent checks
            dL = x + dEff.offsetX - PAD;
            dT = y + dEff.offsetY - PAD;
            dR = dL + dEff.w + PAD * 2;
            dB = dT + dEff.h + PAD * 2;
            nudged = true;
          }
        }
        if (nudged) onMoveNode(dragState.nodeId, Math.max(0, x), Math.max(0, y));
        const dw = ds.w;
        const dh = ds.h;

        // Bounce + ripple + sound
        playSound("drop");
        setDroppingNodeId(dragState.nodeId);
        setDropRipple({ x: dragged.position.x + dw / 2, y: dragged.position.y + dh / 2 });
        setTimeout(() => setDroppingNodeId(null), 250);
        setTimeout(() => setDropRipple(null), 350);
      }
      dragRotationRef.current = 0;
      repelOffsetsRef.current = {};
      setDragState(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragState, zoom, onMoveNode, nodes, playSound]);

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
    const GLOW_RADIUS = 50;
    const onMove = (e: MouseEvent) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const worldX = (e.clientX - rect.left + vp.scrollLeft) / zoom;
      const worldY = (e.clientY - rect.top + vp.scrollTop) / zoom;
      setConnectDrag(prev => prev ? { ...prev, mouseX: worldX, mouseY: worldY } : null);

      // Proximity detection for target glow
      let closestId: string | null = null;
      let closestDist = Infinity;
      for (const node of nodesRef.current) {
        if (node.id === connectDrag.sourceId) continue;
        const ns = getScaledCardSize(node);
        const ncx = node.position.x + ns.w / 2;
        const ncy = node.position.y + ns.h / 2;
        const dx = worldX - ncx;
        const dy = worldY - ncy;
        const dist = Math.sqrt(dx * dx + dy * dy) - Math.max(ns.w, ns.h) / 2;
        if (dist < GLOW_RADIUS && dist < closestDist) {
          closestDist = dist;
          closestId = node.id;
        }
      }
      setNearbyTargetId(closestId);
    };
    const onUp = (e: MouseEvent) => {
      setNearbyTargetId(null);
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
        // Snap animation: briefly show solid line, then complete
        setConnectionSnapping(true);
        playSound("connection");
        setTimeout(() => {
          if (onDirectConnection) {
            onDirectConnection(connectDrag.sourceId, targetId!);
          } else {
            onStartConnection(connectDrag.sourceId);
            requestAnimationFrame(() => onCompleteConnection(targetId!));
          }
          setConnectionSnapping(false);
          setConnectDrag(null);
        }, 100);
      } else {
        setConnectDrag(null);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [connectDrag, zoom, onStartConnection, onCompleteConnection, onDirectConnection, playSound]);

  // ─── Drop ─────────────────────────────────────────────────────────────

  // Hit-test helper: find a connection line near a point in world coordinates.
  const hitTestConnection = useCallback((px: number, py: number, conns: BoardConnection[], nds: BoardNode[], getSize: (n: BoardNode) => { w: number; h: number }): BoardConnection | null => {
    const TOLERANCE = 80; // generous: connection drop zones should be forgiving
    let best: { conn: BoardConnection; dist: number } | null = null;
    for (const conn of conns) {
      const a = nds.find((n) => n.id === conn.sourceId);
      const b = nds.find((n) => n.id === conn.targetId);
      if (!a || !b) continue;
      const sa = getSize(a), sb = getSize(b);
      const ax = a.position.x + sa.w / 2;
      const ay = a.position.y + sa.h / 2;
      const bx = b.position.x + sb.w / 2;
      const by = b.position.y + sb.h / 2;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const cx = ax + t * dx, cy = ay + t * dy;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist < TOLERANCE && (!best || dist < best.dist)) {
        best = { conn, dist };
      }
    }
    return best?.conn ?? null;
  }, []);

  // During drag: is the user dragging evidence (pinnable) or a person/entity (placeable)?
  const [dragKind, setDragKind] = useState<"evidence" | "placeable" | null>(null);
  // Live active drop target while dragging evidence
  const [activeDropTarget, setActiveDropTarget] = useState<
    | { kind: "card"; id: string }
    | { kind: "connection"; id: string }
    | null
  >(null);

  // Global drag listeners to detect what's being dragged (we can't read data in dragover)
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      try {
        const raw = e.dataTransfer?.getData("application/board-item");
        if (raw) {
          const parsed = JSON.parse(raw);
          setDragKind(parsed.kind === "evidence" ? "evidence" : "placeable");
        }
      } catch { /* ignore */ }
    };
    const onDragEnd = () => setDragKind(null);
    window.addEventListener("dragstart", onDragStart);
    window.addEventListener("dragend", onDragEnd);
    return () => {
      window.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("dragend", onDragEnd);
    };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropHighlight(true);

    // Only do target resolution for evidence drags
    if (dragKind !== "evidence") return;

    // Check if the drag target is over a card element
    let cardEl: HTMLElement | null = e.target as HTMLElement | null;
    while (cardEl && !cardEl.dataset?.nodeId) cardEl = cardEl.parentElement;
    if (cardEl?.dataset?.nodeId) {
      setActiveDropTarget({ kind: "card", id: cardEl.dataset.nodeId });
      return;
    }

    // Otherwise hit-test connections at world coordinates
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const wx = (e.clientX - rect.left + vp.scrollLeft) / zoom;
    const wy = (e.clientY - rect.top + vp.scrollTop) / zoom;
    const hitConn = hitTestConnection(wx, wy, connections, nodes, getScaledCardSize);
    if (hitConn) {
      setActiveDropTarget({ kind: "connection", id: hitConn.id });
    } else {
      setActiveDropTarget(null);
    }
  }, [dragKind, zoom, connections, nodes, hitTestConnection, getScaledCardSize]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we actually leave the viewport (not just a child)
    const vp = viewportRef.current;
    if (!vp) return;
    const r = vp.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      setDropHighlight(false);
      setDragKind(null);
      setActiveDropTarget(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropHighlight(false);
      setDragKind(null);
      const currentTarget = activeDropTarget;
      setActiveDropTarget(null);
      const raw = e.dataTransfer.getData("application/board-item");
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        const vp = viewportRef.current;
        if (!vp) return;
        const rect = vp.getBoundingClientRect();
        let x = Math.max(0, (e.clientX - rect.left + vp.scrollLeft) / zoom - 90);
        let y = Math.max(0, (e.clientY - rect.top + vp.scrollTop) / zoom - 45);

        let droppedId: string | null = null;

        if (parsed.kind === "person") {
          onAddPerson(parsed.id, x, y);
          droppedId = parsed.id;
          if (firstPlacementMode && onFirstPlacement) {
            onFirstPlacement(parsed.id);
          }
        } else if (parsed.kind === "entity" && onAddEntity) {
          const entity = SEED_ENTITIES.find((e: SeedEntity) => e.id === parsed.id);
          if (entity) {
            onAddEntity(entity, x, y);
            droppedId = entity.id;
          }
        } else if (parsed.kind === "flight" && onAddFlight) {
          // Flight entities come from the right-panel Flights tab. They carry a
          // FlightListItem payload with everything needed to hydrate the card.
          // The flight_log is auto-pinned as the entity's sole starting evidence.
          const f = parsed.data as {
            id: string;
            date: string | null;
            title: string;
            snippet: string;
            departureCode: string | null;
            arrivalCode: string | null;
            departureCity: string | null;
            arrivalCity: string | null;
            passengerCount: number;
            passengers: string[];
            aircraft: string | null;
            pilot: string | null;
          };
          onAddFlight(
            {
              title: f.title,
              date: f.date,
              departure: null,
              arrival: null,
              departureCode: f.departureCode,
              arrivalCode: f.arrivalCode,
              departureCity: f.departureCity,
              arrivalCity: f.arrivalCity,
              departureCountry: null,
              arrivalCountry: null,
              departureLat: null,
              departureLon: null,
              arrivalLat: null,
              arrivalLon: null,
              aircraft: f.aircraft,
              pilot: f.pilot,
              flightNumber: null,
              passengers: f.passengers,
              passengerCount: f.passengerCount,
              notes: null,
              distanceNm: null,
              durationMinutes: null,
              sourceDoc: null,
              name: f.title,
            },
            // Auto-pin the flight_log as a PinnedEvidence record on the entity
            {
              id: f.id,
              type: "flight_log",
              title: f.title,
              snippet: f.snippet,
              date: f.date,
              sender: f.aircraft ?? f.pilot ?? null,
              starCount: 0,
            },
            x,
            y,
          );
          droppedId = f.id;
        } else if (parsed.kind === "evidence" && parsed.data) {
          // Evidence pins to the currently-highlighted drop target.
          // We trust the live hit-test from handleDragOver for a clean delineation.
          const evidence = parsed.data as SearchResult;
          if (currentTarget?.kind === "card" && onPinEvidenceToCard) {
            onPinEvidenceToCard(currentTarget.id, evidence);
            droppedId = evidence.id;
          } else if (currentTarget?.kind === "connection" && onPinEvidenceToConnection) {
            onPinEvidenceToConnection(currentTarget.id, evidence);
            droppedId = evidence.id;
          } else if (
            (evidence.type === "photo" || evidence.type === "video") &&
            onAddMedia
          ) {
            // Dropped on empty board — promote the photo/video to a standalone
            // investigation target (BoardMediaNode) with the source evidence
            // auto-pinned. The player uses this when they can't identify
            // who/what is in the media and wants it as its own subject.
            const pinned: PinnedEvidence = {
              id: evidence.id,
              type: evidence.type,
              title: evidence.title,
              snippet: evidence.snippet,
              date: evidence.date,
              sender: evidence.sender,
              starCount: evidence.starCount,
            };
            const thumbnailUrl =
              evidence.type === "photo"
                ? `https://assets.getkino.com/cdn-cgi/image/width=400,quality=80,format=auto/photos-deboned/${evidence.id}`
                : evidence.thumbnailUrl ?? null;
            const streamUrl =
              evidence.type === "video" && evidence.filename
                ? `https://cdn.jmailarchive.org/${evidence.filename}`
                : null;
            onAddMedia(
              {
                mediaType: evidence.type,
                title: evidence.title,
                thumbnailUrl,
                streamUrl,
                name: evidence.title,
              },
              pinned,
              x,
              y,
            );
            droppedId = evidence.id;
          }
        }

        // Bounce + ripple + sound for successful drops
        if (droppedId) {
          playSound("drop");
          setJustDroppedNodeId(droppedId);
          setDropRipple({ x: x + 90, y: y + 45 });
          setTimeout(() => setJustDroppedNodeId(null), 300);
          setTimeout(() => setDropRipple(null), 350);
        }
      } catch { /* ignore */ }
    },
    [zoom, onAddPerson, onAddEntity, onAddFlight, onAddMedia, onPinEvidenceToCard, onPinEvidenceToConnection, firstPlacementMode, onFirstPlacement, playSound, activeDropTarget]
  );

  // Returns the bottom-edge center of the card (where the handle is)
  function getNodeCenter(nodeId: string): { cx: number; cy: number } | null {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    // Measure actual DOM element for accurate dimensions
    const cardEl = viewportRef.current?.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement | null;
    if (cardEl && cardEl.offsetWidth > 0) {
      const w = cardEl.offsetWidth;
      const h = cardEl.offsetHeight;
      return { cx: node.position.x + w / 2, cy: node.position.y + h };
    }
    // Fallback to estimates (accounting for importance scaling)
    const s = getScaledCardSize(node);
    const w = s.w;
    const h = node.kind === "person" ? s.h + 40 : s.h;
    return { cx: node.position.x + w / 2, cy: node.position.y + h };
  }

  /* ── Dynamic world size — grows to fit all nodes ───────────────────────── */
  const { WORLD_W, WORLD_H } = useMemo(() => {
    let maxX = 0, maxY = 0;
    for (const n of nodes) {
      const s = getCardSize(n.id);
      maxX = Math.max(maxX, n.position.x + s.w);
      maxY = Math.max(maxY, n.position.y + s.h);
    }
    return {
      WORLD_W: Math.max(BASE_WORLD_W, maxX + 500),
      WORLD_H: Math.max(BASE_WORLD_H, maxY + 500),
    };
  }, [nodes, getCardSize]);

  const sizerW = WORLD_W * zoom;
  const sizerH = WORLD_H * zoom;

  return (
    <div className="flex flex-1 flex-col overflow-hidden border-l border-r border-[#222]">
      {/* Header bar — score strip, whole bar glows green on score */}
      <div className={`relative flex-shrink-0 border-b px-5 py-0.5 transition-all duration-500 ${
        investigationStep ? "opacity-20" : ""
      }`} style={{
        backgroundColor: scoreGlow ? "rgba(22, 163, 106, 0.15)" : "#0e0e0e",
        borderColor: scoreGlow ? "rgba(74, 222, 128, 0.3)" : "#1a1a1a",
        boxShadow: scoreGlow
          ? "inset 0 0 30px rgba(74,222,128,0.1), 0 0 20px rgba(74,222,128,0.1)"
          : score > 0 ? "inset 0 0 20px rgba(74,222,128,0.03)" : "none",
        transition: "background-color 0.5s, border-color 0.5s, box-shadow 0.6s",
      }}>
        <div className="flex items-center justify-center">
          <div className="flex items-center justify-center gap-3">
            <span className="font-[family-name:var(--font-mono)] text-sm uppercase tracking-[0.2em] text-white font-bold">Score</span>
            <span
              className="font-[family-name:var(--font-display)] font-black text-4xl tracking-wide"
              style={{
                color: scoreGlow ? "#fff" : (score > 0 ? "#4ade80" : "#666"),
                textShadow: scoreGlow
                  ? "0 0 20px #4ade80, 0 0 40px #22c55e, 0 0 80px #16a34a"
                  : score > 0 ? "0 0 20px #4ade8088, 0 0 40px #22c55e50, 0 0 60px #16a34a30" : "none",
                transition: "color 0.3s, text-shadow 0.6s, transform 0.3s",
                transform: scoreGlow ? "scale(1.2)" : "scale(1)",
                display: "inline-block",
              }}
            >
              {score.toLocaleString()}
            </span>
          </div>
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
              return n.data.name;
            })()}
          </span>
          <button onClick={() => onFocusNode(null)} className="ml-auto text-xs font-bold text-red-500/60 hover:text-red-400 transition uppercase tracking-wider">
            ESC ×
          </button>
        </div>
      )}

      {/* ── Canvas area (viewport + scrollable sizer + scaled world) ──────── */}
      <div className="relative flex-1 overflow-hidden">

        {/* ── Show All toggle (top-center, compare mode only) ───────────── */}
        {pathFocus && (
          <button
            onClick={() => setShowAllInCompare(s => !s)}
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition shadow-lg shadow-black/40 ${
              showAllInCompare
                ? "border-red-500/40 bg-red-600/15 text-red-400 hover:bg-red-600/25"
                : "border-[#2a2a2a] bg-[#141414]/90 text-[#888] hover:bg-[#222] hover:text-white"
            } backdrop-blur-sm`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {showAllInCompare
                ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
              }
            </svg>
            {showAllInCompare ? "Show All" : "Show All"}
          </button>
        )}

        {/* PARALLAX: Slower-moving background layer for depth effect */}
        <div
          ref={parallaxRef}
          className="parallax-bg absolute inset-0 pointer-events-none"
          aria-hidden="true"
        />

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
          onDoubleClick={(e) => {
            if (!isBackgroundTarget(e.target)) return;
            const vp = viewportRef.current;
            if (!vp) return;
            const rect = vp.getBoundingClientRect();
            const cursorX = e.clientX - rect.left;
            const cursorY = e.clientY - rect.top;
            setZoom((prev) => {
              const next = clampZoom(prev + ZOOM_STEP * 6);
              const worldX = (vp.scrollLeft + cursorX) / prev;
              const worldY = (vp.scrollTop + cursorY) / prev;
              requestAnimationFrame(() => {
                vp.scrollLeft = worldX * next - cursorX;
                vp.scrollTop = worldY * next - cursorY;
              });
              return next;
            });
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
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
                  <filter id="string-glow-green">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="blur" />
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                {(() => {
                  // Group connections by endpoint pair for edge bundling
                  const pairKey = (a: string, b: string) => a < b ? `${a}::${b}` : `${b}::${a}`;
                  const bundles = new Map<string, typeof connections>();
                  for (const conn of connections) {
                    // Skip connections to collapsed/hidden evidence nodes
                    if (hiddenNodeIds.has(conn.sourceId) || hiddenNodeIds.has(conn.targetId)) continue;
                    const key = pairKey(conn.sourceId, conn.targetId);
                    if (!bundles.has(key)) bundles.set(key, []);
                    bundles.get(key)!.push(conn);
                  }

                  return Array.from(bundles.entries()).map(([bundleKey, bundleConns]) => {
                    // Use first connection for geometry
                    const primary = bundleConns[0];
                    const from = getNodeCenter(primary.sourceId);
                    const to = getNodeCenter(primary.targetId);
                    if (!from || !to) return null;

                    const bundleCount = bundleConns.length;
                    const isBundled = bundleCount > 1;

                    // Check if any connection in the bundle is new/selected
                    const hasNew = bundleConns.some(c => c.id === newConnectionId);
                    const hasReintegrating = reintegratingIds ? bundleConns.some(c => reintegratingIds.has(c.id)) : false;
                    const hasPulse = spotlightPulseId ? bundleConns.some(c => c.sourceId === spotlightPulseId || c.targetId === spotlightPulseId) : false;
                    const hasSelected = bundleConns.some(c => c.id === selectedConnectionId);
                    const anyVis = bundleConns.map(c => getEdgeVis(c.id));
                    const hasHighlight = anyVis.includes("highlight");
                    const allFaded = anyVis.every(v => v === "faded");
                    const maxStrength = Math.max(...bundleConns.map(c => c.strength));

                    const lineColor = hasNew ? "#4ade80" : hasReintegrating ? "#E24B4A" : hasSelected ? "#f87171" : "#ef4444";
                    const dotColor = hasNew ? "#4ade80" : hasReintegrating ? "#E24B4A" : "#ef4444";
                    const lineFilter = hasNew ? "url(#string-glow-green)" : hasReintegrating ? "url(#string-glow-strong)" : hasSelected ? "url(#string-glow-strong)" : hasHighlight ? "url(#string-glow)" : "url(#string-glow)";

                    // Curve calculation
                    const dx = to.cx - from.cx;
                    const dy = to.cy - from.cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const absDx = Math.abs(dx);
                    const absDy = Math.abs(dy);
                    const isNearlyVertical = dist > 0 && absDx < 40;
                    const isNearlyHorizontal = dist > 0 && absDy < 40;
                    const curveOffsetX = isNearlyVertical ? dist * 0.02 : 0;
                    const curveOffsetY = isNearlyHorizontal ? dist * 0.02 : 0;
                    const mx = (from.cx + to.cx) / 2 + curveOffsetX;
                    const my = (from.cy + to.cy) / 2 - curveOffsetY;
                    const curvePath = isNearlyVertical || isNearlyHorizontal
                      ? `M ${from.cx} ${from.cy} Q ${mx} ${my} ${to.cx} ${to.cy}`
                      : `M ${from.cx} ${from.cy} L ${to.cx} ${to.cy}`;

                    // Bundle visual: thicker line + count badge
                    const bundledWidth = isBundled
                      ? Math.min(8, 2 + bundleCount * 0.5)
                      : (hasNew ? 5 : hasSelected ? 4 : (pathFocus && !showAllInCompare && hasHighlight) ? 2 + maxStrength * 4 : 1 + maxStrength * 0.8);
                    const bundledOpacity = hasNew ? 1 : hasSelected ? 1 : hasHighlight ? 0.9
                      : allFaded ? (pathFocus && !showAllInCompare ? 0 : 0.08)
                      : isBundled ? 0.5 + Math.min(0.5, bundleCount * 0.08)
                      : 0.35 + maxStrength * 0.12;

                    const midX = (from.cx + to.cx) / 2;
                    const midY = (from.cy + to.cy) / 2;

                    return (
                      <g key={bundleKey}>
                        {/* Invisible fat hit area for clicking / hovering */}
                        <path
                          d={curvePath}
                          stroke="transparent"
                          strokeWidth={28}
                          fill="none"
                          style={{ pointerEvents: "stroke", cursor: "pointer" }}
                          onMouseEnter={() => setHoveredConnectionId(primary.id)}
                          onMouseLeave={() => setHoveredConnectionId((curr) => curr === primary.id ? null : curr)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedConnectionId(primary.id === selectedConnectionId ? null : primary.id);
                            onSelectNode(null);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setFocusedConnectionId(primary.id);
                            setSelectedConnectionId(null);
                          }}
                        />
                        {/* Hover glow — makes it obvious the line is clickable */}
                        {hoveredConnectionId && bundleConns.some(c => c.id === hoveredConnectionId) && (
                          <path
                            d={curvePath}
                            stroke="#f87171"
                            strokeWidth={Math.max(bundledWidth + 10, 16)}
                            strokeOpacity={0.4}
                            fill="none"
                            strokeLinecap="round"
                            filter="url(#string-glow-strong)"
                            className="pointer-events-none"
                          />
                        )}
                        {/* Evidence-drop halo — red glow on every connection while dragging evidence,
                            brighter on the line currently under the cursor. */}
                        {dragKind === "evidence" && (() => {
                          const isActive = bundleConns.some(c => activeDropTarget?.kind === "connection" && activeDropTarget.id === c.id);
                          return (
                            <path
                              d={curvePath}
                              stroke="#ef4444"
                              strokeWidth={isActive ? Math.max(bundledWidth + 18, 24) : Math.max(bundledWidth + 8, 14)}
                              strokeOpacity={isActive ? 0.9 : 0.45}
                              fill="none"
                              strokeLinecap="round"
                              filter="url(#string-glow-strong)"
                              className="board-connection--evidence-drop-target pointer-events-none"
                            />
                          );
                        })()}
                        {/* Visible line */}
                        <path
                          id={`conn-path-${primary.id}`}
                          d={curvePath}
                          stroke={lineColor}
                          strokeWidth={bundledWidth}
                          strokeOpacity={bundledOpacity}
                          fill="none"
                          filter={lineFilter}
                          strokeLinecap="round"
                          className={`pointer-events-none ${dragState ? "" : "transition-all duration-500"}`}
                        />
                        {/* Endpoint dots */}
                        <circle cx={from.cx} cy={from.cy} r={hasNew ? 6 : 4} fill={dotColor} fillOpacity={allFaded ? (pathFocus && !showAllInCompare ? 0 : 0.08) : hasNew ? 1 : 0.6} className={`pointer-events-none ${dragState ? "" : "transition-all duration-500"}`} />
                        <circle cx={to.cx} cy={to.cy} r={hasNew ? 6 : 4} fill={dotColor} fillOpacity={allFaded ? (pathFocus && !showAllInCompare ? 0 : 0.08) : hasNew ? 1 : 0.6} className={`pointer-events-none ${dragState ? "" : "transition-all duration-500"}`} />
                        {/* Bundle count badge */}
                        {isBundled && !allFaded && (
                          <g className="pointer-events-none">
                            <circle cx={midX} cy={midY} r={10} fill="#0a0a0a" stroke="#ef4444" strokeWidth={1.5} strokeOpacity={0.5} />
                            <text x={midX} y={midY + 3.5} textAnchor="middle" fill="#ef4444" fontSize="9" fontWeight="bold" fontFamily="var(--font-mono)">
                              {bundleCount}
                            </text>
                          </g>
                        )}
                        {/* Pulse traveling along new connection */}
                        {(hasNew || hasPulse) && (
                          <>
                            <path d={curvePath} stroke={hasNew ? "#4ade80" : "#ef4444"} strokeWidth={8} fill="none" strokeLinecap="round" className="pointer-events-none">
                              <animate attributeName="stroke-opacity" values="0.4;0" dur="0.5s" fill="freeze" />
                              <animate attributeName="stroke-width" values="8;2" dur="0.5s" fill="freeze" />
                            </path>
                            <circle r={5} fill={hasNew ? "#4ade80" : "#ef4444"} filter={hasNew ? "url(#string-glow-green)" : "url(#string-glow)"} className="pointer-events-none">
                              <animateMotion dur="0.35s" fill="freeze">
                                <mpath href={`#conn-path-${primary.id}`} />
                              </animateMotion>
                              <animate attributeName="r" values="5;8;5" dur="0.35s" />
                              <animate attributeName="opacity" values="1;0.8;0" dur="0.45s" fill="freeze" />
                            </circle>
                          </>
                        )}
                      </g>
                    );
                  });
                })()}
                {/* Live connect-drag line */}
                {connectDrag && (() => {
                  const from = getNodeCenter(connectDrag.sourceId);
                  if (!from) return null;
                  const cdx = connectDrag.mouseX - from.cx;
                  const cdy = connectDrag.mouseY - from.cy;
                  const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
                  const cNearV = cdist > 0 && Math.abs(cdx) < 40;
                  const cNearH = cdist > 0 && Math.abs(cdy) < 40;
                  const cmx = (from.cx + connectDrag.mouseX) / 2 + (cNearV ? cdist * 0.02 : 0);
                  const cmy = (from.cy + connectDrag.mouseY) / 2 - (cNearH ? cdist * 0.02 : 0);
                  return (
                    <path
                      d={`M ${from.cx} ${from.cy} Q ${cmx} ${cmy} ${connectDrag.mouseX} ${connectDrag.mouseY}`}
                      stroke={connectionSnapping ? "#4ade80" : "#f87171"}
                      strokeWidth={connectionSnapping ? 4 : 3}
                      strokeOpacity={connectionSnapping ? 1 : 0.8}
                      strokeDasharray={connectionSnapping ? "0" : "8 4"}
                      strokeLinecap="round"
                      fill="none"
                      filter={connectionSnapping ? "url(#string-glow-green)" : "url(#string-glow)"}
                      className="pointer-events-none"
                      style={{ transition: "stroke-width 100ms, stroke-opacity 100ms" }}
                    />
                  );
                })()}
              </svg>

              {/* Pinned evidence distributed along each connection line.
                  Items alternate above/below (perpendicular) with a small
                  connector line to their anchor point on the line.
                  Chip size shrinks when the connected cards are close
                  together so chips don't pile up or cover the cards. */}
              {connections.filter(c => c.pinnedEvidence && c.pinnedEvidence.length > 0).map((conn) => {
                const from = getNodeCenter(conn.sourceId);
                const to = getNodeCenter(conn.targetId);
                if (!from || !to) return null;
                const pinned = conn.pinnedEvidence!;
                const dx = to.cx - from.cx;
                const dy = to.cy - from.cy;
                const len = Math.hypot(dx, dy) || 1;
                // Perpendicular unit vector
                const perpX = -dy / len;
                const perpY = dx / len;
                // Compute the t-range along the line that's OUTSIDE both end
                // cards, so chips stay in the visible gap instead of being
                // covered by the cards. Use the line↔rectangle exit distance
                // (not the max-dim radius) so long narrow cards don't
                // over-reserve space.
                const srcNode = nodes.find(n => n.id === conn.sourceId);
                const tgtNode = nodes.find(n => n.id === conn.targetId);
                const srcSize = srcNode ? getScaledCardSize(srcNode) : { w: 240, h: 240 };
                const tgtSize = tgtNode ? getScaledCardSize(tgtNode) : { w: 240, h: 240 };
                const dirX = dx / len;
                const dirY = dy / len;
                const exitDist = (halfW: number, halfH: number) => {
                  const tX = Math.abs(dirX) > 0.001 ? halfW / Math.abs(dirX) : Infinity;
                  const tY = Math.abs(dirY) > 0.001 ? halfH / Math.abs(dirY) : Infinity;
                  return Math.min(tX, tY);
                };
                const srcExit = exitDist(srcSize.w / 2, srcSize.h / 2);
                const tgtEnter = exitDist(tgtSize.w / 2, tgtSize.h / 2);
                const effLen = Math.max(40, len - srcExit - tgtEnter);
                // Add a small buffer past each card edge so chips don't kiss the cards
                const BUFFER = 12;
                let tStart = (srcExit + BUFFER) / len;
                let tEnd = 1 - (tgtEnter + BUFFER) / len;
                if (tEnd <= tStart) {
                  // Cards touch / overlap — fall back to midpoint
                  tStart = 0.5;
                  tEnd = 0.5;
                }

                // Dynamic chip sizing: chips alternate sides, so the
                // constraint is the along-line spacing between two SAME-side
                // chips (every other index). Shrink chip down to CHIP_MIN
                // when that spacing is tight.
                const sameSideCount = Math.max(1, Math.ceil(pinned.length / 2));
                const slotLen = effLen / sameSideCount;
                const CHIP_MAX = 56;
                const CHIP_MIN = 26;
                const CHIP = Math.max(CHIP_MIN, Math.min(CHIP_MAX, slotLen * 0.75));
                const OFFSET = Math.max(22, CHIP * 0.82);
                return (
                  <div key={`pinned-${conn.id}`} className="contents">
                    {pinned.map((ev, i) => {
                      // Distribute within the valid [tStart, tEnd] gap
                      // between the two cards so chips aren't covered.
                      const t = pinned.length === 1
                        ? (tStart + tEnd) / 2
                        : tStart + ((i) / (pinned.length - 1)) * (tEnd - tStart);
                      const ax = from.cx + dx * t;
                      const ay = from.cy + dy * t;
                      const side = i % 2 === 0 ? 1 : -1;
                      const px = ax + perpX * OFFSET * side;
                      const py = ay + perpY * OFFSET * side;
                      return (
                        <div key={`${conn.id}-${ev.id}`} className="contents">
                          {/* Connector line from anchor on the main line to the chip */}
                          <svg
                            className="absolute pointer-events-none z-[14]"
                            style={{
                              left: Math.min(ax, px) - 2,
                              top: Math.min(ay, py) - 2,
                              width: Math.abs(px - ax) + 4,
                              height: Math.abs(py - ay) + 4,
                              overflow: "visible",
                            }}
                          >
                            <line
                              x1={ax - Math.min(ax, px) + 2}
                              y1={ay - Math.min(ay, py) + 2}
                              x2={px - Math.min(ax, px) + 2}
                              y2={py - Math.min(ay, py) + 2}
                              stroke="#ef4444"
                              strokeWidth={1.5}
                              strokeOpacity={0.6}
                            />
                            <circle
                              cx={ax - Math.min(ax, px) + 2}
                              cy={ay - Math.min(ay, py) + 2}
                              r={2.5}
                              fill="#ef4444"
                            />
                          </svg>
                          {/* Square chip */}
                          <div
                            className="absolute z-[15]"
                            style={{ left: px - CHIP / 2, top: py - CHIP / 2, width: CHIP, height: CHIP }}
                          >
                            <PinnedEvidenceChip evidence={ev} square onDoubleClick={setFocusedPinnedEvidence} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

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
                    onViewDetails={() => setFocusedConnectionId(selectedConnection.id)}
                    onDelete={() => {
                      onDeleteConnection?.(selectedConnection.id);
                      setSelectedConnectionId(null);
                    }}
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
                const isOrphan = orphanNodeIds.has(node.id);
                const opc = (isOrphan && hideOrphans) ? "opacity-0 pointer-events-none" : vis === "dimmed" ? (pathFocus && !showAllInCompare ? "opacity-0 pointer-events-none" : "opacity-15") : vis === "second" ? "opacity-45" : "opacity-100";
                const isConnectSource = connectDrag?.sourceId === node.id;
                const isConnectTarget = connectDrag && connectDrag.sourceId !== node.id;
                return (
                  <div
                    key={node.id}
                    data-node-id={node.id}
                    className={`board-node absolute select-none ${opc} ${
                      dragState?.nodeId === node.id ? "board-node--dragging" : droppingNodeId === node.id ? "board-node--dropping" : justDroppedNodeId === node.id ? "board-node--just-dropped" : isArranging ? "board-node--arranging" : ""
                    } ${nearbyTargetId === node.id ? "board-node--connect-glow" : ""
                    } ${selectedNodeId === node.id ? "ring-2 ring-red-500/50 rounded-xl" : ""
                    } ${vis === "focused" ? "ring-2 ring-red-500 shadow-xl shadow-red-600/20 rounded-xl" : ""} ${
                      isConnectSource ? "ring-2 ring-red-400 shadow-xl shadow-red-500/30 rounded-xl" : ""
                    } ${isConnectTarget ? "ring-1 ring-dashed ring-red-500/30 hover:ring-red-400 hover:shadow-lg hover:shadow-red-500/20 rounded-xl" : ""
                    } ${connectingFrom && connectingFrom !== node.id ? "ring-1 ring-dashed ring-red-500/30 hover:ring-red-500/60 rounded-xl" : ""
                    } ${reintegratingIds?.has(node.id) ? "reintegrated-node rounded-xl" : ""
                    } ${dragKind === "evidence" ? "board-node--evidence-drop-target" : ""
                    } ${activeDropTarget?.kind === "card" && activeDropTarget.id === node.id ? "board-node--evidence-drop-active" : ""
                    }`}
                    style={{
                      left: node.position.x, top: node.position.y,
                      zIndex: dragState?.nodeId === node.id ? 100 : vis === "focused" ? 30 : selectedNodeId === node.id ? 20 : vis === "dimmed" ? 5 : 10,
                      ...(dragState?.nodeId === node.id ? {
                        transform: `scale(1.05) rotate(${dragRotationRef.current}deg)`,
                        boxShadow: "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(220,38,38,0.3)",
                      } : dragState && dragState.nodeId !== node.id && repelOffsetsRef.current[node.id] ? {
                        transform: `translate(${repelOffsetsRef.current[node.id].dx}px, ${repelOffsetsRef.current[node.id].dy}px)`,
                        transition: "transform 0.15s ease-out",
                      } : node.kind === "person" && getNodeScale(node.id) > 1.0 ? {
                        transform: `scale(${getNodeScale(node.id)})`,
                        transformOrigin: "center center",
                      } : {}),
                    }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom) { onCompleteConnection(node.id); return; }
                      // Path drill-down: click a path node to focus on its connections
                      if (pathFocus && pathFullFocusRef.current && pathDefaultFocusRef.current) {
                        const fullFocus = pathFullFocusRef.current;
                        const defaultFocus = pathDefaultFocusRef.current;
                        const isOnPath = node.id === fullFocus.nodeId || fullFocus.directIds.has(node.id);
                        if (isOnPath) {
                          if (pathDrillNode === node.id) {
                            // Clicking same node again — restore default 5-column view
                            setPathFocus(defaultFocus);
                            setPathDrillNode(null);
                          } else {
                            // Drill: show this node + its connections, hide everything else
                            const drillDirect = new Set<string>();
                            const drillEdges = new Set<string>();
                            for (const c of connections) {
                              if (c.sourceId === node.id || c.targetId === node.id) {
                                const other = c.sourceId === node.id ? c.targetId : c.sourceId;
                                if (fullFocus.directIds.has(other) || other === fullFocus.nodeId) {
                                  drillDirect.add(other);
                                  drillEdges.add(c.id);
                                }
                              }
                            }
                            setPathFocus({
                              nodeId: node.id,
                              directIds: drillDirect,
                              secondIds: new Set(),
                              edgeIds: drillEdges,
                            });
                            setPathDrillNode(node.id);
                          }
                          return;
                        }
                      }
                      onSelectNode(node.id);
                      // Only open the detail panel on a pure click, not after a drag.
                      if (!didDragRef.current) setDetailNodeId(node.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (node.kind === "person") onOpenSubjectView(node.id);
                      // entity double-click: no-op (was opening the focus view)
                    }}
                  >
                    {node.kind === "person" ? (
                      <PersonCard data={node.data} isSelected={selectedNodeId === node.id}
                        connectedEvidence={personEvidenceCounts[node.id]}
                        evidenceGroups={[]}
                        collapsedGroups={collapsedGroups}
                        onToggleCollapse={(evType) => toggleCollapse(node.id, evType)}
                        onFocus={() => onFocusNode(node.id)}
                        pinnedEvidence={node.pinnedEvidence}
                        onPinnedEvidenceDoubleClick={setFocusedPinnedEvidence}
                        zoom={zoom} />
                    ) : node.kind === "flight" ? (
                      <FlightBoardCard data={node.data} isSelected={selectedNodeId === node.id} zoom={zoom} />
                    ) : node.kind === "media" ? (
                      <MediaBoardCard data={node.data} isSelected={selectedNodeId === node.id} zoom={zoom} />
                    ) : (
                      <EntityBoardCard data={node.data} isSelected={selectedNodeId === node.id} pinnedEvidence={node.pinnedEvidence} onPinnedEvidenceDoubleClick={setFocusedPinnedEvidence} zoom={zoom} />
                    )}
                    {/* Pinned evidence: photos orbit the card perimeter at 80px, 2 per side (8 max).
                        All non-photo evidence + overflow photos live in category badges below the card. */}
                    {node.pinnedEvidence && node.pinnedEvidence.length > 0 && zoom >= 0.5 && (() => {
                      const cardEl = viewportRef.current?.querySelector(`[data-node-id="${node.id}"] > div`) as HTMLElement | null;
                      const w = cardEl?.offsetWidth ?? getScaledCardSize(node).w;
                      const h = cardEl?.offsetHeight ?? getScaledCardSize(node).h;
                      const part = partitionNodeEvidence(node.pinnedEvidence);
                      const orbital = part.orbitalPhotos;

                      // Compute (x, y) for orbital photo at index i (0..5).
                      // Fill order: right → left → top, 2 per side. Bottom is reserved for the stack row.
                      const orbitalPos = (i: number) => {
                        const side = Math.floor(i / ORBITAL_PER_SIDE); // 0=right, 1=left, 2=top
                        const idxInSide = i % ORBITAL_PER_SIDE;
                        // How many chips actually on this side (for centering when side underfilled)
                        const remaining = Math.max(0, orbital.length - side * ORBITAL_PER_SIDE);
                        const chipsOnSide = Math.min(ORBITAL_PER_SIDE, remaining);
                        const runLen = chipsOnSide * ORBITAL_CHIP + (chipsOnSide - 1) * ORBITAL_SPACING;
                        let x = 0, y = 0;
                        if (side === 0) {
                          // Right
                          x = w + 2;
                          y = (h - runLen) / 2 + idxInSide * (ORBITAL_CHIP + ORBITAL_SPACING);
                        } else if (side === 1) {
                          // Left
                          x = -ORBITAL_CHIP - 2;
                          y = (h - runLen) / 2 + idxInSide * (ORBITAL_CHIP + ORBITAL_SPACING);
                        } else {
                          // Top
                          x = (w - runLen) / 2 + idxInSide * (ORBITAL_CHIP + ORBITAL_SPACING);
                          y = -ORBITAL_CHIP - 2;
                        }
                        return { x, y };
                      };

                      // Category stack badges shown below the card. Photo overflow gets a badge too.
                      const badges: { key: string; icon: string; count: number; border: string; bg: string }[] = [];
                      if (part.overflowPhotos.length > 0) badges.push({ key: "photos", icon: "📸", count: part.overflowPhotos.length, border: "border-[#c86464]", bg: "bg-[#1f1512]" });
                      if (part.emails.length > 0) badges.push({ key: "emails", icon: "✉️", count: part.emails.length, border: "border-[#4A6D8C]", bg: "bg-[#1a2530]" });
                      if (part.documents.length > 0) badges.push({ key: "documents", icon: "📄", count: part.documents.length, border: "border-[#888]", bg: "bg-[#1a1a1a]" });
                      if (part.imessages.length > 0) badges.push({ key: "imessages", icon: "💬", count: part.imessages.length, border: "border-[#6B5B95]", bg: "bg-[#1f1b30]" });
                      if (part.flightLogs.length > 0) badges.push({ key: "flight_logs", icon: "✈️", count: part.flightLogs.length, border: "border-[#9d8555]", bg: "bg-[#1c1812]" });
                      if (part.videos.length > 0) badges.push({ key: "videos", icon: "🎬", count: part.videos.length, border: "border-[#c45a3c]", bg: "bg-[#1f1410]" });

                      return (
                        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 25 }}>
                          {/* Orbital photo chips */}
                          {orbital.map((ev, i) => {
                            const { x, y } = orbitalPos(i);
                            return (
                              <div
                                key={`orb-${ev.id}`}
                                className="absolute pointer-events-auto"
                                style={{ left: x, top: y, width: ORBITAL_CHIP, height: ORBITAL_CHIP, zIndex: 30 }}
                              >
                                <PinnedEvidenceChip evidence={ev} square onDoubleClick={setFocusedPinnedEvidence} />
                              </div>
                            );
                          })}

                          {/* Category stack badges attached below the card — wraps to multiple rows if needed */}
                          {badges.length > 0 && (
                            <div
                              className="absolute flex flex-wrap pointer-events-none"
                              style={{ left: 0, top: h + 8, width: w, gap: STACK_BADGE_GAP, zIndex: 28 }}
                            >
                              {badges.map((b) => (
                                <button
                                  type="button"
                                  key={b.key}
                                  className={`pointer-events-auto flex items-center justify-center gap-1 rounded-md border-2 ${b.border} ${b.bg} shadow-lg shadow-black/70 backdrop-blur-sm hover:scale-105 hover:brightness-125 transition-all`}
                                  style={{ width: STACK_BADGE_W, height: STACK_BADGE_H }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetailNodeId(node.id);
                                  }}
                                  title={`${b.count} ${b.key}`}
                                >
                                  <span className="text-[14px] leading-none">{b.icon}</span>
                                  <span className="text-[12px] font-black text-white/90 tabular-nums">{b.count}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {/* Glowing connection handle at bottom center — hidden at low zoom */}
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 -bottom-3 z-20 flex flex-col items-center ${zoom < 0.6 ? "hidden" : ""}`}
                      data-connect-handle={node.id}
                      onMouseDown={(e) => handleConnectHandleDown(e, node.id)}
                    >
                      <div className={`rounded-full border-2 cursor-crosshair transition-all ${
                        isConnectSource
                          ? "w-6 h-6 bg-red-500 border-red-400 shadow-[0_0_16px_4px_rgba(239,68,68,0.6)]"
                          : isConnectTarget
                            ? "w-6 h-6 bg-red-500/60 border-red-400/80 shadow-[0_0_12px_3px_rgba(239,68,68,0.4)] scale-110"
                            : investigationStep === "create-connection"
                              ? "w-8 h-8 bg-red-500 border-red-300 shadow-[0_0_30px_8px_rgba(239,68,68,0.8),0_0_60px_16px_rgba(239,68,68,0.4)] scale-110"
                              : "w-6 h-6 bg-red-600/40 border-red-500/50 shadow-[0_0_8px_2px_rgba(239,68,68,0.25)] hover:bg-red-500/70 hover:shadow-[0_0_14px_4px_rgba(239,68,68,0.5)] hover:scale-110"
                      }`}>
                        <div className="w-full h-full rounded-full bg-red-400/30 animate-ping" style={{ animationDuration: investigationStep === "create-connection" ? '1s' : '2s' }} />
                      </div>
                    </div>

                  </div>
                );
              })}


              {/* Large detail panel — only opens on a pure click, not drag */}
              {detailNodeId && (() => {
                const detailNode = nodes.find(n => n.id === detailNodeId);
                if (!detailNode) return null;
                return (
                  <NodeDetailCard
                    node={detailNode}
                    connections={connections}
                    nodes={nodes}
                    onClose={() => setDetailNodeId(null)}
                    onFocusNode={onFocusNode}
                    onSelectNode={(id) => { setDetailNodeId(id); onSelectNode(id); }}
                    focusedNodeId={focusedNodeId}
                    onOpenEvidence={setFocusedPinnedEvidence}
                  />
                );
              })()}

              {/* Drop ripple effect */}
              {dropRipple && (
                <div className="drop-ripple" style={{
                  position: "absolute",
                  left: dropRipple.x - 60,
                  top: dropRipple.y - 60,
                  width: 120, height: 120,
                  zIndex: 50,
                }} />
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
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-600/10 border border-red-600/20">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-500/70">
                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <p className="text-base font-bold uppercase tracking-widest text-[#999]">
                      No evidence on board
                    </p>
                    <p className="text-sm text-[#777] mt-2">
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
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-lg border border-[#2a2a2a] bg-[#141414]/90 backdrop-blur-sm p-1 shadow-xl shadow-black/50">
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

          <div className="mx-0.5 h-5 w-px bg-[#333]" />

          <button
            onClick={arrangeGrid}
            disabled={nodes.length < 2 || isArranging}
            className="flex h-8 items-center gap-1.5 rounded px-2 text-[#888] hover:bg-[#222] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Organize: Grid"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider">Grid</span>
          </button>

          <button
            onClick={arrangeSplit}
            disabled={nodes.length < 2 || isArranging}
            className="flex h-8 items-center gap-1.5 rounded px-2 text-[#888] hover:bg-[#222] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Organize: Split by type"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="14" y="3" width="7" height="18" rx="1" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider">Split</span>
          </button>

          <button
            onClick={arrangeForce}
            disabled={nodes.length < 2 || isArranging}
            className="flex h-8 items-center gap-1.5 rounded px-2 text-[#888] hover:bg-[#222] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Organize: Force-directed network"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="5" cy="6" r="3" />
              <circle cx="19" cy="6" r="3" />
              <circle cx="12" cy="19" r="3" />
              <line x1="7.5" y1="7.5" x2="10" y2="17" />
              <line x1="16.5" y1="7.5" x2="14" y2="17" />
              <line x1="8" y1="6" x2="16" y2="6" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider">Network</span>
          </button>

          <button
            onClick={arrangeWideNetwork}
            disabled={nodes.length < 2 || isArranging}
            className="flex h-8 items-center gap-1.5 rounded px-2 text-[#888] hover:bg-[#222] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Organize: Wide network — fills the viewport"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="3" cy="12" r="2" />
              <circle cx="21" cy="5" r="2" />
              <circle cx="21" cy="19" r="2" />
              <circle cx="12" cy="4" r="2" />
              <circle cx="12" cy="20" r="2" />
              <line x1="5" y1="12" x2="10" y2="5" />
              <line x1="5" y1="12" x2="10" y2="19" />
              <line x1="14" y1="4" x2="19" y2="5" />
              <line x1="14" y1="20" x2="19" y2="19" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider">Wide</span>
          </button>

          <button
            onClick={arrangeEgo}
            disabled={nodes.length < 2 || isArranging}
            className="flex h-8 items-center gap-1.5 rounded px-2 text-[#888] hover:bg-[#222] hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Organize: Ego view (select a person first)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="7" fill="none" />
              <circle cx="12" cy="12" r="11" fill="none" strokeDasharray="3 3" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider">Ego</span>
          </button>

          <button
            onClick={arrangeTest}
            disabled={nodes.length < 2 || isArranging}
            className="flex h-8 items-center gap-1.5 rounded px-2 text-amber-500/70 hover:bg-amber-600/10 hover:text-amber-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Lab: fCoSE force-directed layout"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 3h6v6l4 8H5l4-8V3z" />
              <line x1="9" y1="3" x2="15" y2="3" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider">Lab</span>
          </button>

          <button
            onClick={arrangeTest2}
            disabled={nodes.length < 2 || isArranging}
            className="flex h-8 items-center gap-1.5 rounded px-2 text-cyan-500/70 hover:bg-cyan-600/10 hover:text-cyan-400 transition disabled:opacity-30 disabled:cursor-not-allowed"
            title="Lab 2: Fruchterman-Reingold force-directed layout"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 3h6v6l4 8H5l4-8V3z" />
              <line x1="9" y1="3" x2="15" y2="3" />
              <circle cx="12" cy="14" r="1.5" fill="currentColor" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider">Lab 2</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setPathPicker(p => ({ open: !p.open, selected: [] }))}
              disabled={nodes.length < 2 || isArranging}
              className={`flex h-8 items-center gap-1.5 rounded px-2 transition disabled:opacity-30 disabled:cursor-not-allowed ${
                pathFocus ? "text-red-400 bg-red-600/10 hover:bg-red-600/20" : "text-[#888] hover:bg-[#222] hover:text-white"
              }`}
              title="Compare two nodes"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="4" cy="12" r="2" />
                <circle cx="20" cy="12" r="2" />
                <path d="M6 12h2c2 0 2-4 4-4s2 4 4 4h2" />
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-wider">Compare</span>
            </button>
            {pathPicker.open && (
              <div className="absolute bottom-full right-0 mb-2 w-64 max-h-80 overflow-y-auto rounded-lg border border-[#2a2a2a] bg-[#111] p-2 shadow-xl shadow-black/60 z-50">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#666] px-2 py-1 mb-1">
                  Pick {2 - pathPicker.selected.length} {pathPicker.selected.length === 0 ? "nodes" : "more"}
                </div>
                {(() => {
                  const people = nodes.filter(n => n.kind === "person");
                  const entities = nodes.filter(n => n.kind === "entity");
                  const groups = [
                    { label: "People", items: people },
                    { label: "Entities", items: entities },
                  ].filter(g => g.items.length > 0);

                  const renderItem = (n: BoardNode) => {
                    const picked = pathPicker.selected.includes(n.id);
                    const label = n.data.name;
                    return (
                      <button
                        key={n.id}
                        onClick={() => {
                          if (picked) {
                            setPathPicker(prev => ({ ...prev, selected: prev.selected.filter(id => id !== n.id) }));
                            return;
                          }
                          const next = [...pathPicker.selected, n.id];
                          if (next.length >= 2) {
                            setPathPicker({ open: false, selected: [] });
                            arrangePath(next[0], next[1]);
                          } else {
                            setPathPicker(prev => ({ ...prev, selected: next }));
                          }
                        }}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                          picked ? "bg-red-600/20 text-red-400" : "text-[#aaa] hover:bg-[#1a1a1a] hover:text-white"
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${picked ? "bg-red-500" : "bg-[#333]"}`} />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  };

                  return groups.map(g => (
                    <div key={g.label}>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[#444] px-2 pt-2 pb-1">{g.label}</div>
                      {g.items.map(renderItem)}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {pathFocus && pathDrillNode && (
            <button
              onClick={() => { setPathFocus(pathDefaultFocusRef.current); setPathDrillNode(null); }}
              className="flex h-8 items-center gap-1 rounded px-2 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-600/10 transition"
              title="Back to default compare view"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </button>
          )}
          {pathFocus && (
            <button
              onClick={() => { setPathFocus(null); setPathDrillNode(null); setShowAllInCompare(false); compareNodeIdsRef.current = null; }}
              className="flex h-8 items-center gap-1 rounded px-2 text-[10px] font-bold uppercase tracking-wider text-[#666] hover:text-red-400 hover:bg-red-600/10 transition"
              title="Exit compare mode"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear
            </button>
          )}

          <div className="mx-0.5 h-5 w-px bg-[#333]" />

          {/* Unconnected toggle */}
          {orphanNodeIds.size > 0 && (
            <button
              onClick={() => { setHideOrphans(h => !h); setTimeout(() => zoomFit(), 350); }}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition ${
                !hideOrphans
                  ? "text-red-400 hover:bg-red-600/15"
                  : "text-[#555] hover:text-white"
              }`}
              title={hideOrphans ? "Show unconnected nodes" : "Hide unconnected nodes"}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {!hideOrphans
                  ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                  : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
                }
              </svg>
              {orphanNodeIds.size}
            </button>
          )}

          <div className="mx-0.5 h-5 w-px bg-[#333]" />

          {/* Sound mute toggle */}
          <button
            onClick={toggleSoundMute}
            className={`flex h-8 w-8 items-center justify-center rounded transition ${soundMuted ? "text-[#555] hover:text-white" : "text-[#888] hover:text-white"}`}
            title={soundMuted ? "Unmute sounds" : "Mute sounds"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {soundMuted ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
          </button>

          {/* Expand All collapsed groups */}
          {hasCollapsed && (
            <>
              <div className="mx-0.5 h-5 w-px bg-[#333]" />
              <button
                onClick={expandAll}
                className="flex h-8 items-center gap-1 rounded px-2 text-[#888] hover:bg-[#222] hover:text-white transition"
                title="Expand all collapsed evidence groups"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">Expand</span>
              </button>
            </>
          )}

        </div>

      </div>

      {/* Connection focus view — opens on connection double-click */}
      {focusedConnectionId && (() => {
        const conn = connections.find(c => c.id === focusedConnectionId);
        if (!conn) return null;
        const source = nodes.find(n => n.id === conn.sourceId);
        const target = nodes.find(n => n.id === conn.targetId);
        if (!source || !target) return null;
        return (
          <ConnectionFocusView
            connection={conn}
            source={source}
            target={target}
            onClose={() => setFocusedConnectionId(null)}
          />
        );
      })()}

      {/* Full-screen evidence viewer — opens on pinned chip double-click */}
      {focusedPinnedEvidence && (
        <FullScreenEvidenceViewer
          evidence={focusedPinnedEvidence}
          onClose={() => setFocusedPinnedEvidence(null)}
        />
      )}
    </div>
  );
});

// ─── Person Card (large suspect dossier card) ──────────────────────────────

function PersonCard({ data, isSelected, onFocus, connectedEvidence, evidenceGroups, collapsedGroups, onToggleCollapse, pinnedEvidence, onPinnedEvidenceDoubleClick, zoom = 1 }: {
  data: Person; isSelected: boolean; onFocus: () => void;
  connectedEvidence?: { emails: number; documents: number; photos: number; total: number };
  evidenceGroups?: { type: EvidenceType; count: number }[];
  collapsedGroups?: Record<string, boolean>;
  onToggleCollapse?: (evType: EvidenceType) => void;
  pinnedEvidence?: PinnedEvidence[];
  onPinnedEvidenceDoubleClick?: (ev: PinnedEvidence) => void;
  zoom?: number;
}) {
  // Mini card at low zoom — keep full photo + name, drop metadata
  if (zoom < 0.6) {
    return (
      <div className={`board-entity-card w-[220px] rounded-xl bg-[#111] border-2 border-l-4 border-l-red-500/60 cursor-grab active:cursor-grabbing ${
        isSelected ? "shadow-2xl shadow-red-600/20 border-red-500/40" : "shadow-xl shadow-black/60 border-[#222]"
      }`}>
        <div className="relative h-28 rounded-t-xl overflow-hidden bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a]">
          {data.imageUrl ? (
            <img src={data.imageUrl} alt={data.name} className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-red-900/25">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#111] to-transparent" />
        </div>
        <div className="px-2.5 py-1.5">
          <h4 className="font-[family-name:var(--font-display)] text-xl leading-none text-white tracking-wide">{data.name}</h4>
        </div>
      </div>
    );
  }

  return (
    <div className={`board-entity-card w-[220px] rounded-xl bg-[#111] border-2 border-l-4 border-l-red-500/60 cursor-grab active:cursor-grabbing transition-all ${
      isSelected ? "shadow-2xl shadow-red-600/20 border-red-500/40" : "shadow-xl shadow-black/60 border-[#222] hover:border-[#333]"
    }`}>
      {/* Photo area — compact */}
      <div className="relative h-28 rounded-t-xl overflow-hidden bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a]">
        {data.imageUrl ? (
          <>
            <img src={data.imageUrl} alt={data.name} className="w-full h-full object-cover"
              onError={(e) => { e.currentTarget.style.display = 'none'; const f = e.currentTarget.nextElementSibling as HTMLElement; if (f) f.style.display = 'flex'; }} />
            <div className="items-center justify-center h-full hidden">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-red-900/25">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-red-900/25">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#111] to-transparent" />

        {data.photoCount > 0 && (
          <div className="absolute top-1.5 right-1.5 rounded bg-[#0a0a0a]/80 border border-[#333] px-1 py-px backdrop-blur-sm flex items-center gap-0.5">
            <span className="text-[8px]">📸</span>
            <span className="text-[8px] font-bold text-[#999]">{data.photoCount}</span>
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="px-2.5 py-1.5">
        <h4 className="font-[family-name:var(--font-display)] text-xl leading-none text-white tracking-wide">{data.name}</h4>
      </div>
    </div>
  );
}

// ─── Evidence Card (evidence file look) ─────────────────────────────────────

const PHOTO_CDN = "https://assets.getkino.com";

/* ─── Pinned Evidence Stack (mini thumbnails along card edge) ─ */

function PinnedEvidenceStack({ pinned, direction = "row", onDoubleClick }: {
  pinned: PinnedEvidence[];
  direction?: "row" | "col";
  onDoubleClick?: (ev: PinnedEvidence) => void;
}) {
  if (!pinned || pinned.length === 0) return null;
  const MAX_VISIBLE = 6;
  const visible = pinned.slice(0, MAX_VISIBLE);
  const overflow = pinned.length - visible.length;
  return (
    <div className={`flex gap-1 ${direction === "col" ? "flex-col" : "flex-row flex-wrap"}`}>
      {visible.map((p) => (
        <div key={p.id} className="w-9 h-9 flex-shrink-0">
          <PinnedEvidenceChip evidence={p} square onDoubleClick={onDoubleClick} />
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-9 h-9 flex items-center justify-center rounded-md bg-black/60 border border-[#333] text-[10px] font-bold text-[#888]">
          +{overflow}
        </div>
      )}
    </div>
  );
}

/* ─── Pinned Evidence Chip (single thumbnail, expands on hover) ───────── */

const PHOTO_CDN_URL = "https://assets.getkino.com";

function PinnedEvidenceChip({ evidence, compact = false, square = false, onDoubleClick }: { evidence: PinnedEvidence; compact?: boolean; square?: boolean; onDoubleClick?: (ev: PinnedEvidence) => void }) {
  const [hovered, setHovered] = useState(false);
  const isPhoto = evidence.type === "photo";
  const thumbUrl = isPhoto
    ? `${PHOTO_CDN_URL}/cdn-cgi/image/width=240,quality=80,format=auto/photos-deboned/${evidence.id}`
    : null;
  const typeBg = evidence.type === "email" ? "bg-[#1a2530]"
    : evidence.type === "imessage" ? "bg-[#1f1b30]"
    : evidence.type === "document" ? "bg-[#1a1a1a]"
    : evidence.type === "flight_log" ? "bg-[#1c1812]"
    : evidence.type === "video" ? "bg-[#1f1410]"
    : "bg-[#0a0a0a]";
  const typeBorder = evidence.type === "email" ? "border-[#4A6D8C]"
    : evidence.type === "imessage" ? "border-[#6B5B95]"
    : evidence.type === "document" ? "border-[#888]"
    : evidence.type === "flight_log" ? "border-[#9d8555]"
    : evidence.type === "video" ? "border-[#c45a3c]"
    : "border-[#c86464]";
  const accentLeft = evidence.type === "email" ? "border-l-[#4A6D8C]"
    : evidence.type === "imessage" ? "border-l-[#6B5B95]"
    : evidence.type === "document" ? "border-l-[#888]"
    : evidence.type === "flight_log" ? "border-l-[#9d8555]"
    : evidence.type === "video" ? "border-l-[#c45a3c]"
    : "border-l-[#c86464]";

  return (
    <div
      className="relative w-full h-full cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(evidence);
      }}
    >
      {/* Square chip (standardized layout for connection pins) */}
      {square ? (
        isPhoto && thumbUrl ? (
          <div className="w-full h-full rounded-md overflow-hidden border-2 border-[#1a1a1a] shadow-lg shadow-black/70 bg-[#0a0a0a]">
            <img src={thumbUrl} alt={evidence.title} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className={`w-full h-full rounded-md border-2 ${typeBorder} ${typeBg} shadow-lg shadow-black/70 flex flex-col items-center justify-center p-1 backdrop-blur-sm`}>
            <span className="text-[18px] leading-none mb-0.5">{EVIDENCE_TYPE_ICON[evidence.type]}</span>
            <span className="text-[8px] font-bold text-white/80 text-center leading-tight line-clamp-2 px-0.5">
              {evidence.title}
            </span>
          </div>
        )
      ) : isPhoto && thumbUrl ? (
        <div className={`rounded overflow-hidden border-2 border-[#1a1a1a] shadow-lg shadow-black/60 bg-[#0a0a0a] ${compact ? "w-10 h-10" : "w-14 h-14"}`}>
          <img src={thumbUrl} alt={evidence.title} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className={`flex items-center gap-1 rounded border-2 border-l-4 ${accentLeft} bg-[#0a0a0a]/95 border-[#1a1a1a] shadow-lg shadow-black/60 backdrop-blur-sm ${compact ? "px-1.5 py-1" : "px-2 py-1.5"}`}>
          <span className={compact ? "text-[11px]" : "text-[13px]"}>{EVIDENCE_TYPE_ICON[evidence.type]}</span>
          <span className={`font-bold text-white truncate ${compact ? "text-[9px] max-w-[80px]" : "text-[11px] max-w-[100px]"}`}>
            {evidence.title}
          </span>
        </div>
      )}

      {/* Expanded preview on hover */}
      {hovered && (
        <div
          className="absolute z-[60] left-1/2 -translate-x-1/2 -top-2 -translate-y-full pointer-events-none"
          style={{ width: 240 }}
        >
          <div className="rounded-xl border border-[#333] bg-[#0a0a0a]/98 backdrop-blur-md shadow-2xl shadow-black/80 overflow-hidden">
            {isPhoto && thumbUrl && (
              <img src={thumbUrl.replace("width=240", "width=500")} alt={evidence.title} className="w-full object-cover" style={{ maxHeight: 260 }} />
            )}
            <div className={`p-3 ${isPhoto ? "" : `border-l-4 ${accentLeft}`}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[11px]">{EVIDENCE_TYPE_ICON[evidence.type]}</span>
                <span className="text-[8px] font-black uppercase tracking-[0.15em] text-[#666]">
                  {EVIDENCE_TYPE_LABEL[evidence.type]}
                </span>
              </div>
              <p className="text-[12px] font-bold text-white leading-tight line-clamp-2">{evidence.title}</p>
              {evidence.date && <p className="text-[10px] text-[#666] tabular-nums mt-0.5">{evidence.date}</p>}
              {evidence.sender && <p className="text-[10px] text-[#777] mt-0.5 truncate">{evidence.sender}</p>}
              {evidence.snippet && !isPhoto && (
                <p className="text-[10px] text-[#888] mt-1.5 leading-relaxed line-clamp-3">{evidence.snippet}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ─── Flight Board Card ──────────────────────────────────────────────────── */

function FlightBoardCard({
  data,
  isSelected,
  zoom = 1,
}: {
  data: BoardFlightNodeData;
  isSelected: boolean;
  zoom?: number;
}) {
  const depLabel = data.departureCode ?? data.departureCity ?? data.departure ?? "?";
  const arrLabel = data.arrivalCode ?? data.arrivalCity ?? data.arrival ?? "?";

  // Mini card at low zoom
  if (zoom < 0.6) {
    return (
      <div
        className="flex items-center gap-1 rounded bg-[#141414] border border-[#2a2a2a] border-l-2 border-l-[#9d8555] px-1.5 py-1 cursor-grab active:cursor-grabbing"
        style={{ width: 150 }}
      >
        <span className="text-[10px] shrink-0">✈️</span>
        <span className="text-[9px] text-white truncate">
          {depLabel} → {arrLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`w-[210px] rounded-xl bg-[#111] border overflow-hidden cursor-grab active:cursor-grabbing ${
        isSelected ? "shadow-xl shadow-[#9d8555]/20 border-[#9d8555]/50" : "shadow-lg shadow-black/50 border-[#2a2a2a]"
      }`}
    >
      {/* Header strip with ✈️ + type */}
      <div className="relative bg-gradient-to-b from-[#1c1812] to-[#111] border-b border-[#2a2a2a] px-3 pt-2.5 pb-2 border-l-4 border-l-[#9d8555]">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12px]">✈️</span>
          <span className="text-[8px] font-black uppercase tracking-[0.15em] text-[#9d8555]">Flight</span>
          {data.date && (
            <span className="ml-auto text-[9px] text-[#777] tabular-nums">{data.date}</span>
          )}
        </div>
        <h3 className="text-[15px] font-black text-white leading-tight tracking-tight">
          {depLabel} <span className="text-[#666]">→</span> {arrLabel}
        </h3>
        {(data.departureCity || data.arrivalCity) && (
          <p className="text-[10px] text-[#888] truncate mt-0.5">
            {data.departureCity ?? "?"} to {data.arrivalCity ?? "?"}
          </p>
        )}
      </div>

      {/* Metadata rows */}
      <div className="px-3 py-2 space-y-1 text-[10px]">
        {data.aircraft && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#555] w-12 flex-shrink-0">Aircraft</span>
            <span className="text-white font-bold font-[family-name:var(--font-mono)] truncate">{data.aircraft}</span>
          </div>
        )}
        {data.pilot && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#555] w-12 flex-shrink-0">Pilot</span>
            <span className="text-[#ccc] truncate">{data.pilot}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[#555] w-12 flex-shrink-0">Pax</span>
          <span className="text-[#9d8555] font-bold tabular-nums">{data.passengerCount}</span>
          {data.passengers.length > 0 && (
            <span className="text-[#666] truncate text-[9px] ml-1">
              · {data.passengers.slice(0, 2).join(", ")}
              {data.passengers.length > 2 ? `, +${data.passengers.length - 2}` : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Media Board Card (standalone photo / video investigation target) ──── */

function MediaBoardCard({
  data,
  isSelected,
  zoom = 1,
}: {
  data: BoardMediaNodeData;
  isSelected: boolean;
  zoom?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const hasImg = !!data.thumbnailUrl && !imgError;
  const accent = data.mediaType === "video" ? "border-l-[#c45a3c]" : "border-l-[#c86464]";
  const label = data.mediaType === "video" ? "VIDEO" : "PHOTO";
  const icon = data.mediaType === "video" ? "🎬" : "📸";

  if (zoom < 0.6) {
    return (
      <div
        className={`flex items-center gap-1 rounded bg-[#141414] border border-[#2a2a2a] border-l-2 ${accent} px-1.5 py-1 cursor-grab active:cursor-grabbing`}
        style={{ width: 140 }}
      >
        <span className="text-[10px] shrink-0">{icon}</span>
        <span className="text-[9px] text-white truncate">{data.title}</span>
      </div>
    );
  }

  return (
    <div
      className={`w-[180px] rounded-xl bg-[#0f0f0f] border overflow-hidden cursor-grab active:cursor-grabbing ${
        isSelected ? "shadow-xl shadow-black/60 border-red-500/40" : "shadow-lg shadow-black/50 border-[#2a2a2a]"
      } border-l-4 ${accent}`}
    >
      {/* Thumbnail — 16:9 for video, 4:3 for photo */}
      <div
        className={`relative w-full bg-black overflow-hidden ${
          data.mediaType === "video" ? "aspect-video" : "aspect-[4/3]"
        }`}
      >
        {hasImg ? (
          <img
            src={data.thumbnailUrl ?? undefined}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#444] text-4xl">{icon}</div>
        )}
        {data.mediaType === "video" && hasImg && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="rounded-full bg-black/60 backdrop-blur-sm border border-white/30 w-10 h-10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 rounded bg-[#0a0a0a]/80 border border-[#333]/60 px-1.5 py-0.5 backdrop-blur-sm">
          <span className="text-[7px] font-black uppercase tracking-[0.15em] text-[#aaa]">
            {icon} {label}
          </span>
        </div>
      </div>
      {/* Title */}
      <div className="px-2.5 py-2">
        <p className="text-[11px] font-bold text-white leading-tight line-clamp-2">
          {data.title}
        </p>
      </div>
    </div>
  );
}

/* ─── Flight Passenger Panel (rendered inside NodeDetailCard) ────────────── */

function FlightPassengerPanel({
  passengers,
  peopleOnBoardNames,
}: {
  passengers: string[];
  peopleOnBoardNames: Set<string>;
}) {
  if (passengers.length === 0) {
    return (
      <div className="rounded border border-[#222] bg-[#111] px-3 py-2.5">
        <p className="text-[11px] text-[#666] italic">
          The flight log records no passengers for this flight.
        </p>
      </div>
    );
  }

  const isAnonymous = (name: string) =>
    /^\s*\[.*\]\s*$/.test(name) || /^unknown$/i.test(name) || /redacted/i.test(name);

  return (
    <div className="rounded border border-[#222] bg-[#0f0e0b] px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px]">✈️</span>
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#9d8555]">
          Flight log states these passengers
        </span>
      </div>
      <ul className="space-y-1">
        {passengers.map((name, i) => {
          const anon = isAnonymous(name);
          const onBoard = !anon && peopleOnBoardNames.has(name);
          return (
            <li
              key={`${i}-${name}`}
              className="flex items-center gap-2 py-0.5"
            >
              <span
                className={`h-2 w-2 rounded-full flex-shrink-0 ${
                  anon ? "bg-[#333] border border-[#444]" : onBoard ? "bg-[#9d8555]" : "border border-[#555]"
                }`}
              />
              <span
                className={`flex-1 text-[12px] truncate ${
                  anon ? "italic text-[#666]" : onBoard ? "text-white font-bold" : "text-[#bbb]"
                }`}
              >
                {name}
              </span>
              {onBoard ? (
                <span className="text-[8px] uppercase tracking-widest text-[#9d8555] font-bold">on board</span>
              ) : anon ? null : (
                <span className="text-[8px] uppercase tracking-widest text-[#555]">not on board</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[9px] text-[#555] italic">
        Passenger connections are not drawn automatically. Drag people from the right panel onto the board, then connect them to this flight yourself.
      </p>
    </div>
  );
}

/* ─── Entity Board Card ──────────────────────────────────────────────────── */

function EntityBoardCard({ data, isSelected, pinnedEvidence, onPinnedEvidenceDoubleClick, zoom = 1 }: {
  data: SeedEntity; isSelected: boolean; pinnedEvidence?: PinnedEvidence[]; onPinnedEvidenceDoubleClick?: (ev: PinnedEvidence) => void; zoom?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const hasImage = data.image.strategy !== "none" && !imgError;
  const imgSrc = data.image.strategy !== "none" ? `/entity-images/${data.id}.jpg` : null;

  const typeColor = data.type === "place" ? "teal" : data.type === "organization" ? "amber" : "purple";
  const typeLabel = data.type === "place" ? "Place" : data.type === "organization" ? "Organization" : "Event";
  const typeIcon = data.type === "place" ? "📍" : data.type === "organization" ? "🏢" : "📅";
  const accentBorder = data.type === "place" ? "border-l-teal-500" : data.type === "organization" ? "border-l-amber-500" : "border-l-purple-500";
  const accentBg = data.type === "place" ? "from-teal-950/20" : data.type === "organization" ? "from-amber-950/15" : "from-purple-950/15";

  // Mini card at low zoom
  if (zoom < 0.6) {
    return (
      <div className={`flex items-center gap-1 rounded bg-[#141414] border border-[#2a2a2a] border-l-2 ${accentBorder} px-1.5 py-1 cursor-grab active:cursor-grabbing`}
        style={{ width: 130 }}>
        <span className="text-[10px] shrink-0">{typeIcon}</span>
        <span className="text-[9px] text-white truncate">{data.shortName || data.name}</span>
      </div>
    );
  }

  return (
    <div className={`w-[220px] rounded-xl bg-[#111] border overflow-hidden cursor-grab active:cursor-grabbing ${
      isSelected ? "shadow-xl shadow-red-600/15 border-red-500/30" : "shadow-lg shadow-black/50 border-[#2a2a2a]"
    }`}>
      {/* Image or stylized header */}
      {hasImage && imgSrc ? (
        <div className="relative w-full h-24 bg-[#0a0a0a] overflow-hidden">
          <img src={imgSrc} alt={data.name} className="h-full w-full object-cover"
            onError={() => setImgError(true)} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-transparent" />
          {/* Type badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-[#0a0a0a]/80 border border-[#333]/50 px-2 py-0.5 backdrop-blur-sm">
            <span className="text-[9px]">{typeIcon}</span>
            <span className="text-[8px] font-black uppercase tracking-[0.15em] text-[#999]">{typeLabel}</span>
          </div>
        </div>
      ) : (
        <div className={`relative border-l-4 ${accentBorder} px-3 py-2.5 bg-gradient-to-r ${accentBg} to-transparent`}>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[9px]">{typeIcon}</span>
            <span className="text-[8px] font-black uppercase tracking-[0.15em] text-[#666]">{typeLabel}</span>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="px-3 py-2">
        <h4 className="font-[family-name:var(--font-display)] text-[14px] font-bold text-white tracking-wide leading-tight">
          {data.shortName || data.name}
        </h4>
        {data.dateRange && (
          <p className="font-[family-name:var(--font-mono)] text-[9px] text-[#666] mt-0.5">{data.dateRange}</p>
        )}
        {data.location && (
          <p className="text-[9px] text-[#555] mt-0.5 truncate">{data.location}</p>
        )}
        {data.keyPeople.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-0.5">
            {data.keyPeople.slice(0, 3).map(name => (
              <span key={name} className="rounded bg-[#1a1a1a] border border-[#222] px-1 py-px text-[7px] text-[#777]">{name}</span>
            ))}
            {data.keyPeople.length > 3 && (
              <span className="text-[7px] text-[#444]">+{data.keyPeople.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Pin at top center */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-red-500 bg-[#141414] z-10" />
    </div>
  );
}

/* ─── Node Detail Card (half-screen right panel) ──────────────────────────── */

function NodeDetailCard({ node, connections, nodes, onClose, onSelectNode, onOpenEvidence }: {
  node: BoardNode;
  connections: BoardConnection[];
  nodes: BoardNode[];
  onClose: () => void;
  onFocusNode: (id: string | null) => void;
  onSelectNode: (id: string | null) => void;
  focusedNodeId: string | null;
  onOpenEvidence: (ev: PinnedEvidence) => void;
}) {
  // Escape closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTab, setSearchTab] = useState<"all" | EvidenceType>("all");
  const [hoveredResult, setHoveredResult] = useState<{ r: SearchResult; x: number; y: number } | null>(null);
  // Split-screen companion viewer docked to the right side of the screen.
  // Populated by clicking any evidence item inside this panel.
  const [splitEvidence, setSplitEvidence] = useState<PinnedEvidence | null>(null);
  const openSplit = useCallback((ev: PinnedEvidence) => setSplitEvidence(ev), []);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const relatedConns = connections.filter(
    (c) => c.sourceId === node.id || c.targetId === node.id
  );

  // Score — "how implicated is this node": weighted count of connections and
  // evidence they carry, plus evidence pinned directly to the node.
  const totalConnEvidence = relatedConns.reduce((sum, c) => sum + (c.pinnedEvidence?.length ?? 0), 0);
  const ownEvidenceCount = node.pinnedEvidence?.length ?? 0;
  const score = relatedConns.length * 10 + totalConnEvidence * 5 + ownEvidenceCount * 2;

  // All evidence attached to this card, grouped by category — no "pinned" distinction here.
  const part = partitionNodeEvidence(node.pinnedEvidence);
  const allPhotos = [...part.orbitalPhotos, ...part.overflowPhotos];
  const allEmails = part.emails;
  const allDocs = part.documents;
  const allIms = part.imessages;
  const allFlights = part.flightLogs;
  const allVideos = part.videos;
  const hasPhotos = allPhotos.length > 0;
  const otherCount = allEmails.length + allDocs.length + allIms.length + allFlights.length + allVideos.length;
  const hasOther = otherCount > 0;
  const totalRawCount = ownEvidenceCount;

  // Node metadata — photo, display name, optional location/date line for entities.
  const headerBits = (() => {
    if (node.kind === "person") {
      const d = node.data;
      return {
        title: d.name,
        subtitle: null as string | null,
        photoUrl: d.imageUrl as string | null,
        nameForSearch: d.name,
        aliasesForSearch: d.aliases,
        extraRows: (
          <>
            {d.aliases.length > 0 && (
              <div className="rounded border border-[#222] bg-[#111] px-3 py-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#555]">Aliases</span>
                <div className="text-[13px] text-[#ccc] mt-1">{d.aliases.join(", ")}</div>
              </div>
            )}
          </>
        ),
      };
    }
    if (node.kind === "flight") {
      const d = node.data;
      const depLabel = d.departureCode ?? d.departureCity ?? d.departure ?? "?";
      const arrLabel = d.arrivalCode ?? d.arrivalCity ?? d.arrival ?? "?";
      const subtitleBits = [d.date, d.aircraft, d.pilot ? `pilot: ${d.pilot}` : null].filter(Boolean) as string[];
      return {
        title: `${depLabel} → ${arrLabel}`,
        subtitle: subtitleBits.join(" · ") || null,
        photoUrl: null as string | null,  // replaced by route map in header row
        nameForSearch: d.passengers.join(" ") || d.name,
        aliasesForSearch: [] as string[],
        extraRows: (
          <FlightPassengerPanel
            passengers={d.passengers}
            peopleOnBoardNames={new Set(nodes.filter((n) => n.kind === "person").map((n) => n.data.name))}
          />
        ),
      };
    }
    if (node.kind === "media") {
      const d = node.data;
      return {
        title: d.title,
        subtitle: d.mediaType === "video" ? "Video · investigation target" : "Photo · investigation target",
        photoUrl: d.thumbnailUrl,
        nameForSearch: d.title,
        aliasesForSearch: [] as string[],
        extraRows: (
          <div className="rounded border border-[#222] bg-[#0f0e0b] px-3 py-2.5 text-[11px] text-[#888]">
            Standalone investigation target. Drag people, places, or other
            entities onto the board and connect them here yourself if you
            think they appear in or relate to this {d.mediaType}.
          </div>
        ),
      };
    }
    const d = node.data;
    return {
      title: d.shortName || d.name,
      subtitle: [d.location, d.dateRange].filter(Boolean).join(" · ") || null,
      photoUrl: d.image.strategy !== "none" ? `/entity-images/${d.id}.jpg` : null,
      nameForSearch: d.name,
      aliasesForSearch: [] as string[],
      extraRows: (
        <>
          {d.description && (
            <div className="rounded border border-[#222] bg-[#111] px-3 py-2.5">
              <p className="text-[13px] leading-relaxed text-[#ccc]">{d.description}</p>
            </div>
          )}
          {d.keyPeople.length > 0 && (
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#555]">Key People</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {d.keyPeople.map(name => (
                  <span key={name} className="rounded bg-[#1a1a1a] border border-[#222] px-2.5 py-1 text-[12px] text-[#aaa]">{name}</span>
                ))}
              </div>
            </div>
          )}
        </>
      ),
    };
  })();

  // Fetch evidence across the whole archive matching this node's name or aliases.
  // Runs whenever the search panel is open and the query or active tab changes.
  useEffect(() => {
    if (!searchOpen) return;
    let cancelled = false;
    const effectiveQuery = query.trim() || headerBits.nameForSearch;
    if (!effectiveQuery) return;
    setSearchLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(effectiveQuery)}&type=${searchTab}&limit=60`)
      .then((r) => r.json())
      .then((data: { results?: SearchResult[] }) => {
        if (cancelled) return;
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      })
      .catch(() => { if (!cancelled) setSearchResults([]); })
      .finally(() => { if (!cancelled) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [searchOpen, query, searchTab, headerBits.nameForSearch]);

  // Click outside the panel closes it (so you can drag from panel → board freely).
  // A click anywhere inside a [data-detail-root] element counts as "inside" —
  // this keeps the split-screen evidence viewer on the right from dismissing
  // its parent detail panel on the left.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-detail-root]")) return;
      onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Seed the query with the node's name the first time the search panel opens.
  const didSeedQueryRef = useRef(false);
  useEffect(() => {
    if (searchOpen && !didSeedQueryRef.current) {
      didSeedQueryRef.current = true;
      setQuery(headerBits.nameForSearch);
    }
  }, [searchOpen, headerBits.nameForSearch]);

  // Portal to document.body so `position: fixed` escapes the board viewport's
  // transform: scale(...) — otherwise fixed coordinates get reinterpreted
  // relative to the transformed ancestor and the panel lands off-screen.
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {/* Panel — slides in from the left, no modal backdrop so the board beyond
          it stays interactive for drag-and-drop of evidence from search results.
          When the split-screen evidence viewer is open, this panel shrinks to
          exactly the left half of the viewport so the two panels meet in the
          middle with no gap. */}
      <div
        ref={panelRef}
        data-detail-root
        className="fixed z-[1001] left-4 top-[6vh] bottom-[6vh] flex flex-col rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a]/98 backdrop-blur-md shadow-2xl shadow-black/80"
        style={
          splitEvidence
            ? { right: "50vw" }
            : { width: "min(50vw, 760px)", minWidth: 480 }
        }
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 rounded-full bg-[#1a1a1a] border border-[#333] w-8 h-8 flex items-center justify-center text-[#888] hover:text-white hover:border-red-500/60 transition"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Header — bigger photo + name row, then centered "SCORE 1234" */}
        <div className="flex-shrink-0 px-6 pt-6 pb-5 border-b border-[#1c1c1c]">
          <div className="flex items-center gap-6">
            {/* Photo / placeholder — bigger */}
            <div className="flex-shrink-0 w-36 h-36 rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#111] shadow-lg shadow-black/50">
              {headerBits.photoUrl ? (
                <img
                  src={headerBits.photoUrl}
                  alt={headerBits.title}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#333] text-4xl">·</div>
              )}
            </div>
            {/* Name + subtitle */}
            <div className="flex-1 min-w-0 pr-10">
              <h2 className="text-5xl font-black text-white tracking-tight leading-[0.95] break-words">
                {headerBits.title}
              </h2>
              {headerBits.subtitle && (
                <p className="mt-2 text-[14px] text-[#888]">{headerBits.subtitle}</p>
              )}
            </div>
          </div>

          {/* Centered glowing green "SCORE 1234" */}
          <div
            className="mt-5 flex items-center justify-center gap-4 text-green-400 tabular-nums"
            style={{
              textShadow: "0 0 22px rgba(74,222,128,0.9), 0 0 48px rgba(74,222,128,0.55), 0 0 84px rgba(74,222,128,0.28)",
            }}
          >
            <span className="text-3xl font-black uppercase tracking-[0.2em]">Score</span>
            <span className="text-7xl font-black leading-none">{score}</span>
          </div>

          {/* Action row: connections dropdown + search */}
          <div className="flex items-center justify-center gap-3 mt-5">
            <button
              type="button"
              onClick={() => setConnectionsOpen((v) => !v)}
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-bold uppercase tracking-wide transition ${connectionsOpen ? "border-red-500/60 bg-red-600/10 text-red-300" : "border-[#2a2a2a] bg-[#111] text-[#bbb] hover:text-white hover:border-red-500/40"}`}
            >
              <span>Connections ({relatedConns.length})</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                   style={{ transform: connectionsOpen ? "rotate(180deg)" : "none", transition: "transform 120ms" }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-bold uppercase tracking-wide transition ${searchOpen ? "border-red-500/60 bg-red-600/10 text-red-300" : "border-[#2a2a2a] bg-[#111] text-[#bbb] hover:text-white hover:border-red-500/40"}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span>Search Evidence</span>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Extra metadata rows (description, key people, aliases) */}
          {headerBits.extraRows}

          {/* Connections dropdown */}
          {connectionsOpen && relatedConns.length > 0 && (
            <div className="space-y-1.5 rounded border border-[#222] bg-[#0a0a0a] p-2.5">
              {relatedConns.map((conn) => {
                const otherId = conn.sourceId === node.id ? conn.targetId : conn.sourceId;
                const otherNode = nodes.find((n) => n.id === otherId);
                const otherName = otherNode ? otherNode.data.name : "Unknown";
                const pinCount = conn.pinnedEvidence?.length ?? 0;
                return (
                  <button
                    key={conn.id}
                    onClick={(e) => { e.stopPropagation(); onSelectNode(otherId); }}
                    className="w-full flex items-center justify-between rounded border border-[#1e1e1e] bg-[#111] px-4 py-2.5 hover:border-red-500/40 hover:bg-[#151515] transition"
                  >
                    <span className="text-[15px] font-semibold text-white/90 truncate">{otherName}</span>
                    {pinCount > 0 && (
                      <span className="text-[11px] text-[#777] tabular-nums flex-shrink-0 ml-2">{pinCount} ev</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {connectionsOpen && relatedConns.length === 0 && (
            <div className="text-[12px] text-[#555] italic px-1">No connections yet.</div>
          )}

          {/* Search — queries the whole archive, seeded with the node's name.
              Tabs switch the type filter. Results are draggable onto the board
              and show a large hover preview. */}
          {searchOpen && (
            <div className="rounded border border-[#2a2a2a] bg-[#0a0a0a]">
              <div className="px-4 py-3 border-b border-[#1c1c1c]">
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search all evidence…"
                  className="w-full bg-transparent outline-none text-[15px] text-white placeholder:text-[#555]"
                />
                <div className="mt-1 text-[10px] text-[#666] tabular-nums">
                  {searchLoading ? "Searching…" : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`}
                  {headerBits.aliasesForSearch.length > 0 && !searchLoading && (
                    <span className="text-[#444]"> · aliases: {headerBits.aliasesForSearch.slice(0, 3).join(", ")}{headerBits.aliasesForSearch.length > 3 ? "…" : ""}</span>
                  )}
                </div>
              </div>
              {/* Type tabs */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1c1c1c]">
                {([
                  { key: "all" as const, label: "All" },
                  { key: "photo" as const, label: "Photos", icon: "📸" },
                  { key: "email" as const, label: "Emails", icon: "✉️" },
                  { key: "document" as const, label: "Docs", icon: "📄" },
                  { key: "imessage" as const, label: "iMessages", icon: "💬" },
                  { key: "flight_log" as const, label: "Flights", icon: "✈️" },
                  { key: "video" as const, label: "Videos", icon: "🎬" },
                ]).map((t) => {
                  const active = searchTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setSearchTab(t.key)}
                      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition ${active ? "bg-red-600/20 text-red-300 border border-red-500/50" : "border border-transparent text-[#888] hover:text-white hover:bg-[#151515]"}`}
                    >
                      {"icon" in t && <span className="text-[12px]">{t.icon}</span>}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
              {searchResults.length > 0 && (
                <div className="max-h-[320px] overflow-y-auto divide-y divide-[#161616]">
                  {searchResults.map((r) => (
                    <div
                      key={`${r.type}-${r.id}`}
                      draggable
                      onDragStart={(e) => {
                        // Do NOT stopPropagation — the window-level dragstart
                        // listener in BoardCanvas needs to see this event to
                        // set dragKind="evidence" so handleDragOver will
                        // resolve a drop target and handleDrop will pin.
                        const payload = {
                          id: r.id,
                          kind: "evidence",
                          data: {
                            id: r.id,
                            type: r.type,
                            title: r.title,
                            snippet: r.snippet,
                            date: r.date,
                            sender: r.sender,
                            score: (r as SearchResult).score ?? 0,
                            starCount: r.starCount,
                          },
                        };
                        e.dataTransfer.setData("application/board-item", JSON.stringify(payload));
                        e.dataTransfer.effectAllowed = "move";
                        (e.currentTarget as HTMLElement).classList.add("dragging-source");
                        setHoveredResult(null);
                      }}
                      onDragEnd={(e) => (e.currentTarget as HTMLElement).classList.remove("dragging-source")}
                      onMouseEnter={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setHoveredResult({ r, x: rect.right + 12, y: rect.top });
                      }}
                      onMouseLeave={() => setHoveredResult(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        openSplit({ id: r.id, type: r.type, title: r.title, snippet: r.snippet, date: r.date, sender: r.sender, starCount: r.starCount });
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[#121212] transition flex items-start gap-2.5 cursor-grab active:cursor-grabbing"
                    >
                      <span className="text-[16px] flex-shrink-0">{EVIDENCE_TYPE_ICON[r.type]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-white/90 truncate">{r.title}</p>
                        {r.snippet && (
                          <p className="text-[11px] text-[#777] truncate mt-0.5">{r.snippet}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {r.date && <span className="text-[10px] text-[#555] tabular-nums">{r.date}</span>}
                          {r.sender && <span className="text-[10px] text-[#666] truncate">{r.sender}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Photos attached to this card */}
          {hasPhotos && (
            <div>
              <h4 className="mb-2.5 text-[11px] font-bold uppercase tracking-widest text-[#666]">
                Photos ({allPhotos.length})
              </h4>
              <div className="grid grid-cols-5 gap-2">
                {allPhotos.map((ev) => (
                  <DetailPhotoThumb key={ev.id} evidence={ev} onOpen={openSplit} />
                ))}
              </div>
            </div>
          )}

          {/* Other Evidence */}
          {hasOther && (
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-[#666]">
                Other Evidence ({otherCount})
              </h4>
              {allEmails.length > 0 && (
                <DetailEvidenceBucket label="Emails" icon="✉️" accent="border-l-[#4A6D8C]" items={allEmails} onOpen={openSplit} />
              )}
              {allDocs.length > 0 && (
                <DetailEvidenceBucket label="Documents" icon="📄" accent="border-l-[#888]" items={allDocs} onOpen={openSplit} />
              )}
              {allIms.length > 0 && (
                <DetailEvidenceBucket label="iMessages" icon="💬" accent="border-l-[#6B5B95]" items={allIms} onOpen={openSplit} />
              )}
              {allFlights.length > 0 && (
                <DetailEvidenceBucket label="Flights" icon="✈️" accent="border-l-[#9d8555]" items={allFlights} onOpen={openSplit} />
              )}
              {allVideos.length > 0 && (
                <DetailEvidenceBucket label="Videos" icon="🎬" accent="border-l-[#c45a3c]" items={allVideos} onOpen={openSplit} />
              )}
            </div>
          )}

          {totalRawCount === 0 && (
            <div className="text-[12px] text-[#555] italic">No evidence attached yet.</div>
          )}
        </div>
      </div>

      {/* Hover preview for search results — large thumbnail for photos,
          expanded metadata card for other evidence types. */}
      {hoveredResult && (() => {
        const r = hoveredResult.r;
        const isPhoto = r.type === "photo";
        const thumbUrl = isPhoto
          ? `https://assets.getkino.com/cdn-cgi/image/width=500,quality=85,format=auto/photos-deboned/${r.id}`
          : null;
        // Clamp so the preview stays on-screen
        const top = Math.min(hoveredResult.y, window.innerHeight - 340);
        const left = Math.min(hoveredResult.x, window.innerWidth - 360);
        return (
          <div
            className="fixed z-[1100] pointer-events-none rounded-xl border border-[#333] bg-[#0a0a0a]/98 backdrop-blur-md shadow-2xl shadow-black/80 overflow-hidden"
            style={{ left, top, width: 340 }}
          >
            {isPhoto && thumbUrl && (
              <img src={thumbUrl} alt={r.title} className="w-full object-cover" style={{ maxHeight: 320 }} />
            )}
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px]">{EVIDENCE_TYPE_ICON[r.type]}</span>
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#666]">
                  {EVIDENCE_TYPE_LABEL[r.type]}
                </span>
              </div>
              <p className="text-[13px] font-bold text-white leading-tight">{r.title}</p>
              {r.date && <p className="text-[10px] text-[#666] tabular-nums mt-0.5">{r.date}</p>}
              {r.sender && <p className="text-[10px] text-[#777] mt-0.5 truncate">{r.sender}</p>}
              {r.snippet && !isPhoto && (
                <p className="text-[11px] text-[#999] mt-2 leading-relaxed line-clamp-6">{r.snippet}</p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Split-screen evidence viewer docked to the right — opens when the
          user clicks any evidence row inside the detail panel. */}
      {splitEvidence && (
        <FullScreenEvidenceViewer
          evidence={splitEvidence}
          onClose={() => setSplitEvidence(null)}
          variant="side"
        />
      )}
    </>,
    document.body
  );
}

function DetailPhotoThumb({ evidence, onOpen }: { evidence: PinnedEvidence; onOpen: (ev: PinnedEvidence) => void }) {
  const thumbUrl = `https://assets.getkino.com/cdn-cgi/image/width=240,quality=80,format=auto/photos-deboned/${evidence.id}`;
  return (
    <button
      type="button"
      className="group relative aspect-square rounded-md overflow-hidden border border-[#333] bg-[#0a0a0a] hover:border-red-500/60 hover:scale-105 transition"
      onClick={(e) => { e.stopPropagation(); onOpen(evidence); }}
      title={evidence.title}
    >
      <img src={thumbUrl} alt={evidence.title} className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1 py-0.5 opacity-0 group-hover:opacity-100 transition">
        <p className="text-[8px] font-bold text-white/90 truncate">{evidence.title}</p>
      </div>
    </button>
  );
}

function DetailEvidenceBucket({ label, icon, accent, items, onOpen }: {
  label: string;
  icon: string;
  accent: string;
  items: PinnedEvidence[];
  onOpen: (ev: PinnedEvidence) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[14px]">{icon}</span>
        <span className="text-[11px] font-black uppercase tracking-[0.15em] text-[#777]">{label}</span>
        <span className="text-[11px] text-[#555] tabular-nums">{items.length}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((ev) => (
          <button
            key={ev.id}
            type="button"
            className={`w-full text-left rounded border border-[#222] border-l-4 ${accent} bg-[#0a0a0a] hover:bg-[#151515] hover:border-red-500/40 transition px-3 py-2`}
            onClick={(e) => { e.stopPropagation(); onOpen(ev); }}
          >
            <p className="text-[13px] font-bold text-white/90 truncate">{ev.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {ev.date && <span className="text-[10px] text-[#666] tabular-nums">{ev.date}</span>}
              {ev.sender && <span className="text-[10px] text-[#777] truncate flex-1">{ev.sender}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailConnections({ connections, currentNodeId, nodes, onSelectNode }: {
  connections: BoardConnection[]; currentNodeId: string; nodes: BoardNode[];
  onSelectNode: (id: string | null) => void;
}) {
  return (
    <div>
      <h4 className="mb-1 text-[8px] font-bold uppercase tracking-widest text-[#555]">
        Connections ({connections.length})
      </h4>
      <div className="space-y-1">
        {connections.map((conn) => {
          const otherId = conn.sourceId === currentNodeId ? conn.targetId : conn.sourceId;
          const otherNode = nodes.find((n) => n.id === otherId);
          const otherName = otherNode ? otherNode.data.name : "Unknown";
          return (
            <button key={conn.id} onClick={(e) => { e.stopPropagation(); onSelectNode(otherId); }}
              className="w-full text-left rounded border border-[#222] bg-[#111] p-1.5 text-[9px] hover:border-red-500/30 transition">
              <span className="font-bold uppercase text-red-400/70">{conn.type}</span>
              <span className="text-[#777]"> → {otherName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Connection Focus View (full-screen split view for a connection) ───── */

function ConnectionFocusView({ connection, source, target, onClose }: {
  connection: BoardConnection;
  source: BoardNode;
  target: BoardNode;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leftCardRef = useRef<HTMLDivElement>(null);
  const rightCardRef = useRef<HTMLDivElement>(null);
  const evidenceRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [hoveredEv, setHoveredEv] = useState<string | null>(null);
  const [focusedEv, setFocusedEv] = useState<PinnedEvidence | null>(null);
  const [positions, setPositions] = useState<{
    leftAnchor: { x: number; y: number };
    rightAnchor: { x: number; y: number };
    bbox: { x: number; y: number; w: number; h: number } | null;
  } | null>(null);

  const pinned = connection.pinnedEvidence || [];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Measure anchor positions + evidence group bounding box after layout
  useEffect(() => {
    function measure() {
      const cont = containerRef.current;
      const left = leftCardRef.current;
      const right = rightCardRef.current;
      if (!cont || !left || !right) return;
      const cRect = cont.getBoundingClientRect();
      const lRect = left.getBoundingClientRect();
      const rRect = right.getBoundingClientRect();
      // Compute bbox of all evidence elements
      let bbox: { x: number; y: number; w: number; h: number } | null = null;
      const evEls = Array.from(evidenceRefs.current.values());
      if (evEls.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const el of evEls) {
          const r = el.getBoundingClientRect();
          if (r.left < minX) minX = r.left;
          if (r.top < minY) minY = r.top;
          if (r.right > maxX) maxX = r.right;
          if (r.bottom > maxY) maxY = r.bottom;
        }
        const PAD = 18;
        bbox = {
          x: minX - cRect.left - PAD,
          y: minY - cRect.top - PAD,
          w: maxX - minX + PAD * 2,
          h: maxY - minY + PAD * 2,
        };
      }
      setPositions({
        leftAnchor: {
          x: lRect.right - cRect.left,
          y: lRect.top + lRect.height / 2 - cRect.top,
        },
        rightAnchor: {
          x: rRect.left - cRect.left,
          y: rRect.top + rRect.height / 2 - cRect.top,
        },
        bbox,
      });
    }
    // Measure after paint + after fonts/images settle
    const raf = requestAnimationFrame(() => {
      measure();
      setTimeout(measure, 80);
    });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [pinned.length]);

  // Enlarged evidence card
  function EnlargedEvidence({ ev, onOpen }: { ev: PinnedEvidence; onOpen: () => void }) {
    const isPhoto = ev.type === "photo";
    const imgUrl = isPhoto
      ? `${PHOTO_CDN_URL}/cdn-cgi/image/width=600,quality=85,format=auto/photos-deboned/${ev.id}`
      : null;
    const accent = ev.type === "email" ? "border-l-[#4A6D8C]"
      : ev.type === "imessage" ? "border-l-[#6B5B95]"
      : ev.type === "document" ? "border-l-[#888]"
      : "border-l-[#c86464]";
    const isHovered = hoveredEv === ev.id;
    if (isPhoto && imgUrl) {
      return (
        <div
          className={`rounded-xl border-2 overflow-hidden bg-[#0a0a0a] cursor-pointer transition-all ${
            isHovered ? "border-red-500/60 shadow-2xl shadow-red-600/30 scale-[1.02]" : "border-[#2a2a2a] shadow-lg shadow-black/60"
          }`}
          onClick={onOpen}
        >
          <img src={imgUrl} alt={ev.title} className="w-full object-cover" style={{ maxHeight: 220 }} />
          <div className="p-2.5">
            <p className="text-[12px] font-bold text-white leading-tight line-clamp-2">{ev.title}</p>
            {ev.sender && <p className="text-[9px] text-[#666] mt-1 truncate">{ev.sender}</p>}
          </div>
        </div>
      );
    }
    return (
      <div
        className={`rounded-xl border-2 border-l-[6px] ${accent} bg-[#0a0a0a] p-4 cursor-pointer transition-all ${
          isHovered ? "border-red-500/60 shadow-2xl shadow-red-600/30 scale-[1.02]" : "border-[#2a2a2a] shadow-lg shadow-black/60"
        }`}
        onClick={onOpen}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[16px]">{EVIDENCE_TYPE_ICON[ev.type]}</span>
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#666]">
            {EVIDENCE_TYPE_LABEL[ev.type]}
          </span>
          {ev.date && <span className="ml-auto text-[10px] text-[#555] tabular-nums">{ev.date}</span>}
        </div>
        <h3 className="text-[13px] font-bold text-white leading-tight mb-2 line-clamp-2">{ev.title}</h3>
        {ev.sender && <p className="text-[10px] text-[#888] mb-2 truncate">{ev.sender}</p>}
        {ev.snippet && <p className="text-[10px] text-[#aaa] leading-relaxed line-clamp-4">{ev.snippet}</p>}
      </div>
    );
  }

  // Centered entity card for the left/right
  function EntitySide({ node }: { node: BoardNode }) {
    if (node.kind === "person") {
      return (
        <div className="w-[240px] rounded-xl border-2 border-l-[6px] border-l-red-500/60 border-[#222] bg-[#111] overflow-hidden shadow-2xl shadow-black/80">
          {node.data.imageUrl && (
            <div className="relative h-56 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] overflow-hidden">
              <img src={node.data.imageUrl} alt={node.data.name} className="w-full h-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#111] to-transparent" />
            </div>
          )}
          <div className="p-4">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-white tracking-wide leading-tight">{node.data.name}</h2>
            {node.data.source && <p className="text-[10px] text-[#777] mt-1">{node.data.source}</p>}
          </div>
        </div>
      );
    }
    return (
      <div className="w-[240px] rounded-xl border-2 border-[#222] bg-[#111] overflow-hidden p-4 shadow-2xl shadow-black/80">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-white tracking-wide">{node.data.name}</h2>
      </div>
    );
  }

  // Build a rounded-rectangle SVG path around the bbox
  function roundedRectPath(bbox: { x: number; y: number; w: number; h: number }, r = 16) {
    const { x, y, w, h } = bbox;
    const rr = Math.min(r, w / 2, h / 2);
    return `M ${x + rr} ${y}`
      + ` L ${x + w - rr} ${y}`
      + ` Q ${x + w} ${y} ${x + w} ${y + rr}`
      + ` L ${x + w} ${y + h - rr}`
      + ` Q ${x + w} ${y + h} ${x + w - rr} ${y + h}`
      + ` L ${x + rr} ${y + h}`
      + ` Q ${x} ${y + h} ${x} ${y + h - rr}`
      + ` L ${x} ${y + rr}`
      + ` Q ${x} ${y} ${x + rr} ${y}`
      + ` Z`;
  }

  const anyHovered = hoveredEv !== null;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[100] bg-[#030303]/98 backdrop-blur-sm overflow-hidden">
      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-[10] flex items-center justify-between px-6 py-4 border-b border-[#1a1a1a] bg-[#030303]/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Connection</span>
          <span className="text-[12px] font-bold text-white">{source.data.name} ↔ {target.data.name}</span>
          <span className="text-[10px] text-[#666] font-[family-name:var(--font-mono)] uppercase">{connection.type}</span>
          <span className="text-[10px] text-[#666]">· {pinned.length} pinned</span>
        </div>
        <button
          onClick={onClose}
          className="rounded border border-[#333] bg-[#141414] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#888] hover:text-white hover:border-[#555] transition"
        >
          ESC ×
        </button>
      </div>

      {/* SVG string overlay — straight lines from entities to a single enclosing loop */}
      <svg className="absolute inset-0 pointer-events-none z-[5]" width="100%" height="100%">
        <defs>
          <filter id="cfv-string-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur1" />
            <feMerge>
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="cfv-string-hot" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {positions && positions.bbox && (() => {
          const bbox = positions.bbox;
          // Anchor points on the loop: left-middle and right-middle
          const loopLeft = { x: bbox.x, y: bbox.y + bbox.h / 2 };
          const loopRight = { x: bbox.x + bbox.w, y: bbox.y + bbox.h / 2 };
          const strokeColor = anyHovered ? "#ff4444" : "#ef4444";
          const strokeWidth = anyHovered ? 3.5 : 1.8;
          const strokeOpacity = anyHovered ? 1 : 0.5;
          const filter = anyHovered ? "url(#cfv-string-hot)" : "url(#cfv-string-glow)";
          return (
            <g className="transition-all duration-200">
              {/* Left entity → loop (straight line) */}
              <line
                x1={positions.leftAnchor.x}
                y1={positions.leftAnchor.y}
                x2={loopLeft.x}
                y2={loopLeft.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeOpacity={strokeOpacity}
                strokeLinecap="round"
                filter={filter}
              />
              {/* Enclosing loop around all evidence */}
              <path
                d={roundedRectPath(bbox, 20)}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeOpacity={strokeOpacity}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={filter}
              />
              {/* Loop → right entity (straight line) */}
              <line
                x1={loopRight.x}
                y1={loopRight.y}
                x2={positions.rightAnchor.x}
                y2={positions.rightAnchor.y}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeOpacity={strokeOpacity}
                strokeLinecap="round"
                filter={filter}
              />
              {/* Pin dots at entity endpoints */}
              <circle
                cx={positions.leftAnchor.x}
                cy={positions.leftAnchor.y}
                r={anyHovered ? 5 : 3.5}
                fill={strokeColor}
                fillOpacity={anyHovered ? 1 : 0.7}
              />
              <circle
                cx={positions.rightAnchor.x}
                cy={positions.rightAnchor.y}
                r={anyHovered ? 5 : 3.5}
                fill={strokeColor}
                fillOpacity={anyHovered ? 1 : 0.7}
              />
            </g>
          );
        })()}
      </svg>

      {/* Layout: absolute positioning for precise centering */}
      {/* Left card — vertically centered */}
      <div ref={leftCardRef} className="absolute left-10 top-1/2 -translate-y-1/2 z-[8]">
        <EntitySide node={source} />
      </div>

      {/* Right card — vertically centered */}
      <div ref={rightCardRef} className="absolute right-10 top-1/2 -translate-y-1/2 z-[8]">
        <EntitySide node={target} />
      </div>

      {/* Evidence grid in center */}
      <div className="absolute inset-y-0 left-[280px] right-[280px] top-16 bottom-6 overflow-y-auto z-[7] flex items-center justify-center">
        {pinned.length === 0 ? (
          <div className="text-[#555] text-sm text-center max-w-md">
            No evidence pinned to this connection yet.<br />
            Drag evidence onto the connection line to add it.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 p-6 max-w-[720px] w-full">
            {pinned.map((ev) => (
              <div
                key={ev.id}
                ref={(el) => { if (el) evidenceRefs.current.set(ev.id, el); else evidenceRefs.current.delete(ev.id); }}
                onMouseEnter={() => setHoveredEv(ev.id)}
                onMouseLeave={() => setHoveredEv(null)}
              >
                <EnlargedEvidence ev={ev} onOpen={() => setFocusedEv(ev)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Full-screen evidence viewer when an item is double-clicked */}
      {focusedEv && (
        <FullScreenEvidenceViewer
          evidence={focusedEv}
          onClose={() => setFocusedEv(null)}
        />
      )}
    </div>
  );
}

/* ─── Full-Screen Evidence Viewer (opens on pinned chip double-click) ────── */

function FullScreenEvidenceViewer({ evidence, onClose, variant = "fullscreen" }: { evidence: PinnedEvidence; onClose: () => void; variant?: "fullscreen" | "side" }) {
  const [full, setFull] = useState<Evidence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/evidence/${encodeURIComponent(evidence.id)}?type=${evidence.type}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { setFull(data); setLoading(false); })
      .catch(() => { setFull(null); setLoading(false); });
  }, [evidence.id, evidence.type]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isPhoto = evidence.type === "photo";
  const photoFullUrl = isPhoto
    ? `${PHOTO_CDN_URL}/cdn-cgi/image/width=1400,quality=90,format=auto/photos-deboned/${evidence.id}`
    : null;

  const inner = (
    <>
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm">{EVIDENCE_TYPE_ICON[evidence.type]}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#666]">
              {EVIDENCE_TYPE_LABEL[evidence.type]}
            </span>
            {evidence.date && <span className="text-[10px] text-[#555] tabular-nums">{evidence.date}</span>}
          </div>
          <h2 className="text-lg font-black text-white leading-tight truncate">{evidence.title}</h2>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded bg-[#222] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#333] transition"
        >
          ESC ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isPhoto && photoFullUrl && (
          <div className="bg-black flex items-center justify-center">
            <img
              src={photoFullUrl}
              alt={evidence.title}
              className="max-w-full max-h-[70vh] object-contain"
            />
          </div>
        )}

        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse mr-2" />
            <span className="text-[11px] text-[#555]">Loading…</span>
          </div>
        ) : full ? (
          <div className="p-5">
            {full.type === "email" && (
              <div>
                <div className="space-y-1.5 text-[12px] mb-4">
                  <div className="flex gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#555] w-12 flex-shrink-0 pt-0.5">From</span>
                    <span className={`font-bold ${full.epsteinIsSender ? "text-red-400" : "text-white"}`}>
                      {full.sender}
                      {full.senderName && full.senderName !== full.sender && (
                        <span className="text-[#555] font-normal ml-1">({full.senderName})</span>
                      )}
                    </span>
                  </div>
                  {full.recipients.length > 0 && (
                    <div className="flex gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#555] w-12 flex-shrink-0 pt-0.5">To</span>
                      <span className="text-[#aaa] break-all">{full.recipients.join(", ")}</span>
                    </div>
                  )}
                  {full.cc.length > 0 && (
                    <div className="flex gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#555] w-12 flex-shrink-0 pt-0.5">CC</span>
                      <span className="text-[#888] break-all">{full.cc.join(", ")}</span>
                    </div>
                  )}
                </div>
                <div className="text-[13px] leading-relaxed text-[#ccc] whitespace-pre-wrap font-mono">
                  {full.body || "No content available"}
                </div>
              </div>
            )}
            {full.type === "document" && (
              <div>
                <div className="flex flex-wrap gap-3 text-[11px] mb-4">
                  {full.volume && (
                    <div className="rounded border border-[#222] bg-[#111] px-2 py-1">
                      <span className="text-[#555]">Volume:</span> <span className="text-white font-bold">{full.volume}</span>
                    </div>
                  )}
                  <div className="rounded border border-[#222] bg-[#111] px-2 py-1">
                    <span className="text-[#555]">Pages:</span> <span className="text-white font-bold">{full.pageCount}</span>
                  </div>
                </div>
                <div className="text-[13px] leading-relaxed text-[#ccc] whitespace-pre-wrap font-mono">
                  {full.fulltext || full.snippet || "No content available"}
                </div>
              </div>
            )}
            {full.type === "imessage" && (
              <div>
                <p className="text-[11px] text-[#888] mb-2">From {full.sender}</p>
                <div className="text-[13px] leading-relaxed text-[#ccc] whitespace-pre-wrap font-mono">
                  {full.body || "No content available"}
                </div>
              </div>
            )}
            {full.type === "photo" && full.imageDescription && (
              <p className="text-[12px] text-[#aaa] leading-relaxed">{full.imageDescription}</p>
            )}
            {full.type === "flight_log" && (
              <div className="space-y-4">
                {/* Route map */}
                <FlightRouteMap
                  fromLat={full.departureLat}
                  fromLon={full.departureLon}
                  toLat={full.arrivalLat}
                  toLon={full.arrivalLon}
                  fromLabel={full.departureCode ?? full.departureCity ?? null}
                  toLabel={full.arrivalCode ?? full.arrivalCity ?? null}
                />

                {/* Route summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-[#222] bg-[#0a0a0a] p-3">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-[#555] mb-1">Departure</div>
                    <div className="text-[14px] font-bold text-white">
                      {full.departureCode ?? full.departureCity ?? full.departure ?? "Unknown"}
                    </div>
                    {full.departureName && full.departureName !== full.departureCode && (
                      <div className="text-[11px] text-[#999] mt-0.5">{full.departureName}</div>
                    )}
                    {(full.departureCity || full.departureCountry) && (
                      <div className="text-[10px] text-[#666] mt-0.5">
                        {[full.departureCity, full.departureCountry].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <div className="rounded border border-[#222] bg-[#0a0a0a] p-3">
                    <div className="text-[8px] font-bold uppercase tracking-widest text-[#555] mb-1">Arrival</div>
                    <div className="text-[14px] font-bold text-white">
                      {full.arrivalCode ?? full.arrivalCity ?? full.arrival ?? "Unknown"}
                    </div>
                    {full.arrivalName && full.arrivalName !== full.arrivalCode && (
                      <div className="text-[11px] text-[#999] mt-0.5">{full.arrivalName}</div>
                    )}
                    {(full.arrivalCity || full.arrivalCountry) && (
                      <div className="text-[10px] text-[#666] mt-0.5">
                        {[full.arrivalCity, full.arrivalCountry].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                </div>

                {/* Flight stats */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {full.date && (
                    <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                      <span className="text-[#555]">Date: </span>
                      <span className="text-white font-bold tabular-nums">{full.date}</span>
                    </div>
                  )}
                  {full.aircraft && (
                    <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                      <span className="text-[#555]">Aircraft: </span>
                      <span className="text-white font-bold">{full.aircraft}</span>
                    </div>
                  )}
                  {full.pilot && (
                    <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                      <span className="text-[#555]">Pilot: </span>
                      <span className="text-white font-bold">{full.pilot}</span>
                    </div>
                  )}
                  {full.flightNumber && (
                    <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                      <span className="text-[#555]">Flight #: </span>
                      <span className="text-white font-bold tabular-nums">{full.flightNumber}</span>
                    </div>
                  )}
                  {full.distanceNm != null && (
                    <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                      <span className="text-[#555]">Distance: </span>
                      <span className="text-white font-bold tabular-nums">{full.distanceNm.toLocaleString()} nm</span>
                    </div>
                  )}
                  {full.durationMinutes != null && (
                    <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                      <span className="text-[#555]">Duration: </span>
                      <span className="text-white font-bold tabular-nums">
                        {Math.floor(full.durationMinutes / 60)}h {full.durationMinutes % 60}m
                      </span>
                    </div>
                  )}
                </div>

                {/* Passengers */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-2">
                    Passengers ({full.passengerCount})
                  </div>
                  {full.passengers.length > 0 ? (
                    <ul className="space-y-1">
                      {full.passengers.map((name, i) => (
                        <li
                          key={`${i}-${name}`}
                          className="flex items-center gap-2 rounded border border-[#222] bg-[#0a0a0a] px-3 py-1.5"
                        >
                          <span className="text-[#555] tabular-nums text-[10px] w-5">{i + 1}.</span>
                          <span className="text-[12px] text-white/90">{name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-[#555] italic">No passengers recorded.</p>
                  )}
                </div>

                {/* Notes */}
                {full.notes && (
                  <div className="rounded border border-[#222] bg-[#111] p-3">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-[#555] mb-1">Notes</div>
                    <p className="text-[12px] text-[#ccc] whitespace-pre-wrap">{full.notes}</p>
                  </div>
                )}

                {/* Source doc reference */}
                {full.sourceDoc && (
                  <div className="text-[10px] text-[#555]">
                    Source: <span className="text-[#888] font-mono">{full.sourceDoc}</span>
                  </div>
                )}
              </div>
            )}
            {full.type === "video" && (
              <div className="space-y-3">
                {/* Player */}
                <div className="rounded-lg overflow-hidden border border-[#222] bg-black">
                  <video
                    key={full.id}
                    src={full.streamUrl}
                    poster={full.thumbnailUrl ?? undefined}
                    controls
                    preload="metadata"
                    className="w-full max-h-[60vh] bg-black"
                  />
                </div>

                {/* Metadata pills */}
                <div className="flex flex-wrap gap-2 text-[11px]">
                  {full.lengthSec != null && (
                    <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                      <span className="text-[#555]">Duration: </span>
                      <span className="text-white font-bold tabular-nums">
                        {Math.floor(full.lengthSec / 60)}:{String(full.lengthSec % 60).padStart(2, "0")}
                      </span>
                    </div>
                  )}
                  <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                    <span className="text-[#555]">Views: </span>
                    <span className="text-white font-bold tabular-nums">{full.views.toLocaleString()}</span>
                  </div>
                  <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                    <span className="text-[#555]">Likes: </span>
                    <span className="text-white font-bold tabular-nums">{full.likes.toLocaleString()}</span>
                  </div>
                  {full.commentCount > 0 && (
                    <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                      <span className="text-[#555]">Comments: </span>
                      <span className="text-white font-bold tabular-nums">{full.commentCount.toLocaleString()}</span>
                    </div>
                  )}
                  {full.isShorts && (
                    <div className="rounded border border-[#c45a3c]/60 bg-[#1f1410] px-3 py-1.5 text-[#c45a3c] font-bold uppercase tracking-wider text-[10px]">
                      Shorts
                    </div>
                  )}
                  {full.isNsfw && (
                    <div className="rounded border border-red-500/60 bg-red-950/30 px-3 py-1.5 text-red-400 font-bold uppercase tracking-wider text-[10px]">
                      NSFW
                    </div>
                  )}
                  {full.dataSet != null && (
                    <div className="rounded border border-[#222] bg-[#111] px-3 py-1.5">
                      <span className="text-[#555]">Set: </span>
                      <span className="text-white font-bold tabular-nums">{full.dataSet}</span>
                    </div>
                  )}
                </div>

                {/* Filename reference */}
                <div className="text-[10px] text-[#555]">
                  File: <span className="text-[#888] font-mono">{full.filename}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5">
            <p className="text-[12px] text-[#777] leading-relaxed whitespace-pre-wrap">{evidence.snippet}</p>
          </div>
        )}
      </div>
    </>
  );

  // Side variant: docked to the right as a split-screen companion. No backdrop.
  // Spans the full right half of the viewport so it sits flush with the
  // NodeDetailCard on the left — no middle gap.
  if (variant === "side") {
    return (
      <div
        data-detail-root
        className="fixed z-[1050] right-4 top-[6vh] bottom-[6vh] rounded-2xl border border-[#2a2a2a] bg-[#0a0a0a]/98 backdrop-blur-md shadow-2xl shadow-black/80 flex flex-col overflow-hidden"
        style={{ left: "50vw" }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    );
  }

  // Fullscreen variant: full modal overlay.
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] shadow-2xl shadow-black/70 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
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
  onViewDetails,
  onDelete,
  onClose,
}: {
  connection: BoardConnection;
  x: number;
  y: number;
  nodes: BoardNode[];
  onViewDetails: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const sourceNode = nodes.find(n => n.id === connection.sourceId);
  const targetNode = nodes.find(n => n.id === connection.targetId);
  const sourceName = sourceNode ? sourceNode.data.name : connection.sourceId;
  const targetName = targetNode ? targetNode.data.name : connection.targetId;
  const pinnedCount = connection.pinnedEvidence?.length ?? 0;

  return (
    <div
      className="absolute z-40"
      style={{
        left: x - 140,
        top: y - 150,
        pointerEvents: "auto",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="w-[280px] rounded-xl border border-[#2a2a2a] bg-[#0a0a0a]/98 backdrop-blur-md p-4 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
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

        {/* Endpoints */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px] font-bold text-white truncate max-w-[100px]">{sourceName}</span>
          <span className="text-red-500/40">↔</span>
          <span className="text-[13px] font-bold text-white truncate max-w-[100px]">{targetName}</span>
        </div>
        <p className="text-[10px] text-[#666] mb-3">{pinnedCount} evidence pinned</p>

        {/* Action buttons */}
        <div className="space-y-2">
          <button
            onClick={() => { onViewDetails(); onClose(); }}
            className="w-full rounded-lg bg-red-600/15 border border-red-500/40 py-3 font-bold text-[12px] uppercase tracking-[0.1em] text-red-300 hover:bg-red-600/25 hover:border-red-500/60 hover:text-red-200 transition"
          >
            View Details
          </button>
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="w-full rounded-lg bg-[#1a1a1a] border border-[#333] py-3 font-bold text-[12px] uppercase tracking-[0.1em] text-[#888] hover:border-red-500/40 hover:bg-red-950/20 hover:text-red-400 transition"
          >
            ✂ Cut Connection
          </button>
        </div>
      </div>
    </div>
  );
}
