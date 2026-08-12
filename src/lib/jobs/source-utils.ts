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
