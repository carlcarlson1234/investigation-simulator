"use client";

import { useState, useMemo, useEffect } from "react";
import type { Person, Evidence, EvidenceType } from "@/lib/types";
import type {
  BoardNode,
  BoardConnection,
  RightPanelTab,
  TimelineEvent,
  FocusState,
} from "@/lib/board-types";
import {
  EVIDENCE_TYPE_ICON,
  EVIDENCE_TYPE_LABEL,
  CONNECTION_TYPE_COLOR,
} from "@/lib/board-types";

interface ContextPanelProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  people: Person[];
  selectedNode: BoardNode | null;
  focusedNodeId: string | null;
  focusState: FocusState | null;
  timelineEvents: TimelineEvent[];
  boardConnections: BoardConnection[];
  boardNodes: BoardNode[];
  isOnBoard: (id: string) => boolean;
  onAddPerson: (personId: string) => void;
  onFocusNode: (id: string | null) => void;
  onSelectNode: (id: string | null) => void;
}

const TABS: { key: RightPanelTab; label: string }[] = [
  { key: "persons", label: "Persons" },
  { key: "details", label: "Details" },
  { key: "timeline", label: "Timeline" },
];

export function ContextPanel({
  activeTab,
  onTabChange,
  people,
  selectedNode,
  focusedNodeId,
  focusState,
  timelineEvents,
  boardConnections,
  boardNodes,
  isOnBoard,
  onAddPerson,
  onFocusNode,
  onSelectNode,
}: ContextPanelProps) {
  const [personSearch, setPersonSearch] = useState("");

  const filteredPeople = useMemo(() => {
    if (!personSearch.trim()) return people;
    const q = personSearch.toLowerCase();
    return people.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.source && p.source.toLowerCase().includes(q)) ||
      p.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [people, personSearch]);

  return (
    <aside className="context-panel flex w-64 flex-shrink-0 flex-col border-l border-border overflow-hidden">
      {/* Tab bar */}
      <div className="flex flex-shrink-0 border-b border-border">
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => onTabChange(tab.key)}
            className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-widest transition ${
              activeTab === tab.key ? "text-accent border-b-2 border-accent bg-accent/5" : "text-muted/50 hover:text-muted/80"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "persons" && (
          <PersonsTab people={filteredPeople} search={personSearch} onSearchChange={setPersonSearch}
            isOnBoard={isOnBoard} onAddPerson={onAddPerson} focusedNodeId={focusedNodeId} onFocusNode={onFocusNode} />
        )}
        {activeTab === "details" && (
          <DetailsTab selectedNode={selectedNode} boardConnections={boardConnections} boardNodes={boardNodes}
            onFocusNode={onFocusNode} onSelectNode={onSelectNode} focusedNodeId={focusedNodeId} />
        )}
        {activeTab === "timeline" && (
          <TimelineTab events={timelineEvents} focusState={focusState} onSelectNode={onSelectNode} />
        )}
      </div>
    </aside>
  );
}

// ─── Persons Tab ────────────────────────────────────────────────────────────

function PersonsTab({
  people, search, onSearchChange, isOnBoard, onAddPerson, focusedNodeId, onFocusNode,
}: {
  people: Person[]; search: string; onSearchChange: (v: string) => void;
  isOnBoard: (id: string) => boolean; onAddPerson: (id: string) => void;
  focusedNodeId: string | null; onFocusNode: (id: string | null) => void;
}) {
  return (
    <div className="p-3 space-y-2">
      <div className="relative mb-3">
        <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/40"
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input type="text" value={search} onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search 473 people…"
          className="w-full rounded-lg border border-border bg-surface py-1.5 pl-7 pr-3 text-[11px] text-foreground placeholder:text-muted/40 focus:border-accent/40 focus:outline-none transition"
        />
      </div>

      <div className="text-[10px] text-muted/40 mb-2">{people.length} people</div>

      {people.map((person) => {
        const onBoard = isOnBoard(person.id);
        const focused = focusedNodeId === person.id;
        return (
          <div key={person.id}
            draggable={!onBoard}
            onDragStart={(e) => {
              e.dataTransfer.setData("application/board-item", JSON.stringify({ id: person.id, kind: "person" }));
              e.dataTransfer.effectAllowed = "copy";
            }}
            className={`group rounded-lg border p-2.5 transition ${
              focused ? "border-accent/40 bg-accent/10" :
              onBoard ? "border-accent/20 bg-accent/5 opacity-60" :
              "border-border bg-surface hover:border-accent/30 cursor-grab active:cursor-grabbing"
            }`}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="h-2 w-2 rounded-full bg-purple-500" />
              <span className="text-[8px] font-bold uppercase tracking-widest text-muted/60">Person</span>
              {person.photoCount > 0 && (
                <span className="ml-auto text-[8px] text-muted/40">📸 {person.photoCount}</span>
              )}
            </div>
            <h4 className="text-xs font-semibold text-foreground/90">{person.name}</h4>
            {person.source && <p className="mt-0.5 text-[9px] text-muted/50">{person.source}</p>}
            {onBoard && <span className="text-[8px] text-accent/60">✓ On board</span>}

            <div className="mt-1.5 flex gap-1">
              {!onBoard && (
                <button onClick={() => onAddPerson(person.id)}
                  className="rounded bg-accent/10 px-2 py-0.5 text-[9px] font-medium text-accent opacity-0 group-hover:opacity-100 hover:bg-accent/20 transition">
                  + Add
                </button>
              )}
              {onBoard && (
                <button onClick={() => onFocusNode(person.id)}
                  className={`rounded px-2 py-0.5 text-[9px] font-medium transition ${
                    focused ? "bg-accent/20 text-accent" : "bg-accent/10 text-accent/60 opacity-0 group-hover:opacity-100"
                  }`}>
                  {focused ? "Unfocus" : "Focus"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Details Tab ────────────────────────────────────────────────────────────

function DetailsTab({
  selectedNode, boardConnections, boardNodes, onFocusNode, onSelectNode, focusedNodeId,
}: {
  selectedNode: BoardNode | null; boardConnections: BoardConnection[];
  boardNodes: BoardNode[]; onFocusNode: (id: string | null) => void;
  onSelectNode: (id: string | null) => void; focusedNodeId: string | null;
}) {
  const [fullEvidence, setFullEvidence] = useState<Evidence | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  // Load full evidence data when an evidence node is selected
  useEffect(() => {
    if (!selectedNode || selectedNode.kind !== "evidence") {
      setFullEvidence(null);
      return;
    }

    setLoadingFull(true);
    fetch(`/api/evidence/${encodeURIComponent(selectedNode.id)}?type=${selectedNode.evidenceType}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { setFullEvidence(data); setLoadingFull(false); })
      .catch(() => { setFullEvidence(null); setLoadingFull(false); });
  }, [selectedNode?.id, selectedNode?.kind]);

  if (!selectedNode) {
    return (
      <div className="flex items-center justify-center p-8 text-center">
        <div>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-muted/30">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-xs text-muted/40">Click an item on the board to see details</p>
        </div>
      </div>
    );
  }

  const relatedConns = boardConnections.filter(
    (c) => c.sourceId === selectedNode.id || c.targetId === selectedNode.id
  );
  const isFocused = focusedNodeId === selectedNode.id;

  if (selectedNode.kind === "person") {
    const d = selectedNode.data;
    return (
      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-3 w-3 rounded-full bg-purple-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted/60">Person</span>
            <button onClick={() => onFocusNode(selectedNode.id)}
              className={`ml-auto text-[9px] rounded px-2 py-0.5 transition ${isFocused ? "bg-accent/20 text-accent" : "bg-accent/10 text-accent/60"}`}>
              {isFocused ? "Unfocus" : "Focus"}
            </button>
          </div>
          <h3 className="text-base font-bold">{d.name}</h3>
          {d.source && <p className="mt-0.5 text-xs text-muted">{d.source}</p>}
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-md border border-border bg-surface px-2 py-1.5">
            <span className="text-muted/50">Photos</span>
            <div className="font-semibold text-foreground/80">{d.photoCount}</div>
          </div>
          {d.aliases.length > 0 && (
            <div className="col-span-2 rounded-md border border-border bg-surface px-2 py-1.5">
              <span className="text-muted/50">Aliases</span>
              <div className="font-semibold text-foreground/80">{d.aliases.join(", ")}</div>
            </div>
          )}
          {d.emailAddresses.length > 0 && (
            <div className="col-span-2 rounded-md border border-border bg-surface px-2 py-1.5">
              <span className="text-muted/50">Email</span>
              <div className="font-semibold text-foreground/80 text-[9px] break-all">{d.emailAddresses.join(", ")}</div>
            </div>
          )}
        </div>

        {relatedConns.length > 0 && (
          <ConnectionsList connections={relatedConns} currentNodeId={selectedNode.id} boardNodes={boardNodes} onSelectNode={onSelectNode} />
        )}
      </div>
    );
  }

  // Evidence details
  const d = selectedNode.data;
  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">{EVIDENCE_TYPE_ICON[selectedNode.evidenceType]}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted/60">
            {EVIDENCE_TYPE_LABEL[selectedNode.evidenceType]}
          </span>
          <button onClick={() => onFocusNode(selectedNode.id)}
            className={`ml-auto text-[9px] rounded px-2 py-0.5 transition ${isFocused ? "bg-accent/20 text-accent" : "bg-accent/10 text-accent/60"}`}>
            {isFocused ? "Unfocus" : "Focus"}
          </button>
        </div>
        <h3 className="text-sm font-bold">{d.title}</h3>
        {d.date && <p className="mt-0.5 text-xs text-muted/50 tabular-nums">{d.date}</p>}
        {d.sender && <p className="mt-0.5 text-xs text-muted/50">{d.sender}</p>}
      </div>

      {d.starCount > 0 && (
        <div className="text-[10px] text-amber-400/60">★ {d.starCount.toLocaleString()} stars</div>
      )}

      {/* Full content loaded on demand */}
      {loadingFull ? (
        <div className="rounded-lg border border-border bg-surface p-3 text-xs text-muted/50 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
          Loading full content…
        </div>
      ) : fullEvidence ? (
        <div className="rounded-lg border border-border bg-surface p-3 max-h-60 overflow-y-auto">
          <p className="text-xs leading-relaxed text-muted/80 whitespace-pre-wrap">
            {getFullContent(fullEvidence)}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs leading-relaxed text-muted/60">{d.snippet}</p>
        </div>
      )}

      {/* Metadata */}
      {fullEvidence && (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          {fullEvidence.type === "email" && (
            <>
              <div className="col-span-2 rounded-md border border-border bg-surface px-2 py-1.5">
                <span className="text-muted/50">From</span>
                <div className="font-semibold text-foreground/80 break-all">{fullEvidence.sender}</div>
              </div>
              {fullEvidence.recipients.length > 0 && (
                <div className="col-span-2 rounded-md border border-border bg-surface px-2 py-1.5">
                  <span className="text-muted/50">To</span>
                  <div className="font-semibold text-foreground/80 text-[9px] break-all">{fullEvidence.recipients.join(", ")}</div>
                </div>
              )}
            </>
          )}
          {fullEvidence.type === "document" && (
            <>
              {fullEvidence.volume && (
                <div className="rounded-md border border-border bg-surface px-2 py-1.5">
                  <span className="text-muted/50">Volume</span>
                  <div className="font-semibold text-foreground/80">{fullEvidence.volume}</div>
                </div>
              )}
              <div className="rounded-md border border-border bg-surface px-2 py-1.5">
                <span className="text-muted/50">Pages</span>
                <div className="font-semibold text-foreground/80">{fullEvidence.pageCount}</div>
              </div>
            </>
          )}
          {fullEvidence.type === "photo" && (
            <div className="rounded-md border border-border bg-surface px-2 py-1.5">
              <span className="text-muted/50">Size</span>
              <div className="font-semibold text-foreground/80">{fullEvidence.width}×{fullEvidence.height}</div>
            </div>
          )}
          {fullEvidence.releaseBatch && (
            <div className="rounded-md border border-border bg-surface px-2 py-1.5">
              <span className="text-muted/50">Batch</span>
              <div className="font-semibold text-foreground/80">{fullEvidence.releaseBatch}</div>
            </div>
          )}
        </div>
      )}

      {relatedConns.length > 0 && (
        <ConnectionsList connections={relatedConns} currentNodeId={selectedNode.id} boardNodes={boardNodes} onSelectNode={onSelectNode} />
      )}
    </div>
  );
}

function getFullContent(ev: Evidence): string {
  switch (ev.type) {
    case "email": return ev.body || ev.snippet;
    case "document": return ev.fulltext || ev.snippet;
    case "photo": return ev.imageDescription || ev.snippet;
    case "imessage": return ev.body || ev.snippet;
  }
}

// ─── Connections List ───────────────────────────────────────────────────────

function ConnectionsList({ connections, currentNodeId, boardNodes, onSelectNode }: {
  connections: BoardConnection[]; currentNodeId: string; boardNodes: BoardNode[];
  onSelectNode: (id: string | null) => void;
}) {
  return (
    <div>
      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted/50">
        Connections ({connections.length})
      </h4>
      <div className="space-y-1.5">
        {connections.map((conn) => {
          const otherId = conn.sourceId === currentNodeId ? conn.targetId : conn.sourceId;
          const otherNode = boardNodes.find((n) => n.id === otherId);
          const otherName = otherNode
            ? otherNode.kind === "person" ? otherNode.data.name : otherNode.data.title
            : "Unknown";
          const color = CONNECTION_TYPE_COLOR[conn.type] ?? "#6366f1";
          return (
            <button key={conn.id} onClick={() => onSelectNode(otherId)}
              className="w-full text-left rounded-md border border-border bg-surface p-2 text-[10px] hover:border-accent/30 transition">
              <span className="font-semibold uppercase" style={{ color }}>{conn.type}</span>
              <span className="text-muted/60"> → {otherName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Timeline Tab ───────────────────────────────────────────────────────────

function TimelineTab({ events, focusState, onSelectNode }: {
  events: TimelineEvent[]; focusState: FocusState | null; onSelectNode: (id: string | null) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-center">
        <div>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-muted/30">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <p className="text-xs text-muted/40">Add dated evidence to the board to build a timeline</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      {focusState && (
        <div className="mb-3 rounded-md border border-accent/20 bg-accent/5 px-2 py-1.5 text-[9px] text-accent/70">
          Related events are highlighted.
        </div>
      )}
      <div className="relative pl-4 border-l border-border/50">
        {events.map((event, i) => {
          const dimmed = focusState && !event.isRelatedToFocus;
          return (
            <button key={`${event.itemId}-${i}`} onClick={() => onSelectNode(event.itemId)}
              className={`relative mb-4 pb-1 block w-full text-left transition-opacity duration-300 hover:opacity-100 ${dimmed ? "opacity-30" : "opacity-100"}`}>
              <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 bg-background transition-colors ${
                !dimmed && focusState ? "border-accent" : "border-accent/40"
              }`} />
              <div className="text-[10px] font-semibold text-accent/60 tabular-nums mb-0.5">{event.date}</div>
              <h4 className="text-xs font-semibold text-foreground/90">{event.title}</h4>
              <p className="mt-0.5 text-[10px] leading-relaxed text-muted/50">{event.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
