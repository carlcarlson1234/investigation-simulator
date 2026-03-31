import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCaseBySlug,
  getEntitiesByCaseId,
  getEvidenceByCaseId,
  getEvidenceLinksByCaseId,
} from "@/lib/queries";
import type { EntityType, EvidenceType, ConnectionType } from "@/lib/types";

export const metadata: Metadata = {
  title: "Investigation Board — The Meridian Protocol",
  description:
    "Analyze evidence, trace connections, and build your theory on the investigation board.",
};

/* ─── Helper maps ───────────────────────────────────────────────────────── */

const entityTypeColor: Record<EntityType, string> = {
  suspect: "border-red-500/40 bg-red-500/5",
  victim: "border-amber-500/40 bg-amber-500/5",
  witness: "border-blue-500/40 bg-blue-500/5",
  person_of_interest: "border-purple-500/40 bg-purple-500/5",
  organization: "border-emerald-500/40 bg-emerald-500/5",
};

const entityTypeLabel: Record<EntityType, string> = {
  suspect: "Suspect",
  victim: "Victim",
  witness: "Witness",
  person_of_interest: "Person of Interest",
  organization: "Organization",
};

const entityTypeDot: Record<EntityType, string> = {
  suspect: "bg-red-500",
  victim: "bg-amber-500",
  witness: "bg-blue-500",
  person_of_interest: "bg-purple-500",
  organization: "bg-emerald-500",
};

const evidenceTypeIcon: Record<EvidenceType, string> = {
  document: "📄",
  photo: "📸",
  testimony: "🗣️",
  forensic: "🔬",
  digital: "💻",
  financial: "💰",
  communication: "📞",
  physical: "🔍",
};

const connectionTypeColor: Record<ConnectionType, string> = {
  financial: "text-emerald-400",
  communication: "text-blue-400",
  physical: "text-amber-400",
  familial: "text-pink-400",
  professional: "text-purple-400",
  suspicious: "text-red-400",
  alibi: "text-cyan-400",
  motive: "text-orange-400",
};

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default async function BoardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const caseData = await getCaseBySlug(slug);
  if (!caseData) notFound();

  const [entitiesData, evidenceData, connectionsData] = await Promise.all([
    getEntitiesByCaseId(caseData.dbId),
    getEvidenceByCaseId(caseData.dbId),
    getEvidenceLinksByCaseId(caseData.dbId),
  ]);

  // Find the victim (central entity)
  const centralEntity = entitiesData.find((e) => e.type === "victim")!;
  const surroundingEntities = entitiesData.filter((e) => e.id !== centralEntity.id);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ─── Main Board Area ────────────────────────────────── */}
      <div className="flex-1 overflow-auto dot-grid p-6">
        {/* Case header bar */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight" id="board-title">
                {caseData.title}
              </h1>
              <span className="evidence-badge border border-accent/20 bg-accent/5 text-accent text-xs">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                {caseData.status.toUpperCase()}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted italic">{caseData.subtitle}</p>
          </div>
          <div className="hidden sm:flex gap-2">
            <div className="glass-card px-3 py-1.5 text-xs text-muted">
              {entitiesData.length} Entities
            </div>
            <div className="glass-card px-3 py-1.5 text-xs text-muted">
              {evidenceData.length} Evidence
            </div>
            <div className="glass-card px-3 py-1.5 text-xs text-muted">
              {connectionsData.length} Connections
            </div>
          </div>
        </div>

        {/* ─── Board Layout (CSS Grid) ───────────────────────── */}
        <div className="relative mx-auto max-w-5xl">
          {/* Connection lines (visual decoration) */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ zIndex: 0 }}
          >
            <line x1="50%" y1="35%" x2="15%" y2="10%" stroke="rgba(99,102,241,0.15)" strokeWidth="1" strokeDasharray="6 4" />
            <line x1="50%" y1="35%" x2="85%" y2="10%" stroke="rgba(99,102,241,0.15)" strokeWidth="1" strokeDasharray="6 4" />
            <line x1="50%" y1="35%" x2="8%" y2="70%" stroke="rgba(99,102,241,0.15)" strokeWidth="1" strokeDasharray="6 4" />
            <line x1="50%" y1="35%" x2="92%" y2="70%" stroke="rgba(99,102,241,0.15)" strokeWidth="1" strokeDasharray="6 4" />
            <line x1="15%" y1="10%" x2="85%" y2="10%" stroke="rgba(239,68,68,0.08)" strokeWidth="1" strokeDasharray="4 6" />
            <line x1="85%" y1="10%" x2="92%" y2="70%" stroke="rgba(16,185,129,0.08)" strokeWidth="1" strokeDasharray="4 6" />
            <line x1="8%" y1="70%" x2="15%" y2="10%" stroke="rgba(139,92,246,0.08)" strokeWidth="1" strokeDasharray="4 6" />
          </svg>

          <div className="relative" style={{ zIndex: 1 }}>
            {/* Top row: surrounding entities */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
              {surroundingEntities.map((entity) => (
                <div
                  key={entity.id}
                  id={`entity-${entity.id}`}
                  className={`entity-card p-4 cursor-default ${entityTypeColor[entity.type]}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${entityTypeDot[entity.type]}`} />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {entityTypeLabel[entity.type]}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold leading-tight">{entity.name}</h3>
                  {entity.occupation && (
                    <p className="mt-1 text-xs text-muted">{entity.occupation}</p>
                  )}
                  <p className="mt-2 text-xs leading-relaxed text-muted/70 line-clamp-2">
                    {entity.description}
                  </p>
                  <div className="mt-3 text-[10px] text-muted/50">
                    {entity.status}
                  </div>
                </div>
              ))}
            </div>

            {/* Center: victim / primary entity */}
            <div className="mx-auto max-w-lg mb-6">
              <div
                id={`entity-${centralEntity.id}`}
                className="entity-card entity-card-primary pulse-glow p-6"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className={`h-3 w-3 rounded-full ${entityTypeDot[centralEntity.type]}`} />
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                    {entityTypeLabel[centralEntity.type]} — Central Figure
                  </span>
                </div>
                <h3 className="text-xl font-bold">{centralEntity.name}</h3>
                {centralEntity.occupation && (
                  <p className="text-sm text-muted">{centralEntity.occupation}</p>
                )}
                <p className="mt-3 text-sm leading-relaxed text-muted/80">
                  {centralEntity.description}
                </p>
                <div className="mt-4 flex gap-4 text-xs text-muted/60">
                  {centralEntity.age && <span>Age: {centralEntity.age}</span>}
                  <span>{centralEntity.lastKnownLocation}</span>
                  <span>{centralEntity.status}</span>
                </div>
              </div>
            </div>

            {/* Evidence strip */}
            <div className="mb-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted/60">
                Evidence Items
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {evidenceData.map((ev) => (
                  <div
                    key={ev.id}
                    id={`evidence-${ev.id}`}
                    className="entity-card p-3 cursor-default"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{evidenceTypeIcon[ev.type]}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                        {ev.type}
                      </span>
                      {ev.classified && (
                        <span className="ml-auto text-[9px] font-bold uppercase tracking-widest text-red-400/80">
                          Classified
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-semibold leading-tight">
                      {ev.title}
                    </h4>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted/60 line-clamp-2">
                      {ev.description}
                    </p>
                    <div className="mt-2">
                      <div className="credibility-bar">
                        <div
                          className="credibility-fill"
                          style={{ width: `${(ev.credibility / 5) * 100}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[9px] text-muted/40">
                        <span>Credibility</span>
                        <span>{ev.credibility}/5</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Inspector Panel (Right Side) ───────────────────── */}
      <aside className="inspector-panel hidden w-80 flex-shrink-0 overflow-y-auto p-5 lg:block" id="inspector-panel">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted/60">
          Connections Map
        </h2>

        <div className="space-y-3">
          {connectionsData.map((conn) => {
            const source = entitiesData.find((e) => e.id === conn.sourceEntityId);
            const target = entitiesData.find((e) => e.id === conn.targetEntityId);
            if (!source || !target) return null;

            return (
              <div
                key={conn.id}
                id={`connection-${conn.id}`}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest ${connectionTypeColor[conn.type]}`}
                  >
                    {conn.type}
                  </span>
                  {conn.verified && (
                    <span className="ml-auto text-[9px] font-medium text-emerald-400/80">
                      ✓ Verified
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-foreground/90 truncate">
                    {source.name}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="flex-shrink-0 text-muted/40"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                  <span className="font-medium text-foreground/90 truncate">
                    {target.name}
                  </span>
                </div>

                <p className="mt-1.5 text-[11px] text-muted/60 leading-relaxed">
                  {conn.label}
                </p>

                <div className="mt-2">
                  <div className="credibility-bar">
                    <div
                      className="credibility-fill"
                      style={{ width: `${(conn.strength / 5) * 100}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[9px] text-muted/40">
                    <span>Strength</span>
                    <span>{conn.strength}/5</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted/50">
            Entity Legend
          </h3>
          <div className="space-y-2">
            {(Object.entries(entityTypeLabel) as [EntityType, string][]).map(
              ([type, label]) => (
                <div key={type} className="flex items-center gap-2 text-xs text-muted">
                  <span className={`h-2.5 w-2.5 rounded-full ${entityTypeDot[type]}`} />
                  {label}
                </div>
              )
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
