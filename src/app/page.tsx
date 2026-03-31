import Link from "next/link";
import { getArchiveStats } from "@/lib/queries";

export default async function HomePage() {
  const stats = await getArchiveStats();

  return (
    <div className="relative overflow-hidden">
      <div className="hero-orb hero-orb-1" />
      <div className="hero-orb hero-orb-2" />

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-4xl px-4 pt-20 pb-12 text-center sm:px-6">
        <div className="animate-in">
          <span className="evidence-badge mb-4 inline-flex border border-accent/20 bg-accent/5 text-accent">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            ACTIVE INVESTIGATION
          </span>
        </div>

        <h1 className="animate-in animate-delay-1 text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          <span className="gradient-text">Investigate The Files.</span>
        </h1>

        <p className="animate-in animate-delay-2 mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
          {stats.emailCount.toLocaleString()} emails.&ensp;
          {stats.documentCount.toLocaleString()} documents.&ensp;
          {stats.photoCount.toLocaleString()} photos.&ensp;
          {stats.personCount} persons of interest.
        </p>

        <p className="animate-in animate-delay-2 mx-auto mt-2 max-w-md text-xs text-muted/60">
          Search the archive. Drag evidence onto your board.
          Build connections. Find patterns.
        </p>

        <div className="animate-in animate-delay-3 mt-8">
          <Link
            href="/board/archive"
            id="hero-cta"
            className="inline-flex h-11 items-center gap-2 rounded bg-accent px-7 text-sm font-bold uppercase tracking-wider text-background shadow-lg shadow-accent/20 transition hover:bg-accent-muted hover:shadow-accent/30"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Open Case Files
          </Link>
        </div>
      </section>

      {/* ─── Stats ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Emails", value: stats.emailCount.toLocaleString(), icon: "✉️" },
            { label: "Documents", value: stats.documentCount.toLocaleString(), icon: "📄" },
            { label: "Photos", value: stats.photoCount.toLocaleString(), icon: "📸" },
            { label: "Persons", value: String(stats.personCount), icon: "👤" },
          ].map((stat, i) => (
            <div
              key={stat.label}
              className="stat-animate glass-card flex flex-col items-center gap-1 p-5"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <span className="text-lg mb-1">{stat.icon}</span>
              <span className="text-xl font-bold tabular-nums text-foreground">
                {stat.value}
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <div className="glass-card pulse-glow relative p-8 overflow-hidden">
          <div className="classified-stamp">CLASSIFIED</div>
          <h2 className="text-lg font-bold sm:text-xl">Case File Access Granted</h2>
          <p className="mt-2 text-sm text-muted">
            All evidence is available. Begin your investigation.
          </p>
          <Link
            href="/board/archive"
            id="footer-cta"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded bg-accent px-6 text-xs font-bold uppercase tracking-wider text-background transition hover:bg-accent-muted"
          >
            Enter the Board Room
          </Link>
        </div>
      </section>
    </div>
  );
}
