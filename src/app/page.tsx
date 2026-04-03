import { Suspense } from "react";
import Link from "next/link";
import { getArchiveStats } from "@/lib/queries";

async function StatsGrid() {
  const stats = await getArchiveStats();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "Emails", value: stats.emailCount.toLocaleString(), icon: "✉️" },
        { label: "Documents", value: stats.documentCount.toLocaleString(), icon: "📄" },
        { label: "Photos", value: stats.photoCount.toLocaleString(), icon: "📸" },
        { label: "Persons", value: String(stats.personCount), icon: "🔍" },
      ].map((stat, i) => (
        <div
          key={stat.label}
          className="stat-animate glass-card flex flex-col items-center gap-1.5 p-5"
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          <span className="text-2xl">{stat.icon}</span>
          <span className="text-2xl font-black tabular-nums text-white">
            {stat.value}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#666]">
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatsFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {["Emails", "Documents", "Photos", "Persons"].map((label, i) => (
        <div
          key={label}
          className="stat-animate glass-card flex flex-col items-center gap-1.5 p-5"
          style={{ animationDelay: `${i * 0.08}s` }}
        >
          <span className="text-2xl opacity-30">⏳</span>
          <span className="text-2xl font-black tabular-nums text-[#333]">—</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#666]">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="relative overflow-hidden scanline-overlay">
      <div className="hero-orb hero-orb-1" />
      <div className="hero-orb hero-orb-2" />

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-4xl px-4 pt-16 pb-10 text-center sm:px-6">
        <div className="animate-in">
          <span className="evidence-badge mb-5 inline-flex border border-red-600/30 bg-red-600/10 text-red-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            ACTIVE INVESTIGATION
          </span>
        </div>

        <h1 className="animate-in animate-delay-1 text-5xl font-black tracking-tight sm:text-7xl lg:text-8xl leading-[0.9]">
          <span className="gradient-text">INVESTIGATE</span>
          <br />
          <span className="text-white">EPSTEIN</span>
        </h1>

        <p className="animate-in animate-delay-2 mx-auto mt-6 max-w-lg text-base leading-relaxed text-[#999]">
          An open citizens investigation. Examine the evidence, map the
          connections, and compare findings with other investigators.
          Every link you uncover strengthens the collective picture.
        </p>

        <div className="animate-in animate-delay-3 mt-10 flex flex-col items-center gap-4">
          <Link
            href="/board/investigate"
            id="hero-cta"
            className="inline-flex h-14 items-center gap-3 rounded bg-red-600 px-10 text-base font-black uppercase tracking-widest text-white shadow-xl shadow-red-600/25 transition hover:bg-red-700 hover:shadow-red-600/40 hover:scale-105 active:scale-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Start Investigation
          </Link>
          <Link
            href="/board/investigate?mode=free"
            id="hero-cta-free"
            className="inline-flex h-10 items-center gap-2 rounded border border-[#333] px-6 text-sm font-bold uppercase tracking-widest text-[#888] transition hover:border-[#555] hover:text-white hover:scale-105"
          >
            Free Explore
          </Link>
        </div>
      </section>

      {/* ─── Stats ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Suspense fallback={<StatsFallback />}>
          <StatsGrid />
        </Suspense>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <div className="glass-card pulse-glow relative p-10 overflow-hidden">
          <div className="classified-stamp">CLASSIFIED</div>
          <h2 className="text-2xl font-black uppercase tracking-wider text-white sm:text-3xl">
            Access Granted
          </h2>
          <p className="mt-3 text-base text-[#888]">
            All evidence files are available for investigation.
          </p>
          <Link
            href="/board/investigate"
            id="footer-cta"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded bg-red-600 px-8 text-sm font-black uppercase tracking-widest text-white transition hover:bg-red-700 hover:scale-105"
          >
            Start Investigation
          </Link>
        </div>
      </section>
    </div>
  );
}
