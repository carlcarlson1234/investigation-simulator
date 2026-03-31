"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { SearchResult, EvidenceType, EmailListItem } from "@/lib/types";
import {
  EVIDENCE_TYPE_ICON,
  EVIDENCE_TYPE_LABEL,
} from "@/lib/board-types";

type PanelTab = "emails" | "search";

interface IntakePanelProps {
  isOnBoard: (id: string) => boolean;
  onAddEvidence: (result: SearchResult, x?: number, y?: number) => void;
  onSelectEmail: (emailId: string) => void;
  selectedEmailId: string | null;
}

export function IntakePanel({ isOnBoard, onAddEvidence, onSelectEmail, selectedEmailId }: IntakePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("emails");

  return (
    <aside className="intake-panel flex w-80 flex-shrink-0 flex-col border-r border-[#1a1a1a] overflow-hidden">
      {/* Tab bar */}
      <div className="flex flex-shrink-0 border-b border-[#1a1a1a]">
        <button
          onClick={() => setActiveTab("emails")}
          className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-widest transition ${
            activeTab === "emails"
              ? "text-red-500 border-b-2 border-red-500 bg-red-600/5"
              : "text-[#555] hover:text-white"
          }`}
        >
          ✉️ Inbox
        </button>
        <button
          onClick={() => setActiveTab("search")}
          className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-widest transition ${
            activeTab === "search"
              ? "text-red-500 border-b-2 border-red-500 bg-red-600/5"
              : "text-[#555] hover:text-white"
          }`}
        >
          🔍 Search All
        </button>
      </div>

      {activeTab === "emails" ? (
        <EmailInbox
          isOnBoard={isOnBoard}
          onAddEvidence={onAddEvidence}
          onSelectEmail={onSelectEmail}
          selectedEmailId={selectedEmailId}
        />
      ) : (
        <EvidenceSearch isOnBoard={isOnBoard} onAddEvidence={onAddEvidence} />
      )}
    </aside>
  );
}

// ─── EMAIL INBOX TAB ────────────────────────────────────────────────────────

function EmailInbox({
  isOnBoard,
  onAddEvidence,
  onSelectEmail,
  selectedEmailId,
}: {
  isOnBoard: (id: string) => boolean;
  onAddEvidence: (result: SearchResult, x?: number, y?: number) => void;
  onSelectEmail: (emailId: string) => void;
  selectedEmailId: string | null;
}) {
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [search, setSearch] = useState("");
  const [epsteinOnly, setEpsteinOnly] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoad = useRef(false);

  const fetchEmails = useCallback(async (p: number, s: string, sortBy: string, epOnly: boolean, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: "30",
        sort: sortBy,
      });
      if (s.trim()) params.set("q", s);
      if (epOnly) params.set("epsteinOnly", "true");

      const res = await fetch(`/api/emails?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      if (append) {
        setEmails((prev) => [...prev, ...data.emails]);
      } else {
        setEmails(data.emails);
      }
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(data.page);
    } catch (err) {
      console.error("Email fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!initialLoad.current) {
      initialLoad.current = true;
      fetchEmails(1, "", sort, epsteinOnly, false);
    }
  }, [fetchEmails, sort, epsteinOnly]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchEmails(1, search, sort, epsteinOnly, false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, sort, epsteinOnly, fetchEmails]);

  const loadMore = () => {
    if (hasMore && !loading) {
      fetchEmails(page + 1, search, sort, epsteinOnly, true);
    }
  };

  function emailToSearchResult(email: EmailListItem): SearchResult {
    return {
      id: email.id,
      type: "email",
      title: email.subject,
      snippet: email.bodyPreview,
      date: email.sentAt ? email.sentAt.split("T")[0] : null,
      sender: email.sender,
      score: 0,
      starCount: email.starCount,
    };
  }

  function formatEmailDate(iso: string | null): string {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (86400000));
      if (diffDays < 365) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  }

  return (
    <>
      {/* Search + Filters */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3 space-y-2">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555]"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emails…"
            className="w-full rounded border border-[#2a2a2a] bg-[#141414] py-2 pl-9 pr-3 text-sm font-bold text-white placeholder:text-[#555] focus:border-red-600/40 focus:outline-none focus:ring-1 focus:ring-red-600/20 transition"
            id="email-search"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSort(sort === "newest" ? "oldest" : "newest")}
            className="rounded border border-[#2a2a2a] bg-[#141414] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#777] hover:text-white hover:border-[#444] transition"
          >
            {sort === "newest" ? "↓ Newest" : "↑ Oldest"}
          </button>
          <button
            onClick={() => setEpsteinOnly(!epsteinOnly)}
            className={`rounded border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
              epsteinOnly
                ? "border-red-600/30 bg-red-600/10 text-red-500"
                : "border-[#2a2a2a] bg-[#141414] text-[#777] hover:text-white hover:border-[#444]"
            }`}
          >
            {epsteinOnly ? "★ Epstein Only" : "All Senders"}
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex-shrink-0 px-3 py-1.5 text-[10px] font-bold text-[#555] border-b border-[#1a1a1a] flex items-center justify-between">
        {loading && emails.length === 0 ? (
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Loading…
          </span>
        ) : (
          <span>{total.toLocaleString()} emails</span>
        )}
        <span className="text-[#444] tabular-nums">
          Page {page}
        </span>
      </div>

      {/* Email list */}
      <div className="flex-1 overflow-y-auto">
        {emails.map((email) => {
          const onBoard = isOnBoard(email.id);
          const isSelected = selectedEmailId === email.id;

          return (
            <div
              key={email.id}
              onClick={() => onSelectEmail(email.id)}
              draggable={!onBoard}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/board-item",
                  JSON.stringify({ id: email.id, kind: "evidence", data: emailToSearchResult(email) })
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`group border-b border-[#1a1a1a] px-3 py-2.5 cursor-pointer transition ${
                isSelected
                  ? "bg-red-600/8 border-l-2 border-l-red-500"
                  : onBoard
                  ? "bg-[#0f0f0f] opacity-50"
                  : "hover:bg-[#161616]"
              }`}
              id={`email-${email.id}`}
            >
              {/* Row 1: Sender + Date */}
              <div className="flex items-center gap-2 mb-0.5">
                {email.epsteinIsSender && (
                  <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" title="Sent by Epstein" />
                )}
                <span className={`text-[12px] font-bold truncate ${
                  email.epsteinIsSender ? "text-red-400" : "text-white"
                }`}>
                  {email.sender}
                </span>
                <span className="ml-auto text-[10px] text-[#555] tabular-nums flex-shrink-0">
                  {formatEmailDate(email.sentAt)}
                </span>
              </div>

              {/* Row 2: Subject */}
              <div className="text-[11px] font-bold text-[#ccc] truncate">
                {email.subject}
              </div>

              {/* Row 3: Preview */}
              <div className="text-[10px] text-[#555] truncate mt-0.5">
                {email.bodyPreview || "No preview available"}
              </div>

              {/* Row 4: Meta */}
              <div className="flex items-center gap-2 mt-1">
                {email.recipientCount > 0 && (
                  <span className="text-[9px] text-[#444]">
                    → {email.recipientCount} recipient{email.recipientCount > 1 ? "s" : ""}
                  </span>
                )}
                {email.hasCc && (
                  <span className="text-[9px] text-[#444]">CC</span>
                )}
                {onBoard && (
                  <span className="text-[9px] font-bold text-red-500/60 ml-auto">✓ On board</span>
                )}
                {!onBoard && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddEvidence(emailToSearchResult(email));
                    }}
                    className="ml-auto text-[9px] font-bold uppercase tracking-wider text-red-500/60 opacity-0 group-hover:opacity-100 hover:text-red-400 transition"
                  >
                    + Board
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Load more */}
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="w-full py-3 text-[11px] font-bold uppercase tracking-wider text-red-500/60 hover:text-red-400 hover:bg-[#141414] transition disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load More"}
          </button>
        )}

        {!loading && emails.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-bold text-[#555]">No emails found</p>
            <p className="text-[10px] text-[#444] mt-1">Try a different search or filter</p>
          </div>
        )}
      </div>
    </>
  );
}

// ─── SEARCH ALL TAB (existing functionality) ────────────────────────────────

function EvidenceSearch({
  isOnBoard,
  onAddEvidence,
}: {
  isOnBoard: (id: string) => boolean;
  onAddEvidence: (result: SearchResult, x?: number, y?: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EvidenceType | "all">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, type: EvidenceType | "all") => {
    setLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({ q, type, limit: "30", offset: "0" });
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setHasSearched(false); return; }
    debounceRef.current = setTimeout(() => doSearch(query, typeFilter), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, typeFilter, doSearch]);

  return (
    <>
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#555]"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all evidence…"
            className="w-full rounded border border-[#2a2a2a] bg-[#141414] py-2 pl-9 pr-3 text-sm font-bold text-white placeholder:text-[#555] focus:border-red-600/40 focus:outline-none focus:ring-1 focus:ring-red-600/20 transition"
            id="evidence-search"
          />
        </div>

        <div className="mt-2 flex gap-1 flex-wrap">
          {(["all", "email", "document", "photo", "imessage"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                typeFilter === t
                  ? "bg-red-600/15 text-red-500 border border-red-600/20"
                  : "text-[#666] hover:text-white hover:bg-[#1c1c1c] border border-transparent"
              }`}
            >
              {t === "all" ? "All" : EVIDENCE_TYPE_ICON[t as EvidenceType]} {t === "all" ? "" : EVIDENCE_TYPE_LABEL[t as EvidenceType]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-shrink-0 px-3 py-1.5 text-[10px] font-bold text-[#555] border-b border-[#1a1a1a]">
        {loading ? (
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Searching…
          </span>
        ) : hasSearched ? (
          <span>{results.length} results</span>
        ) : (
          <span>Type to search all evidence</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {!hasSearched && !loading && (
          <div className="px-2 py-8 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-[#333]">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#555]">
              Search all evidence types
            </p>
            <p className="text-[10px] text-[#444] mt-1">Emails, documents, photos, iMessages</p>
          </div>
        )}

        {hasSearched && results.length === 0 && !loading && (
          <div className="px-2 py-8 text-center text-xs text-[#555]">No results.</div>
        )}

        {results.map((result) => {
          const onBoard = isOnBoard(result.id);
          return (
            <div
              key={result.id}
              draggable={!onBoard}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/board-item",
                  JSON.stringify({ id: result.id, kind: "evidence", data: result })
                );
                e.dataTransfer.effectAllowed = "copy";
              }}
              className={`group rounded border p-2.5 transition ${
                onBoard
                  ? "border-red-500/20 bg-red-600/5 opacity-50 cursor-default"
                  : "border-[#2a2a2a] bg-[#141414] hover:border-red-500/30 hover:bg-[#1a1a1a] cursor-grab active:cursor-grabbing"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs">{EVIDENCE_TYPE_ICON[result.type]}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#666]">
                  {EVIDENCE_TYPE_LABEL[result.type]}
                </span>
                {result.date && (
                  <span className="ml-auto text-[10px] text-[#555] tabular-nums">{result.date}</span>
                )}
              </div>
              <h4 className="text-sm font-bold leading-tight text-white line-clamp-2">{result.title}</h4>
              {result.sender && <p className="mt-0.5 text-[10px] text-[#666] truncate">{result.sender}</p>}
              <p className="mt-1 text-[10px] leading-relaxed text-[#444] line-clamp-2">{result.snippet}</p>
              {!onBoard && (
                <button
                  onClick={() => onAddEvidence(result)}
                  className="mt-2 text-[9px] font-bold uppercase tracking-wider text-red-500/60 opacity-0 group-hover:opacity-100 hover:text-red-400 transition"
                >
                  + Add to board
                </button>
              )}
              {onBoard && <span className="mt-1 text-[9px] font-bold text-red-500/60">✓ On board</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}
