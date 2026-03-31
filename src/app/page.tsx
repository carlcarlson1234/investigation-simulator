import Link from "next/link";
import { getHomeStats } from "@/lib/queries";

export default async function HomePage() {
  const stats = await getHomeStats();

  const statItems = [
    { label: "Active Cases", value: String(stats.activeCases) },
    { label: "Evidence Items", value: String(stats.evidenceItems) },
    { label: "Connections", value: String(stats.connections) },
    { label: "Investigators", value: String(stats.investigators) },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Background orbs */}
      <div className="hero-orb hero-orb-1" />
      <div className="hero-orb hero-orb-2" />

      {/* ─── Hero Section ─────────────────────────────────────── */}
      <section className="relative mx-auto max-w-5xl px-4 pt-24 pb-16 text-center sm:px-6">
        <div className="animate-in">
          <span className="evidence-badge mb-6 inline-flex border border-accent/20 bg-accent/5 text-accent">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Live Investigation
          </span>
        </div>

        <h1 className="animate-in animate-delay-1 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          <span className="gradient-text">Uncover the Truth.</span>
          <br />
          <span className="text-foreground/80">Before Time Runs Out.</span>
        </h1>

        <p className="animate-in animate-delay-2 mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          Analyze evidence. Map connections. Compete with investigators
          worldwide. Dive into complex cases built from real investigative
          techniques and see if you can crack the code.
        </p>

        <div className="animate-in animate-delay-3 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/board/demo-case"
            id="hero-cta-primary"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-8 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-muted hover:shadow-accent/40"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Open Demo Case
          </Link>
          <Link
            href="/cases"
            id="hero-cta-secondary"
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-border px-8 text-sm font-semibold text-foreground/70 transition hover:border-accent/30 hover:text-foreground"
          >
            Browse Cases
          </Link>
        </div>
      </section>

      {/* ─── Stats ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {statItems.map((stat, i) => (
            <div
              key={stat.label}
              className={`stat-animate glass-card flex flex-col items-center gap-1 p-6`}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <span className="text-3xl font-bold text-foreground">
                {stat.value}
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How It Works ─────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <h2 className="mb-12 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          How It Works
        </h2>

        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Choose a Case",
              desc: "Browse mysteries rated by difficulty. Each case is a self-contained investigation with real-world investigative logic.",
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              ),
            },
            {
              step: "02",
              title: "Analyze the Board",
              desc: "Examine evidence cards, trace connections between entities, and build your theory on a visual investigation board.",
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              ),
            },
            {
              step: "03",
              title: "Solve & Compete",
              desc: "Submit your conclusion, see how your accuracy stacks up on the global leaderboard, and share your results.",
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 5 7 5s1.2-2 3-2c1.7 0 3 1.3 3 3 0 2.5-4 5-4 5" />
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 5 17 5s-1.2-2-3-2c-1.7 0-3 1.3-3 3 0 2.5 4 5 4 5" />
                  <line x1="12" y1="9" x2="12" y2="22" />
                  <path d="M7 12H5a2 2 0 0 0-2 2v7h18v-7a2 2 0 0 0-2-2h-2" />
                </svg>
              ),
            },
          ].map((item) => (
            <div key={item.step} className="glass-card p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                {item.icon}
              </div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-accent/60">
                Step {item.step}
              </div>
              <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <div className="glass-card pulse-glow p-10">
          <h2 className="text-2xl font-bold sm:text-3xl">Ready to Investigate?</h2>
          <p className="mt-3 text-muted">
            The Meridian Protocol awaits. Can you see what others missed?
          </p>
          <Link
            href="/board/demo-case"
            id="footer-cta"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-8 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-muted"
          >
            Start Investigating
          </Link>
        </div>
      </section>
    </div>
  );
}
