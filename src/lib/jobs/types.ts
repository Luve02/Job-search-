export type Freshness = "fresh" | "older" | "unknown" | "stale";
export type JobDecision = "new" | "accepted" | "saved" | "rejected";

export interface JobOpportunity {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  postedAt: string | null;
  freshness: Freshness;
  daysOld: number | null;
  score: number;
  reasons: string[];
  remote: boolean;
  decision: JobDecision;
}

export interface DiscoveryResponse {
  jobs: JobOpportunity[];
  searchedAt: string;
  sources: string[];
  notices: string[];
}
