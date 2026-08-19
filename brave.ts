import { getFreshness, parseRelativeAge } from "../freshness";
import { scoreJob } from "../scoring";
import { cleanText, detectSource, normalizeJobDetailUrl, stableId } from "../source-utils";
import type { JobOpportunity, SearchPreferences } from "../types";

interface BraveResult {
  title: string;
  url: string;
  description?: string;
  age?: string;
}

interface BraveResponse {
  web?: { results?: BraveResult[] };
}

export interface BraveSearchResult {
  jobs: JobOpportunity[];
  queryCount: number;
}

interface GeographyEstimate {
  location: string;
  remote: boolean;
}

const CANDIDATE_LIMIT = 45;
const BLOCKED_FILE = /\.(pdf|docx?|xlsx?|pptx?|zip|jpg|jpeg|png|gif)(\?|$)/i;
const BLOCKED_HOSTS = ["youtube.com", "facebook.com", "instagram.com", "tiktok.com", "wikipedia.org"];
const REMOTE_FOR_CR = /\b(remote|remoto|worldwide|anywhere|latam|latin america|americas|central america)\b/i;
const COSTA_RICA = /\b(costa rica|san jos[eé]|heredia|alajuela|cartago|escaz[uú]|santa ana|lim[oó]n|guanacaste|puntarenas)\b/i;
const FOREIGN_LOCATION = /\b(colombia|bogot[aá]|medell[ií]n|cali|venezuela|caracas|m[eé]xico|argentina|chile|per[uú]|ecuador|panam[aá])\b/i;

// Algunas consultas se concentran en portales conocidos y otras recorren la
// web abierta. La IA recibe los candidatos y decide cuáles sí son vacantes.
const QUERIES = [
  '(site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:smartrecruiters.com OR site:ashbyhq.com) ("Costa Rica" OR LATAM OR remote) ("human resources" OR recruiter OR "talent acquisition" OR "people operations")',
  '(site:linkedin.com/jobs OR site:indeed.com OR site:computrabajo.co.cr OR site:elempleo.com) "Costa Rica" ("recursos humanos" OR reclutamiento OR "talento humano" OR generalista OR psicología)',
  '(site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:linkedin.com/jobs OR site:workable.com) ("Costa Rica" OR LATAM OR remote) ("project coordinator" OR "program coordinator" OR "operations coordinator" OR "project assistant")',
  '("Costa Rica" OR "Remote LATAM") ("recursos humanos" OR reclutamiento OR "talent acquisition" OR "people operations") (empleo OR vacante OR hiring OR careers)',
  '("Costa Rica" OR "Remote LATAM") ("coordinador de proyecto" OR "coordinador de programa" OR "asistente de proyecto" OR "operations assistant") (empleo OR vacante OR hiring)',
  '("Costa Rica" OR "Remote LATAM") (psicólogo OR psicóloga OR psicosocial OR bienestar OR "programas sociales" OR "impacto social") (empleo OR vacante OR puesto OR hiring)',
  '("Costa Rica" OR LATAM OR remote) (ONG OR nonprofit OR fundación OR foundation OR development) (coordinator OR coordinador OR assistant OR asistente OR specialist)',
  '("Costa Rica" OR "Remote LATAM") ("asistente administrativo" OR "administrative assistant" OR "coordinador administrativo" OR "employee experience") (empleo OR job OR vacancy)',
];

export async function searchBrave(apiKey: string, preferences: SearchPreferences, offset = 0): Promise<BraveSearchResult> {
  const groups: BraveResponse[] = [];
  let lastError: Error | null = null;
  const freshness = freshnessRange(60);
  const queries = buildQueries(preferences.targetRoles);

  // Brave no ofrece CR como mercado de resultados. Indicamos la ubicación en
  // los encabezados y en las propias consultas.
  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        q: query,
        count: "20",
        offset: String(Math.min(9, Math.max(0, offset))),
        freshness,
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
  const largestGroup = Math.max(0, ...groups.map((payload) => payload.web?.results?.length ?? 0));

  // Intercalar consultas evita que los primeros 45 candidatos provengan de
  // una sola fuente o área profesional.
  for (let resultIndex = 0; resultIndex < largestGroup && unique.size < CANDIDATE_LIMIT; resultIndex += 1) {
    for (const payload of groups) {
      const result = payload.web?.results?.[resultIndex];
      if (!result || !isHttpCandidate(result.url)) continue;

      const canonicalUrl = normalizeJobDetailUrl(result.url);
      if (!canonicalUrl) continue;
      if (unique.has(canonicalUrl)) continue;

      const description = cleanText(result.description ?? "");
      const cleanTitle = cleanText(result.title.replace(/\s*[|–-]\s*[^|–-]+$/, ""));
      if (cleanTitle.length < 6) continue;

      const geography = estimateGeography(canonicalUrl, `${result.title} ${description}`);
      const postedAt = parseRelativeAge(result.age);
      const freshnessResult = getFreshness(postedAt);
      if (freshnessResult.freshness === "stale") continue;

      const source = detectSource(canonicalUrl);
      const preliminaryMatch = scoreJob({
        title: cleanTitle,
        description: description.slice(0, 1_800),
        location: geography.location,
        targetRoles: preferences.targetRoles,
        profileSkills: preferences.skills,
      });

      unique.set(canonicalUrl, {
        id: stableId(source, canonicalUrl),
        source,
        title: cleanTitle,
        company: extractCompany(result.title, source),
        location: geography.location,
        url: canonicalUrl,
        description,
        postedAt,
        ...freshnessResult,
        ...preliminaryMatch,
        remote: geography.remote,
        decision: "new",
      });
    }
  }

  return { jobs: [...unique.values()], queryCount: queries.length };
}

function extractCompany(title: string, fallback: string): string {
  const parts = title.split(/\s+[|–-]\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.at(-1) ?? fallback : fallback;
}

function buildQueries(targetRoles: string[]): string[] {
  const customTerms = targetRoles
    .map((role) => role.replace(/[^\p{L}\p{N}\s&-]/gu, "").trim())
    .filter((role) => role.length >= 4)
    .slice(0, 7)
    .map((role) => `"${role}"`);

  if (customTerms.length === 0) return QUERIES;
  return [
    ...QUERIES,
    `("Costa Rica" OR "Remote LATAM" OR remoto) (${customTerms.join(" OR ")}) (empleo OR vacante OR job OR hiring OR careers)`,
  ];
}

function isHttpCandidate(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!/^https?:$/.test(url.protocol) || BLOCKED_FILE.test(url.pathname)) return false;
    return !BLOCKED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function freshnessRange(days: number): string {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return `${formatDate(start)}to${formatDate(end)}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function estimateGeography(url: string, text: string): GeographyEstimate {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const costaRica = COSTA_RICA.test(text) || host.endsWith(".cr") || host.startsWith("cr.");
    const remote = REMOTE_FOR_CR.test(text);
    if (costaRica) return { location: "Costa Rica", remote };
    if (remote) return { location: "Remoto / LATAM por confirmar", remote: true };
    if (FOREIGN_LOCATION.test(text)) return { location: "Otra ubicación por revisar", remote: false };
    return { location: "Ubicación por confirmar", remote: false };
  } catch {
    return { location: "Ubicación por confirmar", remote: false };
  }
}
