"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Person, SearchResult, ArchiveStats, EmailEvidence, EvidenceFolderItem } from "@/lib/types";
import type {
  BoardNode,
  BoardConnection,
  BoardFlightNodeData,
  BoardMediaNodeData,
  RightPanelTab,
  FocusState,
  PinnedEvidence,
} from "@/lib/board-types";
import { IntakePanel } from "./intake-panel";
import { BoardCanvas } from "./board-canvas";
import type { BoardCanvasHandle } from "./board-canvas";
import { ContextPanel } from "./context-panel";
import { SubjectFocusView } from "./subject-focus-view";
import { PhotoFocusView } from "./photo-focus-view";
import { EvidenceTray } from "./evidence-folder";
import { InvestigationOverlay } from "./investigation-overlay";
import { useInvestigation } from "@/hooks/use-investigation";
import { loadBoardState, useBoardPersistence } from "@/hooks/use-board-persistence";
import { LEAD_CATALOG } from "@/lib/lead-definitions";
import { LeadsModal } from "./leads-modal";
import { FocusedInvestigation } from "./focused-investigation";
import type { InvestigationResult } from "./focused-investigation";
import type { SeedEntity } from "@/lib/entity-seed-data";

interface BoardWorkspaceProps {
  archiveTitle: string;
  people: Person[];
  stats: ArchiveStats;
  urlMode?: string | null;
}

export function BoardWorkspace({
  archiveTitle,
  people,
  stats,
  urlMode,
}: BoardWorkspaceProps) {
  // ─── Restore saved state (lazy initializers — run once on mount) ────────
  const [saved] = useState(() => loadBoardState());

  // ─── Board State ─────────────────────────────────────────────────────────
  const [boardNodes, setBoardNodes] = useState<BoardNode[]>(() => saved?.nodes ?? []);
  const [boardConnections, setBoardConnections] = useState<BoardConnection[]>(() => saved?.connections ?? []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightPanelTab>("persons");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedEmailDetail, setSelectedEmailDetail] = useState<EmailEvidence | null>(null);
  const [subjectFocusPersonId, setSubjectFocusPersonId] = useState<string | null>(null);
  const [photoFocusId, setPhotoFocusId] = useState<string | null>(null);

  // ─── Evidence Folder State ──────────────────────────────────────────────
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderItems, setFolderItems] = useState<EvidenceFolderItem[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [seenEvidenceIds, setSeenEvidenceIds] = useState<Set<string>>(() => {
    const saved_seen = saved?.seenEvidenceIds;
    return saved_seen ? new Set(saved_seen) : new Set();
  });

  // ─── Leads System ────────────────────────────────────────────────────────
  const [leadsModalOpen, setLeadsModalOpen] = useState(false);
  const [focusInvestigationPersonId, setFocusInvestigationPersonId] = useState<string | null>(null);
  const [completedLeadIds, setCompletedLeadIds] = useState<Set<string>>(new Set());
  const [reintegratingIds, setReintegratingIds] = useState<Set<string>>(new Set());
  const [reintegrationNotification, setReintegrationNotification] = useState(false);
  const [newLeadIndicator, setNewLeadIndicator] = useState(false);

  // ─── Spotlight (multi-select person filter) ──────────────────────────────
  const [spotlightPersonIds, setSpotlightPersonIds] = useState<Set<string>>(new Set());
  const [spotlightPulseId, setSpotlightPulseId] = useState<string | null>(null);

  const toggleSpotlight = useCallback((personId: string) => {
    setSpotlightPersonIds(prev => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
        // Pulse animation for newly added person
        setSpotlightPulseId(personId);
        setTimeout(() => setSpotlightPulseId(null), 400);
      }
      return next;
    });
  }, []);

  const clearSpotlight = useCallback(() => {
    setSpotlightPersonIds(new Set());
  }, []);

  const spotlightEntity = useCallback((entity: SeedEntity) => {
    // Find people on board whose names match the entity's keyPeople
    const matchingIds = new Set<string>();
    for (const node of boardNodes) {
      if (node.kind === "person") {
        const nameMatch = entity.keyPeople.some(
          kp => kp.toLowerCase() === node.data.name.toLowerCase()
        );
        if (nameMatch) matchingIds.add(node.id);
      }
    }
    if (matchingIds.size > 0) {
      setSpotlightPersonIds(matchingIds);
    }
  }, [boardNodes]);

  // Compute spotlight focus state from multi-selected people
  const spotlightFocusState = useMemo(() => {
    if (spotlightPersonIds.size === 0) return null;

    const directIds = new Set<string>();
    const edgeIds = new Set<string>();

    for (const conn of boardConnections) {
      const sourceIn = spotlightPersonIds.has(conn.sourceId);
      const targetIn = spotlightPersonIds.has(conn.targetId);
      if (sourceIn || targetIn) {
        edgeIds.add(conn.id);
        if (sourceIn) directIds.add(conn.targetId);
        if (targetIn) directIds.add(conn.sourceId);
      }
    }

    // Remove spotlight people from directIds (they're "focused", not "direct")
    for (const id of spotlightPersonIds) directIds.delete(id);

    return { nodeIds: spotlightPersonIds, directIds, edgeIds };
  }, [spotlightPersonIds, boardConnections]);

  // Reference to the canvas component's imperative handle for centering
  const canvasRef = useRef<BoardCanvasHandle>(null);

  // ─── Investigation Flow ─────────────────────────────────────────────────
  const investigation = useInvestigation(boardNodes, boardConnections, people, saved?.mode, urlMode);
  const { autoDetectCompletion } = investigation as ReturnType<typeof useInvestigation> & { autoDetectCompletion: boolean };

  // Auto-advance when step conditions are met
  useEffect(() => {
    if (autoDetectCompletion && investigation.isStartMode) {
      // Small delay so the user sees the confirmation
      const t = setTimeout(() => investigation.advanceStep(), 800);
      return () => clearTimeout(t);
    }
  }, [autoDetectCompletion, investigation.isStartMode]);

  // ─── Persist board state to sessionStorage ──────────────────────────────
  useBoardPersistence(boardNodes, boardConnections, investigation.mode, seenEvidenceIds);

  // ─── Focus computation ───────────────────────────────────────────────────

  const focusState = useMemo<FocusState | null>(() => {
    if (!focusedNodeId) return null;

    const directIds = new Set<string>();
    const edgeIds = new Set<string>();

    for (const conn of boardConnections) {
      if (conn.sourceId === focusedNodeId || conn.targetId === focusedNodeId) {
        edgeIds.add(conn.id);
        const otherId = conn.sourceId === focusedNodeId ? conn.targetId : conn.sourceId;
        directIds.add(otherId);
      }
    }

    const secondIds = new Set<string>();
    for (const directId of directIds) {
      for (const conn of boardConnections) {
        if (conn.sourceId === directId || conn.targetId === directId) {
          const otherId = conn.sourceId === directId ? conn.targetId : conn.sourceId;
          if (otherId !== focusedNodeId && !directIds.has(otherId)) {
            secondIds.add(otherId);
          }
        }
      }
    }

    return { nodeId: focusedNodeId, directIds, secondIds, edgeIds };
  }, [focusedNodeId, boardConnections]);

  // ─── Center board on focused node ────────────────────────────────────────

  const centerOnNode = useCallback((nodeId: string) => {
    canvasRef.current?.centerOnNode(nodeId);
  }, []);

  // First-placement callback - node already at drop position, no scroll needed
  const handleFirstPlacement = useCallback((_nodeId: string) => {
    // Card lands where the user dropped it, no centering needed
  }, []);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const isOnBoard = useCallback(
    (id: string) => {
      if (boardNodes.some((n) => n.id === id)) return true;
      for (const n of boardNodes) {
        if (n.pinnedEvidence?.some((e) => e.id === id)) return true;
      }
      for (const c of boardConnections) {
        if (c.pinnedEvidence?.some((e) => e.id === id)) return true;
      }
      return false;
    },
    [boardNodes, boardConnections]
  );

  // Keep a ref to current nodes for overlap checks (avoids stale closure)
  const boardNodesRef = useRef(boardNodes);
  boardNodesRef.current = boardNodes;

  // Nudge a drop position so the new card doesn't overlap existing nodes
  const findClearPosition = useCallback((x: number, y: number, w: number, h: number): { x: number; y: number } => {
    const PAD = 20;
    const currentNodes = boardNodesRef.current;
    const overlaps = (tx: number, ty: number) =>
      currentNodes.some(n => {
        const nw = n.kind === "person" ? 260 : 190;
        const nh = n.kind === "person" ? 300 : 160;
        return tx < n.position.x + nw + PAD && tx + w + PAD > n.position.x &&
               ty < n.position.y + nh + PAD && ty + h + PAD > n.position.y;
      });
    if (!overlaps(x, y)) return { x, y };
    // Spiral outward checking 12 angles per ring
    for (let r = 1; r <= 12; r++) {
      const dist = (w + PAD) * r * 0.6;
      for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * Math.PI * 2;
        const nx = Math.max(0, x + Math.cos(angle) * dist);
        const ny = Math.max(0, y + Math.sin(angle) * dist);
        if (!overlaps(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x: x + w + PAD, y };
  }, []);

  const addPersonToBoard = useCallback(
    (personId: string, dropX?: number, dropY?: number) => {
      if (isOnBoard(personId)) return;
      const person = people.find((p) => p.id === personId);
      if (!person) return;

      const raw = { x: dropX ?? 200 + Math.random() * 400, y: dropY ?? 100 + Math.random() * 300 };
      const { x, y } = findClearPosition(raw.x, raw.y, 260, 300);

      setBoardNodes((prev) => [
        ...prev,
        { kind: "person", id: personId, data: person, position: { x, y } },
      ]);
    },
    [people, isOnBoard, findClearPosition]
  );

  // Legacy "+ Add to Board" buttons — no-op in the new pin model.
  // Evidence must be dragged onto a specific card or connection.
  const noopAddEvidence = useCallback((_result: SearchResult, _x?: number, _y?: number) => {
    // TODO: toast "Drag evidence onto a card or connection to pin it"
  }, []);

  // Pin evidence to an entity card
  const pinEvidenceToCard = useCallback(
    (cardId: string, result: SearchResult) => {
      setBoardNodes((prev) =>
        prev.map((n) => {
          if (n.id !== cardId) return n;
          const existing = n.pinnedEvidence || [];
          if (existing.some((e) => e.id === result.id)) return n;
          const pinned: PinnedEvidence = {
            id: result.id,
            type: result.type,
            title: result.title,
            snippet: result.snippet,
            date: result.date,
            sender: result.sender,
            starCount: result.starCount,
          };
          return { ...n, pinnedEvidence: [...existing, pinned] };
        })
      );
    },
    []
  );

  // Pin evidence to a connection — strength = pinnedEvidence.length
  const pinEvidenceToConnection = useCallback(
    (connId: string, result: SearchResult) => {
      setBoardConnections((prev) =>
        prev.map((c) => {
          if (c.id !== connId) return c;
          const existing = c.pinnedEvidence || [];
          if (existing.some((e) => e.id === result.id)) return c;
          const pinned: PinnedEvidence = {
            id: result.id,
            type: result.type,
            title: result.title,
            snippet: result.snippet,
            date: result.date,
            sender: result.sender,
            starCount: result.starCount,
          };
          const next = [...existing, pinned];
          return { ...c, pinnedEvidence: next, strength: next.length };
        })
      );
    },
    []
  );

  const addEntityToBoard = useCallback(
    (entity: SeedEntity, dropX?: number, dropY?: number) => {
      if (isOnBoard(entity.id)) return;

      const raw = { x: dropX ?? 200 + Math.random() * 400, y: dropY ?? 100 + Math.random() * 300 };
      const { x, y } = findClearPosition(raw.x, raw.y, 220, 180);

      setBoardNodes((prev) => [
        ...prev,
        {
          kind: "entity",
          id: entity.id,
          entityType: entity.type,
          data: entity,
          position: { x, y },
        },
      ]);
    },
    [isOnBoard, findClearPosition]
  );

  const addFlightToBoard = useCallback(
    (
      data: BoardFlightNodeData,
      autoPinnedEvidence: PinnedEvidence,
      dropX?: number,
      dropY?: number,
    ) => {
      // Flight entity ids are shared with the flight_log evidence ids (1:1),
      // so we cannot use the generic isOnBoard() here — it would treat a
      // flight_log already pinned as evidence as "the flight entity is on
      // the board." Scope the check to flight nodes only.
      if (boardNodes.some((n) => n.kind === "flight" && n.id === autoPinnedEvidence.id)) return;

      const raw = { x: dropX ?? 200 + Math.random() * 400, y: dropY ?? 100 + Math.random() * 300 };
      const { x, y } = findClearPosition(raw.x, raw.y, 210, 160);

      setBoardNodes((prev) => [
        ...prev,
        {
          kind: "flight",
          id: autoPinnedEvidence.id,
          data,
          position: { x, y },
          // Auto-pin the flight log as the flight entity's starting evidence.
          pinnedEvidence: [autoPinnedEvidence],
        },
      ]);
    },
    [boardNodes, findClearPosition]
  );

  const addMediaToBoard = useCallback(
    (
      data: BoardMediaNodeData,
      autoPinnedEvidence: PinnedEvidence,
      dropX?: number,
      dropY?: number,
    ) => {
      // Media node id === the source photo/video id (1:1). Scope the
      // existence guard to media nodes only — photo/video id may also be
      // pinned as evidence elsewhere, and that should not block creating
      // the standalone investigation card.
      if (boardNodes.some((n) => n.kind === "media" && n.id === autoPinnedEvidence.id)) return;

      const raw = { x: dropX ?? 200 + Math.random() * 400, y: dropY ?? 100 + Math.random() * 300 };
      const { x, y } = findClearPosition(raw.x, raw.y, 180, 160);

      setBoardNodes((prev) => [
        ...prev,
        {
          kind: "media",
          id: autoPinnedEvidence.id,
          data,
          position: { x, y },
          pinnedEvidence: [autoPinnedEvidence],
        },
      ]);
    },
    [boardNodes, findClearPosition]
  );

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setBoardNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, position: { x, y } } : n))
    );
  }, []);

  const batchMoveNodes = useCallback((moves: Record<string, { x: number; y: number }>) => {
    setBoardNodes((prev) =>
      prev.map((n) => moves[n.id] ? { ...n, position: moves[n.id] } : n)
    );
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const focusNode = useCallback((id: string | null) => {
    setFocusedNodeId((prev) => {
      const newId = prev === id ? null : id;
      if (newId) {
        requestAnimationFrame(() => centerOnNode(newId));
      }
      return newId;
    });
  }, [centerOnNode]);

  const openSubjectView = useCallback((personId: string) => {
    setSubjectFocusPersonId(personId);
  }, []);

  const closeSubjectView = useCallback(() => {
    setSubjectFocusPersonId(null);
  }, []);

  const openPhotoView = useCallback((photoId: string) => {
    setPhotoFocusId(photoId);
  }, []);

  const closePhotoView = useCallback(() => {
    setPhotoFocusId(null);
  }, []);

  // ─── Leads helpers ──────────────────────────────────────────────────
  const boardPeople = useMemo(
    () => boardNodes.filter((n): n is Extract<typeof n, { kind: "person" }> => n.kind === "person").map((n) => n.data),
    [boardNodes],
  );

  const handleFocusedInvestigation = useCallback((personId: string) => {
    setLeadsModalOpen(false);
    setFocusInvestigationPersonId(personId);
  }, []);

  const handleFocusInvestigationComplete = useCallback(
    (result: InvestigationResult) => {
      // Close focus mode
      setFocusInvestigationPersonId(null);

      // Mark lead as completed
      const leadId = `focus-${result.personId}`;
      setCompletedLeadIds((prev) => {
        const next = new Set(prev);
        next.add(leadId);
        return next;
      });

      // TODO: re-implement focused-investigation reintegration for pinned evidence.
      // For now, we only add new connections (no evidence nodes).
      const allNewIds = new Set<string>();
      const connectionDelay = 200;
      result.newConnections.forEach((nc, i) => {
        allNewIds.add(nc.id);
        setTimeout(() => {
          setBoardConnections((prev) => {
            if (prev.some((c) => c.id === nc.id)) return prev;
            return [...prev, nc];
          });
        }, connectionDelay + i * 400);
      });

      // Track reintegrating IDs for glow animations
      setReintegratingIds(allNewIds);

      // Show notification after all animations
      const totalDelay = connectionDelay + result.newConnections.length * 400 + 200;
      setTimeout(() => {
        setReintegrationNotification(true);
        setTimeout(() => setReintegrationNotification(false), 4000);
      }, totalDelay);

      // Clear evidence green glow after 30s
      setTimeout(() => setReintegratingIds(new Set()), 30000);

      // Flash "NEW" on leads button
      setNewLeadIndicator(true);
      setTimeout(() => setNewLeadIndicator(false), 5000);
    },
    [findClearPosition],
  );

  const startConnection = useCallback((fromId: string) => {
    setConnectingFrom(fromId);
  }, []);

  const completeConnection = useCallback(
    (toId: string) => {
      if (!connectingFrom || connectingFrom === toId) {
        setConnectingFrom(null);
        return;
      }

      const exists = boardConnections.some(
        (c) =>
          (c.sourceId === connectingFrom && c.targetId === toId) ||
          (c.sourceId === toId && c.targetId === connectingFrom)
      );

      if (!exists) {
        setBoardConnections((prev) => [
          ...prev,
          {
            id: `manual-${Date.now()}`,
            sourceId: connectingFrom,
            targetId: toId,
            type: "manual" as const,
            label: "Manual connection",
            strength: 3,
            verified: false,
          },
        ]);
      }

      setConnectingFrom(null);
    },
    [connectingFrom, boardConnections]
  );

  // Direct connection — used by drag-to-connect (bypasses two-step connectingFrom)
  const directConnection = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const exists = boardConnections.some(
        (c) =>
          (c.sourceId === fromId && c.targetId === toId) ||
          (c.sourceId === toId && c.targetId === fromId)
      );
      if (!exists) {
        setBoardConnections((prev) => [
          ...prev,
          {
            id: `manual-${Date.now()}`,
            sourceId: fromId,
            targetId: toId,
            type: "manual" as const,
            label: "Manual connection",
            strength: 3,
            verified: false,
          },
        ]);
      }
    },
    [boardConnections]
  );

  const updateConnection = useCallback(
    (connId: string, updates: Partial<BoardConnection>) => {
      setBoardConnections((prev) =>
        prev.map((c) => (c.id === connId ? { ...c, ...updates } : c))
      );
    },
    []
  );

  // Undo state for recently-cut connections
  const [recentlyCut, setRecentlyCut] = useState<BoardConnection | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deleteConnection = useCallback(
    (connId: string) => {
      setBoardConnections((prev) => {
        const target = prev.find((c) => c.id === connId);
        if (target) {
          setRecentlyCut(target);
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          undoTimerRef.current = setTimeout(() => setRecentlyCut(null), 6000);
        }
        return prev.filter((c) => c.id !== connId);
      });
    },
    []
  );

  const undoCut = useCallback(() => {
    if (!recentlyCut) return;
    setBoardConnections((prev) => {
      if (prev.some((c) => c.id === recentlyCut.id)) return prev;
      return [...prev, recentlyCut];
    });
    setRecentlyCut(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [recentlyCut]);

  // ─── Evidence Folder ─────────────────────────────────────────────────────

  const fetchEvidenceFolder = useCallback(async () => {
    setFolderLoading(true);
    try {
      const personIds = boardNodes
        .filter((n) => n.kind === "person")
        .map((n) => n.id);

      const res = await fetch("/api/evidence-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personIds,
          excludeIds: Array.from(seenEvidenceIds),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setFolderItems(data.items);
        setSeenEvidenceIds((prev) => {
          const next = new Set(prev);
          for (const item of data.items) next.add(item.id);
          return next;
        });
        setFolderOpen(true);
      }
    } catch (err) {
      console.error("Failed to fetch evidence folder:", err);
    } finally {
      setFolderLoading(false);
    }
  }, [boardNodes, seenEvidenceIds]);

  const handleEvidencePack = useCallback(() => {
    setLeadsModalOpen(false);
    fetchEvidenceFolder();
  }, [fetchEvidenceFolder]);

  const addFolderItemToBoard = useCallback(
    (item: EvidenceFolderItem) => {
      // TODO: rework evidence folder to pin to entities/connections instead of creating nodes
      setFolderItems((prev) => {
        const next = prev.filter((i) => i.id !== item.id);
        if (next.length === 0) setTimeout(() => setFolderOpen(false), 300);
        return next;
      });
    },
    []
  );

  const dismissFolderItem = useCallback((itemId: string) => {
    setFolderItems((prev) => {
      const next = prev.filter((i) => i.id !== itemId);
      if (next.length === 0) setTimeout(() => setFolderOpen(false), 300);
      return next;
    });
  }, []);

  // ─── Selected node ──────────────────────────────────────────────────────

  const selectedNode = boardNodes.find((n) => n.id === selectedNodeId) ?? null;

  // Node selection no longer switches tabs — details show as floating card on the canvas

  // ─── Email selection from inbox ───────────────────────────────────────────

  const handleSelectEmail = useCallback(async (emailId: string) => {
    setSelectedEmailId(emailId);
    // Fetch full email detail
    try {
      const res = await fetch(`/api/evidence/${emailId}?type=email`);
      if (res.ok) {
        const data = await res.json();
        setSelectedEmailDetail(data);
      }
    } catch (err) {
      console.error("Failed to fetch email detail:", err);
    }
  }, []);

  // ─── Test Board ─────────────────────────────────────────────────────────
  const loadTestBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/test-board");
      if (!res.ok) return;
      const data = await res.json();
      if (data.nodes && data.connections) {
        setBoardNodes(data.nodes);
        setBoardConnections(data.connections);
        setSelectedNodeId(null);
        setFocusedNodeId(null);
        setConnectingFrom(null);
      }
    } catch (err) {
      console.error("Failed to load test board:", err);
    }
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────

  // Investigation-mode suggested people (for right panel)
  const suggestedPeople = useMemo(() => {
    if (investigation.suggestedPeopleIds.length === 0) return undefined;
    return people.filter(p => investigation.suggestedPeopleIds.includes(p.id));
  }, [investigation.suggestedPeopleIds, people]);

  // Panel visibility — progressive reveal during onboarding
  const STEP_ORDER_INDEX: Record<string, number> = {
    "place-epstein": 0, "place-evidence": 1, "pick-person": 2,
    "create-connection": 3, "connection-confirmed": 4, "tutorial-complete": 5, "open-investigation": 6,
  };
  const stepIdx = investigation.isStartMode ? (STEP_ORDER_INDEX[investigation.step] ?? 6) : 6;
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // ─── Resizable Evidence Panel + Evidence-Focus Mode ──────────────────────
  const [leftPanelWidth, setLeftPanelWidth] = useState(230);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(230);
  const containerRef = useRef<HTMLDivElement>(null);

  // Evidence-focus mode: activates when panel > 40% of screen
  const FOCUS_THRESHOLD = 0.40;
  const evidenceFocusMode = !leftCollapsed && containerRef.current
    ? leftPanelWidth / containerRef.current.clientWidth >= FOCUS_THRESHOLD
    : leftPanelWidth >= 600; // fallback before first render

  // Resize drag handlers
  useEffect(() => {
    if (!isResizingLeft) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX.current;
      const newW = Math.max(230, Math.min(resizeStartW.current + delta, window.innerWidth * 0.65));
      setLeftPanelWidth(newW);
    };
    const onUp = () => {
      setIsResizingLeft(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizingLeft]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartW.current = leftPanelWidth;
    setIsResizingLeft(true);
  }, [leftPanelWidth]);

  // ─── Resizable Entities Panel (right) ───────────────────────────────────
  const [rightPanelWidth, setRightPanelWidth] = useState(230);
  // Wide mode: entities panel scales up cards when wider than 350px
  const entitiesWideMode = !rightCollapsed && rightPanelWidth >= 350;
  const [isResizingRight, setIsResizingRight] = useState(false);
  const rightResizeStartX = useRef(0);
  const rightResizeStartW = useRef(230);

  useEffect(() => {
    if (!isResizingRight) return;
    const onMove = (e: MouseEvent) => {
      // Dragging left = wider (inverted from left panel)
      const delta = rightResizeStartX.current - e.clientX;
      const newW = Math.max(230, Math.min(rightResizeStartW.current + delta, window.innerWidth * 0.65));
      setRightPanelWidth(newW);
    };
    const onUp = () => {
      setIsResizingRight(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizingRight]);

  const handleRightResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    rightResizeStartX.current = e.clientX;
    rightResizeStartW.current = rightPanelWidth;
    setIsResizingRight(true);
  }, [rightPanelWidth]);

  // Mini-board: filtered nodes/connections for evidence-focus mode
  const miniBoardNodes = useMemo(() => {
    if (!evidenceFocusMode) return boardNodes;
    if (spotlightPersonIds.size === 0) return boardNodes; // show all if no filter
    // Show spotlight people + their direct connections
    const visibleIds = new Set<string>(spotlightPersonIds);
    for (const conn of boardConnections) {
      if (spotlightPersonIds.has(conn.sourceId)) visibleIds.add(conn.targetId);
      if (spotlightPersonIds.has(conn.targetId)) visibleIds.add(conn.sourceId);
    }
    return boardNodes.filter(n => visibleIds.has(n.id));
  }, [evidenceFocusMode, boardNodes, boardConnections, spotlightPersonIds]);

  const miniBoardConnections = useMemo(() => {
    if (!evidenceFocusMode) return boardConnections;
    const nodeIds = new Set(miniBoardNodes.map(n => n.id));
    return boardConnections.filter(c => nodeIds.has(c.sourceId) && nodeIds.has(c.targetId));
  }, [evidenceFocusMode, boardConnections, miniBoardNodes]);

  // Top connected people for quick-select chips (when no spotlight active)
  const topConnectedPeople = useMemo(() => {
    const personNodes = boardNodes.filter(n => n.kind === "person");
    if (personNodes.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const n of personNodes) counts[n.id] = 0;
    for (const c of boardConnections) {
      if (counts[c.sourceId] !== undefined) counts[c.sourceId]++;
      if (counts[c.targetId] !== undefined) counts[c.targetId]++;
    }
    return personNodes
      .sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))
      .slice(0, 8);
  }, [boardNodes, boardConnections]);

  const showRightPanel = true;
  const showBoard = true;
  const showLeftPanel = !investigation.isStartMode || stepIdx >= 1;

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* LEFT: Evidence panel — resizable */}
      <div
        className={`h-full shrink-0 overflow-hidden ${isResizingLeft ? "" : "transition-all duration-300 ease-out"} ${!showLeftPanel ? "w-0" : leftCollapsed ? "w-0" : ""}`}
        style={!showLeftPanel || leftCollapsed ? undefined : { width: leftPanelWidth }}
      >
        {showLeftPanel && !leftCollapsed && (
          <IntakePanel
            isOnBoard={isOnBoard}
            onAddEvidence={noopAddEvidence}
            onSelectEmail={handleSelectEmail}
            selectedEmailId={selectedEmailId}
            starterLeads={investigation.starterEvidence.length > 0 ? investigation.starterEvidence : undefined}
            investigationStep={investigation.isStartMode ? investigation.step : null}
            isWideMode={evidenceFocusMode}
          />
        )}
      </div>

      {/* RESIZE HANDLE — draggable edge between evidence panel and board */}
      {showLeftPanel && !leftCollapsed && (
        <div
          className={`panel-resize-handle shrink-0 ${isResizingLeft ? "active" : ""}`}
          onMouseDown={handleResizeStart}
        >
          <div className="panel-resize-handle-dots">
            <span /><span /><span />
          </div>
        </div>
      )}

      {/* CENTER: Board Canvas (or mini-board in evidence-focus mode) */}
      <div className={`relative flex flex-col flex-1 min-h-0 ${isResizingLeft ? "" : "transition-all duration-700 ease-out"} ${showBoard ? "opacity-100" : "opacity-0"}`}>
        {/* Test board loader */}
        <button
          onClick={loadTestBoard}
          className="absolute top-1 right-3 z-50 rounded border border-[#333] bg-[#1a1a1a]/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#666] hover:border-red-500/40 hover:bg-red-600/10 hover:text-red-400 transition"
        >
          Test
        </button>

        {/* Panel toggle buttons — always visible on board */}
        <div className="absolute top-2 left-3 z-40 flex gap-2">
          <button
            onClick={() => {
              setLeftCollapsed(prev => {
                if (prev) return false; // opening — restore
                setLeftPanelWidth(230); // collapsing — reset width
                return true;
              });
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] font-bold uppercase tracking-[0.08em] transition backdrop-blur-sm ${
              !leftCollapsed
                ? "border-[#E24B4A]/30 bg-[#E24B4A]/10 text-[#E24B4A] hover:bg-[#E24B4A]/20"
                : "border-[#333] bg-[#141414]/90 text-[#888] hover:border-[#555] hover:text-white"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            Evidence
          </button>
          {!evidenceFocusMode && (
            <button
              onClick={() => {
                setRightCollapsed(prev => {
                  if (prev) return false;
                  setRightPanelWidth(230);
                  return true;
                });
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-[family-name:var(--font-mono)] font-bold uppercase tracking-[0.08em] transition backdrop-blur-sm ${
                !rightCollapsed
                  ? "border-[#E24B4A]/30 bg-[#E24B4A]/10 text-[#E24B4A] hover:bg-[#E24B4A]/20"
                  : "border-[#333] bg-[#141414]/90 text-[#888] hover:border-[#555] hover:text-white"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              Entities
            </button>
          )}
        </div>

        {/* Evidence-focus mode: spotlight chip bar */}
        {evidenceFocusMode && spotlightPersonIds.size > 0 && (
          <div className="absolute top-2 right-3 z-40 flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-[#E24B4A]/20 bg-[#111]/90 backdrop-blur-sm px-2.5 py-1.5">
              <span className="text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-[0.12em] text-[#E24B4A]/60">Focus:</span>
              {[...spotlightPersonIds].map(pid => {
                const n = boardNodes.find(nd => nd.id === pid);
                const name = n?.kind === "person" ? n.data.name : pid;
                return (
                  <span key={pid} className="flex items-center gap-1 rounded-full bg-[#E24B4A]/10 border border-[#E24B4A]/20 px-2 py-0.5 text-[10px] text-[#E24B4A]">
                    {name}
                    <button onClick={() => toggleSpotlight(pid)} className="text-[#E24B4A]/40 hover:text-[#E24B4A] ml-0.5">×</button>
                  </span>
                );
              })}
              <button onClick={clearSpotlight} className="text-[9px] text-[#555] hover:text-white ml-1 transition">Clear</button>
            </div>
          </div>
        )}

        {/* Evidence Tray — split-screen above board (opened via Evidence Pack lead) */}
        {folderOpen && !evidenceFocusMode && (
          <EvidenceTray
            items={folderItems}
            onAddToBoard={addFolderItemToBoard}
            onDismiss={dismissFolderItem}
            onClose={() => setFolderOpen(false)}
            isOnBoard={isOnBoard}
          />
        )}

        {/* LEADS FAB — bottom-right floating action button */}
        {(!investigation.isStartMode || investigation.step === "open-investigation") && !evidenceFocusMode && (
          <div className="absolute bottom-6 right-6 z-50">
            <button
              onClick={() => setLeadsModalOpen(true)}
              className="leads-fab group relative flex h-24 w-24 flex-col items-center justify-center rounded-2xl border-2 border-[#E24B4A]/50 bg-[#111]/95 shadow-[0_0_30px_8px_rgba(226,75,74,0.2)] backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-[#E24B4A]/80 hover:shadow-[0_0_40px_12px_rgba(226,75,74,0.3)]"
            >
              {newLeadIndicator && (
                <span className="absolute -top-2 -right-2 z-10 animate-pulse rounded-full bg-[#E24B4A] px-2 py-0.5 text-[8px] font-bold text-white shadow-lg">
                  NEW
                </span>
              )}
              <span className="leads-exclamation text-3xl font-black leading-none text-[#E24B4A]">!</span>
              <span className="mt-1 font-[family-name:var(--font-mono)] text-[11px] font-black uppercase tracking-[0.08em] text-[#E24B4A]">
                New Leads
              </span>
            </button>
          </div>
        )}

        {showBoard && (
          <BoardCanvas
            ref={canvasRef}
            archiveTitle={archiveTitle}
            nodes={evidenceFocusMode ? miniBoardNodes : boardNodes}
            connections={evidenceFocusMode ? miniBoardConnections : boardConnections}
            selectedNodeId={selectedNodeId}
            focusedNodeId={focusedNodeId}
            focusState={focusState}
            connectingFrom={connectingFrom}
            onSelectNode={selectNode}
            onFocusNode={focusNode}
            onMoveNode={moveNode}
            onBatchMoveNodes={batchMoveNodes}
            onAddPerson={addPersonToBoard}
            onAddEntity={addEntityToBoard}
            onAddFlight={addFlightToBoard}
            onAddMedia={addMediaToBoard}
            onPinEvidenceToCard={pinEvidenceToCard}
            onPinEvidenceToConnection={pinEvidenceToConnection}
            onStartConnection={startConnection}
            onCompleteConnection={completeConnection}
            onDirectConnection={directConnection}
            onOpenSubjectView={openSubjectView}
            onOpenPhotoView={openPhotoView}
            stats={stats}
            score={boardConnections.length * 50}
            firstPlacementMode={investigation.isStartMode && investigation.step === "place-epstein"}
            onFirstPlacement={handleFirstPlacement}
            investigationStep={investigation.isStartMode ? investigation.step : null}
            onUpdateConnection={updateConnection}
            onDeleteConnection={deleteConnection}
            spotlightFocusState={spotlightFocusState}
            spotlightPulseId={spotlightPulseId}
            reintegratingIds={reintegratingIds}
          />
        )}

        {/* Reintegration notification */}
        {reintegrationNotification && (
          <div className="reintegration-notification pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2">
            <div className="rounded-lg border border-[#22c55e]/20 bg-[#111]/95 px-5 py-2.5 backdrop-blur-sm">
              <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#22c55e]">
                Investigation integrated into main board
              </span>
            </div>
          </div>
        )}

        {/* Undo cut connection toast */}
        {recentlyCut && (
          <div className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-3 rounded-lg border border-[#E24B4A]/30 bg-[#111]/98 px-5 py-3 shadow-2xl shadow-black/60 backdrop-blur-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wider text-[#ccc]">
                Connection cut
              </span>
              <button
                onClick={undoCut}
                className="rounded bg-[#E24B4A] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-[#d43c3b] transition"
              >
                Undo
              </button>
              <button
                onClick={() => setRecentlyCut(null)}
                className="text-[#666] hover:text-white transition text-sm leading-none"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Investigation Overlay (only in start mode, not after tutorial ends) */}
      {investigation.isStartMode && investigation.step !== "open-investigation" && (
        <InvestigationOverlay
          step={investigation.step}
          autoDetected={autoDetectCompletion}
          onAdvance={investigation.advanceStep}
          onSkip={investigation.skipStep}
          onSwitchToFree={investigation.switchToFree}
          score={investigation.score}
        />
      )}

      {/* RIGHT RESIZE HANDLE */}
      {showRightPanel && !rightCollapsed && !evidenceFocusMode && (
        <div
          className={`panel-resize-handle shrink-0 ${isResizingRight ? "active" : ""}`}
          onMouseDown={handleRightResizeStart}
        >
          <div className="panel-resize-handle-dots">
            <span /><span /><span />
          </div>
        </div>
      )}

      {/* RIGHT: Entities panel — hidden in evidence-focus mode */}
      <div
        className={`${isResizingRight ? "" : "transition-all duration-300 ease-out"} h-full shrink-0 overflow-hidden ${evidenceFocusMode ? "w-0" : showRightPanel ? (rightCollapsed ? "w-0" : "") : "w-0"}`}
        style={evidenceFocusMode || !showRightPanel || rightCollapsed ? undefined : { width: rightPanelWidth }}
      >
        {showRightPanel && !rightCollapsed && !evidenceFocusMode && (
          <ContextPanel
            activeTab={rightTab}
            onTabChange={setRightTab}
            people={people}
            focusedNodeId={focusedNodeId}
            boardConnections={boardConnections}
            boardNodes={boardNodes}
            isOnBoard={isOnBoard}
            onAddPerson={addPersonToBoard}
            onFocusNode={focusNode}
            suggestedPeople={suggestedPeople}
            investigationStep={investigation.isStartMode ? investigation.step : null}
            spotlightPersonIds={spotlightPersonIds}
            onToggleSpotlight={toggleSpotlight}
            onClearSpotlight={clearSpotlight}
            onAddEntity={addEntityToBoard}
            onSpotlightEntity={spotlightEntity}
            isWideMode={entitiesWideMode}
          />
        )}
      </div>

      {/* Subject Focus View overlay */}
      {subjectFocusPersonId && (() => {
        const personNode = boardNodes.find(n => n.id === subjectFocusPersonId && n.kind === "person");
        if (!personNode || personNode.kind !== "person") return null;
        return (
          <SubjectFocusView
            person={personNode.data}
            boardNodes={boardNodes}
            boardConnections={boardConnections}
            onClose={closeSubjectView}
            onAddEvidence={noopAddEvidence}
            onFocusNode={focusNode}
            onCreateConnection={(targetId: string) => {
              // Create a connection between this person and the target
              const exists = boardConnections.some(
                (c) =>
                  (c.sourceId === subjectFocusPersonId && c.targetId === targetId) ||
                  (c.sourceId === targetId && c.targetId === subjectFocusPersonId)
              );
              if (!exists) {
                setBoardConnections((prev) => [
                  ...prev,
                  {
                    id: `manual-${Date.now()}`,
                    sourceId: subjectFocusPersonId,
                    targetId: targetId,
                    type: "manual" as const,
                    label: "Manual connection",
                    strength: 3,
                    verified: false,
                  },
                ]);
              }
            }}
            onRemoveConnection={(connId: string) => {
              setBoardConnections((prev) => prev.filter(c => c.id !== connId));
            }}
            isOnBoard={isOnBoard}
            people={people}
            onAddPerson={addPersonToBoard}
          />
        );
      })()}

      {/* Photo Focus View overlay */}
      {photoFocusId && (
        <PhotoFocusView
          photoId={photoFocusId}
          boardNodes={boardNodes}
          boardConnections={boardConnections}
          people={people}
          isOnBoard={isOnBoard}
          onClose={closePhotoView}
          onAddEvidence={noopAddEvidence}
          onAddPerson={addPersonToBoard}
          onFocusNode={focusNode}
        />
      )}

      {/* Leads Modal overlay */}
      {leadsModalOpen && (
        <LeadsModal
          leads={LEAD_CATALOG}
          boardPeople={boardPeople}
          onClose={() => setLeadsModalOpen(false)}
          onEvidencePack={handleEvidencePack}
          onFocusedInvestigation={handleFocusedInvestigation}
        />
      )}

      {/* Focused Investigation overlay */}
      {focusInvestigationPersonId && (() => {
        const personNode = boardNodes.find(
          (n) => n.kind === "person" && n.id === focusInvestigationPersonId,
        );
        if (!personNode || personNode.kind !== "person") return null;
        return (
          <FocusedInvestigation
            person={personNode.data}
            existingNodes={boardNodes}
            existingConnections={boardConnections}
            stats={stats}
            onComplete={handleFocusInvestigationComplete}
            onExit={() => setFocusInvestigationPersonId(null)}
          />
        );
      })()}

    </div>
  );
}
