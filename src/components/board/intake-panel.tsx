"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { SearchResult, EvidenceType, EmailListItem, PhotoListItem } from "@/lib/types";
import type { InvestigationStep } from "@/lib/investigation-types";
import {
  EVIDENCE_TYPE_ICON,
  EVIDENCE_TYPE_LABEL,
} from "@/lib/board-types";

type PanelTab = "emails" | "photos";

interface IntakePanelProps {
  isOnBoard: (id: string) => boolean;
  onAddEvidence: (result: SearchResult, x?: number, y?: number) => void;
  onSelectEmail: (emailId: string) => void;
  selectedEmailId: string | null;
  starterLeads?: SearchResult[];
  investigationStep?: InvestigationStep | null;
}

export function IntakePanel({ isOnBoard, onAddEvidence, onSelectEmail, selectedEmailId, starterLeads, investigationStep }: IntakePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("emails");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isOnboarding = investigationStep != null;

  // When search is opened, switch to search tab; when closed, go back to emails
  const handleOpenSearch = () => {
    setSearchOpen(true);
  };
  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <aside className={`intake-panel flex h-full w-80 flex-shrink-0 flex-col border-r border-[#1a1a1a] overflow-hidden transition-opacity duration-300 ${
      isOnboarding ? "bg-[#080808]" : ""
    }`}>
      {/* Tab bar */}
      <div className={`flex flex-shrink-0 border-b border-[#1a1a1a] transition-opacity duration-300 ${
        isOnboarding ? "opacity-40" : ""
      }`}>
        <button
          onClick={() => { setActiveTab("emails"); setSearchOpen(false); }}
          className={`flex-1 py-2.5 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] transition ${
            activeTab === "emails" && !searchOpen
              ? "text-red-500 border-b-2 border-red-500 bg-red-600/5"
              : "text-[#555] hover:text-white"
          }`}
        >
          ✉️ Inbox
        </button>
        <button
          onClick={() => { setActiveTab("photos"); setSearchOpen(false); }}
          className={`flex-1 py-2.5 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] transition ${
            activeTab === "photos" && !searchOpen
              ? "text-red-500 border-b-2 border-red-500 bg-red-600/5"
              : "text-[#555] hover:text-white"
          }`}
        >
          📷 Photos
        </button>
      </div>

      {/* ── SEARCH BAR (collapsible, above everything) ── */}
      <div className="flex-shrink-0 bg-[#0a0a0a] border-b border-[#1a1a1a] px-3 pt-3 pb-2">
        {searchOpen ? (
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-red-500/50"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              placeholder="Search all evidence…"
              className="w-full rounded-lg border border-[#333] bg-[#141414] py-2.5 pl-9 pr-9 text-sm font-bold text-white placeholder:text-[#444] focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20 focus:outline-none transition"
            />
            <button
              onClick={handleCloseSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] hover:text-white transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={handleOpenSearch}
            className="w-full flex items-center gap-2.5 rounded-lg border border-[#222] bg-[#111] px-3 py-2.5 text-[#555] hover:border-[#444] hover:text-[#888] transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.12em]">
              Search evidence
            </span>
          </button>
        )}
      </div>

      {/* ── MAIN CONTENT (scrollable) ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Search results mode */}
        {searchOpen ? (
          <EvidenceSearch isOnBoard={isOnBoard} onAddEvidence={onAddEvidence} externalQuery={searchQuery} />
        ) : (
          <>
            {/* ── STARTER EVIDENCE ── */}
            {starterLeads && starterLeads.length > 0 && (
              <div className={`flex-shrink-0 border-b border-[#1a1a1a] ${isOnboarding ? "p-4" : "p-3"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  <span className={`font-[family-name:var(--font-mono)] uppercase tracking-[0.15em] text-red-500/80 ${
                    isOnboarding ? "text-xs" : "text-[10px]"
                  }`}>
                    🎯 Starter Evidence
                  </span>
                </div>
                <div className={isOnboarding ? "space-y-4" : "space-y-1.5"}>
                  {starterLeads.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/board-item",
                          JSON.stringify({ kind: "evidence", data: lead })
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={`rounded-xl border cursor-grab active:cursor-grabbing transition-all overflow-hidden ${
                        isOnBoard(lead.id)
                          ? "border-green-600/20 bg-green-950/10 opacity-50"
                          : isOnboarding
                          ? "border-red-500/30 bg-[#0e0e0e] hover:border-red-500/50 shadow-lg shadow-red-900/15"
                          : "border-red-500/20 bg-red-950/10 hover:border-red-500/40 hover:bg-red-950/15"
                      }`}
                    >
                      {/* Photo preview */}
                      {isOnboarding && lead.type === 'photo' && (
                        <div className="relative w-full h-36 bg-[#080808] overflow-hidden">
                          <img
                            src={`https://assets.getkino.com/cdn-cgi/image/width=400,quality=80,format=auto/photos-deboned/${lead.id}`}
                            alt={lead.title}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-transparent to-transparent" />
                          <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-black/60 border border-red-900/30 px-1.5 py-0.5 backdrop-blur-sm">
                            <span className="text-[9px] text-red-400">📸</span>
                            <span className="font-[family-name:var(--font-mono)] text-[8px] uppercase tracking-wider text-red-400/80">Photo</span>
                          </div>
                        </div>
                      )}
                      <div className={isOnboarding ? "p-4" : "p-2.5"}>
                        <div className="flex items-start gap-3">
                          {(!isOnboarding || lead.type !== 'photo') && (
                            <span className={isOnboarding ? "text-2xl mt-0.5" : "text-base"}>
                              {lead.type === 'photo' ? '📸' : lead.type === 'email' ? '✉️' : '📄'}
                            </span>
                          )}
                          {isOnboarding && lead.type === 'email' && (
                            <span className="text-2xl mt-0.5">✉️</span>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-white ${isOnboarding ? "text-sm" : "text-xs truncate"}`}>{lead.title}</p>
                            <p className={`text-[#888] mt-1 ${isOnboarding ? "text-xs leading-relaxed line-clamp-3" : "text-[10px] truncate"}`}>{lead.snippet}</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-end">
                          {isOnBoard(lead.id) ? (
                            <span className="font-[family-name:var(--font-mono)] text-[9px] font-bold text-green-500/60 uppercase tracking-wider">✓ On Board</span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); onAddEvidence(lead); }}
                              className={`font-[family-name:var(--font-mono)] font-bold uppercase tracking-wider transition ${
                                isOnboarding
                                  ? "text-xs rounded-lg bg-red-600/15 border border-red-600/30 px-4 py-2 text-red-400 hover:bg-red-600/25 hover:text-red-300"
                                  : "text-[9px] text-red-500/60 hover:text-red-400"
                              }`}
                            >
                              + Add to Board
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab content */}
            {activeTab === "emails" ? (
              <EmailInbox
                isOnBoard={isOnBoard}
                onAddEvidence={onAddEvidence}
                onSelectEmail={onSelectEmail}
                selectedEmailId={selectedEmailId}
              />
            ) : activeTab === "photos" ? (
              <PhotoGallery isOnBoard={isOnBoard} onAddEvidence={onAddEvidence} />
            ) : null}
          </>
        )}
      </div>
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
      {/* Sort + Filters (search removed — handled by top bar) */}
      <div className="flex-shrink-0 border-b border-[#1a1a1a] px-3 py-2">
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
                e.dataTransfer.effectAllowed = "move";
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

// ─── PHOTO GALLERY TAB ──────────────────────────────────────────────────────

function PhotoGallery({
  isOnBoard,
  onAddEvidence,
}: {
  isOnBoard: (id: string) => boolean;
  onAddEvidence: (result: SearchResult, x?: number, y?: number) => void;
}) {
  const [photos, setPhotos] = useState<PhotoListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [personFilterName, setPersonFilterName] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoad = useRef(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoListItem | null>(null);

  const fetchPhotos = useCallback(async (p: number, q: string, pid: string | null, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: "24",
      });
      if (q.trim()) params.set("q", q);
      if (pid) params.set("personId", pid);

      const res = await fetch(`/api/photos?${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();

      if (append) {
        setPhotos((prev) => [...prev, ...data.photos]);
      } else {
        setPhotos(data.photos);
      }
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(data.page);
    } catch (err) {
      console.error("Photo fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (!initialLoad.current) {
      initialLoad.current = true;
      fetchPhotos(1, "", null, false);
    }
  }, [fetchPhotos]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPhotos(1, search, personFilter, false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, personFilter, fetchPhotos]);

  const loadMore = () => {
    if (hasMore && !loading) {
      fetchPhotos(page + 1, search, personFilter, true);
    }
  };

  function photoToSearchResult(photo: PhotoListItem): SearchResult {
    return {
      id: photo.id,
      type: "photo",
      title: photo.id,
      snippet: photo.description.slice(0, 150),
      date: null,
      sender: photo.facePeople.length > 0 ? photo.facePeople.join(", ") : null,
      score: 0,
      starCount: 0,
    };
  }

  const filterByPerson = (personId: string, personName: string) => {
    setPersonFilter(personId);
    setPersonFilterName(personName);
  };

  const clearPersonFilter = () => {
    setPersonFilter(null);
    setPersonFilterName(null);
  };

  return (
    <>
      {/* Filters (search removed — handled by top bar) */}
      {personFilterName && (
        <div className="flex-shrink-0 border-b border-[#1a1a1a] px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-red-600/30 bg-red-600/10 px-2.5 py-0.5 text-[10px] font-bold text-red-400 flex items-center gap-1">
              👤 {personFilterName}
              <button
                onClick={clearPersonFilter}
                className="ml-0.5 text-red-400/60 hover:text-red-300 transition"
              >
                ✕
              </button>
            </span>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="flex-shrink-0 px-3 py-1.5 text-[10px] font-bold text-[#555] border-b border-[#1a1a1a] flex items-center justify-between">
        {loading && photos.length === 0 ? (
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Loading…
          </span>
        ) : (
          <span>{total.toLocaleString()} photos</span>
        )}
        <span className="text-[#444] tabular-nums">
          Page {page}
        </span>
      </div>

      {/* Photo Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-1.5">
          {photos.map((photo) => {
            const onBoard = isOnBoard(photo.id);
            return (
              <div
                key={photo.id}
                draggable={!onBoard}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/board-item",
                    JSON.stringify({ id: photo.id, kind: "evidence", data: photoToSearchResult(photo) })
                  );
                  e.dataTransfer.effectAllowed = "move";
                }}
                className={`group relative rounded-lg overflow-hidden border transition cursor-pointer ${
                  onBoard
                    ? "border-red-500/20 opacity-40"
                    : "border-[#2a2a2a] hover:border-red-500/30 active:cursor-grabbing"
                }`}
                onClick={() => setLightboxPhoto(photo)}
              >
                {/* Thumbnail image */}
                <div className="aspect-square bg-[#0e0e0e] relative">
                  <img
                    src={photo.thumbnailUrl}
                    alt={photo.description || photo.id}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.style.display = 'none';
                    }}
                  />

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

                  {/* Face badges */}
                  {photo.facePeople.length > 0 && (
                    <div className="absolute top-1 left-1 flex flex-wrap gap-0.5">
                      {photo.facePeople.slice(0, 2).map((name, i) => (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.stopPropagation();
                            filterByPerson(photo.facePersonIds[i], name);
                          }}
                          className="rounded bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[8px] font-bold text-white hover:bg-red-600/80 transition"
                        >
                          {name.split(" ")[0]}
                        </button>
                      ))}
                      {photo.facePeople.length > 2 && (
                        <span className="rounded bg-black/70 px-1 py-0.5 text-[8px] text-white/60">
                          +{photo.facePeople.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Add to board button on hover */}
                  {!onBoard && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddEvidence(photoToSearchResult(photo));
                      }}
                      className="absolute bottom-1 right-1 rounded bg-red-600/90 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition shadow-lg"
                    >
                      + Board
                    </button>
                  )}
                  {onBoard && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-2 py-1 text-[9px] font-bold text-red-400">
                      ✓ On board
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Load more */}
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="w-full py-3 mt-2 text-[11px] font-bold uppercase tracking-wider text-red-500/60 hover:text-red-400 hover:bg-[#141414] rounded transition disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load More Photos"}
          </button>
        )}

        {!loading && photos.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-bold text-[#555]">No photos found</p>
            <p className="text-[10px] text-[#444] mt-1">Try a different search</p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="relative max-w-3xl max-h-[85vh] mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxPhoto.imageUrl}
              alt={lightboxPhoto.description || lightboxPhoto.id}
              className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain"
            />
            <div className="absolute top-2 right-2 flex gap-1.5">
              {!isOnBoard(lightboxPhoto.id) && (
                <button
                  onClick={() => {
                    onAddEvidence(photoToSearchResult(lightboxPhoto));
                    setLightboxPhoto(null);
                  }}
                  className="rounded bg-red-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-red-500 transition shadow-lg"
                >
                  + Add to Board
                </button>
              )}
              <button
                onClick={() => setLightboxPhoto(null)}
                className="rounded bg-black/60 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-black/80 transition"
              >
                ✕ Close
              </button>
            </div>
            {/* Description + faces */}
            {(lightboxPhoto.description || lightboxPhoto.facePeople.length > 0) && (
              <div className="mt-2 rounded-lg bg-[#111]/90 border border-[#2a2a2a] p-3">
                {lightboxPhoto.facePeople.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {lightboxPhoto.facePeople.map((name, i) => (
                      <span
                        key={i}
                        className="rounded-full border border-red-600/20 bg-red-600/10 px-2 py-0.5 text-[10px] font-bold text-red-400"
                      >
                        👤 {name}
                      </span>
                    ))}
                  </div>
                )}
                {lightboxPhoto.description && (
                  <p className="text-[11px] leading-relaxed text-[#888]">
                    {lightboxPhoto.description}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── SEARCH ALL TAB (existing functionality) ────────────────────────────────

function EvidenceSearch({
  isOnBoard,
  onAddEvidence,
  externalQuery,
}: {
  isOnBoard: (id: string) => boolean;
  onAddEvidence: (result: SearchResult, x?: number, y?: number) => void;
  externalQuery?: string;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EvidenceType | "all">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use external query when provided
  const effectiveQuery = externalQuery !== undefined ? externalQuery : query;

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
    if (!effectiveQuery.trim()) { setResults([]); setHasSearched(false); return; }
    debounceRef.current = setTimeout(() => doSearch(effectiveQuery, typeFilter), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [effectiveQuery, typeFilter, doSearch]);

  return (
    <>
      <div className="flex-shrink-0 border-b border-[#1a1a1a] p-3">
        {/* Only show internal search input when not driven by external query */}
        {externalQuery === undefined && (
          <div className="relative mb-2">
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
        )}

        <div className="flex gap-1 flex-wrap">
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
                e.dataTransfer.effectAllowed = "move";
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
