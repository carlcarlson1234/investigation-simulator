"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Person, SearchResult, ArchiveStats, EmailEvidence } from "@/lib/types";
import type {
  BoardNode,
  BoardConnection,
  RightPanelTab,
  FocusState,
} from "@/lib/board-types";
import { IntakePanel } from "./intake-panel";
import { BoardCanvas } from "./board-canvas";
import type { BoardCanvasHandle } from "./board-canvas";
import { ContextPanel } from "./context-panel";
import { SubjectFocusView } from "./subject-focus-view";
import { PhotoFocusView } from "./photo-focus-view";
import { InvestigationOverlay } from "./investigation-overlay";
import { useInvestigation } from "@/hooks/use-investigation";
import { loadBoardState, useBoardPersistence } from "@/hooks/use-board-persistence";

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
  useBoardPersistence(boardNodes, boardConnections, investigation.mode);

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
    (id: string) => boardNodes.some((n) => n.id === id),
    [boardNodes]
  );

  const addPersonToBoard = useCallback(
    (personId: string, dropX?: number, dropY?: number) => {
      if (isOnBoard(personId)) return;
      const person = people.find((p) => p.id === personId);
      if (!person) return;

      const x = dropX ?? 200 + Math.random() * 400;
      const y = dropY ?? 100 + Math.random() * 300;

      setBoardNodes((prev) => [
        ...prev,
        { kind: "person", id: personId, data: person, position: { x, y } },
      ]);
    },
    [people, isOnBoard]
  );

  const addEvidenceToBoard = useCallback(
    (result: SearchResult, dropX?: number, dropY?: number) => {
      if (isOnBoard(result.id)) return;

      const x = dropX ?? 200 + Math.random() * 400;
      const y = dropY ?? 100 + Math.random() * 300;

      setBoardNodes((prev) => [
        ...prev,
        {
          kind: "evidence",
          id: result.id,
          evidenceType: result.type,
          data: result,
          position: { x, y },
        },
      ]);
    },
    [isOnBoard]
  );

  const moveNode = useCallback((id: string, x: number, y: number) => {
    setBoardNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, position: { x, y } } : n))
    );
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    if (id) {
      setRightTab("details");
    } else {
      setRightTab((prev) => prev === "details" ? "persons" : prev);
    }
  }, []);

  const focusNode = useCallback((id: string | null) => {
    setFocusedNodeId((prev) => {
      const newId = prev === id ? null : id;
      // Center the board view on the newly focused node
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

  const deleteConnection = useCallback(
    (connId: string) => {
      setBoardConnections((prev) => prev.filter((c) => c.id !== connId));
    },
    []
  );

  // ─── Selected node ──────────────────────────────────────────────────────

  const selectedNode = boardNodes.find((n) => n.id === selectedNodeId) ?? null;

  // ─── Email selection from inbox ───────────────────────────────────────────

  const handleSelectEmail = useCallback(async (emailId: string) => {
    setSelectedEmailId(emailId);
    setRightTab("details");
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
  const showRightPanel = true;                                           // always visible
  const showBoard = true;                                                // always visible
  const showLeftPanel = !investigation.isStartMode || stepIdx >= 1;      // place-evidence+

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* LEFT: Email Inbox + Search — hidden until intro-evidence */}
      <div className={`transition-all duration-700 ease-out h-full ${showLeftPanel ? "w-[340px] opacity-100" : "w-0 opacity-0 overflow-hidden"}`}>
        {showLeftPanel && (
          <IntakePanel
            isOnBoard={isOnBoard}
            onAddEvidence={addEvidenceToBoard}
            onSelectEmail={handleSelectEmail}
            selectedEmailId={selectedEmailId}
            starterLeads={investigation.starterEvidence.length > 0 ? investigation.starterEvidence : undefined}
            investigationStep={investigation.isStartMode ? investigation.step : null}
          />
        )}
      </div>

      {/* CENTER: Board Canvas — hidden until intro-board */}
      <div className={`flex flex-col flex-1 min-h-0 transition-all duration-700 ease-out ${showBoard ? "opacity-100" : "opacity-0"}`}>
        {showBoard && (
          <BoardCanvas
            ref={canvasRef}
            archiveTitle={archiveTitle}
            nodes={boardNodes}
            connections={boardConnections}
            selectedNodeId={selectedNodeId}
            focusedNodeId={focusedNodeId}
            focusState={focusState}
            connectingFrom={connectingFrom}
            onSelectNode={selectNode}
            onFocusNode={focusNode}
            onMoveNode={moveNode}
            onAddEvidence={addEvidenceToBoard}
            onAddPerson={addPersonToBoard}
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
          />
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

      {/* RIGHT: Persons + Email Detail + Context — hidden until intro-people */}
      <div className={`transition-all duration-700 ease-out h-full ${showRightPanel ? "w-[340px] opacity-100" : "w-0 opacity-0 overflow-hidden"}`}>
        {showRightPanel && (
          <ContextPanel
            activeTab={rightTab}
            onTabChange={setRightTab}
            people={people}
            selectedNode={selectedNode}
            selectedEmailDetail={selectedEmailDetail}
            focusedNodeId={focusedNodeId}
            focusState={focusState}
            boardConnections={boardConnections}
            boardNodes={boardNodes}
            isOnBoard={isOnBoard}
            onAddPerson={addPersonToBoard}
            onFocusNode={focusNode}
            onSelectNode={selectNode}
            suggestedPeople={suggestedPeople}
            investigationStep={investigation.isStartMode ? investigation.step : null}
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
            onAddEvidence={addEvidenceToBoard}
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
          onAddEvidence={addEvidenceToBoard}
          onAddPerson={addPersonToBoard}
          onFocusNode={focusNode}
        />
      )}
    </div>
  );
}
