"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { SearchResult, EvidenceType } from "@/lib/types";
import {
  EVIDENCE_TYPE_ICON,
  EVIDENCE_TYPE_LABEL,
  EVIDENCE_CATEGORIES,
  getEvidenceCategory,
} from "@/lib/board-types";

interface IntakePanelProps {
  isOnBoard: (id: string) => boolean;
  onAddEvidence: (result: SearchResult, x?: number, y?: number) => void;
}

export function IntakePanel({ isOnBoard, onAddEvidence }: IntakePanelProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<EvidenceType | "all">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Search with debounce ────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string, type: EvidenceType | "all") => {
    setLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({
        q,
        type,
        limit: "30",
        offset: "0",
      });
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

    if (!query.trim() && typeFilter === "all") {
      setResults([]);
      setHasSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      doSearch(query, typeFilter);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, typeFilter, doSearch]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <aside className="intake-panel flex w-64 flex-shrink-0 flex-col border-r border-border overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-accent/70">
          Evidence Search
        </h2>
        <p className="mt-0.5 text-[9px] text-muted/40">
          Search files &amp; drag onto board
        </p>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 border-b border-border p-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted/40"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emails, docs, photos…"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted/40 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20 transition"
            id="intake-search"
          />
        </div>

        {/* Type filter */}
        <div className="mt-2 flex gap-1 flex-wrap">
          {(["all", "email", "document", "photo", "imessage"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition ${
                typeFilter === t
                  ? "bg-accent/15 text-accent"
                  : "text-muted/50 hover:text-muted/80 hover:bg-surface-hover"
              }`}
            >
              {t === "all" ? "All" : EVIDENCE_TYPE_ICON[t as EvidenceType]} {t === "all" ? "" : EVIDENCE_TYPE_LABEL[t as EvidenceType]}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="flex-shrink-0 px-4 py-2 text-[10px] text-muted/50 border-b border-border/50">
        {loading ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            Searching…
          </span>
        ) : hasSearched ? (
          `${results.length} result${results.length !== 1 ? "s" : ""}`
        ) : (
          "Type to search the archive"
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
        {!hasSearched && !loading && (
          <div className="px-2 py-8 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-muted/20">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-[10px] text-muted/40 uppercase tracking-wider font-semibold">
              Search the archive
            </p>
            <p className="text-[9px] text-muted/30 mt-1">1.78M+ files available</p>
          </div>
        )}

        {hasSearched && results.length === 0 && !loading && (
          <div className="px-2 py-8 text-center text-xs text-muted/40">
            No results found.
          </div>
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
              className={`group rounded-lg border p-2.5 transition ${
                onBoard
                  ? "border-accent/20 bg-accent/5 opacity-50 cursor-default"
                  : "border-border bg-surface hover:border-accent/30 hover:bg-surface-hover cursor-grab active:cursor-grabbing"
              }`}
              id={`intake-${result.id}`}
            >
              {/* Header */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs flex-shrink-0">
                  {EVIDENCE_TYPE_ICON[result.type]}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-muted/60">
                  {EVIDENCE_TYPE_LABEL[result.type]}
                </span>
                {result.date && (
                  <span className="ml-auto text-[9px] text-muted/40 tabular-nums">
                    {result.date}
                  </span>
                )}
              </div>

              {/* Title */}
              <h4 className="text-xs font-semibold leading-tight text-foreground/90 line-clamp-2">
                {result.title}
              </h4>

              {/* Sender / source */}
              {result.sender && (
                <p className="mt-0.5 text-[9px] text-muted/50 truncate">
                  {result.sender}
                </p>
              )}

              {/* Snippet */}
              <p className="mt-1 text-[10px] leading-relaxed text-muted/40 line-clamp-2">
                {result.snippet}
              </p>

              {/* Star count */}
              {result.starCount > 0 && (
                <div className="mt-1 text-[9px] text-amber-400/60">
                  ★ {result.starCount.toLocaleString()}
                </div>
              )}

              {/* Status */}
              {onBoard ? (
                <div className="mt-1.5 text-[9px] font-medium text-accent/60">
                  ✓ On board
                </div>
              ) : (
                <button
                  onClick={() => onAddEvidence(result)}
                  className="mt-1.5 flex items-center gap-1 rounded bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent opacity-0 transition group-hover:opacity-100 hover:bg-accent/20"
                >
                  + Add to board
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
