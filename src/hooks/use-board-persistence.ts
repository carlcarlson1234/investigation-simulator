"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BoardNode, BoardConnection } from "@/lib/board-types";
import type { InvestigationMode } from "@/lib/investigation-types";

const STORAGE_KEY = "board-state";

interface PersistedBoardState {
  nodes: BoardNode[];
  connections: BoardConnection[];
  mode: InvestigationMode;
  seenEvidenceIds?: string[];
}

/** Read saved board state from sessionStorage (call once on mount). */
export function loadBoardState(): PersistedBoardState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBoardState;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.connections)) return null;
    // Migration: drop legacy evidence nodes (from before evidence became pinned).
    // Their kind is "evidence" which no longer exists on BoardNode.
    const filtered: BoardNode[] = [];
    for (const n of parsed.nodes as unknown[]) {
      const node = n as { kind?: string };
      if (node.kind === "person" || node.kind === "entity" || node.kind === "flight" || node.kind === "media") {
        filtered.push(n as BoardNode);
      }
    }
    // Also drop connections that reference dropped evidence nodes.
    const validIds = new Set(filtered.map((n) => n.id));
    const validConns = parsed.connections.filter(
      (c) => validIds.has(c.sourceId) && validIds.has(c.targetId)
    );
    return { ...parsed, nodes: filtered, connections: validConns };
  } catch {
    return null;
  }
}

/** Hook that auto-saves board state to sessionStorage on changes. */
export function useBoardPersistence(
  nodes: BoardNode[],
  connections: BoardConnection[],
  mode: InvestigationMode,
  seenEvidenceIds?: Set<string>,
) {
  const hasMounted = useRef(false);

  const save = useCallback(() => {
    try {
      const state: PersistedBoardState = {
        nodes,
        connections,
        mode,
        seenEvidenceIds: seenEvidenceIds ? Array.from(seenEvidenceIds) : undefined,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage full or unavailable — silently ignore
    }
  }, [nodes, connections, mode, seenEvidenceIds]);

  // Save whenever nodes/connections/mode change (skip initial mount to avoid overwriting with empty state during hydration)
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    save();
  }, [save]);
}
