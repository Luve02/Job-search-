import { getFreshness, parseRelativeAge } from "../freshness";
import { isTargetTitle, scoreJob } from "../scoring";
import { canonicalJobUrl, cleanText, detectSource, stableId } from "../source-utils";
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

interface GeographyMatch {
  location: string;
  remote: boolean;
}

const GENERIC_TITLE = /^(empleos?|trabajos?|jobs?|vacantes?|careers?|ofertas?\s+de\s+(empleo|trabajo))\b/i;
const GENERIC_LISTING = /\b(remote\s+)?(social\s+impact\s+)?jobs?\b|ofertas?\s+de\s+empleo|encuentra\s+ofertas|actualizadas?\s+diariamente/i;
const EXCLUDED_ROLE = /^community manager\b/i;
const EDITORIAL_TITLE = /\b(foro|noticias?|opiniones?|reporta|anuncia|crecimiento|avanza|art[ií]culo|blog|ranking|gu[ií]a|revista|informe)\b/i;
const EDITORIAL_HOST_TOKEN = /(^|[.-])(foro[a-z0-9-]*|news|noticias[a-z0-9-]*|blog|revista)([.-]|$)/i;
const EDITORIAL_HOSTS = ["medium.com", "reddit.com", "wikipedia.org", "youtube.com"];
const JOB_PATH = /\/(job|jobs|career|careers|vacancy|vacancies|position|positions|empleo|empleos|trabajo|trabajos|oferta|ofertas|vacante|vacantes|requisition|requisitions|req)(\/|-|_|\?|$)/i;
const TRUSTED_JOB_HOSTS = [
  "myworkdayjobs.com", "greenhouse.io", "lever.co", "linkedin.com", "indeed.com",
  "computrabajo.co.cr", "elempleo.com", "smartrecruiters.com", "ashbyhq.com",
  "workable.com", "jobvite.com", "bamboohr.com", "successfactors.com",
  "oraclecloud.com", "icims.com", "jazzhr.com", "personio.com", "recruitee.com",
];
const REMOTE_FOR_CR = /\b(remote|remoto|worldwide|anywhere|latam|latin america|americas|central america)\b/i;
const COSTA_RICA = /\b(costa rica|san jos[eé]|heredia|alajuela|cartago|escaz[uú]|santa ana)\b/i;
const FOREIGN_ONLY = /\b(colombia|bogot[aá]|medell[ií]n|cali|venezuela|caracas|m[eé]xico|argentina|chile|per[uú]|ecuador|panam[aá])\b/i;
const FOREIGN_HOST = /^(co|ve|mx|ar|cl|pe|ec|pa)\./i;
const GLOBAL_JOB_HOST = /(myworkdayjobs\.com|greenhouse\.io|lever\.co|linkedin\.com|indeed\.com|smartrecruiters\.com|ashbyhq\.com|workable\.com)$/i;

const QUERIES = [
  '(site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:smartrecruiters.com) ("Costa Rica" OR LATAM) ("human resources" OR recruiter OR "talent acquisition")',
  '(site:linkedin.com/jobs OR site:indeed.com OR site:computrabajo.co.cr) "Costa Rica" ("recursos humanos" OR reclutamiento OR "talento humano" OR generalista)',
  '(site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:linkedin.com/jobs) ("Costa Rica" OR remoto OR LATAM) ("project coordinator" OR "program coordinator" OR "operations coordinator")',
  '(site:linkedin.com/jobs OR site:indeed.com OR site:computrabajo.co.cr OR site:elempleo.com) "Costa Rica" ("coordinador de proyecto" OR "coordinador de programa" OR "asistente de proyecto")',
  '(site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:smartrecruiters.com OR site:linkedin.com/jobs) ("Costa Rica" OR remoto OR LATAM) (psicólogo OR psicóloga OR "coordinador psicosocial" OR "coordinador de bienestar" OR "coordinador de programas sociales")',
  '(site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:smartrecruiters.com OR site:linkedin.com/jobs) ("Costa Rica" OR LATAM) ("people operations" OR "people & culture" OR "employee experience" OR "HR assistant")',
];

export async function searchBrave(apiKey: string, preferences: SearchPreferences, offset = 0): Promise<JobOpportunity[]> {
  const groups: BraveResponse[] = [];
  let lastError: Error | null = null;
  const possibleFloor = Math.max(40, preferences.minimumScore - 15);
  const freshness = freshnessRange(60);

  // Brave no ofrece CR como mercado de resultados en el parámetro `country`.
  // Enviamos Costa Rica como ubicación y la incluimos explícitamente en cada
  // consulta para recibir puestos locales y remotos aptos para LATAM.
  for (const query of buildQueries(preferences.targetRoles)) {
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
  for (const payload of groups) {
    for (const result of payload.web?.results ?? []) {
      const description = cleanText(result.description ?? "");
      const cleanTitle = cleanText(result.title.replace(/\s*[|–-]\s*[^|–-]+$/, ""));
      const geography = getCompatibleGeography(result.url, `${result.title} ${description}`);

      if (!isSpecificJob(result.url, cleanTitle, preferences.targetRoles) || !geography) continue;

      const postedAt = parseRelativeAge(result.age);
      const freshness = getFreshness(postedAt);
      const canonicalUrl = canonicalJobUrl(result.url);
      const source = detectSource(canonicalUrl);
      const match = scoreJob({
        title: cleanTitle,
        description: description.slice(0, 1_800),
        location: geography.location,
        targetRoles: preferences.targetRoles,
        profileSkills: preferences.skills,
      });

      if (match.score < possibleFloor) continue;

      unique.set(canonicalUrl, {
        id: stableId(source, canonicalUrl),
        source,
        title: cleanTitle,
        company: extractCompany(result.title, source),
        location: geography.location,
        url: canonicalUrl,
        description,
        postedAt,
        ...freshness,
        ...match,
        remote: geography.remote,
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

function isSpecificJob(url: string, title: string, targetRoles: string[]): boolean {
  if (
    title.length < 8
    || GENERIC_TITLE.test(title)
    || GENERIC_LISTING.test(title)
    || EXCLUDED_ROLE.test(title)
    || EDITORIAL_TITLE.test(title)
    || !isTargetTitle(title, targetRoles)
  ) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    const genericPaths = new Set(["", "/job", "/jobs", "/empleo", "/empleos", "/trabajo", "/trabajos", "/vacantes", "/careers", "/search"]);
    if (isEditorialHost(host)) return false;
    if (genericPaths.has(path) || /\/(search|buscar|ofertas-de-empleo)$/.test(path)) return false;
    if (/theimpactjob\.com$/.test(host) && /^\/jobs\/(remote|category|search)/.test(path)) return false;
    if (/trabajo\.org$/.test(host) && !/^\/oferta-/.test(path)) return false;
    if (!isTrustedJobHost(host) && !JOB_PATH.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}

function buildQueries(targetRoles: string[]): string[] {
  const customTerms = targetRoles
    .map((role) => role.replace(/[^\p{L}\p{N}\s&-]/gu, "").trim())
    .filter((role) => role.length >= 4)
    .slice(0, 5)
    .map((role) => `"${role}"`);

  if (customTerms.length === 0) return QUERIES;
  return [
    ...QUERIES,
    `(site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:smartrecruiters.com OR site:linkedin.com/jobs OR site:indeed.com) ("Costa Rica" OR remoto OR LATAM) (${customTerms.join(" OR ")})`,
  ];
}

function isTrustedJobHost(host: string): boolean {
  return TRUSTED_JOB_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isEditorialHost(host: string): boolean {
  return EDITORIAL_HOST_TOKEN.test(host)
    || EDITORIAL_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
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

function getCompatibleGeography(url: string, text: string): GeographyMatch | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const costaRica = COSTA_RICA.test(text) || host.endsWith(".cr") || host.startsWith("cr.");
    const remote = REMOTE_FOR_CR.test(text);

    // Los portales con subdominio de otro país se excluyen aunque aparezcan
    // accidentalmente en una búsqueda dirigida a Costa Rica.
    if (FOREIGN_HOST.test(host)) return null;
    if (FOREIGN_ONLY.test(text) && !costaRica && !remote) return null;
    if (costaRica) return { location: "Costa Rica", remote };
    if (remote) return { location: "Remoto compatible con CR / LATAM", remote: true };

    // Los ATS globales pueden omitir la ubicación en el fragmento de búsqueda.
    // Solo se conservan si son publicaciones individuales; quedan marcados
    // claramente para revisión antes de aceptar.
    if (GLOBAL_JOB_HOST.test(host)) {
      return { location: "Ubicación por confirmar", remote: false };
    }

    return null;
  } catch {
    return null;
  }
}
