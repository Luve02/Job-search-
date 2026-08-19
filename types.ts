export type Freshness = "fresh" | "older" | "unknown" | "stale";
export type JobDecision = "new" | "accepted" | "saved" | "rejected";

export interface SearchPreferences {
  targetRoles: string[];
  skills: string[];
  minimumScore: number;
  enabledSources: {
    brave: boolean;
    remotive: boolean;
  };
}

export const DEFAULT_SEARCH_PREFERENCES: SearchPreferences = {
  targetRoles: [
    "Recursos Humanos",
    "Reclutamiento",
    "People Operations",
    "Coordinación de proyectos",
    "Psicología y programas psicosociales",
  ],
  skills: ["Planificación", "Seguimiento", "Logística", "Excel", "Microsoft Office", "Python"],
  minimumScore: 60,
  enabledSources: { brave: true, remotive: true },
};

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
  queryCount: number;
  searchPage: number;
}
