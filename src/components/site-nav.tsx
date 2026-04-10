"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "board-state";

const links = [
  { href: "/", label: "Home" },
  { href: "/board/investigate", label: "Board" },
  { href: "/timeline", label: "Timeline" },
];

function MagnifyingGlass({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke="#E24B4A"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <line
        x1="25"
        y1="25"
        x2="34"
        y2="34"
        stroke="#E24B4A"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SiteNav() {
  const pathname = usePathname();

  const handleReset = () => {
    if (!confirm("Reset your investigation? All board progress will be cleared.")) return;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    window.location.href = "/board/investigate";
  };

  return (
    <header className="sticky top-0 z-20 border-b border-[#1a1a1a] bg-[#0a0a0a]/70 backdrop-blur-md">
      <nav className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* OpenCase brand lockup */}
        <Link href="/" className="flex items-center group" id="nav-logo">
          <MagnifyingGlass size={26} />
          <span
            className="font-[family-name:var(--font-brand)] text-[18px] font-medium tracking-[-0.5px] ml-1"
          >
            <span className="text-[#E24B4A]">Open</span>
            <span className="text-white">Case</span>
          </span>

          {/* Vertical divider */}
          <span className="hidden sm:inline-block w-px h-5 bg-[#333] mx-3" />

          {/* The Epstein List */}
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="font-[family-name:var(--font-brand)] text-[11px] font-normal tracking-[0.15em] text-white uppercase">
              The
            </span>
            <span className="font-[family-name:var(--font-brand)] text-[11px] font-semibold tracking-[0.15em] text-[#E24B4A] uppercase">
              Epstein
            </span>
            <span className="font-[family-name:var(--font-brand)] text-[11px] font-normal tracking-[0.15em] text-white uppercase">
              List
            </span>
          </span>

          {/* LIVE badge */}
          <span className="ml-3 inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-600/10 text-red-400/80 text-[8px] font-bold py-0.5 px-2 leading-none font-[family-name:var(--font-mono)] uppercase tracking-[0.12em]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_3px_rgba(239,68,68,0.4)]" />
            </span>
            LIVE
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <ul className="flex items-center gap-6">
            {links.map((link) => {
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    id={`nav-${link.label.toLowerCase()}`}
                    className={`font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.2em] transition-colors ${
                      isActive
                        ? "text-red-500"
                        : "text-[#888] hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <button
            onClick={handleReset}
            className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.15em] text-[#555] hover:text-red-400 transition-colors border border-[#333] hover:border-red-600/30 rounded px-2.5 py-1"
            title="Reset investigation"
          >
            Reset
          </button>
        </div>
      </nav>
    </header>
  );
}
