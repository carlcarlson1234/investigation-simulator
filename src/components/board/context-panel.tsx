"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { Person, Evidence, EvidenceType, EmailEvidence } from "@/lib/types";
import type { InvestigationStep } from "@/lib/investigation-types";
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
import { PLACES, ORGANIZATIONS, EVENTS } from "@/lib/entity-seed-data";
import type { SeedEntity, EntityType } from "@/lib/entity-seed-data";

interface ContextPanelProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  people: Person[];
  selectedNode: BoardNode | null;
  selectedEmailDetail: EmailEvidence | null;
  focusedNodeId: string | null;
  focusState: FocusState | null;
  boardConnections: BoardConnection[];
  boardNodes: BoardNode[];
  isOnBoard: (id: string) => boolean;
  onAddPerson: (personId: string) => void;
  onFocusNode: (id: string | null) => void;
  onSelectNode: (id: string | null) => void;
  suggestedPeople?: Person[];
  investigationStep?: InvestigationStep | null;
  spotlightPersonIds?: Set<string>;
  onToggleSpotlight?: (personId: string) => void;
  onClearSpotlight?: () => void;
  onAddEntity?: (entity: SeedEntity) => void;
  onSpotlightEntity?: (entity: SeedEntity) => void;
}

const TABS: { key: RightPanelTab; label: string }[] = [
  { key: "persons", label: "People" },
  { key: "places", label: "Places" },
  { key: "orgs", label: "Orgs" },
  { key: "events", label: "Events" },
  { key: "details", label: "Details" },
];

export function ContextPanel({
  activeTab,
  onTabChange,
  people,
  selectedNode,
  selectedEmailDetail,
  focusedNodeId,
  focusState,
  boardConnections,
  boardNodes,
  isOnBoard,
  onAddPerson,
  onFocusNode,
  onSelectNode,
  suggestedPeople,
  investigationStep,
  spotlightPersonIds,
  onToggleSpotlight,
  onClearSpotlight,
  onAddEntity,
  onSpotlightEntity,
}: ContextPanelProps) {
  const [personSearch, setPersonSearch] = useState("");
  const [entitySearch, setEntitySearch] = useState("");
  const isOnboarding = investigationStep != null;

  // Track which imageUrls actually load (not 404)
  const [validImages, setValidImages] = useState<Set<string>>(new Set());
  const checkedImages = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const p of people) {
      if (!p.imageUrl || checkedImages.current.has(p.id)) continue;
      checkedImages.current.add(p.id);
      const img = new Image();
      img.onload = () => setValidImages(prev => new Set(prev).add(p.id));
      img.src = p.imageUrl;
    }
  }, [people]);

  const filteredPeople = useMemo(() => {
    let list = people;
    if (personSearch.trim()) {
      const q = personSearch.toLowerCase();
      list = people.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.source && p.source.toLowerCase().includes(q)) ||
        p.aliases.some((a) => a.toLowerCase().includes(q))
      );
    }
    // Pinned order, then photos by fame, then alphabetical
    const pinned = ["donald-trump", "bill-clinton", "bill-gates", "jeffrey-epstein", "ghislaine-maxwell"];
    const pinnedIdx = (id: string) => { const i = pinned.indexOf(id); return i >= 0 ? i : Infinity; };
    return [...list].sort((a, b) => {
      const pa = pinnedIdx(a.id), pb = pinnedIdx(b.id);
      if (pa !== pb) return pa - pb;
      const aHasImg = validImages.has(a.id) ? 1 : 0;
      const bHasImg = validImages.has(b.id) ? 1 : 0;
      if (aHasImg !== bHasImg) return bHasImg - aHasImg;
      if (aHasImg && bHasImg) return b.photoCount - a.photoCount;
      return a.name.localeCompare(b.name);
    });
  }, [people, personSearch, validImages]);

  return (
    <aside className={`context-panel flex h-full w-[230px] flex-shrink-0 flex-col border-l border-[#1a1a1a] overflow-hidden transition-all duration-300 ${
      isOnboarding ? "bg-[#080808]" : ""
    }`}>
      {/* Tab bar — muted during onboarding */}
      <div className={`flex flex-shrink-0 border-b border-[#1a1a1a] transition-opacity duration-300 ${
        isOnboarding ? "opacity-40" : ""
      }`}>
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => onTabChange(tab.key)}
            className={`flex-1 py-2 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.08em] transition min-w-0 px-0.5 ${
              activeTab === tab.key ? "text-red-500 border-b-2 border-red-500 bg-red-600/5" : "text-[#666] hover:text-white hover:border-b-2 hover:border-[#555]"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === "persons" && (
          <PersonsTab people={filteredPeople} search={personSearch} onSearchChange={setPersonSearch}
            isOnBoard={isOnBoard} onAddPerson={onAddPerson} focusedNodeId={focusedNodeId} onFocusNode={onFocusNode}
            suggestedPeople={suggestedPeople} investigationStep={investigationStep} boardConnections={boardConnections}
            spotlightPersonIds={spotlightPersonIds} onToggleSpotlight={onToggleSpotlight} onClearSpotlight={onClearSpotlight} />
        )}
        {activeTab === "places" && (
          <EntityListTab entities={PLACES} entityType="place" search={entitySearch}
            onSearchChange={setEntitySearch} isOnBoard={isOnBoard} onAddEntity={onAddEntity}
            onSpotlightEntity={onSpotlightEntity} boardNodes={boardNodes}
            spotlightPersonIds={spotlightPersonIds} people={people} />
        )}
        {activeTab === "orgs" && (
          <EntityListTab entities={ORGANIZATIONS} entityType="organization" search={entitySearch}
            onSearchChange={setEntitySearch} isOnBoard={isOnBoard} onAddEntity={onAddEntity}
            onSpotlightEntity={onSpotlightEntity} boardNodes={boardNodes}
            spotlightPersonIds={spotlightPersonIds} people={people} />
        )}
        {activeTab === "events" && (
          <EntityListTab entities={EVENTS} entityType="event" search={entitySearch}
            onSearchChange={setEntitySearch} isOnBoard={isOnBoard} onAddEntity={onAddEntity}
            onSpotlightEntity={onSpotlightEntity} boardNodes={boardNodes}
            spotlightPersonIds={spotlightPersonIds} people={people} />
        )}
        {activeTab === "details" && (
          selectedEmailDetail && !selectedNode ? (
            <EmailDetailView email={selectedEmailDetail} />
          ) : (
            <DetailsTab selectedNode={selectedNode} boardConnections={boardConnections} boardNodes={boardNodes}
              onFocusNode={onFocusNode} onSelectNode={onSelectNode} focusedNodeId={focusedNodeId} />
          )
        )}
      </div>
    </aside>
  );
}

// ─── Persons Tab ──────────────────────────────────────────────────────────

function PersonsTab({ people, search, onSearchChange, isOnBoard, onAddPerson, focusedNodeId, onFocusNode, suggestedPeople, investigationStep, boardConnections, spotlightPersonIds, onToggleSpotlight, onClearSpotlight }: {
  people: Person[]; search: string; onSearchChange: (v: string) => void;
  isOnBoard: (id: string) => boolean; onAddPerson: (id: string) => void;
  focusedNodeId: string | null; onFocusNode: (id: string | null) => void;
  suggestedPeople?: Person[];
  investigationStep?: InvestigationStep | null;
  boardConnections: BoardConnection[];
  spotlightPersonIds?: Set<string>;
  onToggleSpotlight?: (id: string) => void;
  onClearSpotlight?: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const isOnboarding = investigationStep != null;

  // IDs of suggested people to exclude from the "all" list
  const suggestedIds = useMemo(() => new Set((suggestedPeople || []).map(p => p.id)), [suggestedPeople]);

  // When searching, filter; when not, show all
  const isSearching = searchOpen && search.trim().length > 0;

  // Non-suggested people (everyone else)
  const otherPeople = useMemo(() => people.filter(p => !suggestedIds.has(p.id)), [people, suggestedIds]);

  // Connection count per person
  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const conn of boardConnections) {
      counts.set(conn.sourceId, (counts.get(conn.sourceId) || 0) + 1);
      counts.set(conn.targetId, (counts.get(conn.targetId) || 0) + 1);
    }
    return counts;
  }, [boardConnections]);

  return (
    <div className="p-3 space-y-1.5">
      {/* ── SEARCH BAR ── */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a] pb-2 -mx-3 px-3 pt-0">
        {searchOpen ? (
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-red-500/50"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input type="text" value={search} onChange={(e) => onSearchChange(e.target.value)}
              autoFocus
              placeholder={`Search ${people.length} people…`}
              className="w-full rounded-lg border border-[#333] bg-[#141414] py-2.5 pl-9 pr-9 text-sm font-bold text-white placeholder:text-[#777] focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20 focus:outline-none transition"
            />
            <button
              onClick={() => { setSearchOpen(false); onSearchChange(""); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-white transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-lg border border-[#222] bg-[#111] px-3 py-2.5 text-[#555] hover:border-[#444] hover:text-[#888] transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.12em]">
              Search {people.length} people
            </span>
          </button>
        )}
      </div>

      {/* Spotlight counter */}
      {spotlightPersonIds && spotlightPersonIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-600/5 px-2.5 py-1.5 mb-2">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.1em] text-red-400/80">
            Filtering {spotlightPersonIds.size} of {people.length}
          </span>
          <button
            onClick={() => onClearSpotlight?.()}
            className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wider text-[#666] hover:text-red-400 transition"
          >
            Clear
          </button>
        </div>
      )}

      {/* Suggested People — pinned at top */}
      {!isSearching && suggestedPeople && suggestedPeople.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-red-500/80">
                Suggested
              </span>
            </div>
            {suggestedPeople.map(person => (
              <PersonCard
                key={person.id}
                person={person}
                isOnBoard={isOnBoard(person.id)}
                isFocused={focusedNodeId === person.id}
                isSuggested
                isSpotlighted={spotlightPersonIds?.has(person.id)}
                isActiveTarget={isOnboarding && !isOnBoard(person.id) && (
                  investigationStep === "place-epstein" || investigationStep === "pick-person"
                )}
                onAddPerson={onAddPerson}
                onFocusNode={onFocusNode}
                onToggleSpotlight={onToggleSpotlight}
                connectionCount={connectionCounts.get(person.id) || 0}
              />
            ))}
          </div>
        )}

        {/* Divider */}
        {!isSearching && suggestedPeople && suggestedPeople.length > 0 && otherPeople.length > 0 && (
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="flex-1 h-px bg-[#222]" />
            <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.15em] text-[#444]">
              All People
            </span>
            <div className="flex-1 h-px bg-[#222]" />
          </div>
        )}

        {/* All people (or search results) */}
        {(isSearching ? people : otherPeople).map(person => (
          <PersonCard
            key={person.id}
            person={person}
            isOnBoard={isOnBoard(person.id)}
            isFocused={focusedNodeId === person.id}
            isSuggested={false}
            isSpotlighted={spotlightPersonIds?.has(person.id)}
            isActiveTarget={false}
            onAddPerson={onAddPerson}
            onFocusNode={onFocusNode}
            onToggleSpotlight={onToggleSpotlight}
            connectionCount={connectionCounts.get(person.id) || 0}
          />
        ))}

        {isSearching && people.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[#555] text-sm">No people found</p>
            <p className="text-[#333] text-xs mt-1">Try a different search term</p>
          </div>
        )}
    </div>
  );
}

// ── Person Card (used in both suggested and all-people lists) ────────────────

function PersonCard({ person, isOnBoard, isFocused, isSuggested, isActiveTarget, isSpotlighted, onAddPerson, onFocusNode, onToggleSpotlight, connectionCount }: {
  person: Person;
  isOnBoard: boolean;
  isFocused: boolean;
  isSuggested: boolean;
  isActiveTarget: boolean;
  isSpotlighted?: boolean;
  onAddPerson: (id: string) => void;
  onFocusNode: (id: string | null) => void;
  onToggleSpotlight?: (id: string) => void;
  connectionCount: number;
}) {
  const [imgLoaded, setImgLoaded] = useState(true);
  const hasImage = person.imageUrl && imgLoaded;

  return (
    <div
      draggable={!isOnBoard}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/board-item", JSON.stringify({ id: person.id, kind: "person" }));
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.classList.add("dragging-source");
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove("dragging-source")}
      onClick={() => isOnBoard && onToggleSpotlight?.(person.id)}
      className={`group rounded-xl border overflow-hidden transition-all ${
        isSpotlighted
          ? "border-l-4 border-l-red-500 border-red-500/30 bg-red-600/10 shadow-lg shadow-red-600/10 cursor-pointer"
          : isActiveTarget
          ? "border-red-500/50 bg-red-950/20 shadow-lg shadow-red-600/15 ring-1 ring-red-500/30 cursor-grab active:cursor-grabbing"
          : isFocused
          ? "border-red-500/40 bg-red-600/10"
          : isOnBoard
          ? "border-green-600/15 bg-green-950/5 opacity-50 cursor-pointer hover:opacity-70"
          : isSuggested
          ? "border-red-500/25 bg-[#111] hover:border-red-500/40 cursor-grab active:cursor-grabbing hover:shadow-lg hover:shadow-red-900/10"
          : "border-[#1e1e1e] bg-[#0e0e0e] hover:border-[#333] hover:bg-[#111] cursor-grab active:cursor-grabbing hover:shadow-md hover:shadow-black/30"
      }`}
    >
      {/* Photo — only rendered when image actually loads */}
      {hasImage && (
        <div className="relative w-full h-32 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a] overflow-hidden">
          <img src={person.imageUrl!} alt={person.name} className="h-full w-full object-cover"
            onError={() => setImgLoaded(false)} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-transparent to-transparent" />
          {isOnBoard && (
            <div className="absolute top-1 right-1 rounded bg-green-900/50 border border-green-600/30 px-1 py-0.5 backdrop-blur-sm">
              <span className="text-[7px] font-bold text-green-400">✓ Board</span>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="px-2 py-1.5">
        {/* Badges */}
        <div className="flex items-center gap-1 mb-0.5">
          {connectionCount > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-black/50 border border-green-600/30 px-1 py-px">
              <span className="font-[family-name:var(--font-mono)] text-[7px] text-green-400">{connectionCount} 🔗</span>
            </div>
          )}
          {!hasImage && isOnBoard && (
            <span className="text-[7px] font-bold text-green-400 ml-auto">✓ Board</span>
          )}
        </div>
        <p className="font-[family-name:var(--font-display)] text-[15px] font-bold text-white tracking-wide leading-tight truncate">{person.name}</p>
        {person.photoCount > 0 && (
          <p className="text-[11px] text-[#999] mt-0.5">📸 Tagged in {person.photoCount} {person.photoCount === 1 ? "photo" : "photos"}</p>
        )}

        {/* Action — only show unfocus button for focused on-board nodes, or drag prompt */}
        {isOnBoard && isFocused && (
          <div className="mt-2">
            <button onClick={(e) => { e.stopPropagation(); onFocusNode(null); }}
              className="w-full rounded-lg bg-red-600/20 border border-red-600/30 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-red-400 hover:bg-red-600/30 transition text-center">
              Unfocus
            </button>
          </div>
        )}
        {isActiveTarget && (
          <div className="mt-2">
            <div className="flex items-center justify-center gap-2 rounded-lg bg-red-600/20 border border-red-500/40 px-3 py-2 text-red-400 animate-pulse">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-bounce">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-wider">Drag to Board</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Email Detail View (full email reader) ──────────────────────────────────

function EmailDetailView({ email }: { email: EmailEvidence }) {
  function formatFullDate(dateStr: string | null): string {
    if (!dateStr) return "Unknown date";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Email header */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-4 space-y-3">
        {/* Subject */}
        <h3 className="text-base font-black text-white leading-tight">
          {email.subject}
        </h3>

        {/* Epstein badge */}
        {email.epsteinIsSender && (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-[10px] font-black uppercase tracking-wider text-red-500">
              Sent by Epstein
            </span>
          </div>
        )}

        {/* From */}
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#555] w-10 flex-shrink-0 pt-0.5">From</span>
            <span className={`text-[12px] font-bold ${email.epsteinIsSender ? "text-red-400" : "text-white"}`}>
              {email.sender}
              {email.senderName && email.senderName !== email.sender && (
                <span className="text-[#555] font-normal ml-1">({email.senderName})</span>
              )}
            </span>
          </div>

          {/* To */}
          {email.recipients.length > 0 && (
            <div className="flex gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#555] w-10 flex-shrink-0 pt-0.5">To</span>
              <div className="text-[11px] text-[#aaa] break-all leading-relaxed">
                {email.recipients.join(", ")}
              </div>
            </div>
          )}

          {/* CC */}
          {email.cc.length > 0 && (
            <div className="flex gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#555] w-10 flex-shrink-0 pt-0.5">CC</span>
              <div className="text-[11px] text-[#888] break-all leading-relaxed">
                {email.cc.join(", ")}
              </div>
            </div>
          )}

          {/* Date */}
          <div className="flex gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#555] w-10 flex-shrink-0 pt-0.5">Date</span>
            <span className="text-[11px] text-[#aaa] tabular-nums">
              {formatFullDate(email.date)}
            </span>
          </div>
        </div>
      </div>

      {/* Email body */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[12px] leading-relaxed text-[#ccc] whitespace-pre-wrap font-mono">
          {email.body || "No content available"}
        </div>
      </div>

      {/* Footer metadata */}
      <div className="flex-shrink-0 border-t border-[#1a1a1a] px-4 py-2 flex items-center gap-3 text-[9px] text-[#444]">
        {email.docId && <span>Doc: {email.docId}</span>}
        {email.releaseBatch && <span>Batch: {email.releaseBatch}</span>}
        {email.isPromotional && <span className="text-yellow-600">Promotional</span>}
        <span className="ml-auto text-[#333]">{email.id}</span>
      </div>
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

  if (selectedNode.kind === "entity") {
    const d = selectedNode.data;
    const typeColor = d.type === "place" ? "teal" : d.type === "organization" ? "amber" : "purple";
    const typeLabel = d.type === "place" ? "Place" : d.type === "organization" ? "Organization" : "Event";
    return (
      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`h-3 w-3 rounded-full bg-${typeColor}-500`} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted/60">{typeLabel}</span>
            <button onClick={() => onFocusNode(selectedNode.id)}
              className={`ml-auto text-[9px] rounded px-2 py-0.5 transition ${isFocused ? "bg-accent/20 text-accent" : "bg-accent/10 text-accent/60"}`}>
              {isFocused ? "Unfocus" : "Focus"}
            </button>
          </div>
          <h3 className="text-base font-bold">{d.shortName || d.name}</h3>
          {d.location && <p className="mt-0.5 text-xs text-muted">{d.location}</p>}
          {d.dateRange && <p className="mt-0.5 text-xs text-muted/50 tabular-nums">{d.dateRange}</p>}
        </div>

        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs leading-relaxed text-muted/80">{d.description}</p>
        </div>

        {d.keyPeople.length > 0 && (
          <div className="text-[10px]">
            <span className="text-muted/50 font-bold uppercase tracking-widest">Key People</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {d.keyPeople.map(name => (
                <span key={name} className="rounded bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 text-[#aaa]">{name}</span>
              ))}
            </div>
          </div>
        )}

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
            ? otherNode.kind === "person" ? otherNode.data.name : otherNode.kind === "entity" ? otherNode.data.name : otherNode.data.title
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

// ─── Entity List Tab (Places / Organizations / Events) ─────────────────────

function EntityListTab({ entities, entityType, search, onSearchChange, isOnBoard, onAddEntity, onSpotlightEntity, boardNodes, spotlightPersonIds, people }: {
  entities: SeedEntity[];
  entityType: EntityType;
  search: string;
  onSearchChange: (v: string) => void;
  isOnBoard: (id: string) => boolean;
  onAddEntity?: (entity: SeedEntity) => void;
  onSpotlightEntity?: (entity: SeedEntity) => void;
  boardNodes: BoardNode[];
  spotlightPersonIds?: Set<string>;
  people: Person[];
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = entities;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = entities.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.shortName && e.shortName.toLowerCase().includes(q)) ||
        (e.location && e.location.toLowerCase().includes(q)) ||
        e.keyPeople.some(p => p.toLowerCase().includes(q))
      );
    }
    return list;
  }, [entities, search]);

  const label = entityType === "place" ? "places" : entityType === "organization" ? "orgs" : "events";

  // Build set of person names on the board for spotlight matching
  const boardPersonNames = useMemo(() => {
    const names = new Set<string>();
    for (const n of boardNodes) {
      if (n.kind === "person") names.add(n.data.name.toLowerCase());
    }
    return names;
  }, [boardNodes]);

  return (
    <div className="p-3 space-y-1.5">
      {/* Search bar */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a] pb-2 -mx-3 px-3 pt-0">
        {searchOpen ? (
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-red-500/50"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input type="text" value={search} onChange={(e) => onSearchChange(e.target.value)}
              autoFocus
              placeholder={`Search ${entities.length} ${label}…`}
              className="w-full rounded-lg border border-[#333] bg-[#141414] py-2.5 pl-9 pr-9 text-sm font-bold text-white placeholder:text-[#777] focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20 focus:outline-none transition"
            />
            <button
              onClick={() => { setSearchOpen(false); onSearchChange(""); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-white transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-lg border border-[#222] bg-[#111] px-3 py-2.5 text-[#555] hover:border-[#444] hover:text-[#888] transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.12em]">
              Search {entities.length} {label}
            </span>
          </button>
        )}
      </div>

      {/* Entity cards */}
      {filtered.map(entity => {
        const onBoard = isOnBoard(entity.id);
        // Count how many keyPeople are on the board
        const matchedPeople = entity.keyPeople.filter(name => boardPersonNames.has(name.toLowerCase())).length;

        if (entityType === "place") {
          return <PlaceCard key={entity.id} entity={entity} isOnBoard={onBoard} onAdd={onAddEntity} onSpotlight={onSpotlightEntity} matchedPeople={matchedPeople} />;
        }
        if (entityType === "organization") {
          return <OrgCard key={entity.id} entity={entity} isOnBoard={onBoard} onAdd={onAddEntity} onSpotlight={onSpotlightEntity} matchedPeople={matchedPeople} />;
        }
        return <EventCard key={entity.id} entity={entity} isOnBoard={onBoard} onAdd={onAddEntity} onSpotlight={onSpotlightEntity} matchedPeople={matchedPeople} />;
      })}

      {filtered.length === 0 && (
        <div className="text-center py-8">
          <p className="text-[#555] text-sm">No {label} found</p>
          <p className="text-[#333] text-xs mt-1">Try a different search term</p>
        </div>
      )}

      {/* Credit line */}
      <div className="pt-4 pb-2">
        <p className="text-[8px] text-[#333] text-center leading-relaxed">
          Entity imagery sourced from Wikipedia and Wikimedia Commons under CC BY-SA / public domain licenses.
        </p>
      </div>
    </div>
  );
}

// ─── Place Card ────────────────────────────────────────────────────────────

function PlaceCard({ entity, isOnBoard, onAdd, onSpotlight, matchedPeople }: {
  entity: SeedEntity; isOnBoard: boolean;
  onAdd?: (e: SeedEntity) => void; onSpotlight?: (e: SeedEntity) => void;
  matchedPeople: number;
}) {
  const [imgLoaded, setImgLoaded] = useState(true);
  const hasImage = entity.image.strategy !== "none" && imgLoaded;
  const imgSrc = entity.image.strategy !== "none" ? `/entity-images/${entity.id}.jpg` : null;

  return (
    <div
      draggable={!isOnBoard}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/board-item", JSON.stringify({ id: entity.id, kind: "entity", entityType: entity.type }));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onSpotlight?.(entity)}
      className={`group rounded-xl border overflow-hidden transition-all cursor-pointer ${
        isOnBoard
          ? "border-green-600/15 bg-green-950/5 opacity-50 hover:opacity-70"
          : "border-[#1e1e1e] bg-[#0e0e0e] hover:border-teal-500/30 hover:bg-[#111] cursor-grab active:cursor-grabbing hover:shadow-md hover:shadow-black/30"
      }`}
    >
      {/* Landscape photo with name overlay */}
      {hasImage && imgSrc ? (
        <div className="relative w-full h-28 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a] overflow-hidden">
          <img src={imgSrc} alt={entity.name} className="h-full w-full object-cover"
            onError={() => setImgLoaded(false)} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5">
            <p className="font-[family-name:var(--font-display)] text-[14px] font-bold text-white tracking-wide leading-tight drop-shadow-lg">
              {entity.shortName || entity.name}
            </p>
          </div>
          {isOnBoard && (
            <div className="absolute top-1 right-1 rounded bg-green-900/50 border border-green-600/30 px-1 py-0.5 backdrop-blur-sm">
              <span className="text-[7px] font-bold text-green-400">✓ Board</span>
            </div>
          )}
        </div>
      ) : (
        /* Stylized no-image place card — teal accent */
        <div className="relative border-l-4 border-l-teal-500 px-2.5 py-3 bg-gradient-to-r from-teal-950/20 to-transparent">
          <div className="flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-teal-500/60 flex-shrink-0 mt-0.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            <div>
              <p className="font-[family-name:var(--font-display)] text-[14px] font-bold text-white tracking-wide leading-tight">
                {entity.shortName || entity.name}
              </p>
              {entity.location && (
                <p className="text-[10px] text-teal-400/50 mt-0.5">{entity.location}</p>
              )}
            </div>
          </div>
          {isOnBoard && (
            <span className="absolute top-1 right-1 text-[7px] font-bold text-green-400">✓ Board</span>
          )}
        </div>
      )}

      {/* Info strip */}
      <div className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          {matchedPeople > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-black/50 border border-teal-600/30 px-1 py-px">
              <span className="font-[family-name:var(--font-mono)] text-[7px] text-teal-400">{matchedPeople} linked</span>
            </div>
          )}
          {entity.dateRange && (
            <span className="font-[family-name:var(--font-mono)] text-[8px] text-[#555] ml-auto">{entity.dateRange}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Organization Card ─────────────────────────────────────────────────────

function OrgCard({ entity, isOnBoard, onAdd, onSpotlight, matchedPeople }: {
  entity: SeedEntity; isOnBoard: boolean;
  onAdd?: (e: SeedEntity) => void; onSpotlight?: (e: SeedEntity) => void;
  matchedPeople: number;
}) {
  const [imgLoaded, setImgLoaded] = useState(true);
  const hasImage = entity.image.strategy !== "none" && imgLoaded;
  const imgSrc = entity.image.strategy !== "none" ? `/entity-images/${entity.id}.jpg` : null;

  return (
    <div
      draggable={!isOnBoard}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/board-item", JSON.stringify({ id: entity.id, kind: "entity", entityType: entity.type }));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onSpotlight?.(entity)}
      className={`group rounded-xl border overflow-hidden transition-all cursor-pointer ${
        isOnBoard
          ? "border-green-600/15 bg-green-950/5 opacity-50 hover:opacity-70"
          : "border-[#1e1e1e] bg-[#0e0e0e] hover:border-amber-500/30 hover:bg-[#111] cursor-grab active:cursor-grabbing hover:shadow-md hover:shadow-black/30"
      }`}
    >
      {/* Image in top half if available */}
      {hasImage && imgSrc && (
        <div className="relative w-full h-20 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] overflow-hidden">
          <img src={imgSrc} alt={entity.name} className="h-full w-full object-cover opacity-80"
            onError={() => setImgLoaded(false)} />
          {isOnBoard && (
            <div className="absolute top-1 right-1 rounded bg-green-900/50 border border-green-600/30 px-1 py-0.5 backdrop-blur-sm">
              <span className="text-[7px] font-bold text-green-400">✓ Board</span>
            </div>
          )}
        </div>
      )}

      {/* Letterhead-style label */}
      <div className={`relative px-2.5 py-2.5 ${!hasImage ? "border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-950/15 to-transparent" : "border-t border-amber-500/20"}`}>
        {!hasImage && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500/40 mb-1">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M3 9h6M3 15h6" />
          </svg>
        )}
        <p className="font-[family-name:var(--font-mono)] text-[12px] font-bold text-white tracking-wide leading-tight">
          {entity.shortName || entity.name}
        </p>
        {entity.location && (
          <p className="text-[9px] text-amber-400/40 mt-0.5 font-[family-name:var(--font-mono)] tracking-wider uppercase">{entity.location}</p>
        )}
        {!hasImage && isOnBoard && (
          <span className="absolute top-1 right-1 text-[7px] font-bold text-green-400">✓ Board</span>
        )}
      </div>

      {/* Info strip */}
      <div className="px-2 py-1">
        <div className="flex items-center gap-1">
          {matchedPeople > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-black/50 border border-amber-600/30 px-1 py-px">
              <span className="font-[family-name:var(--font-mono)] text-[7px] text-amber-400">{matchedPeople} linked</span>
            </div>
          )}
          {entity.dateRange && (
            <span className="font-[family-name:var(--font-mono)] text-[8px] text-[#555] ml-auto">{entity.dateRange}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Event Card ────────────────────────────────────────────────────────────

function EventCard({ entity, isOnBoard, onAdd, onSpotlight, matchedPeople }: {
  entity: SeedEntity; isOnBoard: boolean;
  onAdd?: (e: SeedEntity) => void; onSpotlight?: (e: SeedEntity) => void;
  matchedPeople: number;
}) {
  // Deterministic tilt from entity id
  const tilt = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < entity.id.length; i++) hash = ((hash << 5) - hash) + entity.id.charCodeAt(i);
    return ((hash % 3) - 1) * 1.2; // -1.2 to 1.2 degrees
  }, [entity.id]);

  const [imgLoaded, setImgLoaded] = useState(true);
  const hasImage = entity.image.strategy !== "none" && imgLoaded;
  const imgSrc = entity.image.strategy !== "none" ? `/entity-images/${entity.id}.jpg` : null;

  return (
    <div
      draggable={!isOnBoard}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/board-item", JSON.stringify({ id: entity.id, kind: "entity", entityType: entity.type }));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onSpotlight?.(entity)}
      style={{ transform: `rotate(${tilt}deg)` }}
      className={`group rounded-sm border-2 overflow-hidden transition-all cursor-pointer shadow-md shadow-black/40 ${
        isOnBoard
          ? "border-[#d4d0c8]/30 bg-[#d4d0c8]/5 opacity-50 hover:opacity-70"
          : "border-[#d4d0c8]/60 bg-[#f5f0e8]/5 hover:border-purple-400/50 cursor-grab active:cursor-grabbing hover:shadow-lg hover:shadow-purple-900/20"
      }`}
    >
      {/* Polaroid style: image if available */}
      {hasImage && imgSrc && (
        <div className="relative w-full h-20 bg-[#1a1a1a] overflow-hidden">
          <img src={imgSrc} alt={entity.name} className="h-full w-full object-cover"
            onError={() => setImgLoaded(false)} />
        </div>
      )}

      {/* Content area */}
      <div className={`px-2.5 py-2 ${!hasImage ? "border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-950/15 to-transparent" : ""}`}>
        {/* Date range in small-caps monospace */}
        {entity.dateRange && (
          <p className="font-[family-name:var(--font-mono)] text-[9px] text-purple-400/70 uppercase tracking-[0.15em] mb-0.5">
            {entity.dateRange}
          </p>
        )}
        <p className="text-[12px] font-bold text-white leading-tight">
          {entity.shortName || entity.name}
        </p>
        {!hasImage && (
          <div className="flex items-center gap-1 mt-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500/40">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {entity.location && (
              <span className="text-[8px] text-[#666]">{entity.location}</span>
            )}
          </div>
        )}
      </div>

      {/* Footer strip */}
      <div className="px-2 py-1 border-t border-[#1a1a1a]">
        <div className="flex items-center gap-1">
          {matchedPeople > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-black/50 border border-purple-600/30 px-1 py-px">
              <span className="font-[family-name:var(--font-mono)] text-[7px] text-purple-400">{matchedPeople} linked</span>
            </div>
          )}
          {isOnBoard && (
            <span className="text-[7px] font-bold text-green-400 ml-auto">✓ Board</span>
          )}
        </div>
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
