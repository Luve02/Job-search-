import { getFreshness, parseRelativeAge } from "../freshness";
import { scoreJob } from "../scoring";
import { cleanText, detectSource, stableId } from "../source-utils";
import type { JobOpportunity } from "../types";

interface BraveResult {
  title: string;
  url: string;
  description?: string;
  age?: string;
}

interface BraveResponse {
  web?: { results?: BraveResult[] };
}

const QUERIES = [
  '(site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co) ("Costa Rica" OR LATAM) ("human resources" OR recruiter OR "project coordinator")',
  '(site:computrabajo.co.cr OR site:elempleo.com OR site:linkedin.com/jobs OR site:indeed.com) "Costa Rica" (recursos humanos OR coordinador OR proyectos)',
  '("Costa Rica" OR remoto OR LATAM) (psicología OR psicosocial OR "program coordinator" OR "social impact") (empleo OR careers OR jobs)',
];

export async function searchBrave(apiKey: string): Promise<JobOpportunity[]> {
  const groups: BraveResponse[] = [];
  let lastError: Error | null = null;

  // Brave no ofrece CR como mercado de resultados en el parámetro `country`.
  // Enviamos Costa Rica como ubicación y la incluimos explícitamente en cada
  // consulta para recibir puestos locales y remotos aptos para LATAM.
  for (const query of QUERIES) {
    try {
      const params = new URLSearchParams({
        q: query,
        count: "20",
        freshness: "pm",
      });
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
          "X-Loc-Country": "CR",
          "X-Loc-Timezone": "America/Costa_Rica",
        },
        signal: AbortSignal.timeout(9_000),
      });
      if (!response.ok) throw new Error(`Brave Search respondió ${response.status}`);
      groups.push((await response.json()) as BraveResponse);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Brave Search no respondió");
    }
  }

  if (groups.length === 0) {
    throw lastError ?? new Error("Brave Search no devolvió resultados");
  }

  const unique = new Map<string, JobOpportunity>();
  for (const payload of groups) {
    for (const result of payload.web?.results ?? []) {
      const description = cleanText(result.description ?? "");
      const postedAt = parseRelativeAge(result.age);
      const freshness = getFreshness(postedAt);
      const source = detectSource(result.url);
      const match = scoreJob({
        title: result.title,
        description: description.slice(0, 1_800),
        location: "Costa Rica / LATAM",
      });
      unique.set(result.url, {
        id: stableId(source, result.url),
        source,
        title: cleanText(result.title.replace(/\s*[|–-]\s*[^|–-]+$/, "")),
        company: extractCompany(result.title, source),
        location: "Costa Rica / por confirmar",
        url: result.url,
        description,
        postedAt,
        ...freshness,
        ...match,
        remote: /remote|remoto/i.test(`${result.title} ${description}`),
        decision: "new",
      });
    }
  }
  return [...unique.values()].filter((job) => job.freshness !== "stale");
}

function extractCompany(title: string, fallback: string): string {
  const parts = title.split(/\s+[|–-]\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.at(-1) ?? fallback : fallback;
}
