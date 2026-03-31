import { db } from "@/db";
import { eq, desc } from "drizzle-orm";
import {
  cases,
  entities,
  evidenceItems,
  evidenceLinks,
  leaderboardEntries,
  users,
} from "@/db/schema";
import type {
  Case,
  Entity,
  Evidence,
  Connection,
  Investigator,
} from "./types";

// ─── Cases ──────────────────────────────────────────────────────────────────

export async function getCases(): Promise<Case[]> {
  const rows = await db.select().from(cases);

  // For each case, count related entries
  const result: Case[] = [];
  for (const row of rows) {
    const [entityRows, evidenceRows, linkRows] = await Promise.all([
      db.select({ id: entities.id }).from(entities).where(eq(entities.caseId, row.id)),
      db.select({ id: evidenceItems.id }).from(evidenceItems).where(eq(evidenceItems.caseId, row.id)),
      db.select({ id: evidenceLinks.id }).from(evidenceLinks).where(eq(evidenceLinks.caseId, row.id)),
    ]);

    result.push({
      id: row.slug,
      title: row.title,
      subtitle: row.subtitle ?? "",
      description: row.description ?? "",
      status: row.status as Case["status"],
      difficulty: row.difficulty,
      dateOpened: row.dateOpened.toISOString().split("T")[0],
      location: row.location ?? "",
      imageUrl: row.imageUrl ?? undefined,
      entityCount: entityRows.length,
      evidenceCount: evidenceRows.length,
      connectionCount: linkRows.length,
    });
  }

  return result;
}

export async function getCaseBySlug(slug: string) {
  const [row] = await db.select().from(cases).where(eq(cases.slug, slug)).limit(1);
  if (!row) return null;

  return {
    dbId: row.id, // Internal UUID for FK queries
    id: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? "",
    description: row.description ?? "",
    status: row.status as Case["status"],
    difficulty: row.difficulty,
    dateOpened: row.dateOpened.toISOString().split("T")[0],
    location: row.location ?? "",
    imageUrl: row.imageUrl ?? undefined,
  };
}

// ─── Entities ───────────────────────────────────────────────────────────────

export async function getEntitiesByCaseId(caseDbId: string): Promise<Entity[]> {
  const rows = await db
    .select()
    .from(entities)
    .where(eq(entities.caseId, caseDbId));

  return rows.map((row) => ({
    id: row.id,
    caseId: row.caseId,
    name: row.name,
    type: row.type as Entity["type"],
    description: row.description ?? "",
    imageUrl: row.imageUrl ?? undefined,
    age: row.age ?? undefined,
    occupation: row.occupation ?? undefined,
    lastKnownLocation: row.lastKnownLocation ?? undefined,
    status: row.status ?? "",
  }));
}

// ─── Evidence ───────────────────────────────────────────────────────────────

export async function getEvidenceByCaseId(caseDbId: string): Promise<Evidence[]> {
  const rows = await db
    .select()
    .from(evidenceItems)
    .where(eq(evidenceItems.caseId, caseDbId));

  return rows.map((row) => ({
    id: row.id,
    caseId: row.caseId,
    title: row.title,
    type: row.type as Evidence["type"],
    description: row.description ?? "",
    dateCollected: row.dateCollected?.toISOString().split("T")[0] ?? "",
    location: row.location ?? "",
    linkedEntityIds: [], // evidence_links handle relationships now
    credibility: row.credibility,
    classified: row.classified,
  }));
}

// ─── Evidence Links (connections) ───────────────────────────────────────────

export async function getEvidenceLinksByCaseId(caseDbId: string): Promise<Connection[]> {
  const rows = await db
    .select()
    .from(evidenceLinks)
    .where(eq(evidenceLinks.caseId, caseDbId));

  return rows.map((row) => ({
    id: row.id,
    caseId: row.caseId,
    sourceEntityId: row.sourceEntityId,
    targetEntityId: row.targetEntityId,
    type: row.type as Connection["type"],
    label: row.label ?? "",
    strength: row.strength,
    verified: row.verified,
  }));
}

// ─── Leaderboard ────────────────────────────────────────────────────────────

export async function getLeaderboard(): Promise<Investigator[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      rank: users.rank,
      avatarUrl: users.avatarUrl,
      casesSolved: leaderboardEntries.casesSolved,
      accuracy: leaderboardEntries.accuracy,
      streak: leaderboardEntries.streak,
      score: leaderboardEntries.score,
      joinedDate: users.createdAt,
    })
    .from(leaderboardEntries)
    .innerJoin(users, eq(leaderboardEntries.userId, users.id))
    .orderBy(desc(leaderboardEntries.score));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    rank: row.rank as Investigator["rank"],
    avatar: row.avatarUrl ?? undefined,
    casesSolved: row.casesSolved,
    accuracy: row.accuracy,
    streak: row.streak,
    score: row.score,
    joinedDate: row.joinedDate.toISOString().split("T")[0],
  }));
}

// ─── Stats (for homepage) ───────────────────────────────────────────────────

export async function getHomeStats() {
  const [caseRows, entityRows, evidenceRows, linkRows, userRows] =
    await Promise.all([
      db.select({ id: cases.id }).from(cases),
      db.select({ id: entities.id }).from(entities),
      db.select({ id: evidenceItems.id }).from(evidenceItems),
      db.select({ id: evidenceLinks.id }).from(evidenceLinks),
      db.select({ id: leaderboardEntries.id }).from(leaderboardEntries),
    ]);

  return {
    activeCases: caseRows.length,
    evidenceItems: evidenceRows.length,
    connections: linkRows.length,
    investigators: userRows.length,
  };
}
