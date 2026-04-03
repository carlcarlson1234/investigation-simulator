"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BoardNode, BoardConnection } from "@/lib/board-types";
import type { InvestigationMode } from "@/lib/investigation-types";

const STORAGE_KEY = "board-state";

interface PersistedBoardState {
  nodes: BoardNode[];
  connections: BoardConnection[];
  mode: InvestigationMode;
}

/** Read saved board state from sessionStorage (call once on mount). */
export function loadBoardState(): PersistedBoardState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBoardState;
    // Basic validation
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.connections)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Hook that auto-saves board state to sessionStorage on changes. */
export function useBoardPersistence(
  nodes: BoardNode[],
  connections: BoardConnection[],
  mode: InvestigationMode,
) {
  const hasMounted = useRef(false);

  const save = useCallback(() => {
    try {
      const state: PersistedBoardState = { nodes, connections, mode };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessionStorage full or unavailable — silently ignore
    }
  }, [nodes, connections, mode]);

  // Save whenever nodes/connections/mode change (skip initial mount to avoid overwriting with empty state during hydration)
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    save();
  }, [save]);
}
