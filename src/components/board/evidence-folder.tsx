"use client";

import { useState } from "react";
import type { EvidenceFolderItem } from "@/lib/types";

// ─── Inline SVG Icons ──────────────────────────────────────────────────────

function FolderIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

const TYPE_ICON: Record<string, string> = {
  email: "\u2709\uFE0F",
  document: "\uD83D\uDCC4",
  photo: "\uD83D\uDCF8",
  imessage: "\uD83D\uDCAC",
};

const TYPE_LABEL: Record<string, string> = {
  email: "Email",
  document: "Document",
  photo: "Photo",
  imessage: "iMessage",
};

// ─── Evidence Folder Button ─────────────────────────────────────────────────

interface EvidenceFolderButtonProps {
  onClick: () => void;
  loading?: boolean;
}

export function EvidenceFolderButton({ onClick, loading }: EvidenceFolderButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="folder-button-pulse flex items-center gap-2 rounded-lg border border-[#E24B4A]/30 bg-[#141414]/90 backdrop-blur-sm px-3 py-2 text-white/90 transition hover:bg-[#E24B4A]/10 hover:border-[#E24B4A]/50 disabled:opacity-50 disabled:cursor-wait"
    >
      <span className="text-[#E24B4A]">
        <FolderIcon size={18} />
      </span>
      <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.12em]">
        {loading ? "Loading..." : "New Evidence"}
      </span>
      {/* Pulsing dot */}
      {!loading && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E24B4A] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#E24B4A] shadow-[0_0_4px_rgba(226,75,74,0.5)]" />
        </span>
      )}
    </button>
  );
}

// ─── Evidence Card (inside folder) ──────────────────────────────────────────

interface FolderCardProps {
  item: EvidenceFolderItem;
  onAdd: () => void;
  onDismiss: () => void;
  isOnBoard: boolean;
}

function FolderCard({ item, onAdd, onDismiss, isOnBoard }: FolderCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="folder-card-animate group relative flex flex-col rounded-lg border border-[#222] bg-[#111]/95 overflow-hidden transition hover:border-[#E24B4A]/30">
      {/* Photo thumbnail */}
      {item.type === "photo" && item.thumbnailUrl && !imgError && (
        <div className="h-28 w-full overflow-hidden bg-black/50">
          <img
            src={item.thumbnailUrl}
            alt={item.snippet || "Evidence photo"}
            className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5 p-3 flex-1">
        {/* Type badge */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-wider text-[#888]">
            <span>{TYPE_ICON[item.type] ?? ""}</span>
            {TYPE_LABEL[item.type] ?? item.type}
          </span>
          {item.starCount > 0 && (
            <span className="text-[9px] text-amber-500/70 font-[family-name:var(--font-mono)]">
              {"★".repeat(Math.min(item.starCount, 5))}
            </span>
          )}
        </div>

        {/* Title */}
        <h4 className="text-[12px] font-medium text-white/90 leading-snug line-clamp-2">
          {item.title}
        </h4>

        {/* Snippet */}
        <p className="text-[10px] text-[#777] leading-relaxed line-clamp-3 flex-1">
          {item.snippet}
        </p>

        {/* Date */}
        {item.date && (
          <span className="text-[9px] text-[#555] font-[family-name:var(--font-mono)]">
            {item.date}
          </span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-1 pt-2 border-t border-[#1a1a1a]">
          {isOnBoard ? (
            <span className="flex-1 text-center text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-wider text-[#555]">
              On Board
            </span>
          ) : (
            <button
              onClick={onAdd}
              className="flex-1 flex items-center justify-center gap-1 rounded border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-2 py-1.5 text-[9px] font-[family-name:var(--font-mono)] font-bold uppercase tracking-[0.1em] text-[#E24B4A] transition hover:bg-[#E24B4A]/20 hover:border-[#E24B4A]/50"
            >
              <PlusIcon />
              Add to Board
            </button>
          )}
          <button
            onClick={onDismiss}
            className="rounded border border-[#333] p-1.5 text-[#555] transition hover:text-white hover:border-[#555]"
            title="Dismiss"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Evidence Folder Overlay ────────────────────────────────────────────────

interface EvidenceFolderOverlayProps {
  items: EvidenceFolderItem[];
  onAddToBoard: (item: EvidenceFolderItem) => void;
  onDismiss: (itemId: string) => void;
  onClose: () => void;
  isOnBoard: (id: string) => boolean;
}

export function EvidenceFolderOverlay({
  items,
  onAddToBoard,
  onDismiss,
  onClose,
  isOnBoard,
}: EvidenceFolderOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm folder-backdrop-enter"
        onClick={onClose}
      />

      {/* Folder container */}
      <div className="evidence-folder-enter relative z-10 w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 rounded-t-xl border border-b-0 border-[#222] bg-[#0d0d0d]">
          <div className="flex items-center gap-3">
            <span className="text-[#E24B4A]">
              <FolderIcon size={22} />
            </span>
            <div>
              <h3 className="font-[family-name:var(--font-brand)] text-[15px] font-medium text-white tracking-tight">
                Evidence Folder
              </h3>
              <p className="text-[9px] font-[family-name:var(--font-mono)] uppercase tracking-[0.15em] text-[#555]">
                {items.length} item{items.length !== 1 ? "s" : ""} — Review and add to your board
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* CLASSIFIED stamp */}
            <span className="hidden sm:inline font-[family-name:var(--font-display)] text-[11px] tracking-[0.2em] text-[#E24B4A]/30 uppercase border border-[#E24B4A]/15 rounded px-2 py-0.5 rotate-[-2deg]">
              Classified
            </span>
            <button
              onClick={onClose}
              className="rounded p-1 text-[#555] transition hover:text-white hover:bg-white/5"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Cards grid */}
        <div className="overflow-y-auto rounded-b-xl border border-[#222] bg-[#0a0a0a]/95 p-4">
          {items.length === 0 ? (
            <div className="py-12 text-center text-[#555] text-sm font-[family-name:var(--font-mono)]">
              No new evidence available. Check back later.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {items.map((item) => (
                <FolderCard
                  key={item.id}
                  item={item}
                  onAdd={() => onAddToBoard(item)}
                  onDismiss={() => onDismiss(item.id)}
                  isOnBoard={isOnBoard(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
