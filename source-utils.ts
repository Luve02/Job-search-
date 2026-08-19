export function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function stableId(source: string, value: string): string {
  let hash = 0;
  const text = `${source}:${value}`;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return `${source.toLowerCase().replace(/\W/g, "-")}-${hash.toString(36)}`;
}

export function canonicalJobUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|trk$|trackingid$|source$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return value.trim();
  }
}

const GENERIC_JOB_PATH = /^\/(?:jobs?|careers?|vacancies|opportunities|empleos?|trabajos?|ofertas-de-trabajo)?\/?$/i;
const SEARCH_PATH = /\/(?:jobs?\/)?(?:search|buscar|busqueda|búsqueda|job-search)(?:\/|$)/i;
const SEARCH_QUERY_KEYS = ["q", "query", "keyword", "keywords", "search", "location"];
const DETAIL_QUERY_KEYS = ["jobid", "job_id", "jid", "jk", "gh_jid", "reqid", "requisitionid"];

/**
 * Devuelve un enlace de detalle normalizado o null cuando el portal solo
 * apunta a una búsqueda, categoría o banco general de empleos.
 */
export function normalizeJobDetailUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (isPortalHost(host, "indeed")) {
      const jobKey = url.searchParams.get("jk")?.trim();
      if (!jobKey) return null;
      const direct = new URL(`${url.protocol}//${url.host}/viewjob`);
      direct.searchParams.set("jk", jobKey);
      return direct.toString();
    }

    if (isPortalHost(host, "linkedin")) {
      return /\/jobs\/view\/[^/]+/i.test(path) ? canonicalJobUrl(url.toString()) : null;
    }

    if (host.includes("myworkdayjobs.com") || host.includes("myworkdaysite.com")) {
      return /\/job\//i.test(path) ? canonicalJobUrl(url.toString()) : null;
    }

    if (host.includes("computrabajo")) {
      return /\/ofertas-de-trabajo\/oferta-de-trabajo-de-/i.test(path)
        ? canonicalJobUrl(url.toString())
        : null;
    }

    if (host.includes("greenhouse.io")) {
      const directPath = /\/jobs\/[^/]+/i.test(path);
      const directQuery = url.searchParams.has("gh_jid") || url.searchParams.has("token");
      return directPath || directQuery ? canonicalJobUrl(url.toString()) : null;
    }

    if (host.includes("lever.co")) {
      const segments = path.split("/").filter(Boolean);
      const direct = /\/postings\/[^/]+\/[^/]+/i.test(path) || segments.length >= 2;
      return direct ? canonicalJobUrl(url.toString()) : null;
    }

    if (host.includes("smartrecruiters.com")) {
      const segments = path.split("/").filter(Boolean);
      return segments.length >= 2 && /\d/.test(segments.at(-1) ?? "")
        ? canonicalJobUrl(url.toString())
        : null;
    }

    if (host.includes("ashbyhq.com")) {
      return path.split("/").filter(Boolean).length >= 2 ? canonicalJobUrl(url.toString()) : null;
    }

    if (host.includes("workable.com")) {
      return /\/(?:j|view)\/[^/]+/i.test(path) ? canonicalJobUrl(url.toString()) : null;
    }

    if (host.includes("elempleo")) {
      return /\/ofertas-trabajo\/[^/]+\/\d{5,}/i.test(path)
        ? canonicalJobUrl(url.toString())
        : null;
    }

    const hasDetailId = DETAIL_QUERY_KEYS.some((key) => hasQueryKey(url, key));
    if (GENERIC_JOB_PATH.test(path) && !hasDetailId) return null;
    if (SEARCH_PATH.test(path) && !hasDetailId) return null;

    const hasSearchQuery = SEARCH_QUERY_KEYS.some((key) => hasQueryKey(url, key));
    const looksLikeDetailPath = /\/(?:jobs?|positions?|vacancies|openings?)\/[^/]+/i.test(path);
    if (hasSearchQuery && !hasDetailId && !looksLikeDetailPath) return null;

    return canonicalJobUrl(url.toString());
  } catch {
    return null;
  }
}

function isPortalHost(host: string, portal: string): boolean {
  return host === `${portal}.com` || host.startsWith(`${portal}.`) || host.includes(`.${portal}.`);
}

function hasQueryKey(url: URL, expected: string): boolean {
  return [...url.searchParams.keys()].some((key) => key.toLowerCase() === expected);
}

export function detectSource(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("myworkdayjobs")) return "Workday";
    if (host.includes("greenhouse")) return "Greenhouse";
    if (host.includes("lever.co")) return "Lever";
    if (host.includes("computrabajo")) return "Computrabajo";
    if (host.includes("linkedin")) return "LinkedIn";
    if (host.includes("indeed")) return "Indeed";
    if (host.includes("elempleo")) return "El Empleo";
    return host.replace(/^www\./, "");
  } catch {
    return "Web";
  }
}
