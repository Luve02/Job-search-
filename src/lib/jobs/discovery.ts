import { searchBrave } from "./sources/brave";
import { searchRemotive } from "./sources/remotive";
import { validateBraveJobsWithLlm } from "./llm-validator";
import { canonicalJobUrl } from "./source-utils";
import { DEFAULT_SEARCH_PREFERENCES, type DiscoveryResponse, type JobOpportunity, type SearchPreferences } from "./types";

export async function discoverJobs(preferences: SearchPreferences = DEFAULT_SEARCH_PREFERENCES, searchPage = 0): Promise<DiscoveryResponse> {
  const sources: string[] = [];
  const notices: string[] = [];
  const jobs: JobOpportunity[] = [];
  let queryCount = 0;

  const tasks: Promise<void>[] = [];

  if (preferences.enabledSources.remotive) {
    tasks.push(searchRemotive(preferences)
      .then((results) => {
        jobs.push(...results);
        sources.push("Remotive");
      })
      .catch(() => {
        notices.push("Remotive no respondió esta vez; puedes volver a intentar.");
      }));
  }

  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;
  if (braveKey && openAIKey && preferences.enabledSources.brave) {
    tasks.push(
      searchBrave(braveKey, preferences, searchPage)
        .then(async (result) => {
          queryCount = result.queryCount;
          const validation = await validateBraveJobsWithLlm(openAIKey, result.jobs, preferences);
          jobs.push(...validation.jobs);
          sources.push("Brave + IA");
          if (validation.reviewedCount > 0 && validation.jobs.length === 0) {
            notices.push(`La IA revisó ${validation.reviewedCount} candidatos, pero ninguno tuvo evidencia suficiente para recomendarlo.`);
          }
        })
        .catch(() => {
          notices.push("La búsqueda web o la validación con IA no respondió esta vez.");
        }),
    );
  } else if (preferences.enabledSources.brave && braveKey && !openAIKey) {
    notices.push("Agrega OPENAI_API_KEY para que la IA valide los candidatos encontrados por Brave.");
  } else if (preferences.enabledSources.brave) {
    notices.push("Agrega BRAVE_SEARCH_API_KEY para incluir Workday, Computrabajo, LinkedIn, Indeed, Greenhouse, Lever y más resultados web.");
  }

  await Promise.all(tasks);

  const uniqueJobs = [...new Map(jobs.map((job) => [canonicalJobUrl(job.url), job])).values()]
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
    queryCount,
    searchPage,
  };
}
