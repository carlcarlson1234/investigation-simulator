"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import type { Person, SearchResult, ArchiveStats } from "@/lib/types";
import type {
  BoardNode,
  BoardConnection,
  RightPanelTab,
  TimelineEvent,
  FocusState,
} from "@/lib/board-types";
import { IntakePanel } from "./intake-panel";
import { BoardCanvas } from "./board-canvas";
import { ContextPanel } from "./context-panel";

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

  // Reference to the canvas container for scroll-to-center
  const canvasRef = useRef<HTMLDivElement>(null);

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
    const node = boardNodes.find((n) => n.id === nodeId);
    if (!node || !canvasRef.current) return;

    const container = canvasRef.current;
    const cardW = 170;
    const cardH = node.kind === "person" ? 80 : 90;

    const centerX = node.position.x + cardW / 2;
    const centerY = node.position.y + cardH / 2;

    const scrollX = centerX - container.clientWidth / 2;
    const scrollY = centerY - container.clientHeight / 2;

    container.scrollTo({ left: scrollX, top: scrollY, behavior: "smooth" });
  }, [boardNodes]);

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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* LEFT: Evidence Search */}
      <IntakePanel
        isOnBoard={isOnBoard}
        onAddEvidence={addEvidenceToBoard}
      />

      {/* CENTER: Board Canvas */}
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
        stats={stats}
      />

      {/* RIGHT: Persons + Context */}
      <ContextPanel
        activeTab={rightTab}
        onTabChange={setRightTab}
        people={people}
        selectedNode={selectedNode}
        focusedNodeId={focusedNodeId}
        focusState={focusState}
        timelineEvents={timelineEvents}
        boardConnections={boardConnections}
        boardNodes={boardNodes}
        isOnBoard={isOnBoard}
        onAddPerson={addPersonToBoard}
        onFocusNode={focusNode}
        onSelectNode={selectNode}
      />
    </div>
  );
}
