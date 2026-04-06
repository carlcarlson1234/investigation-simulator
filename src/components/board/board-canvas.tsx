"use client";

import { forwardRef, useRef, useCallback, useState, useEffect, useImperativeHandle, useMemo } from "react";
import type { BoardNode, BoardEvidenceNode, BoardConnection, FocusState } from "@/lib/board-types";
import type { Person, SearchResult, ArchiveStats, EvidenceType } from "@/lib/types";
import type { InvestigationStep } from "@/lib/investigation-types";
import {
  EVIDENCE_TYPE_ICON,
  EVIDENCE_TYPE_LABEL,
} from "@/lib/board-types";
import { useBoardSounds } from "@/hooks/use-board-sounds";
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

/* ── Public handle so parent can call centerOnNode ──────────────────────── */
export interface BoardCanvasHandle {
  centerOnNode: (nodeId: string) => void;
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
  onAddEvidence: (result: SearchResult, x?: number, y?: number) => void;
  onAddPerson: (personId: string, x?: number, y?: number) => void;
  onStartConnection: (fromId: string) => void;
  onCompleteConnection: (toId: string) => void;
  onDirectConnection?: (fromId: string, toId: string) => void;
  onOpenSubjectView: (personId: string) => void;
  onOpenPhotoView: (photoId: string) => void;
  onUpdateConnection?: (connId: string, updates: Partial<BoardConnection>) => void;
  onDeleteConnection?: (connId: string) => void;
  spotlightFocusState?: { nodeIds: Set<string>; directIds: Set<string>; edgeIds: Set<string> } | null;
  spotlightPulseId?: string | null;
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
    onAddEvidence,
    onAddPerson,
    onStartConnection,
    onCompleteConnection,
    onDirectConnection,
    onOpenSubjectView,
    onOpenPhotoView,
    onUpdateConnection,
    onDeleteConnection,
    spotlightFocusState,
    spotlightPulseId,
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

  const toggleCollapse = useCallback((personId: string, evType: EvidenceType) => {
    const key = `${personId}:${evType}`;
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedGroups(prev => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) next[key] = false;
      return next;
    });
  }, []);

  const hasCollapsed = Object.values(collapsedGroups).some(Boolean);

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
  // Auto-collapse evidence groups with 3+ items
  useEffect(() => {
    const updates: Record<string, boolean> = {};
    for (const [personId, groups] of Object.entries(personEvidenceGroups)) {
      for (const group of groups) {
        const key = `${personId}:${group.type}`;
        if (group.nodes.length >= 3 && collapsedGroups[key] === undefined) {
          updates[key] = true;
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      setCollapsedGroups(prev => ({ ...prev, ...updates }));
    }
  }, [personEvidenceGroups]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const baseW = node.kind === "person" ? 260 : 190;
    const baseH = node.kind === "person" ? 300 : 160;
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

  /* ── Auto-arrange (multiple modes) ───────────────────────────────────── */
  const [isArranging, setIsArranging] = useState(false);
  const [pathPicker, setPathPicker] = useState<{ open: boolean; selected: string[] }>({ open: false, selected: [] });
  const [pathFocus, setPathFocus] = useState<FocusState | null>(null);
  const [pathDrillNode, setPathDrillNode] = useState<string | null>(null);
  const [showAllInCompare, setShowAllInCompare] = useState(false);
  const [hideOrphans, setHideOrphans] = useState(true);
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
      const baseW = node.kind === "person" ? 260 : 190;
      const baseH = node.kind === "person" ? 300 : 160;
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
      playSound("pickup");
      dragVelocityRef.current = { vx: 0, vy: 0, lastX: e.clientX, lastY: e.clientY };
      dragRotationRef.current = 0;
      repelOffsetsRef.current = {};
    },
    [nodes, zoom, onSelectNode, playSound]
  );

  useEffect(() => {
    if (!dragState) return;
    const REPEL_RADIUS = 80;
    const REPEL_STRENGTH = 8;
    const onMove = (e: MouseEvent) => {
      const vp = viewportRef.current;
      if (!vp) return;
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

      // Repel nearby cards (accounting for importance scaling)
      const dragged = nodesRef.current.find(n => n.id === dragState.nodeId);
      if (dragged) {
        const ds = getScaledCardSize(dragged);
        const dcx = nx + ds.w / 2;
        const dcy = ny + ds.h / 2;
        const offsets: Record<string, { dx: number; dy: number }> = {};
        for (const other of nodesRef.current) {
          if (other.id === dragState.nodeId) continue;
          const os = getScaledCardSize(other);
          const ow = os.w;
          const ocx = other.position.x + ow / 2;
          const ocy = other.position.y + os.h / 2;
          const ddx = ocx - dcx;
          const ddy = ocy - dcy;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy);
          const minDist = (ds.w + ow) / 2 + REPEL_RADIUS;
          if (dist < minDist && dist > 0) {
            const force = ((minDist - dist) / minDist) * REPEL_STRENGTH;
            offsets[other.id] = { dx: (ddx / dist) * force, dy: (ddy / dist) * force };
          }
        }
        repelOffsetsRef.current = offsets;
      }
    };
    const onUp = () => {
      // Nudge if overlapping another card (accounting for importance scaling)
      const dragged = nodes.find(n => n.id === dragState.nodeId);
      if (dragged) {
        const PAD = 20;
        const ds = getScaledCardSize(dragged);
        const dw = ds.w;
        const dh = ds.h;
        let { x, y } = dragged.position;
        let nudged = false;
        for (const other of nodes) {
          if (other.id === dragState.nodeId) continue;
          const os = getScaledCardSize(other);
          const ow = os.w;
          const oh = os.h;
          if (x < other.position.x + ow + PAD && x + dw + PAD > other.position.x &&
              y < other.position.y + oh + PAD && y + dh + PAD > other.position.y) {
            const overlapR = (x + dw + PAD) - other.position.x;
            const overlapL = (other.position.x + ow + PAD) - x;
            const overlapD = (y + dh + PAD) - other.position.y;
            const overlapU = (other.position.y + oh + PAD) - y;
            const minOverlap = Math.min(overlapR, overlapL, overlapD, overlapU);
            if (minOverlap === overlapR) x -= overlapR;
            else if (minOverlap === overlapL) x += overlapL;
            else if (minOverlap === overlapD) y -= overlapD;
            else y += overlapU;
            nudged = true;
          }
        }
        if (nudged) onMoveNode(dragState.nodeId, Math.max(0, x), Math.max(0, y));

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

        let droppedId: string | null = null;
        if (parsed.kind === "person") {
          onAddPerson(parsed.id, x, y);
          droppedId = parsed.id;
          if (firstPlacementMode && onFirstPlacement) {
            onFirstPlacement(parsed.id);
          }
        } else if (parsed.kind === "evidence" && parsed.data) {
          onAddEvidence(parsed.data as SearchResult, x, y);
          droppedId = parsed.data.id ?? parsed.id;
        }
        // Bounce + ripple + sound for intake drops
        if (droppedId) {
          playSound("drop");
          setJustDroppedNodeId(droppedId);
          setDropRipple({ x: x + 90, y: y + 45 });
          setTimeout(() => setJustDroppedNodeId(null), 300);
          setTimeout(() => setDropRipple(null), 350);
        }
      } catch { /* ignore */ }
    },
    [zoom, onAddEvidence, onAddPerson, firstPlacementMode, onFirstPlacement, playSound]
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

        {/* ── Show Unconnected toggle (top-right of board) ─────────────── */}
        {orphanNodeIds.size > 0 && (
          <button
            onClick={() => { setHideOrphans(h => !h); setTimeout(() => zoomFit(), 350); }}
            className={`absolute top-3 right-3 z-40 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition shadow-lg shadow-black/40 ${
              !hideOrphans
                ? "border-red-500/40 bg-red-600/15 text-red-400 hover:bg-red-600/25"
                : "border-[#2a2a2a] bg-[#141414]/90 text-[#666] hover:bg-[#222] hover:text-white"
            } backdrop-blur-sm`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {!hideOrphans
                ? <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></>
              }
            </svg>
            {hideOrphans ? "Unconnected" : "Unconnected"}
            <span className="rounded bg-[#333] px-1 py-0 text-[9px] font-bold text-[#777]">{orphanNodeIds.size}</span>
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
                    const hasPulse = spotlightPulseId ? bundleConns.some(c => c.sourceId === spotlightPulseId || c.targetId === spotlightPulseId) : false;
                    const hasSelected = bundleConns.some(c => c.id === selectedConnectionId);
                    const anyVis = bundleConns.map(c => getEdgeVis(c.id));
                    const hasHighlight = anyVis.includes("highlight");
                    const allFaded = anyVis.every(v => v === "faded");
                    const maxStrength = Math.max(...bundleConns.map(c => c.strength));

                    const lineColor = hasNew ? "#4ade80" : hasSelected ? "#f87171" : "#ef4444";
                    const dotColor = hasNew ? "#4ade80" : "#ef4444";
                    const lineFilter = hasNew ? "url(#string-glow-green)" : hasSelected ? "url(#string-glow-strong)" : hasHighlight ? "url(#string-glow)" : "url(#string-glow)";

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
                        {/* Invisible fat hit area for clicking */}
                        <path
                          d={curvePath}
                          stroke="transparent"
                          strokeWidth={20}
                          fill="none"
                          style={{ pointerEvents: "stroke", cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedConnectionId(primary.id === selectedConnectionId ? null : primary.id);
                            onSelectNode(null);
                          }}
                        />
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
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (node.kind === "person") onOpenSubjectView(node.id);
                      else if (node.kind === "evidence" && node.evidenceType === "photo") onOpenPhotoView(node.id);
                      else onFocusNode(node.id);
                    }}
                  >
                    {/* Evidence collapse tabs — top of person cards */}
                    {node.kind === "person" && zoom >= 0.6 && (() => {
                      const groups = personEvidenceGroups[node.id] || [];
                      const tabs = groups.filter(g => g.nodes.length >= 2);
                      if (tabs.length === 0) return null;
                      const icons: Record<string, string> = { email: "✉️", document: "📄", photo: "📸", imessage: "💬" };
                      return (
                        <div className="absolute -top-5 left-0 right-0 flex items-center justify-center gap-1 z-30 pointer-events-none">
                          {tabs.map(g => {
                            const key = `${node.id}:${g.type}`;
                            const isCollapsed = collapsedGroups[key];
                            return (
                              <button
                                key={g.type}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleCollapse(node.id, g.type); }}
                                style={{ pointerEvents: "auto" }}
                                className={`flex items-center gap-0.5 rounded-t px-1.5 py-0.5 text-[8px] font-bold transition ${
                                  isCollapsed
                                    ? "bg-red-600/20 text-red-400 border border-b-0 border-red-500/30"
                                    : "bg-[#1a1a1a] text-[#555] border border-b-0 border-[#333] hover:text-[#888]"
                                }`}
                                title={isCollapsed ? `Show ${g.nodes.length} ${g.type}s` : `Hide ${g.nodes.length} ${g.type}s`}
                              >
                                <span className="text-[9px]">{icons[g.type] || "📄"}</span>
                                <span>{g.nodes.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {node.kind === "person" ? (
                      <PersonCard data={node.data} isSelected={selectedNodeId === node.id}
                        connectedEvidence={personEvidenceCounts[node.id]}
                        evidenceGroups={
                          (personEvidenceGroups[node.id] || []).map(g => ({ type: g.type, count: g.nodes.length }))
                        }
                        collapsedGroups={collapsedGroups}
                        onToggleCollapse={(evType) => toggleCollapse(node.id, evType)}
                        onFocus={() => onFocusNode(node.id)}
                        zoom={zoom} />
                    ) : (
                      <EvidenceCard data={node.data} evidenceType={node.evidenceType} isSelected={selectedNodeId === node.id}
                        onFocus={() => onFocusNode(node.id)}
                        zoom={zoom} />
                    )}
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
                  const photos = nodes.filter(n => n.kind === "evidence" && (n as BoardEvidenceNode).evidenceType === "photo");
                  const other = nodes.filter(n => n.kind === "evidence" && (n as BoardEvidenceNode).evidenceType !== "photo");
                  const groups = [
                    { label: "People", items: people },
                    { label: "Photos", items: photos },
                    { label: "Evidence", items: other },
                  ].filter(g => g.items.length > 0);

                  const renderItem = (n: BoardNode) => {
                    const picked = pathPicker.selected.includes(n.id);
                    const label = n.kind === "person" ? n.data.name : n.data.title;
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
    </div>
  );
});

// ─── Person Card (large suspect dossier card) ──────────────────────────────

function PersonCard({ data, isSelected, onFocus, connectedEvidence, evidenceGroups, collapsedGroups, onToggleCollapse, zoom = 1 }: {
  data: Person; isSelected: boolean; onFocus: () => void;
  connectedEvidence?: { emails: number; documents: number; photos: number; total: number };
  evidenceGroups?: { type: EvidenceType; count: number }[];
  collapsedGroups?: Record<string, boolean>;
  onToggleCollapse?: (evType: EvidenceType) => void;
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

function EvidenceCard({ data, evidenceType, isSelected, onFocus, zoom = 1 }: {
  data: SearchResult; evidenceType: EvidenceType; isSelected: boolean; onFocus: () => void; zoom?: number;
}) {
  const [imgError, setImgError] = useState(false);

  // Mini card at low zoom
  if (zoom < 0.6) {
    const typeAccent = evidenceType === "email" ? "border-l-[#4A6D8C]"
      : evidenceType === "imessage" ? "border-l-[#6B5B95]"
      : evidenceType === "document" ? "border-l-[#555]"
      : "border-l-transparent";
    if (evidenceType === "photo") {
      const thumbUrl = `${PHOTO_CDN}/cdn-cgi/image/width=500,quality=80,format=auto/photos-deboned/${data.id}`;
      return (
        <div className={`board-evidence-card w-[220px] rounded-xl bg-[#111] border overflow-hidden cursor-grab active:cursor-grabbing ${
          isSelected ? "shadow-xl shadow-red-600/15 border-red-500/30" : "shadow-lg shadow-black/50 border-[#2a2a2a]"
        }`}>
          <div className="relative bg-[#0a0a0a]" style={{ minHeight: imgError ? 80 : 200 }}>
            {!imgError ? (
              <img src={thumbUrl} alt={data.snippet || data.title} loading="lazy" className="w-full object-cover" style={{ maxHeight: 320 }}
                onError={() => setImgError(true)} />
            ) : (
              <div className="flex items-center justify-center h-20">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-[#333]">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
            )}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-red-500 bg-[#141414] z-10" />
          </div>
          <div className="px-2.5 py-1.5">
            <h4 className="text-[11px] font-bold leading-tight text-[#888] truncate">{data.title}</h4>
          </div>
        </div>
      );
    }
    return (
      <div className={`board-evidence-card flex items-center gap-1 rounded bg-[#141414] border border-[#2a2a2a] border-l-2 ${typeAccent} px-1.5 py-1 cursor-grab active:cursor-grabbing`}
        style={{ width: 110 }}>
        <span className="text-[10px] shrink-0">{EVIDENCE_TYPE_ICON[evidenceType]}</span>
        <span className="text-[9px] text-white truncate">{data.title}</span>
      </div>
    );
  }

  // Photo evidence gets a big image card
  if (evidenceType === "photo") {
    const thumbnailUrl = `${PHOTO_CDN}/cdn-cgi/image/width=500,quality=80,format=auto/photos-deboned/${data.id}`;
    return (
      <div className={`board-evidence-card w-[220px] rounded-xl bg-[#111] border overflow-hidden cursor-grab active:cursor-grabbing ${
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

        {/* Caption area — compact */}
        <div className="px-2.5 py-1.5">
          <h4 className="text-[11px] font-bold leading-tight text-[#888] truncate">{data.title}</h4>
        </div>
      </div>
    );
  }

  // Non-photo evidence (email, document, imessage) — type-specific left accent
  const typeAccent = evidenceType === "email" ? "border-l-2 border-l-[#4A6D8C]"
    : evidenceType === "imessage" ? "border-l-2 border-l-[#6B5B95]"
    : evidenceType === "document" ? "border-l-2 border-l-[#555]"
    : "";
  return (
    <div className={`board-evidence-card w-[170px] rounded-lg bg-[#141414] border border-[#2a2a2a] ${typeAccent} p-2.5 pt-3 cursor-grab active:cursor-grabbing ${
      isSelected ? "shadow-xl shadow-red-600/15 border-red-500/30" : "shadow-lg shadow-black/50"
    }`}>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-sm">{EVIDENCE_TYPE_ICON[evidenceType]}</span>
        <span className="text-[9px] font-black uppercase tracking-[0.12em] text-[#666]">
          {EVIDENCE_TYPE_LABEL[evidenceType]}
        </span>
      </div>
      <h4 className="text-[12px] font-bold leading-tight text-white line-clamp-2">{data.title}</h4>
      {data.date && <p className="mt-0.5 text-[10px] font-bold text-[#555] tabular-nums">{data.date}</p>}
      {data.sender && <p className="mt-0.5 text-[10px] text-[#555] truncate">{data.sender}</p>}
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
  onDelete,
  onClose,
}: {
  connection: BoardConnection;
  x: number;
  y: number;
  nodes: BoardNode[];
  onUpdate: (updates: Partial<BoardConnection>) => void;
  onDelete: () => void;
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

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              onUpdate({ note: noteText || undefined, strength });
              onClose();
            }}
            className="flex-1 rounded-lg bg-red-600/20 border border-red-600/30 py-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-red-400 hover:bg-red-600/30 hover:text-red-300 transition"
          >
            Save
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg bg-[#1a1a1a] border border-[#333] px-4 py-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-[#666] hover:border-red-600/40 hover:bg-red-600/10 hover:text-red-400 transition"
            title="Cut this connection"
          >
            ✂ Cut
          </button>
        </div>
      </div>
    </div>
  );
}
