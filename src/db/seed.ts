import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import {
  users,
  cases,
  entities,
  evidenceItems,
  evidenceLinks,
  leaderboardEntries,
  claims,
  claimEvidence,
} from "./schema";

// ─── Connect ────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

// ─── Seed ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 Seeding database...\n");

  // Clear tables in reverse dependency order
  await db.execute(sql`TRUNCATE claim_evidence, claim_votes, claim_comments, claims, evidence_links, evidence_items, entities, leaderboard_entries, cases, users CASCADE`);
  console.log("  ✓ Cleared existing data");

  // ── Users (for leaderboard + demo claims) ──────────────────────────────

  const insertedUsers = await db
    .insert(users)
    .values([
      { name: "Alexandra Frost", email: "frost@example.com", rank: "chief_inspector" },
      { name: "Marcus Liu", email: "liu@example.com", rank: "inspector" },
      { name: "Diana Okafor", email: "okafor@example.com", rank: "inspector" },
      { name: "James Thornton", email: "thornton@example.com", rank: "senior_detective" },
      { name: "Yuki Tanaka", email: "tanaka@example.com", rank: "senior_detective" },
      { name: "Rafael Moreno", email: "moreno@example.com", rank: "detective" },
      { name: "Ingrid Bergström", email: "bergstrom@example.com", rank: "detective" },
      { name: "Kwame Asante", email: "asante@example.com", rank: "rookie" },
    ])
    .returning({ id: users.id, name: users.name });
  console.log(`  ✓ Inserted ${insertedUsers.length} users`);

  // ── Case ───────────────────────────────────────────────────────────────

  const [demoCase] = await db
    .insert(cases)
    .values({
      slug: "demo-case",
      title: "The Meridian Protocol",
      subtitle: "A web of corporate espionage runs deeper than anyone imagined",
      description:
        "When a senior data architect at Meridian Systems is found dead in his office, what appears to be a tragic suicide quickly unravels into a labyrinth of corporate espionage, insider trading, and a shadowy network that reaches into the highest echelons of power. Five suspects. Ten pieces of evidence. One truth hidden beneath layers of deception.",
      status: "active",
      difficulty: 4,
      dateOpened: new Date("2026-03-15"),
      location: "Seattle, WA",
    })
    .returning({ id: cases.id });
  console.log(`  ✓ Inserted demo case`);

  const caseId = demoCase.id;

  // ── Entities ───────────────────────────────────────────────────────────

  const insertedEntities = await db
    .insert(entities)
    .values([
      {
        caseId,
        name: "Dr. Marcus Webb",
        type: "victim",
        description:
          "Senior data architect at Meridian Systems. Found dead in his locked office on March 14th. Known for his meticulous work habits and a growing unease in the weeks before his death.",
        age: 47,
        occupation: "Senior Data Architect",
        lastKnownLocation: "Meridian Systems HQ, Floor 34",
        status: "Deceased",
      },
      {
        caseId,
        name: "Elena Vasquez",
        type: "suspect",
        description:
          "Chief Technology Officer at Meridian Systems. Promoted over Webb six months ago despite his seniority. Multiple witnesses report heated arguments between them. Her access keycard shows she was in the building until 11:47 PM on the night in question.",
        age: 39,
        occupation: "CTO, Meridian Systems",
        lastKnownLocation: "Meridian Systems HQ",
        status: "Under investigation",
      },
      {
        caseId,
        name: "James Harlow",
        type: "person_of_interest",
        description:
          "Private security consultant with ties to multiple corporate intelligence firms. Surveillance footage places him at a restaurant with Webb three days before the death. No prior known connection between the two.",
        age: 52,
        occupation: "Private Security Consultant",
        lastKnownLocation: "Unknown",
        status: "Whereabouts unknown",
      },
      {
        caseId,
        name: "Sarah Chen",
        type: "witness",
        description:
          "Junior developer at Meridian Systems and the last person to see Webb alive. Claims she left his office at 8 PM after discussing a routine code review. Her testimony contains inconsistencies about the timeline.",
        age: 28,
        occupation: "Software Developer",
        lastKnownLocation: "Meridian Systems HQ",
        status: "Cooperating witness",
      },
      {
        caseId,
        name: "Nexus Capital Group",
        type: "organization",
        description:
          'A venture capital firm with significant investment in Meridian Systems. Internal documents suggest they were pressuring the board for access to proprietary datasets codenamed "Protocol-7". Webb was the primary gatekeeper of these datasets.',
        occupation: "Venture Capital Firm",
        lastKnownLocation: "Financial District, Seattle",
        status: "Under regulatory review",
      },
    ])
    .returning({ id: entities.id, name: entities.name });
  console.log(`  ✓ Inserted ${insertedEntities.length} entities`);

  // Build entity lookup by name for FK references
  const entityByName: Record<string, string> = {};
  for (const e of insertedEntities) entityByName[e.name] = e.id;

  const webb = entityByName["Dr. Marcus Webb"];
  const vasquez = entityByName["Elena Vasquez"];
  const harlow = entityByName["James Harlow"];
  const chen = entityByName["Sarah Chen"];
  const nexus = entityByName["Nexus Capital Group"];

  // ── Evidence Items ─────────────────────────────────────────────────────

  const insertedEvidence = await db
    .insert(evidenceItems)
    .values([
      {
        caseId,
        title: "Webb's Encrypted Laptop",
        type: "digital",
        description:
          "Personal laptop found in Webb's home office. Contains multiple layers of encryption. Forensic analysis reveals recently deleted files related to Project Protocol-7.",
        dateCollected: new Date("2026-03-15"),
        location: "Webb Residence",
        credibility: 5,
        classified: false,
      },
      {
        caseId,
        title: "Security Footage — Lobby",
        type: "photo",
        description:
          "Lobby security camera footage showing Elena Vasquez entering the building at 10:15 PM and leaving at 11:47 PM. Notably, she used the freight elevator rather than the main elevator bank.",
        dateCollected: new Date("2026-03-15"),
        location: "Meridian Systems HQ",
        credibility: 5,
        classified: false,
      },
      {
        caseId,
        title: "Burner Phone Records",
        type: "communication",
        description:
          "Records from a prepaid phone found in Webb's desk drawer. Shows 17 calls to an unregistered number in the 72 hours before his death. Cell tower triangulation places the other phone near James Harlow's known residence.",
        dateCollected: new Date("2026-03-16"),
        location: "Meridian Systems HQ, Webb's Office",
        credibility: 4,
        classified: false,
      },
      {
        caseId,
        title: "Autopsy Report",
        type: "forensic",
        description:
          "Official cause of death: asphyxiation. However, toxicology reports reveal traces of a rare sedative compound not consistent with Webb's known medical prescriptions. Bruising patterns on the wrists suggest restraint.",
        dateCollected: new Date("2026-03-16"),
        location: "King County Medical Examiner",
        credibility: 5,
        classified: true,
      },
      {
        caseId,
        title: "Nexus Capital Board Minutes",
        type: "document",
        description:
          'Leaked board meeting minutes from Nexus Capital Group dated February 28th. Discussion item: "Acquisition of Protocol-7 assets — timeline acceleration required." Handwritten margin note reads: "Webb is the obstacle."',
        dateCollected: new Date("2026-03-18"),
        location: "Anonymous source",
        credibility: 3,
        classified: false,
      },
      {
        caseId,
        title: "Chen's Revised Timeline",
        type: "testimony",
        description:
          "During a second interview, Sarah Chen revised her departure time from 8 PM to 9:30 PM. She also mentioned overhearing a phone call where Webb sounded 'desperate' and mentioned 'they won't stop until they get it.'",
        dateCollected: new Date("2026-03-19"),
        location: "Police Station",
        credibility: 3,
        classified: false,
      },
      {
        caseId,
        title: "Wire Transfer Records",
        type: "financial",
        description:
          "Bank records showing three wire transfers totaling $2.3M from a Nexus Capital subsidiary to a shell company in the Cayman Islands. The shell company's registered agent matches a known alias used by James Harlow.",
        dateCollected: new Date("2026-03-20"),
        location: "First National Bank",
        credibility: 4,
        classified: true,
      },
      {
        caseId,
        title: "Vasquez's Personal Email",
        type: "communication",
        description:
          'Emails recovered from Elena Vasquez\'s personal account showing correspondence with an unknown party. Message from March 12: "The architect knows too much. We need to move to Phase 3 before the board meeting."',
        dateCollected: new Date("2026-03-21"),
        location: "Digital forensics lab",
        credibility: 4,
        classified: false,
      },
      {
        caseId,
        title: "Office Lock Analysis",
        type: "physical",
        description:
          "Electronic lock log for Webb's office shows the door was locked from the outside at 10:52 PM using a master keycard. Only three master keycards exist: building management, CEO, and CTO (Vasquez).",
        dateCollected: new Date("2026-03-15"),
        location: "Meridian Systems HQ, Floor 34",
        credibility: 5,
        classified: false,
      },
      {
        caseId,
        title: "Restaurant Surveillance",
        type: "photo",
        description:
          "Surveillance footage from Il Cortile restaurant showing Webb and Harlow at a corner booth on March 11. Webb appears to hand Harlow a USB drive. Harlow places an envelope on the table.",
        dateCollected: new Date("2026-03-22"),
        location: "Il Cortile Restaurant",
        credibility: 4,
        classified: false,
      },
    ])
    .returning({ id: evidenceItems.id, title: evidenceItems.title });
  console.log(`  ✓ Inserted ${insertedEvidence.length} evidence items`);

  // ── Evidence Links (board connections) ──────────────────────────────────

  const insertedLinks = await db
    .insert(evidenceLinks)
    .values([
      { caseId, sourceEntityId: vasquez, targetEntityId: webb, type: "professional", label: "Superior / Subordinate conflict", strength: 4, verified: true },
      { caseId, sourceEntityId: harlow, targetEntityId: webb, type: "suspicious", label: "Secret meeting at Il Cortile", strength: 4, verified: true },
      { caseId, sourceEntityId: nexus, targetEntityId: webb, type: "motive", label: 'Protocol-7 data access — "Webb is the obstacle"', strength: 5, verified: false },
      { caseId, sourceEntityId: nexus, targetEntityId: harlow, type: "financial", label: "$2.3M via shell company", strength: 4, verified: true },
      { caseId, sourceEntityId: chen, targetEntityId: webb, type: "professional", label: "Last person to see victim alive", strength: 3, verified: true },
      { caseId, sourceEntityId: vasquez, targetEntityId: nexus, type: "communication", label: '"Move to Phase 3" email exchange', strength: 4, verified: false },
      { caseId, sourceEntityId: harlow, targetEntityId: webb, type: "communication", label: "17 burner phone calls in 72 hours", strength: 3, verified: true },
      { caseId, sourceEntityId: vasquez, targetEntityId: webb, type: "physical", label: "Master keycard used to lock office at 10:52 PM", strength: 5, verified: true },
    ])
    .returning({ id: evidenceLinks.id });
  console.log(`  ✓ Inserted ${insertedLinks.length} evidence links`);

  // ── Leaderboard Entries ────────────────────────────────────────────────

  const leaderboardData = [
    { name: "Alexandra Frost", casesSolved: 142, accuracy: 97, streak: 23, score: 48750 },
    { name: "Marcus Liu", casesSolved: 98, accuracy: 94, streak: 15, score: 35200 },
    { name: "Diana Okafor", casesSolved: 87, accuracy: 91, streak: 8, score: 31450 },
    { name: "James Thornton", casesSolved: 76, accuracy: 89, streak: 12, score: 27800 },
    { name: "Yuki Tanaka", casesSolved: 64, accuracy: 93, streak: 19, score: 24100 },
    { name: "Rafael Moreno", casesSolved: 51, accuracy: 86, streak: 5, score: 18900 },
    { name: "Ingrid Bergström", casesSolved: 43, accuracy: 88, streak: 7, score: 15600 },
    { name: "Kwame Asante", casesSolved: 12, accuracy: 92, streak: 4, score: 8400 },
  ];

  const userIdByName: Record<string, string> = {};
  for (const u of insertedUsers) userIdByName[u.name] = u.id;

  await db.insert(leaderboardEntries).values(
    leaderboardData.map((ld) => ({
      userId: userIdByName[ld.name],
      casesSolved: ld.casesSolved,
      accuracy: ld.accuracy,
      streak: ld.streak,
      score: ld.score,
    }))
  );
  console.log(`  ✓ Inserted ${leaderboardData.length} leaderboard entries`);

  // ── Demo Claims ────────────────────────────────────────────────────────

  const frostId = userIdByName["Alexandra Frost"];
  const liuId = userIdByName["Marcus Liu"];

  const insertedClaims = await db
    .insert(claims)
    .values([
      {
        caseId,
        userId: frostId,
        title: "Vasquez orchestrated the murder",
        description:
          "The CTO had motive (career conflict), means (master keycard), and opportunity (in the building until 11:47 PM). Her personal emails reveal coordination with an unknown party to 'move to Phase 3.'",
        status: "open",
      },
      {
        caseId,
        userId: liuId,
        title: "Harlow was hired by Nexus Capital",
        description:
          "The $2.3M wire transfer through a shell company, combined with the secret restaurant meeting and 17 burner phone calls, suggests Harlow was a contracted operative funded by Nexus Capital Group.",
        status: "open",
      },
    ])
    .returning({ id: claims.id });
  console.log(`  ✓ Inserted ${insertedClaims.length} demo claims`);

  // Link some evidence to the claims
  const evByTitle: Record<string, string> = {};
  for (const e of insertedEvidence) evByTitle[e.title] = e.id;

  await db.insert(claimEvidence).values([
    { claimId: insertedClaims[0].id, evidenceItemId: evByTitle["Office Lock Analysis"] },
    { claimId: insertedClaims[0].id, evidenceItemId: evByTitle["Vasquez's Personal Email"] },
    { claimId: insertedClaims[0].id, evidenceItemId: evByTitle["Security Footage — Lobby"] },
    { claimId: insertedClaims[1].id, evidenceItemId: evByTitle["Wire Transfer Records"] },
    { claimId: insertedClaims[1].id, evidenceItemId: evByTitle["Restaurant Surveillance"] },
    { claimId: insertedClaims[1].id, evidenceItemId: evByTitle["Burner Phone Records"] },
  ]);
  console.log(`  ✓ Linked evidence to claims`);

  console.log("\n✅ Seed complete!");
  await client.end();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
