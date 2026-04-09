export type LeadType = "focused-investigation" | "evidence-pack";

export interface LeadDefinition {
  id: string;
  type: LeadType;
  title: string;
  description: string;
}
