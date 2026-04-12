"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from "react";
import type {
  Person,
  SearchResult,
  EmailListItem,
  EmailEvidence,
} from "@/lib/types";
import type { BoardNode, BoardConnection } from "@/lib/board-types";
import { EVIDENCE_TYPE_ICON, EVIDENCE_TYPE_LABEL } from "@/lib/board-types";

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════════ */

type ActivePanel =
  | null
  | "comms"
  | "files"
  | "links"
  | "sources"
  | "compare";

interface CompareItem {
  id: string;
  title: string;
  type: "email" | "document" | "photo" | "imessage" | "flight_log" | "video" | "external";
  date: string | null;
  sender: string | null;
  snippet: string;
  body?: string;
}

interface ExternalSource {
  id: string;
  url: string;
  title: string;
  description: string;
  image: string;
  domain: string;
  textContent: string;
  addedAt: number;
}

export interface SubjectFocusViewProps {
  person: Person;
  boardNodes: BoardNode[];
  boardConnections: BoardConnection[];
  people: Person[];
  isOnBoard: (id: string) => boolean;
  onClose: () => void;
  onAddEvidence: (result: SearchResult) => void;
  onAddPerson: (personId: string) => void;
  onFocusNode: (id: string | null) => void;
  onCreateConnection: (targetId: string) => void;
  onRemoveConnection: (connId: string) => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════════ */

export function SubjectFocusView({
  person,
  boardNodes,
  boardConnections,
  people,
  isOnBoard,
  onClose,
  onAddEvidence,
  onAddPerson,
  onFocusNode,
  onCreateConnection,
  onRemoveConnection,
}: SubjectFocusViewProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [compareItems, setCompareItems] = useState<CompareItem[]>([]);
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);

  // ESC to close panel first, then overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activePanel) setActivePanel(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, activePanel]);

  // Connections for this person
  const connections = useMemo(
    () =>
      boardConnections.filter(
        (c) => c.sourceId === person.id || c.targetId === person.id
      ),
    [boardConnections, person.id]
  );

  const connectedNodes = useMemo(() => {
    const ids = new Set(
      connections.map((c) =>
        c.sourceId === person.id ? c.targetId : c.sourceId
      )
    );
    return boardNodes.filter((n) => ids.has(n.id));
  }, [connections, boardNodes, person.id]);

  // Compare helpers
  const addToCompare = useCallback(
    (item: CompareItem) => {
      if (compareItems.length >= 4) return;
      if (compareItems.some((c) => c.id === item.id)) return;
      setCompareItems((prev) => [...prev, item]);
    },
    [compareItems]
  );
  const removeFromCompare = useCallback((id: string) => {
    setCompareItems((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Action buttons around the hero
  const ACTIONS: {
    key: ActivePanel;
    label: string;
    icon: string;
    desc: string;
  }[] = [
    { key: "comms", label: "Comms", icon: "✉️", desc: "Search emails" },
    { key: "files", label: "Files", icon: "📁", desc: "Documents & photos" },
    { key: "links", label: "Links", icon: "🔗", desc: "Board connections" },
    { key: "sources", label: "Sources", icon: "🌐", desc: "External links" },
    {
      key: "compare",
      label: "Compare",
      icon: "⚖️",
      desc: `${compareItems.length} pinned`,
    },
  ];

  const panelOpen = activePanel !== null;

  return (
    <div className="subject-overlay fixed inset-0 z-[100] flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#030303]/98 subject-vignette" />
      <div className="absolute inset-0 pointer-events-none scanline-overlay" />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center border-b border-red-900/15 bg-[#080808]/80 px-5 py-2.5 backdrop-blur-sm flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-[#555] hover:text-white transition group"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="group-hover:-translate-x-0.5 transition-transform"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Board
        </button>

        <div className="mx-auto flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/60">
            Subject Dossier
          </span>
        </div>

        <span className="text-[10px] font-bold text-[#333] tracking-wider">
          ESC
        </span>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* ═══ LEFT: Hero zone — person photo + action ring ═══════════════ */}
        <div
          className={`flex flex-col items-center justify-center transition-all duration-500 ease-out ${
            panelOpen ? "w-[320px] flex-shrink-0" : "flex-1"
          }`}
        >
          <div
            className={`flex flex-col items-center transition-all duration-500 ${
              panelOpen ? "scale-75" : "scale-100"
            }`}
          >
            {/* Photo */}
            <div className="subject-photo-container relative mb-5">
              <div className="subject-photo-glow" />
              {person.imageUrl ? (
                <>
                  <img
                    src={person.imageUrl}
                    alt={person.name}
                    className={`rounded-xl object-cover border-2 border-red-900/30 shadow-2xl shadow-red-950/40 relative z-10 transition-all duration-500 ${
                      panelOpen
                        ? "h-48 w-48"
                        : "h-72 w-72 lg:h-80 lg:w-80"
                    }`}
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                  <div
                    className={`rounded-xl border-2 border-red-900/30 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a] items-center justify-center relative z-10 shadow-2xl shadow-red-950/40 transition-all duration-500 hidden ${
                      panelOpen
                        ? "h-48 w-48"
                        : "h-72 w-72 lg:h-80 lg:w-80"
                    }`}
                  >
                    <svg
                      width={panelOpen ? 60 : 100}
                      height={panelOpen ? 60 : 100}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="0.6"
                      className="text-red-900/30 transition-all duration-500"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                </>
              ) : (
                <div
                  className={`rounded-xl border-2 border-red-900/30 bg-gradient-to-br from-[#1a1a1a] via-[#111] to-[#0a0a0a] flex items-center justify-center relative z-10 shadow-2xl shadow-red-950/40 transition-all duration-500 ${
                    panelOpen
                      ? "h-48 w-48"
                      : "h-72 w-72 lg:h-80 lg:w-80"
                  }`}
                >
                  <svg
                    width={panelOpen ? 60 : 100}
                    height={panelOpen ? 60 : 100}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.6"
                    className="text-red-900/30 transition-all duration-500"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}

              {/* Classified stamp */}
              <div className="absolute -top-2 -right-3 z-20 rotate-12 border-2 border-red-600/25 px-2 py-0.5 text-[7px] font-black uppercase tracking-widest text-red-600/30 bg-[#0a0a0a]/80">
                Classified
              </div>
            </div>

            {/* Name */}
            <h2
              className={`font-black text-white text-center tracking-wide mb-1 transition-all duration-500 ${
                panelOpen ? "text-lg" : "text-2xl lg:text-3xl"
              }`}
            >
              {person.name}
            </h2>
            {person.source && (
              <p className="text-[11px] text-[#555] mb-1">{person.source}</p>
            )}

            {/* Aliases */}
            {person.aliases.length > 0 && !panelOpen && (
              <div className="flex flex-wrap gap-1.5 justify-center mt-2 mb-4 max-w-sm">
                {person.aliases.map((alias, i) => (
                  <span
                    key={i}
                    className="rounded border border-red-900/20 bg-red-950/15 px-2 py-0.5 text-[10px] font-bold text-red-400/60"
                  >
                    {alias}
                  </span>
                ))}
              </div>
            )}

            {/* ── Action buttons ring ──────────────────────────────────────── */}
            <div
              className={`flex gap-3 mt-4 transition-all duration-500 ${
                panelOpen ? "flex-col items-stretch w-full px-4" : "flex-wrap justify-center"
              }`}
            >
              {ACTIONS.map((action) => {
                const isActive = activePanel === action.key;
                return (
                  <button
                    key={action.key}
                    onClick={() =>
                      setActivePanel(isActive ? null : action.key)
                    }
                    className={`group relative flex items-center gap-2.5 rounded-xl border px-4 py-3 transition-all duration-300 ${
                      isActive
                        ? "border-red-600/30 bg-red-600/10 text-red-400 shadow-lg shadow-red-950/20"
                        : "border-[#222] bg-[#111]/80 text-[#888] hover:border-[#444] hover:text-white hover:bg-[#1a1a1a]"
                    } ${panelOpen && !isActive ? "py-2" : ""}`}
                  >
                    <span className="text-lg">{action.icon}</span>
                    <div className="text-left">
                      <div className="text-[11px] font-black uppercase tracking-wider">
                        {action.label}
                      </div>
                      {(!panelOpen || isActive) && (
                        <div className="text-[9px] text-[#555] mt-0.5">
                          {action.desc}
                        </div>
                      )}
                    </div>
                    {action.key === "compare" && compareItems.length > 0 && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
                        {compareItems.length}
                      </span>
                    )}
                    {action.key === "links" && connections.length > 0 && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#333] text-[9px] font-bold text-white">
                        {connections.length}
                      </span>
                    )}
                    {action.key === "sources" && externalSources.length > 0 && (
                      <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#333] text-[9px] font-bold text-white">
                        {externalSources.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick stats when collapsed */}
            {!panelOpen && (
              <div className="flex gap-4 mt-6 text-center">
                <Stat label="Photos" value={person.photoCount} />
                <Stat label="Links" value={connections.length} />
                <Stat
                  label="Sources"
                  value={externalSources.length}
                />
                <Stat
                  label="Pinned"
                  value={compareItems.length}
                  accent
                />
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT: Active panel slide-in ═══════════════════════════════ */}
        {panelOpen && (
          <div className="flex-1 border-l border-[#1a1a1a] bg-[#090909]/90 overflow-hidden flex flex-col animate-slide-in-right">
            {/* Panel header */}
            <div className="flex items-center gap-2 border-b border-[#1a1a1a] px-5 py-3 flex-shrink-0 bg-[#0c0c0c]">
              <span className="text-lg">
                {ACTIONS.find((a) => a.key === activePanel)?.icon}
              </span>
              <h3 className="text-[12px] font-black uppercase tracking-widest text-white">
                {ACTIONS.find((a) => a.key === activePanel)?.label}
              </h3>
              <button
                onClick={() => setActivePanel(null)}
                className="ml-auto text-[10px] font-bold text-[#555] hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">
              {activePanel === "comms" && (
                <CommsPanel
                  person={person}
                  onAddToCompare={addToCompare}
                  onAddEvidence={onAddEvidence}
                  onCreateConnection={onCreateConnection}
                />
              )}
              {activePanel === "files" && (
                <FilesPanel
                  person={person}
                  onAddToCompare={addToCompare}
                  onAddEvidence={onAddEvidence}
                  onCreateConnection={onCreateConnection}
                />
              )}
              {activePanel === "links" && (
                <LinksPanel
                  person={person}
                  connectedNodes={connectedNodes}
                  connections={connections}
                  boardNodes={boardNodes}
                  people={people}
                  isOnBoard={isOnBoard}
                  onCreateConnection={onCreateConnection}
                  onRemoveConnection={onRemoveConnection}
                  onAddPerson={onAddPerson}
                  onFocusNode={(id) => {
                    onClose();
                    setTimeout(() => onFocusNode(id), 100);
                  }}
                />
              )}
              {activePanel === "sources" && (
                <SourcesPanel
                  person={person}
                  externalSources={externalSources}
                  onAddSource={(src) =>
                    setExternalSources((prev) => [...prev, src])
                  }
                  onRemoveSource={(id) =>
                    setExternalSources((prev) =>
                      prev.filter((s) => s.id !== id)
                    )
                  }
                  onAddToCompare={addToCompare}
                  onAddEvidence={onAddEvidence}
                  onCreateConnection={onCreateConnection}
                />
              )}
              {activePanel === "compare" && (
                <ComparePanel
                  items={compareItems}
                  onRemove={removeFromCompare}
                  person={person}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small stat ─────────────────────────────────────────────────────────── */
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`text-xl font-black tabular-nums ${
          accent ? "text-red-400" : "text-white"
        }`}
      >
        {value}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-widest text-[#555]">
        {label}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMMS PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function CommsPanel({
  person,
  onAddToCompare,
  onAddEvidence,
  onCreateConnection,
}: {
  person: Person;
  onAddToCompare: (item: CompareItem) => void;
  onAddEvidence: (result: SearchResult) => void;
  onCreateConnection: (targetId: string) => void;
}) {
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<EmailEvidence | null>(
    null
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q,
        page: "1",
        pageSize: "25",
        sort: "newest",
      });
      const res = await fetch(`/api/emails?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    doSearch(person.name);
  }, [person.name, doSearch]);

  useEffect(() => {
    if (!search) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(search), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, doSearch]);

  const handleExpand = useCallback(
    async (emailId: string) => {
      if (expandedId === emailId) {
        setExpandedId(null);
        setExpandedEmail(null);
        return;
      }
      setExpandedId(emailId);
      setLoadingDetail(true);
      try {
        const res = await fetch(`/api/evidence/${emailId}?type=email`);
        if (res.ok) setExpandedEmail(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingDetail(false);
      }
    },
    [expandedId]
  );

  return (
    <div className="p-4">
      <div className="relative mb-3">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#555]"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${person.name}'s comms…`}
          className="w-full rounded-lg border border-[#222] bg-[#0e0e0e] py-2 pl-8 pr-3 text-sm text-white placeholder:text-[#444] focus:border-red-600/30 focus:outline-none transition"
        />
      </div>

      {loading && emails.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-red-400 py-6">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          Searching…
        </div>
      )}

      <div className="space-y-1.5">
        {emails.map((email) => (
          <div
            key={email.id}
            className={`rounded-lg border overflow-hidden transition ${
              expandedId === email.id
                ? "border-red-600/25 bg-[#0e0e0e]"
                : "border-[#1a1a1a] bg-[#0a0a0a] hover:border-[#2a2a2a]"
            }`}
          >
            <button
              onClick={() => handleExpand(email.id)}
              className="w-full text-left px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2 mb-0.5">
                {email.epsteinIsSender && (
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                )}
                <span
                  className={`text-[11px] font-bold truncate ${
                    email.epsteinIsSender ? "text-red-400" : "text-white"
                  }`}
                >
                  {email.sender}
                </span>
                <span className="ml-auto text-[9px] text-[#555] tabular-nums">
                  {email.sentAt
                    ? new Date(email.sentAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : ""}
                </span>
              </div>
              <div className="text-[10px] font-bold text-[#bbb] truncate">
                {email.subject}
              </div>
              <div className="text-[9px] text-[#555] truncate mt-0.5">
                {email.bodyPreview}
              </div>
            </button>

            {expandedId === email.id && (
              <div className="border-t border-[#1a1a1a]">
                {loadingDetail ? (
                  <div className="px-4 py-4 text-[10px] text-red-400 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    Loading…
                  </div>
                ) : expandedEmail ? (
                  <div className="px-3.5 py-3">
                    <div className="space-y-1 mb-3 text-[10px]">
                      <div className="flex gap-2">
                        <span className="text-[#555] w-7 font-bold">From</span>
                        <span className="text-white">
                          {expandedEmail.sender}
                        </span>
                      </div>
                      {expandedEmail.recipients.length > 0 && (
                        <div className="flex gap-2">
                          <span className="text-[#555] w-7 font-bold">To</span>
                          <span className="text-[#999] break-all">
                            {expandedEmail.recipients.join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="rounded border border-[#1a1a1a] bg-[#060606] p-3 max-h-48 overflow-y-auto mb-2.5">
                      <pre className="text-[10px] leading-relaxed text-[#bbb] whitespace-pre-wrap font-mono">
                        {expandedEmail.body || "No content"}
                      </pre>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <ActionBtn
                        label="⚖️ Compare"
                        accent
                        onClick={() =>
                          onAddToCompare({
                            id: expandedEmail.id,
                            title: expandedEmail.subject,
                            type: "email",
                            date: expandedEmail.date,
                            sender: expandedEmail.sender,
                            snippet:
                              expandedEmail.body?.slice(0, 200) || "",
                            body: expandedEmail.body,
                          })
                        }
                      />
                      <ActionBtn
                        label="+ Board"
                        onClick={() =>
                          onAddEvidence({
                            id: email.id,
                            type: "email",
                            title: email.subject,
                            snippet: email.bodyPreview,
                            date: email.sentAt?.split("T")[0] ?? null,
                            sender: email.sender,
                            score: 0,
                            starCount: email.starCount,
                          })
                        }
                      />
                      <ActionBtn
                        label="🔗 Link"
                        onClick={() => {
                          onAddEvidence({
                            id: email.id,
                            type: "email",
                            title: email.subject,
                            snippet: email.bodyPreview,
                            date: email.sentAt?.split("T")[0] ?? null,
                            sender: email.sender,
                            score: 0,
                            starCount: email.starCount,
                          });
                          setTimeout(() => onCreateConnection(email.id), 100);
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && emails.length === 0 && (
        <EmptyState
          icon="✉️"
          title="No communications found"
          desc="Try a different search term"
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FILES PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function FilesPanel({
  person,
  onAddToCompare,
  onAddEvidence,
  onCreateConnection,
}: {
  person: Person;
  onAddToCompare: (item: CompareItem) => void;
  onAddEvidence: (result: SearchResult) => void;
  onCreateConnection: (targetId: string) => void;
}) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<
    "all" | "document" | "photo"
  >("all");

  useEffect(() => {
    setLoading(true);
    if (typeFilter === "all") {
      Promise.all([
        fetch(
          `/api/search?${new URLSearchParams({ q: person.name, type: "document", limit: "15", offset: "0" })}`
        ).then((r) => (r.ok ? r.json() : { results: [] })),
        fetch(
          `/api/search?${new URLSearchParams({ q: person.name, type: "photo", limit: "15", offset: "0" })}`
        ).then((r) => (r.ok ? r.json() : { results: [] })),
      ])
        .then(([docs, photos]) => {
          setResults([
            ...(docs.results || []),
            ...(photos.results || []),
          ]);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      fetch(
        `/api/search?${new URLSearchParams({ q: person.name, type: typeFilter, limit: "30", offset: "0" })}`
      )
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data) => {
          setResults(data.results || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [person.name, typeFilter]);

  return (
    <div className="p-4">
      <div className="flex gap-1.5 mb-3">
        {(["all", "document", "photo"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${
              typeFilter === t
                ? "bg-red-600/15 text-red-500 border border-red-600/20"
                : "text-[#666] border border-transparent hover:text-white hover:bg-[#1a1a1a]"
            }`}
          >
            {t === "all"
              ? "All"
              : t === "document"
                ? "📄 Docs"
                : "📸 Photos"}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-red-400 py-6">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          Searching…
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {results.map((result) => (
          <div
            key={result.id}
            className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-3 hover:border-[#2a2a2a] transition group"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs">
                {EVIDENCE_TYPE_ICON[result.type]}
              </span>
              <span className="text-[8px] font-black uppercase tracking-widest text-[#666]">
                {EVIDENCE_TYPE_LABEL[result.type]}
              </span>
            </div>
            <h4 className="text-[11px] font-bold text-white leading-tight line-clamp-2 mb-1">
              {result.title}
            </h4>
            <p className="text-[9px] text-[#555] line-clamp-2">
              {result.snippet}
            </p>
            <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <ActionBtn
                label="⚖️"
                small
                accent
                onClick={() =>
                  onAddToCompare({
                    id: result.id,
                    title: result.title,
                    type: result.type,
                    date: result.date,
                    sender: result.sender,
                    snippet: result.snippet,
                  })
                }
              />
              <ActionBtn
                label="+ Board"
                small
                onClick={() => onAddEvidence(result)}
              />
              <ActionBtn
                label="🔗 Link"
                small
                onClick={() => {
                  onAddEvidence(result);
                  setTimeout(() => onCreateConnection(result.id), 100);
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {!loading && results.length === 0 && (
        <EmptyState
          icon="📁"
          title="No files found"
          desc="No documents or photos reference this person"
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LINKS PANEL — Connect board items to this person
   ═══════════════════════════════════════════════════════════════════════════ */
function LinksPanel({
  person,
  connectedNodes,
  connections,
  boardNodes,
  people,
  isOnBoard,
  onCreateConnection,
  onRemoveConnection,
  onAddPerson,
  onFocusNode,
}: {
  person: Person;
  connectedNodes: BoardNode[];
  connections: BoardConnection[];
  boardNodes: BoardNode[];
  people: Person[];
  isOnBoard: (id: string) => boolean;
  onCreateConnection: (targetId: string) => void;
  onRemoveConnection: (connId: string) => void;
  onAddPerson: (personId: string) => void;
  onFocusNode: (id: string) => void;
}) {
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  // Items available to link = board items not already connected & not self
  const linkableItems = useMemo(() => {
    const connectedIds = new Set(connectedNodes.map((n) => n.id));
    return boardNodes.filter(
      (n) => n.id !== person.id && !connectedIds.has(n.id)
    );
  }, [boardNodes, connectedNodes, person.id]);

  // People not on board yet (for adding + linking)
  const availablePeople = useMemo(() => {
    const q = linkSearch.toLowerCase();
    return people
      .filter(
        (p) =>
          p.id !== person.id &&
          !isOnBoard(p.id) &&
          (p.name.toLowerCase().includes(q) ||
            p.aliases.some((a) => a.toLowerCase().includes(q)))
      )
      .slice(0, 20);
  }, [people, person.id, isOnBoard, linkSearch]);

  const filteredLinkable = useMemo(() => {
    if (!linkSearch) return linkableItems;
    const q = linkSearch.toLowerCase();
    return linkableItems.filter((n) => {
      return n.data.name.toLowerCase().includes(q);
    });
  }, [linkableItems, linkSearch]);

  return (
    <div className="p-4">
      {/* Existing connections */}
      <div className="mb-4">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-[#555] mb-2">
          Connected ({connections.length})
        </h4>
        {connectedNodes.length === 0 ? (
          <p className="text-[10px] text-[#444] py-2">
            No connections yet. Use the button below to link items.
          </p>
        ) : (
          <div className="space-y-1.5">
            {connectedNodes.map((node) => {
              const conn = connections.find(
                (c) =>
                  (c.sourceId === person.id &&
                    c.targetId === node.id) ||
                  (c.targetId === person.id &&
                    c.sourceId === node.id)
              );
              return (
                <div
                  key={node.id}
                  className="flex items-center gap-2.5 rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-2.5 group"
                >
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      node.kind === "person"
                        ? "bg-red-950/20 border border-red-900/20"
                        : "bg-[#151515] border border-[#222]"
                    }`}
                  >
                    {node.kind === "person" ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-red-500/40"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    ) : (
                      <span className="text-xs">📍</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white truncate">
                      {node.data.name}
                    </p>
                    <p className="text-[9px] text-[#555]">
                      {conn?.type || "manual"}
                    </p>
                  </div>
                  <button
                    onClick={() => onFocusNode(node.id)}
                    className="text-[9px] font-bold text-[#555] hover:text-white transition opacity-0 group-hover:opacity-100"
                  >
                    Go→
                  </button>
                  {conn && (
                    <button
                      onClick={() => onRemoveConnection(conn.id)}
                      className="text-[9px] font-bold text-[#555] hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Link picker */}
      <button
        onClick={() => setShowLinkPicker(!showLinkPicker)}
        className={`w-full rounded-lg border border-dashed py-2.5 text-[11px] font-black uppercase tracking-wider transition ${
          showLinkPicker
            ? "border-red-600/30 bg-red-600/5 text-red-400"
            : "border-[#333] text-[#666] hover:border-[#555] hover:text-white"
        }`}
      >
        {showLinkPicker ? "Close Link Picker" : "+ Create New Link"}
      </button>

      {showLinkPicker && (
        <div className="mt-3 rounded-lg border border-[#1e1e1e] bg-[#0c0c0c] p-3">
          <input
            type="text"
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            placeholder="Search board items or persons…"
            className="w-full rounded border border-[#222] bg-[#080808] py-2 px-3 text-sm text-white placeholder:text-[#444] focus:border-red-600/30 focus:outline-none transition mb-2"
          />

          {filteredLinkable.length > 0 && (
            <>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#555] mb-1.5">
                On Board
              </p>
              <div className="space-y-1 mb-3">
                {filteredLinkable.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => onCreateConnection(node.id)}
                    className="w-full flex items-center gap-2 rounded border border-[#1a1a1a] bg-[#0a0a0a] p-2 text-left text-[11px] hover:border-red-600/20 transition"
                  >
                    <span className="text-xs">
                      {node.kind === "person" ? "👤" : "📍"}
                    </span>
                    <span className="text-white font-bold truncate">
                      {node.data.name}
                    </span>
                    <span className="ml-auto text-[9px] text-red-500/60">
                      + Link
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {availablePeople.length > 0 && (
            <>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#555] mb-1.5">
                Add to Board & Link
              </p>
              <div className="space-y-1">
                {availablePeople.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onAddPerson(p.id);
                      setTimeout(
                        () => onCreateConnection(p.id),
                        100
                      );
                    }}
                    className="w-full flex items-center gap-2 rounded border border-[#1a1a1a] bg-[#0a0a0a] p-2 text-left text-[11px] hover:border-red-600/20 transition"
                  >
                    <span>👤</span>
                    <span className="text-white font-bold truncate">
                      {p.name}
                    </span>
                    <span className="ml-auto text-[9px] text-[#666]">
                      + Add & Link
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SOURCES PANEL — External links, web clips
   ═══════════════════════════════════════════════════════════════════════════ */
function SourcesPanel({
  person,
  externalSources,
  onAddSource,
  onRemoveSource,
  onAddToCompare,
  onAddEvidence,
  onCreateConnection,
}: {
  person: Person;
  externalSources: ExternalSource[];
  onAddSource: (src: ExternalSource) => void;
  onRemoveSource: (id: string) => void;
  onAddToCompare: (item: CompareItem) => void;
  onAddEvidence: (result: SearchResult) => void;
  onCreateConnection: (targetId: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    url: string;
    title: string;
    description: string;
    image: string;
    domain: string;
    textContent: string;
  } | null>(null);

  const fetchPreview = useCallback(async () => {
    if (!url.trim()) return;
    setFetching(true);
    setError("");
    setPreview(null);
    try {
      const res = await fetch("/api/clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to fetch");
        return;
      }
      const data = await res.json();
      setPreview(data);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setFetching(false);
    }
  }, [url]);

  const saveSource = useCallback(() => {
    if (!preview) return;
    const sourceId = `ext-${Date.now()}`;
    // Save to local sources list
    onAddSource({
      id: sourceId,
      url: preview.url,
      title: preview.title,
      description: preview.description,
      image: preview.image,
      domain: preview.domain,
      textContent: preview.textContent,
      addedAt: Date.now(),
    });
    // Also add to board as a document evidence node
    onAddEvidence({
      id: sourceId,
      type: "document",
      title: preview.title || preview.url,
      snippet: preview.description || preview.textContent.slice(0, 200),
      date: new Date().toISOString().split("T")[0],
      sender: preview.domain,
      score: 0,
      starCount: 0,
    });
    // Link the source to the current person
    setTimeout(() => onCreateConnection(sourceId), 150);
    setPreview(null);
    setUrl("");
  }, [preview, onAddSource, onAddEvidence, onCreateConnection]);

  return (
    <div className="p-4">
      {/* URL input */}
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#555] mb-2">
          Add External Source
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchPreview()}
            placeholder="Paste URL (news article, wikipedia, etc.)"
            className="flex-1 rounded-lg border border-[#222] bg-[#0e0e0e] py-2 px-3 text-sm text-white placeholder:text-[#444] focus:border-red-600/30 focus:outline-none transition"
          />
          <button
            onClick={fetchPreview}
            disabled={!url.trim() || fetching}
            className="rounded-lg bg-red-600/15 border border-red-600/20 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-red-500/70 hover:bg-red-600/25 hover:text-red-400 transition disabled:opacity-30"
          >
            {fetching ? "…" : "Fetch"}
          </button>
        </div>
        {error && (
          <p className="text-[10px] text-red-400 mt-1.5">{error}</p>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="mb-4 rounded-lg border border-red-600/20 bg-[#0c0c0c] overflow-hidden">
          {preview.image && (
            <img
              src={preview.image}
              alt=""
              className="w-full h-36 object-cover"
              onError={(e) =>
                ((e.target as HTMLImageElement).style.display = "none")
              }
            />
          )}
          <div className="p-3">
            <p className="text-[9px] font-bold text-[#666] mb-1">
              {preview.domain}
            </p>
            <h4 className="text-sm font-bold text-white mb-1">
              {preview.title}
            </h4>
            <p className="text-[10px] text-[#888] line-clamp-3">
              {preview.description || preview.textContent.slice(0, 200)}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={saveSource}
                className="rounded bg-red-600/15 border border-red-600/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-500 hover:bg-red-600/25 transition"
              >
                💾 Save Source
              </button>
              <button
                onClick={() => {
                  onAddToCompare({
                    id: `clip-${Date.now()}`,
                    title: preview.title,
                    type: "external" as any,
                    date: new Date().toISOString().split("T")[0],
                    sender: preview.domain,
                    snippet: preview.description || preview.textContent.slice(0, 300),
                    body: preview.textContent,
                  });
                  saveSource();
                }}
                className="rounded bg-[#1a1a1a] border border-[#333] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-[#888] hover:text-white transition"
              >
                ⚖️ Compare
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved sources */}
      {externalSources.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#555] mb-2">
            Saved Sources ({externalSources.length})
          </p>
          <div className="space-y-2">
            {externalSources.map((src) => (
              <div
                key={src.id}
                className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-3 group"
              >
                <div className="flex items-start gap-2">
                  {src.image && (
                    <img
                      src={src.image}
                      alt=""
                      className="h-12 w-16 rounded object-cover flex-shrink-0"
                      onError={(e) =>
                        ((e.target as HTMLImageElement).style.display =
                          "none")
                      }
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold text-[#666]">
                      🌐 {src.domain}
                    </p>
                    <h4 className="text-[11px] font-bold text-white leading-tight line-clamp-2">
                      {src.title}
                    </h4>
                    <p className="text-[9px] text-[#555] line-clamp-1 mt-0.5">
                      {src.description}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition">
                  <ActionBtn
                    label="🔗 Open"
                    small
                    onClick={() => window.open(src.url, "_blank")}
                  />
                  <ActionBtn
                    label="⚖️ Compare"
                    small
                    accent
                    onClick={() =>
                      onAddToCompare({
                        id: src.id,
                        title: src.title,
                        type: "external" as any,
                        date: null,
                        sender: src.domain,
                        snippet: src.description,
                        body: src.textContent,
                      })
                    }
                  />
                  <ActionBtn
                    label="+ Board"
                    small
                    onClick={() =>
                      onAddEvidence({
                        id: src.id,
                        type: "document",
                        title: `[EXT] ${src.title}`,
                        snippet: src.description,
                        date: null,
                        sender: src.domain,
                        score: 0,
                        starCount: 0,
                      })
                    }
                  />
                  <button
                    onClick={() => onRemoveSource(src.id)}
                    className="ml-auto text-[9px] font-bold text-[#555] hover:text-red-400 transition"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {externalSources.length === 0 && !preview && (
        <EmptyState
          icon="🌐"
          title="No external sources"
          desc="Paste a URL above to clip content from news articles, wikipedia, and other sources"
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPARE PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function ComparePanel({
  items,
  onRemove,
  person,
}: {
  items: CompareItem[];
  onRemove: (id: string) => void;
  person: Person;
}) {
  const highlights = useMemo(() => {
    if (items.length < 2) return new Set<string>();
    const terms = new Set<string>();
    const nameParts = person.name
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length > 2);
    const aliases = person.aliases.map((a) => a.toLowerCase());
    const emails = person.emailAddresses.map((e) => e.toLowerCase());

    for (const item of items) {
      const text =
        `${item.title} ${item.snippet} ${item.body || ""} ${item.sender || ""}`.toLowerCase();
      for (const part of nameParts)
        if (text.includes(part)) terms.add(part);
      for (const alias of aliases)
        if (text.includes(alias)) terms.add(alias);
      for (const email of emails)
        if (text.includes(email)) terms.add(email);
    }
    return terms;
  }, [items, person]);

  function hl(text: string): React.ReactNode {
    if (highlights.size === 0) return text;
    const sorted = Array.from(highlights).sort(
      (a, b) => b.length - a.length
    );
    const pattern = new RegExp(
      `(${sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
      "gi"
    );
    return text.split(pattern).map((part, i) => {
      const isMatch = sorted.some(
        (t) => t.toLowerCase() === part.toLowerCase()
      );
      return isMatch ? (
        <mark
          key={i}
          className="bg-red-600/25 text-red-300 rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        part
      );
    });
  }

  if (items.length === 0)
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center max-w-xs">
          <span className="text-3xl mb-3 block">⚖️</span>
          <h3 className="text-sm font-bold text-[#666] mb-1">
            Compare Evidence
          </h3>
          <p className="text-[10px] text-[#444] leading-relaxed">
            Pin items from <strong className="text-[#666]">Comms</strong>
            , <strong className="text-[#666]">Files</strong>, or{" "}
            <strong className="text-[#666]">Sources</strong> to compare
            them side by side with auto-highlighted overlaps.
          </p>
        </div>
      </div>
    );

  return (
    <div className="p-4">
      {highlights.size > 0 && (
        <div className="mb-3 rounded-lg bg-red-600/10 border border-red-600/15 px-3 py-2 text-[10px] font-bold text-red-400/70">
          {highlights.size} shared term{highlights.size !== 1 ? "s" : ""}{" "}
          highlighted across items
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden"
          >
            <div className="flex items-center gap-1.5 border-b border-[#1a1a1a] px-3 py-2 bg-[#0e0e0e]">
              <span className="text-xs">
                {item.type === "external"
                  ? "🌐"
                  : EVIDENCE_TYPE_ICON[
                      item.type as keyof typeof EVIDENCE_TYPE_ICON
                    ] || "📄"}
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest text-[#666]">
                {item.type === "external" ? "External" : item.type}
              </span>
              <button
                onClick={() => onRemove(item.id)}
                className="ml-auto text-[9px] text-[#555] hover:text-red-400 transition"
              >
                ✕
              </button>
            </div>
            <div className="px-3 py-2.5">
              <h4 className="text-[11px] font-bold text-white leading-tight mb-1">
                {hl(item.title)}
              </h4>
              {item.sender && (
                <p className="text-[9px] text-[#666] mb-1">
                  {hl(item.sender)}
                </p>
              )}
              {item.date && (
                <p className="text-[9px] text-[#555] tabular-nums mb-1.5">
                  {item.date}
                </p>
              )}
              <div className="rounded border border-[#1a1a1a] bg-[#060606] p-2 max-h-32 overflow-y-auto">
                <p className="text-[9px] leading-relaxed text-[#999] whitespace-pre-wrap">
                  {hl(item.body || item.snippet || "No content")}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Shared UI atoms ────────────────────────────────────────────────────── */

function ActionBtn({
  label,
  onClick,
  accent,
  small,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded border font-black uppercase tracking-wider transition ${
        small ? "px-2 py-0.5 text-[8px]" : "px-2.5 py-1 text-[9px]"
      } ${
        accent
          ? "border-red-600/20 bg-red-600/10 text-red-500/70 hover:bg-red-600/20 hover:text-red-400"
          : "border-[#2a2a2a] bg-[#151515] text-[#777] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="text-center py-10">
      <span className="text-2xl mb-2 block">{icon}</span>
      <p className="text-sm font-bold text-[#555]">{title}</p>
      <p className="text-[10px] text-[#444] mt-1">{desc}</p>
    </div>
  );
}
