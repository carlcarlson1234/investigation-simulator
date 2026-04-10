"use client";

import { useState, useEffect, useCallback } from "react";
import type { PhotoEvidence, Person, SearchResult } from "@/lib/types";
import type { BoardNode, BoardConnection } from "@/lib/board-types";

const PHOTO_CDN = "https://assets.getkino.com";

export interface PhotoFocusViewProps {
  photoId: string;
  boardNodes: BoardNode[];
  boardConnections: BoardConnection[];
  people: Person[];
  isOnBoard: (id: string) => boolean;
  onClose: () => void;
  onAddEvidence: (result: SearchResult) => void;
  onAddPerson: (personId: string) => void;
  onFocusNode: (id: string | null) => void;
}

export function PhotoFocusView({
  photoId,
  boardNodes,
  boardConnections,
  people,
  isOnBoard,
  onClose,
  onAddEvidence,
  onAddPerson,
  onFocusNode,
}: PhotoFocusViewProps) {
  const [photo, setPhoto] = useState<PhotoEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFullRes, setShowFullRes] = useState(false);

  // Fetch full photo detail
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/evidence/${encodeURIComponent(photoId)}?type=photo`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setPhoto(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Build URLs from photo ID
  const fullImageUrl = `${PHOTO_CDN}/photos/${photoId}`;
  const largeThumbUrl = `${PHOTO_CDN}/cdn-cgi/image/width=900,quality=85,format=auto/photos-deboned/${photoId}`;

  // Find people detected in this photo
  const detectedPeople = photo?.facesDetected
    ?.map((pid) => people.find((p) => p.id === pid))
    .filter(Boolean) as Person[] | undefined;

  // Find connections this photo has on the board
  const connections = boardConnections.filter(
    (c) => c.sourceId === photoId || c.targetId === photoId
  );

  const connectedNodes = connections
    .map((c) =>
      boardNodes.find(
        (n) => n.id === (c.sourceId === photoId ? c.targetId : c.sourceId)
      )
    )
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#030303]/98" />
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
            Photo Evidence
          </span>
        </div>

        <span className="text-[10px] font-bold text-[#333] tracking-wider">
          ESC
        </span>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 overflow-hidden">
        {/* Left: Large photo */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="h-12 w-12 rounded-full border-2 border-red-500/30 border-t-red-500 animate-spin" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#555]">
                Loading evidence…
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center max-w-4xl w-full">
              {/* Image container */}
              <div className="relative group w-full">
                <img
                  src={showFullRes ? fullImageUrl : largeThumbUrl}
                  alt={photo?.imageDescription || photoId}
                  className="w-full max-h-[70vh] object-contain rounded-xl shadow-2xl shadow-black/50 border border-[#2a2a2a]"
                  onClick={() => setShowFullRes(!showFullRes)}
                />

                {/* Resolution toggle */}
                <button
                  onClick={() => setShowFullRes(!showFullRes)}
                  className="absolute top-3 right-3 rounded bg-black/70 backdrop-blur-sm px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white/80 hover:text-white hover:bg-black/90 transition border border-white/10"
                >
                  {showFullRes ? "📐 Full Res" : "🔍 Click for Full Res"}
                </button>

                {/* Face overlay badges */}
                {detectedPeople && detectedPeople.length > 0 && (
                  <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1.5">
                    {detectedPeople.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (isOnBoard(p.id)) {
                            onFocusNode(p.id);
                            onClose();
                          } else {
                            onAddPerson(p.id);
                          }
                        }}
                        className="flex items-center gap-1.5 rounded-full bg-black/80 backdrop-blur-sm border border-white/10 px-2.5 py-1 hover:bg-red-900/60 hover:border-red-500/30 transition group/badge"
                      >
                        {p.imageUrl && (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="h-5 w-5 rounded-full object-cover border border-white/20"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <span className="text-[10px] font-bold text-white">
                          {p.name}
                        </span>
                        <span className="text-[8px] text-white/40 group-hover/badge:text-red-400 transition">
                          {isOnBoard(p.id) ? "→ Focus" : "+ Add"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Title bar under photo */}
              <div className="mt-4 w-full flex items-center gap-3">
                <div className="flex items-center gap-1.5 rounded bg-red-600/10 border border-red-600/20 px-2.5 py-1">
                  <span className="text-sm">📸</span>
                  <span className="text-[9px] font-black uppercase tracking-[0.15em] text-red-500/80">
                    Photo Evidence
                  </span>
                </div>
                <h2 className="text-[14px] font-bold text-[#888] truncate">
                  {photo?.title || photoId}
                </h2>
                {photo?.source && (
                  <span className="ml-auto text-[10px] font-bold text-[#555] uppercase tracking-wider">
                    Source: {photo.source}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Metadata panel */}
        <div className="w-[360px] flex-shrink-0 border-l border-red-900/15 bg-[#0a0a0a]/80 backdrop-blur-sm overflow-y-auto">
          {photo && (
            <div className="p-5 space-y-5">
              {/* File Info */}
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/60 mb-3">
                  File Information
                </h3>
                <div className="space-y-2">
                  <InfoRow label="Filename" value={photo.title} />
                  <InfoRow label="Source" value={photo.source || "Unknown"} />
                  <InfoRow
                    label="Dimensions"
                    value={
                      photo.width && photo.height
                        ? `${photo.width} × ${photo.height}px`
                        : "Unknown"
                    }
                  />
                  <InfoRow
                    label="Content Type"
                    value={photo.contentType || "image/png"}
                  />
                  <InfoRow
                    label="Release Batch"
                    value={photo.releaseBatch || "—"}
                  />
                  {photo.sourceUrl && (
                    <div className="pt-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#555] block mb-1">
                        Original Source
                      </span>
                      <a
                        href={photo.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-red-400 hover:text-red-300 underline underline-offset-2 transition break-all"
                      >
                        {photo.sourceUrl}
                      </a>
                    </div>
                  )}
                </div>
              </section>

              {/* AI Description */}
              {photo.imageDescription && (
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/60 mb-3">
                    AI Analysis
                  </h3>
                  <div className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
                    <p className="text-[11px] leading-relaxed text-[#999]">
                      {photo.imageDescription}
                    </p>
                  </div>
                </section>
              )}

              {/* Detected Persons */}
              {detectedPeople && detectedPeople.length > 0 && (
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/60 mb-3">
                    Detected Persons ({detectedPeople.length})
                  </h3>
                  <div className="space-y-1.5">
                    {detectedPeople.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2.5 rounded-lg border border-[#2a2a2a] bg-[#111] p-2.5 hover:border-red-500/20 transition group/person"
                      >
                        <div className="h-10 w-10 rounded-lg overflow-hidden bg-[#1a1a1a] flex-shrink-0 border border-[#333]">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="h-full w-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                className="text-[#444]"
                              >
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[12px] font-bold text-white block truncate">
                            {p.name}
                          </span>
                          {p.photoCount > 0 && (
                            <span className="text-[9px] text-[#555]">
                              📸 {p.photoCount} photos
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (isOnBoard(p.id)) {
                              onFocusNode(p.id);
                              onClose();
                            } else {
                              onAddPerson(p.id);
                            }
                          }}
                          className="text-[8px] font-bold uppercase tracking-wider text-red-500/50 hover:text-red-400 transition opacity-0 group-hover/person:opacity-100"
                        >
                          {isOnBoard(p.id) ? "Focus →" : "+ Board"}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Board Connections */}
              {connectedNodes.length > 0 && (
                <section>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500/60 mb-3">
                    Board Connections ({connectedNodes.length})
                  </h3>
                  <div className="space-y-1.5">
                    {connectedNodes.map((n) => {
                      if (!n) return null;
                      return (
                        <button
                          key={n.id}
                          onClick={() => {
                            onFocusNode(n.id);
                            onClose();
                          }}
                          className="w-full flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#111] p-2.5 hover:border-red-500/20 transition text-left"
                        >
                          <span className="text-sm">
                            {n.kind === "person" ? "👤" : "📄"}
                          </span>
                          <span className="text-[11px] font-bold text-white truncate">
                            {n.kind === "person" ? n.data.name : n.kind === "entity" ? n.data.name : n.data.title}
                          </span>
                          <span className="ml-auto text-[8px] text-[#555] uppercase tracking-wider">
                            Focus →
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[9px] font-bold uppercase tracking-wider text-[#555] flex-shrink-0 w-24">
        {label}
      </span>
      <span className="text-[11px] font-bold text-[#ccc] truncate">{value}</span>
    </div>
  );
}
