"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { Person } from "@/lib/types";
import type { InvestigationStep } from "@/lib/investigation-types";
import type {
  BoardNode,
  BoardConnection,
  BoardFlightNodeData,
  PinnedEvidence,
  RightPanelTab,
  TimelineEvent,
  FocusState,
} from "@/lib/board-types";
import { PLACES, ORGANIZATIONS, EVENTS } from "@/lib/entity-seed-data";
import type { SeedEntity, EntityType } from "@/lib/entity-seed-data";

interface ContextPanelProps {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  people: Person[];
  focusedNodeId: string | null;
  boardConnections: BoardConnection[];
  boardNodes: BoardNode[];
  isOnBoard: (id: string) => boolean;
  onAddPerson: (personId: string) => void;
  onFocusNode: (id: string | null) => void;
  suggestedPeople?: Person[];
  investigationStep?: InvestigationStep | null;
  spotlightPersonIds?: Set<string>;
  onToggleSpotlight?: (personId: string) => void;
  onClearSpotlight?: () => void;
  onAddEntity?: (entity: SeedEntity) => void;
  onSpotlightEntity?: (entity: SeedEntity) => void;
  isWideMode?: boolean;
}

const TABS: { key: RightPanelTab; label: string }[] = [
  { key: "persons", label: "People" },
  { key: "places", label: "Places" },
  { key: "orgs", label: "Orgs" },
  { key: "events", label: "Events" },
  { key: "flights", label: "Flights" },
];

export function ContextPanel({
  activeTab,
  onTabChange,
  people,
  focusedNodeId,
  boardConnections,
  boardNodes,
  isOnBoard,
  onAddPerson,
  onFocusNode,
  suggestedPeople,
  investigationStep,
  spotlightPersonIds,
  onToggleSpotlight,
  onClearSpotlight,
  onAddEntity,
  onSpotlightEntity,
  isWideMode,
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
    <aside className={`context-panel flex h-full w-full flex-shrink-0 flex-col border-l border-[#1a1a1a] overflow-hidden ${
      isOnboarding ? "bg-[#080808]" : ""
    }`}>
      {/* Tab bar — muted during onboarding */}
      <div className={`flex flex-shrink-0 border-b border-[#1a1a1a] transition-opacity duration-300 ${
        isOnboarding ? "opacity-40" : ""
      }`}>
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => onTabChange(tab.key)}
            className={`flex-1 font-[family-name:var(--font-mono)] uppercase transition min-w-0 ${
              isWideMode ? "py-3 text-[11px] tracking-[0.12em] px-2" : "py-2 text-[9px] tracking-[0.08em] px-0.5"
            } ${
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
            spotlightPersonIds={spotlightPersonIds} onToggleSpotlight={onToggleSpotlight} onClearSpotlight={onClearSpotlight}
            isWideMode={isWideMode} />
        )}
        {activeTab === "places" && (
          <EntityListTab entities={PLACES} entityType="place" search={entitySearch}
            onSearchChange={setEntitySearch} isOnBoard={isOnBoard} onAddEntity={onAddEntity}
            onSpotlightEntity={onSpotlightEntity} boardNodes={boardNodes}
            spotlightPersonIds={spotlightPersonIds} people={people} isWideMode={isWideMode} />
        )}
        {activeTab === "orgs" && (
          <EntityListTab entities={ORGANIZATIONS} entityType="organization" search={entitySearch}
            onSearchChange={setEntitySearch} isOnBoard={isOnBoard} onAddEntity={onAddEntity}
            onSpotlightEntity={onSpotlightEntity} boardNodes={boardNodes}
            spotlightPersonIds={spotlightPersonIds} people={people} isWideMode={isWideMode} />
        )}
        {activeTab === "events" && (
          <EntityListTab entities={EVENTS} entityType="event" search={entitySearch}
            onSearchChange={setEntitySearch} isOnBoard={isOnBoard} onAddEntity={onAddEntity}
            onSpotlightEntity={onSpotlightEntity} boardNodes={boardNodes}
            spotlightPersonIds={spotlightPersonIds} people={people} isWideMode={isWideMode} />
        )}
        {activeTab === "flights" && (
          <FlightsTab isOnBoard={isOnBoard} isWideMode={isWideMode} />
        )}
      </div>
    </aside>
  );
}

// ─── Persons Tab ──────────────────────────────────────────────────────────

function PersonsTab({ people, search, onSearchChange, isOnBoard, onAddPerson, focusedNodeId, onFocusNode, suggestedPeople, investigationStep, boardConnections, spotlightPersonIds, onToggleSpotlight, onClearSpotlight, isWideMode }: {
  people: Person[]; search: string; onSearchChange: (v: string) => void;
  isOnBoard: (id: string) => boolean; onAddPerson: (id: string) => void;
  focusedNodeId: string | null; onFocusNode: (id: string | null) => void;
  suggestedPeople?: Person[];
  investigationStep?: InvestigationStep | null;
  boardConnections: BoardConnection[];
  spotlightPersonIds?: Set<string>;
  onToggleSpotlight?: (id: string) => void;
  onClearSpotlight?: () => void;
  isWideMode?: boolean;
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
    <div className="p-3">
      {/* ── SEARCH BAR ── */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a] pb-2 -mx-3 px-3 pt-0 mb-1.5">
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
            <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
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
                isWideMode={isWideMode}
              />
            ))}
            </div>
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
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
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
        </div>

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

function PersonCard({ person, isOnBoard, isFocused, isSuggested, isActiveTarget, isSpotlighted, onAddPerson, onFocusNode, onToggleSpotlight, connectionCount, isWideMode }: {
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
  isWideMode?: boolean;
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
        <div className={`relative w-full bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a] overflow-hidden ${isWideMode ? "h-48" : "h-32"}`}>
          <img src={person.imageUrl!} alt={person.name} className="h-full w-full object-cover"
            onError={() => setImgLoaded(false)} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-transparent to-transparent" />
          {isOnBoard && (
            <div className={`absolute top-1 right-1 rounded bg-green-900/50 border border-green-600/30 backdrop-blur-sm ${isWideMode ? "px-1.5 py-1" : "px-1 py-0.5"}`}>
              <span className={`font-bold text-green-400 ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>✓ Board</span>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className={isWideMode ? "px-3 py-2.5" : "px-2 py-1.5"}>
        {/* Badges */}
        <div className={`flex items-center gap-1 ${isWideMode ? "mb-1" : "mb-0.5"}`}>
          {connectionCount > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-black/50 border border-green-600/30 px-1 py-px">
              <span className={`font-[family-name:var(--font-mono)] text-green-400 ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>{connectionCount} 🔗</span>
            </div>
          )}
          {!hasImage && isOnBoard && (
            <span className={`font-bold text-green-400 ml-auto ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>✓ Board</span>
          )}
        </div>
        <p className={`font-[family-name:var(--font-display)] font-bold text-white tracking-wide leading-tight ${isWideMode ? "text-[18px]" : "text-[15px] truncate"}`}>{person.name}</p>
        {person.photoCount > 0 && (
          <p className={`text-[#999] ${isWideMode ? "text-[13px] mt-1" : "text-[11px] mt-0.5"}`}>📸 Tagged in {person.photoCount} {person.photoCount === 1 ? "photo" : "photos"}</p>
        )}
        {isWideMode && person.source && (
          <p className="text-[11px] text-[#666] mt-1">{person.source}</p>
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


// ─── Entity List Tab (Places / Organizations / Events) ─────────────────────

function EntityListTab({ entities, entityType, search, onSearchChange, isOnBoard, onAddEntity, onSpotlightEntity, boardNodes, spotlightPersonIds, people, isWideMode }: {
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
  isWideMode?: boolean;
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

      {/* Entity cards — auto 2-col grid when panel is wide */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
      {filtered.map(entity => {
        const onBoard = isOnBoard(entity.id);
        const matchedPeople = entity.keyPeople.filter(name => boardPersonNames.has(name.toLowerCase())).length;

        if (entityType === "place") {
          return <PlaceCard key={entity.id} entity={entity} isOnBoard={onBoard} onAdd={onAddEntity} onSpotlight={onSpotlightEntity} matchedPeople={matchedPeople} isWideMode={isWideMode} />;
        }
        if (entityType === "organization") {
          return <OrgCard key={entity.id} entity={entity} isOnBoard={onBoard} onAdd={onAddEntity} onSpotlight={onSpotlightEntity} matchedPeople={matchedPeople} isWideMode={isWideMode} />;
        }
        return <EventCard key={entity.id} entity={entity} isOnBoard={onBoard} onAdd={onAddEntity} onSpotlight={onSpotlightEntity} matchedPeople={matchedPeople} isWideMode={isWideMode} />;
      })}
      </div>

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

function PlaceCard({ entity, isOnBoard, onAdd, onSpotlight, matchedPeople, isWideMode }: {
  entity: SeedEntity; isOnBoard: boolean;
  onAdd?: (e: SeedEntity) => void; onSpotlight?: (e: SeedEntity) => void;
  matchedPeople: number; isWideMode?: boolean;
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
        <div className={`relative w-full bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a] overflow-hidden ${isWideMode ? "h-44" : "h-28"}`}>
          <img src={imgSrc} alt={entity.name} className="h-full w-full object-cover"
            onError={() => setImgLoaded(false)} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className={`absolute bottom-0 left-0 right-0 ${isWideMode ? "px-3 pb-2.5" : "px-2 pb-1.5"}`}>
            <p className={`font-[family-name:var(--font-display)] font-bold text-white tracking-wide leading-tight drop-shadow-lg ${isWideMode ? "text-[18px]" : "text-[14px]"}`}>
              {entity.shortName || entity.name}
            </p>
            {isWideMode && entity.location && (
              <p className="text-[11px] text-white/60 mt-0.5">{entity.location}</p>
            )}
          </div>
          {isOnBoard && (
            <div className={`absolute top-1 right-1 rounded bg-green-900/50 border border-green-600/30 backdrop-blur-sm ${isWideMode ? "px-1.5 py-1" : "px-1 py-0.5"}`}>
              <span className={`font-bold text-green-400 ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>✓ Board</span>
            </div>
          )}
        </div>
      ) : (
        /* Stylized no-image place card — teal accent */
        <div className={`relative border-l-4 border-l-teal-500 bg-gradient-to-r from-teal-950/20 to-transparent ${isWideMode ? "px-4 py-4" : "px-2.5 py-3"}`}>
          <div className="flex items-start gap-2">
            <svg width={isWideMode ? 20 : 16} height={isWideMode ? 20 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-teal-500/60 flex-shrink-0 mt-0.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            <div>
              <p className={`font-[family-name:var(--font-display)] font-bold text-white tracking-wide leading-tight ${isWideMode ? "text-[18px]" : "text-[14px]"}`}>
                {entity.shortName || entity.name}
              </p>
              {entity.location && (
                <p className={`text-teal-400/50 ${isWideMode ? "text-[12px] mt-1" : "text-[10px] mt-0.5"}`}>{entity.location}</p>
              )}
            </div>
          </div>
          {isOnBoard && (
            <span className={`absolute top-1 right-1 font-bold text-green-400 ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>✓ Board</span>
          )}
        </div>
      )}

      {/* Info strip */}
      <div className={isWideMode ? "px-3 py-2" : "px-2 py-1.5"}>
        <div className="flex items-center gap-1">
          {matchedPeople > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-black/50 border border-teal-600/30 px-1 py-px">
              <span className={`font-[family-name:var(--font-mono)] text-teal-400 ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>{matchedPeople} linked</span>
            </div>
          )}
          {entity.dateRange && (
            <span className={`font-[family-name:var(--font-mono)] text-[#555] ml-auto ${isWideMode ? "text-[10px]" : "text-[8px]"}`}>{entity.dateRange}</span>
          )}
        </div>
        {isWideMode && entity.description && (
          <p className="text-[11px] text-[#666] leading-relaxed mt-1.5 line-clamp-3">{entity.description}</p>
        )}
      </div>
    </div>
  );
}

// ─── Organization Card ─────────────────────────────────────────────────────

function OrgCard({ entity, isOnBoard, onAdd, onSpotlight, matchedPeople, isWideMode }: {
  entity: SeedEntity; isOnBoard: boolean;
  onAdd?: (e: SeedEntity) => void; onSpotlight?: (e: SeedEntity) => void;
  matchedPeople: number; isWideMode?: boolean;
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
        <div className={`relative w-full bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] overflow-hidden ${isWideMode ? "h-32" : "h-20"}`}>
          <img src={imgSrc} alt={entity.name} className="h-full w-full object-cover opacity-80"
            onError={() => setImgLoaded(false)} />
          {isOnBoard && (
            <div className={`absolute top-1 right-1 rounded bg-green-900/50 border border-green-600/30 backdrop-blur-sm ${isWideMode ? "px-1.5 py-1" : "px-1 py-0.5"}`}>
              <span className={`font-bold text-green-400 ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>✓ Board</span>
            </div>
          )}
        </div>
      )}

      {/* Letterhead-style label */}
      <div className={`relative ${!hasImage ? "border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-950/15 to-transparent" : "border-t border-amber-500/20"} ${isWideMode ? "px-4 py-3.5" : "px-2.5 py-2.5"}`}>
        {!hasImage && (
          <svg width={isWideMode ? 18 : 14} height={isWideMode ? 18 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-500/40 mb-1">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M3 9h6M3 15h6" />
          </svg>
        )}
        <p className={`font-[family-name:var(--font-mono)] font-bold text-white tracking-wide leading-tight ${isWideMode ? "text-[15px]" : "text-[12px]"}`}>
          {entity.shortName || entity.name}
        </p>
        {entity.location && (
          <p className={`text-amber-400/40 font-[family-name:var(--font-mono)] tracking-wider uppercase ${isWideMode ? "text-[10px] mt-1" : "text-[9px] mt-0.5"}`}>{entity.location}</p>
        )}
        {!hasImage && isOnBoard && (
          <span className={`absolute top-1 right-1 font-bold text-green-400 ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>✓ Board</span>
        )}
      </div>

      {/* Info strip */}
      <div className={isWideMode ? "px-4 py-2" : "px-2 py-1"}>
        <div className="flex items-center gap-1">
          {matchedPeople > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-black/50 border border-amber-600/30 px-1 py-px">
              <span className={`font-[family-name:var(--font-mono)] text-amber-400 ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>{matchedPeople} linked</span>
            </div>
          )}
          {entity.dateRange && (
            <span className={`font-[family-name:var(--font-mono)] text-[#555] ml-auto ${isWideMode ? "text-[10px]" : "text-[8px]"}`}>{entity.dateRange}</span>
          )}
        </div>
        {isWideMode && entity.description && (
          <p className="text-[11px] text-[#666] leading-relaxed mt-1.5 line-clamp-3">{entity.description}</p>
        )}
      </div>
    </div>
  );
}

// ─── Event Card ────────────────────────────────────────────────────────────

function EventCard({ entity, isOnBoard, onAdd, onSpotlight, matchedPeople, isWideMode }: {
  entity: SeedEntity; isOnBoard: boolean;
  onAdd?: (e: SeedEntity) => void; onSpotlight?: (e: SeedEntity) => void;
  matchedPeople: number; isWideMode?: boolean;
}) {
  // Deterministic tilt from entity id
  const tilt = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < entity.id.length; i++) hash = ((hash << 5) - hash) + entity.id.charCodeAt(i);
    return ((hash % 3) - 1) * 1.2;
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
        <div className={`relative w-full bg-[#1a1a1a] overflow-hidden ${isWideMode ? "h-36" : "h-20"}`}>
          <img src={imgSrc} alt={entity.name} className="h-full w-full object-cover"
            onError={() => setImgLoaded(false)} />
        </div>
      )}

      {/* Content area */}
      <div className={`${!hasImage ? "border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-950/15 to-transparent" : ""} ${isWideMode ? "px-4 py-3" : "px-2.5 py-2"}`}>
        {/* Date range in small-caps monospace */}
        {entity.dateRange && (
          <p className={`font-[family-name:var(--font-mono)] text-purple-400/70 uppercase tracking-[0.15em] mb-0.5 ${isWideMode ? "text-[11px]" : "text-[9px]"}`}>
            {entity.dateRange}
          </p>
        )}
        <p className={`font-bold text-white leading-tight ${isWideMode ? "text-[15px]" : "text-[12px]"}`}>
          {entity.shortName || entity.name}
        </p>
        {!hasImage && (
          <div className={`flex items-center gap-1 ${isWideMode ? "mt-1.5" : "mt-1"}`}>
            <svg width={isWideMode ? 12 : 10} height={isWideMode ? 12 : 10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-500/40">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {entity.location && (
              <span className={`text-[#666] ${isWideMode ? "text-[10px]" : "text-[8px]"}`}>{entity.location}</span>
            )}
          </div>
        )}
        {isWideMode && entity.description && (
          <p className="text-[11px] text-[#666] leading-relaxed mt-1.5 line-clamp-3">{entity.description}</p>
        )}
      </div>

      {/* Footer strip */}
      <div className={`border-t border-[#1a1a1a] ${isWideMode ? "px-4 py-1.5" : "px-2 py-1"}`}>
        <div className="flex items-center gap-1">
          {matchedPeople > 0 && (
            <div className="flex items-center gap-0.5 rounded bg-black/50 border border-purple-600/30 px-1 py-px">
              <span className={`font-[family-name:var(--font-mono)] text-purple-400 ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>{matchedPeople} linked</span>
            </div>
          )}
          {isOnBoard && (
            <span className={`font-bold text-green-400 ml-auto ${isWideMode ? "text-[9px]" : "text-[7px]"}`}>✓ Board</span>
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

// ─── Flights Tab ──────────────────────────────────────────────────────────

interface FlightListItem {
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
}

function FlightsTab({
  isOnBoard,
  isWideMode,
}: {
  isOnBoard: (id: string) => boolean;
  isWideMode?: boolean;
}) {
  const [flights, setFlights] = useState<FlightListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const didInit = useRef(false);

  const fetchFlights = async (q: string, off: number, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30", offset: String(off) });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/flights?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data: { flights: FlightListItem[]; total: number; hasMore: boolean } = await res.json();
      setFlights((prev) => (append ? [...prev, ...data.flights] : data.flights));
      setTotal(data.total);
      setHasMore(data.hasMore);
      setOffset(off);
    } catch (err) {
      console.error("Flights tab fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      fetchFlights("", 0, false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!didInit.current) return;
    const t = setTimeout(() => fetchFlights(search, 0, false), 220);
    return () => clearTimeout(t);
  }, [search]);

  const loadMore = () => {
    if (hasMore && !loading) fetchFlights(search, offset + 30, true);
  };

  return (
    <div className="p-2">
      {/* Search */}
      <div className="mb-2 relative">
        <svg
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555]"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search flights by passenger, city, aircraft…"
          className="w-full rounded border border-[#2a2a2a] bg-[#111] py-1.5 pl-8 pr-2 text-[11px] text-white placeholder:text-[#555] focus:border-red-500/40 focus:outline-none transition"
        />
      </div>

      {/* Status */}
      <div className="mb-1 flex items-center justify-between px-1 text-[9px] font-bold text-[#555]">
        <span>
          {loading && flights.length === 0 ? (
            <span className="flex items-center gap-1 text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              Loading…
            </span>
          ) : (
            <span>{total.toLocaleString()} flights</span>
          )}
        </span>
        <span className="text-[#444] tabular-nums">{flights.length} loaded</span>
      </div>

      {/* Flight list */}
      <div className="space-y-1">
        {flights.map((f) => {
          const onBoard = isOnBoard(f.id);
          return (
            <div
              key={f.id}
              draggable={!onBoard}
              onDragStart={(e) => {
                const payload = {
                  id: f.id,
                  kind: "flight",
                  data: f,
                };
                e.dataTransfer.setData("application/board-item", JSON.stringify(payload));
                e.dataTransfer.effectAllowed = "move";
                e.currentTarget.classList.add("dragging-source");
              }}
              onDragEnd={(e) => e.currentTarget.classList.remove("dragging-source")}
              className={`group rounded border border-[#222] bg-[#0e0e0e] hover:border-[#9d8555]/60 hover:bg-[#151515] transition ${
                isWideMode ? "px-3 py-2.5" : "px-2 py-1.5"
              } ${onBoard ? "opacity-50" : "cursor-grab active:cursor-grabbing"}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[12px]">✈️</span>
                <span className={`flex-1 font-bold text-white truncate ${isWideMode ? "text-[12px]" : "text-[10px]"}`}>
                  {f.departureCode ?? f.departureCity ?? "?"} → {f.arrivalCode ?? f.arrivalCity ?? "?"}
                </span>
                {f.date && (
                  <span className={`text-[#555] tabular-nums flex-shrink-0 ${isWideMode ? "text-[10px]" : "text-[9px]"}`}>
                    {f.date}
                  </span>
                )}
              </div>
              <p className={`text-[#777] pl-[18px] truncate ${isWideMode ? "text-[10px] mt-0.5" : "text-[9px]"}`}>
                {f.snippet || "(no passengers recorded)"}
              </p>
              <div className="pl-[18px] mt-0.5 flex items-center gap-2 text-[8px] text-[#555]">
                {f.aircraft && (
                  <span className="font-[family-name:var(--font-mono)] uppercase tracking-wider">{f.aircraft}</span>
                )}
                {f.passengerCount > 0 && <span>{f.passengerCount} pax</span>}
                {onBoard && (
                  <span className="ml-auto font-bold uppercase tracking-wider text-green-500/60">✓ On Board</span>
                )}
              </div>
            </div>
          );
        })}
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="w-full py-2 text-center font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.15em] text-[#555] hover:text-white hover:bg-[#161616] transition rounded border border-[#1a1a1a]"
          >
            {loading ? "Loading…" : "Load More ↓"}
          </button>
        )}
        {flights.length === 0 && !loading && (
          <div className="py-8 text-center text-[10px] text-[#555]">No flights found.</div>
        )}
      </div>
    </div>
  );
}
