import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Users ──────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).unique(),
  avatarUrl: text("avatar_url"),
  rank: varchar("rank", { length: 32 }).notNull().default("rookie"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Cases ──────────────────────────────────────────────────────────────────

export const cases = pgTable("cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  difficulty: integer("difficulty").notNull().default(1),
  dateOpened: timestamp("date_opened", { withTimezone: true }).notNull().defaultNow(),
  location: text("location"),
  imageUrl: text("image_url"),
});

// ─── Entities ───────────────────────────────────────────────────────────────

export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  description: text("description"),
  age: integer("age"),
  occupation: text("occupation"),
  lastKnownLocation: text("last_known_location"),
  status: varchar("status", { length: 64 }),
  imageUrl: text("image_url"),
});

// ─── Evidence Items ─────────────────────────────────────────────────────────

export const evidenceItems = pgTable("evidence_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  description: text("description"),
  dateCollected: timestamp("date_collected", { withTimezone: true }),
  location: text("location"),
  credibility: integer("credibility").notNull().default(3),
  classified: boolean("classified").notNull().default(false),
});

// ─── Evidence Links (board edges) ───────────────────────────────────────────

export const evidenceLinks = pgTable("evidence_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  sourceEntityId: uuid("source_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  targetEntityId: uuid("target_entity_id").notNull().references(() => entities.id, { onDelete: "cascade" }),
  evidenceItemId: uuid("evidence_item_id").references(() => evidenceItems.id, { onDelete: "set null" }),
  type: varchar("type", { length: 32 }).notNull(),
  label: text("label"),
  strength: integer("strength").notNull().default(3),
  verified: boolean("verified").notNull().default(false),
});

// ─── Claims ─────────────────────────────────────────────────────────────────

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Claim ↔ Evidence (join table) ──────────────────────────────────────────

export const claimEvidence = pgTable("claim_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  evidenceItemId: uuid("evidence_item_id").notNull().references(() => evidenceItems.id, { onDelete: "cascade" }),
});

// ─── Claim Votes ────────────────────────────────────────────────────────────

export const claimVotes = pgTable("claim_votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  vote: varchar("vote", { length: 8 }).notNull(), // "up" | "down"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Claim Comments ─────────────────────────────────────────────────────────

export const claimComments = pgTable("claim_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id").notNull().references(() => claims.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Leaderboard Entries ────────────────────────────────────────────────────

export const leaderboardEntries = pgTable("leaderboard_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  casesSolved: integer("cases_solved").notNull().default(0),
  accuracy: integer("accuracy").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  score: integer("score").notNull().default(0),
});
