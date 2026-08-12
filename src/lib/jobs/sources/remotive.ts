import { getFreshness } from "../freshness";
import { isTargetTitle, scoreJob } from "../scoring";
import { cleanText, stableId } from "../source-utils";
import type { JobOpportunity } from "../types";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  description: string;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

const COMPATIBLE_LOCATIONS = /worldwide|anywhere|latin america|latam|americas|costa rica|central america/i;
const EXCLUDED_LOCATIONS = /united states only|us only|usa only|canada only|europe only|uk only|eu only/i;

export async function searchRemotive(): Promise<JobOpportunity[]> {
  const response = await fetch("https://remotive.com/api/remote-jobs?limit=100", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(9_000),
    next: { revalidate: 21_600 },
  });
  if (!response.ok) throw new Error(`Remotive respondió ${response.status}`);

  const payload = (await response.json()) as RemotiveResponse;
  return (payload.jobs ?? [])
    .filter((job) => {
      const location = job.candidate_required_location || "";
      return COMPATIBLE_LOCATIONS.test(location)
        && !EXCLUDED_LOCATIONS.test(location)
        && isTargetTitle(job.title);
    })
    .map((job) => {
      const description = cleanText(job.description);
      const freshness = getFreshness(job.publication_date);
      const match = scoreJob({
        title: job.title,
        description: description.slice(0, 1_800),
        location: job.candidate_required_location,
      });
      return {
        id: stableId("remotive", String(job.id)),
        source: "Remotive",
        title: cleanText(job.title),
        company: cleanText(job.company_name),
        location: cleanText(job.candidate_required_location || "Remoto"),
        url: job.url,
        description,
        postedAt: job.publication_date,
        ...freshness,
        ...match,
        remote: true,
        decision: "new" as const,
      };
    })
    .filter((job) => job.freshness !== "stale" && job.score >= 55);
}
