"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Person, SearchResult, ArchiveStats, EmailEvidence } from "@/lib/types";
import type {
  BoardNode,
  BoardConnection,
  RightPanelTab,
  TimelineEvent,
  FocusState,
} from "@/lib/board-types";
import { IntakePanel } from "./intake-panel";
import { BoardCanvas } from "./board-canvas";
import type { BoardCanvasHandle } from "./board-canvas";
import { ContextPanel } from "./context-panel";
import { SubjectFocusView } from "./subject-focus-view";
import { PhotoFocusView } from "./photo-focus-view";
import { InvestigationModeChooser } from "./investigation-mode-chooser";
import { InvestigationOverlay } from "./investigation-overlay";
import { useInvestigation } from "@/hooks/use-investigation";

interface BoardWorkspaceProps {
  archiveTitle: string;
  archiveSubtitle: string;
  people: Person[];
  stats: ArchiveStats;
}

export function BoardWorkspace({
  archiveTitle,
  archiveSubtitle,
  people,
  stats,
}: BoardWorkspaceProps) {
  // ─── Board State ─────────────────────────────────────────────────────────
  const [boardNodes, setBoardNodes] = useState<BoardNode[]>([]);
  const [boardConnections, setBoardConnections] = useState<BoardConnection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightPanelTab>("persons");
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedEmailDetail, setSelectedEmailDetail] = useState<EmailEvidence | null>(null);
  const [subjectFocusPersonId, setSubjectFocusPersonId] = useState<string | null>(null);
  const [photoFocusId, setPhotoFocusId] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  // Reference to the canvas component's imperative handle for centering
  const canvasRef = useRef<BoardCanvasHandle>(null);

  // ─── Investigation Flow ─────────────────────────────────────────────────
  const investigation = useInvestigation(boardNodes, boardConnections, people);
  const { autoDetectCompletion } = investigation as ReturnType<typeof useInvestigation> & { autoDetectCompletion: boolean };

  // Auto-advance when step conditions are met
  useEffect(() => {
    if (autoDetectCompletion && investigation.isStartMode) {
      // Small delay so the user sees the confirmation
      const t = setTimeout(() => investigation.advanceStep(), 800);
      return () => clearTimeout(t);
    }
  }, [autoDetectCompletion, investigation.isStartMode]);

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
    if (id) setRightTab("details");
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

  // ─── Selected node ──────────────────────────────────────────────────────

  const selectedNode = boardNodes.find((n) => n.id === selectedNodeId) ?? null;

  // ─── Timeline (from board evidence nodes that have dates) ────────────────

  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];

    for (const node of boardNodes) {
      if (node.kind === "evidence" && node.data.date) {
        const isRelated = focusState
          ? focusState.nodeId === node.id || focusState.directIds.has(node.id)
          : true;

        events.push({
          date: node.data.date,
          title: node.data.title,
          description: node.data.snippet.slice(0, 100),
          itemId: node.id,
          kind: "evidence",
          isRelatedToFocus: isRelated,
        });
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date));
    return events;
  }, [boardNodes, focusState]);

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

  // People lookup for investigation overlay
  const firstPerson = people.find(p => p.id === investigation.starterPacket.firstPerson.personId);

  // Investigation-mode suggested people (for right panel)
  const suggestedPeople = useMemo(() => {
    if (!investigation.isStartMode) return undefined;
    return people.filter(p => investigation.suggestedPeopleIds.includes(p.id));
  }, [investigation.isStartMode, investigation.suggestedPeopleIds, people]);

  // Panel visibility — progressive reveal during onboarding
  const STEP_ORDER_INDEX: Record<string, number> = {
    "welcome": 0, "intro-people": 1, "intro-board": 2, "place-epstein": 3,
    "intro-evidence": 4, "place-evidence": 5, "pick-person": 6,
    "create-connection": 7, "connection-confirmed": 8, "open-investigation": 9,
  };
  const stepIdx = investigation.isStartMode ? (STEP_ORDER_INDEX[investigation.step] ?? 9) : 9;
  const showRightPanel = !investigation.isStartMode || stepIdx >= 1;     // intro-people+
  const showBoard = !investigation.isStartMode || stepIdx >= 2;          // intro-board+
  const showLeftPanel = !investigation.isStartMode || stepIdx >= 4;      // intro-evidence+

  // Show mode chooser if no mode selected
  if (investigation.mode === null) {
    return (
      <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
        <InvestigationModeChooser
          onChoose={investigation.setMode}
        />
      </div>
    );
  }

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
            starterLeads={investigation.isStartMode ? investigation.starterEvidence : undefined}
            investigationStep={investigation.isStartMode ? investigation.step : null}
          />
        )}
      </div>

      {/* CENTER: Board Canvas — hidden until intro-board */}
      <div className={`relative flex flex-col flex-1 min-h-0 overflow-hidden transition-all duration-700 ease-out ${showBoard ? "opacity-100" : "opacity-0"}`}>
        {showBoard && (
          <BoardCanvas
            ref={canvasRef}
            archiveTitle={archiveTitle}
            archiveSubtitle={archiveSubtitle}
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
            firstPlacementMode={investigation.isStartMode && investigation.step === "place-epstein"}
            onFirstPlacement={handleFirstPlacement}
            investigationStep={investigation.isStartMode ? investigation.step : null}
            onUpdateConnection={updateConnection}
          />
        )}

        {/* Timeline toggle button (floating) */}
        <button
          onClick={() => setTimelineOpen(!timelineOpen)}
          className={`absolute top-3 right-3 z-30 flex items-center gap-2 rounded-lg border px-3 py-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] transition backdrop-blur-sm ${
            timelineOpen
              ? "border-red-500/40 bg-red-600/15 text-red-400 shadow-lg shadow-red-900/20"
              : "border-[#2a2a2a] bg-[#0a0a0a]/80 text-[#666] hover:text-white hover:border-[#444]"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          Timeline{timelineEvents.length > 0 ? ` (${timelineEvents.length})` : ""}
        </button>

        {/* Timeline drawer (slide from right over canvas) */}
        <div className={`absolute top-0 right-0 z-20 h-full w-72 border-l border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-md transition-transform duration-300 ease-out ${
          timelineOpen ? "translate-x-0" : "translate-x-full"
        }`}>
          <div className="flex items-center justify-between border-b border-[#1a1a1a] px-3 py-2.5">
            <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] text-red-500">
              🕐 Timeline
            </span>
            <button onClick={() => setTimelineOpen(false)} className="text-[#555] hover:text-white transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto h-[calc(100%-42px)]">
            {timelineEvents.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-center">
                <div>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-[#333]">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                  <p className="text-xs text-[#555]">Add dated evidence to build a timeline</p>
                </div>
              </div>
            ) : (
              <div className="p-3">
                {focusState && (
                  <div className="mb-3 rounded-md border border-red-600/20 bg-red-600/5 px-2 py-1.5 text-[9px] text-red-400/70">
                    Related events are highlighted.
                  </div>
                )}
                <div className="relative pl-4 border-l border-[#222]">
                  {timelineEvents.map((event, i) => {
                    const dimmed = focusState && !event.isRelatedToFocus;
                    return (
                      <button key={`${event.itemId}-${i}`} onClick={() => selectNode(event.itemId)}
                        className={`relative mb-4 pb-1 block w-full text-left transition-opacity duration-300 hover:opacity-100 ${dimmed ? "opacity-30" : "opacity-100"}`}>
                        <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 bg-[#0a0a0a] transition-colors ${
                          !dimmed && focusState ? "border-red-500" : "border-red-500/40"
                        }`} />
                        <div className="text-[10px] font-semibold text-red-500/60 tabular-nums mb-0.5">{event.date}</div>
                        <h4 className="text-xs font-semibold text-white/90">{event.title}</h4>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-[#777]">{event.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Investigation Overlay (only in start mode) */}
      {investigation.isStartMode && investigation.step !== "open-investigation" && (
        <InvestigationOverlay
          step={investigation.step}
          stepConfig={investigation.stepConfig}
          completedSteps={investigation.completedSteps}
          autoDetected={autoDetectCompletion}
          onAdvance={investigation.advanceStep}
          onSkip={investigation.skipStep}
          onSwitchToFree={investigation.switchToFree}
          firstPerson={firstPerson}
          onAddPerson={addPersonToBoard}
          expansionChoices={investigation.expansionChoices}
          onChooseExpansion={investigation.chooseExpansion}
          clusterComplete={investigation.clusterComplete}
          nudges={investigation.nudges}
          nodeCount={boardNodes.filter(n => n.kind === "person").length}
          connectionCount={boardConnections.length}
          evidenceCount={boardNodes.filter(n => n.kind === "evidence").length}
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
            timelineEvents={timelineEvents}
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
