"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "board-state";

const links = [
  { href: "/", label: "Home" },
  { href: "/board/investigate", label: "Board" },
  { href: "/timeline", label: "Timeline" },
];

export function SiteNav() {
  const pathname = usePathname();

  const handleReset = () => {
    if (!confirm("Reset your investigation? All board progress will be cleared.")) return;
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    window.location.href = "/board/investigate";
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#1a1a1a] bg-[#0a0a0a]/95 backdrop-blur-md">
      <nav className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3 group" id="nav-logo">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-red-600/15 text-red-500 transition group-hover:bg-red-600/25 group-hover:shadow-lg group-hover:shadow-red-600/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </span>
          <span className="font-[family-name:var(--font-display)] text-lg tracking-[0.08em] text-white hidden sm:inline">
            INVESTIGATE<span className="text-red-500">EPSTEIN</span>
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
