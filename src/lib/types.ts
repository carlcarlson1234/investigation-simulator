// Core domain types for Investigation Simulator

export type CaseStatus = "active" | "cold" | "solved" | "classified";
export type EntityType = "suspect" | "witness" | "victim" | "person_of_interest" | "organization";
export type EvidenceType = "document" | "photo" | "testimony" | "forensic" | "digital" | "financial" | "communication" | "physical";
export type ConnectionType = "financial" | "communication" | "physical" | "familial" | "professional" | "suspicious" | "alibi" | "motive";
export type InvestigatorRank = "rookie" | "detective" | "senior_detective" | "inspector" | "chief_inspector";

export interface Case {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  status: CaseStatus;
  difficulty: number; // 1-5
  dateOpened: string;
  location: string;
  imageUrl?: string;
  entityCount: number;
  evidenceCount: number;
  connectionCount: number;
}

export interface Entity {
  id: string;
  caseId: string;
  name: string;
  type: EntityType;
  description: string;
  imageUrl?: string;
  age?: number;
  occupation?: string;
  lastKnownLocation?: string;
  status: string;
}

export interface Evidence {
  id: string;
  caseId: string;
  title: string;
  type: EvidenceType;
  description: string;
  dateCollected: string;
  location: string;
  linkedEntityIds: string[];
  credibility: number; // 1-5
  classified: boolean;
}

export interface Connection {
  id: string;
  caseId: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: ConnectionType;
  label: string;
  strength: number; // 1-5
  verified: boolean;
}

export interface Investigator {
  id: string;
  name: string;
  rank: InvestigatorRank;
  avatar?: string;
  casesSolved: number;
  accuracy: number; // 0-100
  streak: number;
  score: number;
  joinedDate: string;
}
