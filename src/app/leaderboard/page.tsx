import type { Metadata } from "next";
import { leaderboard } from "@/lib/seed-data";
import type { InvestigatorRank } from "@/lib/types";

export const metadata: Metadata = {
  title: "Leaderboard — Investigation Simulator",
  description:
    "See how top investigators rank by cases solved, accuracy, and overall score.",
};

const rankLabel: Record<InvestigatorRank, string> = {
  rookie: "Rookie",
  detective: "Detective",
  senior_detective: "Sr. Detective",
  inspector: "Inspector",
  chief_inspector: "Chief Inspector",
};

export default function LeaderboardPage() {
  const sorted = [...leaderboard].sort((a, b) => b.score - a.score);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Leaderboard
        </h1>
        <p className="mt-2 text-muted">
          Top investigators ranked by overall score. Accuracy and streak
          bonuses influence your ranking.
        </p>
      </div>

      {/* ─── Podium (Top 3) ────────────────────────────────── */}
      <div className="mb-10 grid grid-cols-3 gap-4">
        {sorted.slice(0, 3).map((inv, i) => {
          const medals = ["🥇", "🥈", "🥉"];
          const sizes = [
            "pt-6 pb-6",
            "pt-8 pb-4",
            "pt-10 pb-3",
          ];
          return (
            <div
              key={inv.id}
              id={`podium-${inv.id}`}
              className={`glass-card relative flex flex-col items-center text-center p-4 ${sizes[i]}`}
            >
              <span className="text-3xl mb-2">{medals[i]}</span>
              {/* Avatar circle */}
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-xl font-bold text-accent mb-2">
                {inv.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
              <h3 className="text-sm font-bold">{inv.name}</h3>
              <span
                className={`evidence-badge mt-1 rank-${inv.rank}`}
              >
                {rankLabel[inv.rank]}
              </span>
              <div className="mt-3 text-2xl font-bold text-accent">
                {inv.score.toLocaleString()}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-muted">
                points
              </div>
              <div className="mt-3 flex gap-3 text-xs text-muted">
                <span>{inv.casesSolved} solved</span>
                <span>{inv.accuracy}% acc</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Full Table ────────────────────────────────────── */}
      <div className="glass-card overflow-hidden" id="leaderboard-table">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted/60">
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">Investigator</th>
              <th className="px-4 py-3 hidden sm:table-cell">Rank</th>
              <th className="px-4 py-3 text-right">Solved</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Accuracy</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Streak</th>
              <th className="px-4 py-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((inv, i) => (
              <tr
                key={inv.id}
                id={`row-${inv.id}`}
                className="border-b border-border/50 transition hover:bg-surface-hover"
              >
                <td className="px-4 py-3 font-mono text-muted/60">
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                      {inv.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <span className="font-medium">{inv.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className={`evidence-badge rank-${inv.rank}`}>
                    {rankLabel[inv.rank]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {inv.casesSolved}
                </td>
                <td className="px-4 py-3 text-right font-mono hidden sm:table-cell">
                  {inv.accuracy}%
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <span className="inline-flex items-center gap-1 text-accent">
                    🔥 {inv.streak}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-accent">
                  {inv.score.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
