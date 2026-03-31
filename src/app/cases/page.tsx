import Link from "next/link";
import type { Metadata } from "next";
import { getCases } from "@/lib/queries";

export const metadata: Metadata = {
  title: "Cases — Investigation Simulator",
  description: "Browse active investigation cases and choose your next challenge.",
};

function DifficultyPips({ level }: { level: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`difficulty-pip ${i < level ? "difficulty-pip-active" : ""}`}
        />
      ))}
    </div>
  );
}

export default async function CasesPage() {
  const cases = await getCases();

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Case Files
        </h1>
        <p className="mt-2 text-muted">
          Select a case to begin your investigation. Each case is rated by
          difficulty and contains its own evidence, entities, and connections.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cases.map((c) => (
          <Link
            key={c.id}
            href={`/board/${c.id}`}
            id={`case-card-${c.id}`}
            className="glass-card group relative overflow-hidden p-6"
          >
            {/* Status badge */}
            <span className="evidence-badge mb-4 border border-accent/20 bg-accent/5 text-accent">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              {c.status.toUpperCase()}
            </span>

            <h2 className="mb-1 text-xl font-bold text-foreground transition group-hover:text-accent">
              {c.title}
            </h2>
            <p className="mb-4 text-sm italic text-muted/80">{c.subtitle}</p>
            <p className="mb-6 text-sm leading-relaxed text-muted line-clamp-3">
              {c.description}
            </p>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4 text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {c.entityCount} Entities
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {c.evidenceCount} Evidence
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                {c.connectionCount} Connections
              </div>
            </div>

            {/* Difficulty */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted/60">
                Difficulty
              </span>
              <DifficultyPips level={c.difficulty} />
            </div>

            {/* Location & Date */}
            <div className="mt-3 flex items-center justify-between text-xs text-muted/60">
              <span>{c.location}</span>
              <span>Opened {c.dateOpened}</span>
            </div>

            {/* Hover glow corner */}
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-accent/5 opacity-0 transition group-hover:opacity-100" />
          </Link>
        ))}

        {/* Coming soon placeholder */}
        <div className="glass-card flex flex-col items-center justify-center p-6 text-center opacity-50" id="case-coming-soon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-muted">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-sm font-medium text-muted">More cases coming soon</span>
          <span className="mt-1 text-xs text-muted/60">New investigations are added regularly</span>
        </div>
      </div>
    </div>
  );
}
