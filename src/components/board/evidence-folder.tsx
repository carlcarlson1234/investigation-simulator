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

function MagnifyingGlass() {
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="12" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      <line x1="25" y1="25" x2="34" y2="34" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
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

const CATEGORY_COLOR: Record<string, string> = {
  direct: "#E24B4A",
  cryptic: "#B8860B",
  fodder: "#555",
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
      {!loading && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E24B4A] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#E24B4A] shadow-[0_0_4px_rgba(226,75,74,0.5)]" />
        </span>
      )}
    </button>
  );
}

// ─── Flip Card ──────────────────────────────────────────────────────────────

function FlipCard({ item, isFlipped, onFlip, onAdd, onDismiss, isOnBoard, onDraggedToBoard }: {
  item: EvidenceFolderItem;
  isFlipped: boolean;
  onFlip: () => void;
  onAdd: () => void;
  onDismiss: () => void;
  isOnBoard: boolean;
  onDraggedToBoard?: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const categoryColor = CATEGORY_COLOR[item.folderCategory] || "#555";

  return (
    <div
      className="flip-card tray-card-enter shrink-0"
      style={{ width: 155, height: 210 }}
      onClick={() => !isFlipped && onFlip()}
    >
      <div className={`flip-card-inner ${isFlipped ? "flipped" : ""}`}>
        {/* Back face — card back with OpenCase logo */}
        <div className="flip-card-back flex flex-col items-center justify-center bg-[#141414] border border-[#2a2a2a] shadow-lg shadow-black/50">
          <MagnifyingGlass />
          <span className="mt-2 font-[family-name:var(--font-brand)] text-[10px] text-[#444] tracking-tight">
            <span className="text-[#E24B4A]/40">Open</span><span className="text-[#666]/40">Case</span>
          </span>
          {/* Category color hint at bottom */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full" style={{ backgroundColor: categoryColor, opacity: 0.4 }} />
        </div>

        {/* Front face — evidence content, draggable to board */}
        <div
          className="flip-card-front flex flex-col bg-[#111] border border-[#2a2a2a] shadow-lg shadow-black/50"
          draggable={isFlipped && !isOnBoard}
          onDragStart={(e) => {
            if (!isFlipped) { e.preventDefault(); return; }
            e.dataTransfer.setData("application/board-item", JSON.stringify({ id: item.id, kind: "evidence", data: item }));
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            // Small delay to let the drop handler add it to the board first
            setTimeout(() => onDraggedToBoard?.(), 100);
          }}
        >
          {/* Photo thumbnail */}
          {item.type === "photo" && item.thumbnailUrl && !imgError && (
            <div className="h-20 w-full overflow-hidden bg-black/50 shrink-0">
              <img
                src={item.thumbnailUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1 p-2.5 flex-1 min-h-0">
            {/* Type badge */}
            <div className="flex items-center gap-1">
              <span className="text-[9px]">{TYPE_ICON[item.type] ?? ""}</span>
              <span className="font-[family-name:var(--font-mono)] text-[8px] uppercase tracking-wider text-[#777]">
                {TYPE_LABEL[item.type] ?? item.type}
              </span>
              {item.starCount > 0 && (
                <span className="ml-auto text-[8px] text-amber-500/70">{"★".repeat(Math.min(item.starCount, 5))}</span>
              )}
            </div>

            {/* Title */}
            <h4 className="text-[11px] font-medium text-white/90 leading-snug line-clamp-2">{item.title}</h4>

            {/* Snippet */}
            <p className="text-[9px] text-[#666] leading-relaxed line-clamp-2 flex-1">{item.snippet}</p>

            {/* Date */}
            {item.date && (
              <span className="text-[8px] text-[#555] font-[family-name:var(--font-mono)]">{item.date}</span>
            )}

            {/* Action */}
            <div className="mt-auto pt-1">
              {isOnBoard ? (
                <span className="text-center block text-[8px] font-[family-name:var(--font-mono)] uppercase tracking-wider text-[#555]">On Board</span>
              ) : (
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onAdd(); }}
                    className="flex-1 flex items-center justify-center gap-1 rounded border border-[#E24B4A]/30 bg-[#E24B4A]/10 px-1.5 py-1 text-[8px] font-[family-name:var(--font-mono)] font-bold uppercase tracking-[0.08em] text-[#E24B4A] transition hover:bg-[#E24B4A]/20"
                  >
                    <PlusIcon /> Add
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                    className="rounded border border-[#333] p-1 text-[#555] transition hover:text-white hover:border-[#555]"
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Evidence Tray (split-screen, replaces overlay) ─────────────────────────

interface EvidenceTrayProps {
  items: EvidenceFolderItem[];
  onAddToBoard: (item: EvidenceFolderItem) => void;
  onDismiss: (itemId: string) => void;
  onClose: () => void;
  isOnBoard: (id: string) => boolean;
}

export function EvidenceTray({
  items,
  onAddToBoard,
  onDismiss,
  onClose,
  isOnBoard,
}: EvidenceTrayProps) {
  const [flippedIds, setFlippedIds] = useState<Set<string>>(new Set());

  const flipCard = (id: string) => {
    setFlippedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const flippedCount = flippedIds.size;
  const totalCount = items.length;

  return (
    <div className="evidence-tray border-b border-[#222] bg-[#111] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-[#E24B4A]"><FolderIcon size={18} /></span>
          <div>
            <h3 className="font-[family-name:var(--font-brand)] text-[13px] font-medium text-white tracking-tight">
              Evidence Pack
            </h3>
            <p className="text-[8px] font-[family-name:var(--font-mono)] uppercase tracking-[0.15em] text-[#555]">
              {flippedCount} of {totalCount} revealed — Click cards to flip
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline font-[family-name:var(--font-display)] text-[10px] tracking-[0.2em] text-[#E24B4A]/25 uppercase border border-[#E24B4A]/10 rounded px-2 py-0.5 rotate-[-2deg]">
            Classified
          </span>
          <button onClick={onClose} className="flex items-center gap-1 rounded border border-[#333] px-2 py-1 text-[#666] transition hover:text-white hover:border-[#555] hover:bg-white/5">
            <CloseIcon />
            <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-wider">Close</span>
          </button>
        </div>
      </div>

      {/* Card row */}
      <div className="px-4 pb-3 overflow-x-auto">
        <div className="flex items-start gap-2 justify-center min-w-min">
          {items.length === 0 ? (
            <div className="py-8 text-center text-[#555] text-sm font-[family-name:var(--font-mono)]">
              No new evidence available.
            </div>
          ) : (
            items.map((item) => (
              <FlipCard
                key={item.id}
                item={item}
                isFlipped={flippedIds.has(item.id)}
                onFlip={() => flipCard(item.id)}
                onAdd={() => onAddToBoard(item)}
                onDismiss={() => onDismiss(item.id)}
                isOnBoard={isOnBoard(item.id)}
                onDraggedToBoard={() => { if (isOnBoard(item.id)) onDismiss(item.id); }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
