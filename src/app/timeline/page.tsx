import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Timeline — Investigate Epstein",
  description: "Chronological timeline of events and evidence.",
};

export default function TimelinePage() {
  return (
    <div className="relative overflow-hidden scanline-overlay">
      <div className="hero-orb hero-orb-1" />
      <div className="hero-orb hero-orb-2" />

      <section className="relative mx-auto max-w-4xl px-4 pt-24 pb-16 text-center sm:px-6">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-600/10 border border-red-600/20">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-500/70">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        <h1 className="font-[family-name:var(--font-display)] text-4xl font-black uppercase tracking-[0.08em] text-white sm:text-5xl">
          <span className="gradient-text">Timeline</span>
        </h1>

        <p className="mx-auto mt-4 max-w-md text-base text-[#999]">
          A chronological view of all events, connections, and evidence.
        </p>

        <div className="mt-10 glass-card p-8 text-center">
          <p className="font-[family-name:var(--font-mono)] text-sm uppercase tracking-[0.15em] text-[#666]">
            Coming soon
          </p>
          <p className="mt-2 text-sm text-[#555]">
            The full interactive timeline is being built. Check back soon.
          </p>
        </div>
      </section>
    </div>
  );
}
