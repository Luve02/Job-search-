import { searchBrave } from "./sources/brave";
import { searchRemotive } from "./sources/remotive";
import type { DiscoveryResponse, JobOpportunity } from "./types";

export async function discoverJobs(): Promise<DiscoveryResponse> {
  const sources: string[] = [];
  const notices: string[] = [];
  const jobs: JobOpportunity[] = [];

  const tasks: Promise<void>[] = [
    searchRemotive()
      .then((results) => {
        jobs.push(...results);
        sources.push("Remotive");
      })
      .catch(() => {
        notices.push("Remotive no respondió esta vez; puedes volver a intentar.");
      }),
  ];

  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    tasks.push(
      searchBrave(braveKey)
        .then((results) => {
          jobs.push(...results);
          sources.push("Búsqueda web");
        })
        .catch(() => {
          notices.push("La búsqueda web amplia no respondió esta vez.");
        }),
    );
  } else {
    notices.push("Agrega BRAVE_SEARCH_API_KEY para incluir Workday, Computrabajo, LinkedIn, Indeed, Greenhouse, Lever y más resultados web.");
  }

  await Promise.all(tasks);

  const uniqueJobs = [...new Map(jobs.map((job) => [job.url, job])).values()]
    .sort((a, b) => {
      const freshnessRank = { fresh: 0, unknown: 1, older: 2, stale: 3 };
      return freshnessRank[a.freshness] - freshnessRank[b.freshness] || b.score - a.score;
    })
    .slice(0, 80);

  return {
    jobs: uniqueJobs,
    searchedAt: new Date().toISOString(),
    sources,
    notices,
  };
}
