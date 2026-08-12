import type { Freshness } from "./types";

const DAY_MS = 86_400_000;

export function getFreshness(
  postedAt: string | null,
  now = new Date(),
): { freshness: Freshness; daysOld: number | null } {
  if (!postedAt) return { freshness: "unknown", daysOld: null };

  const date = new Date(postedAt);
  if (Number.isNaN(date.getTime())) {
    return { freshness: "unknown", daysOld: null };
  }

  const daysOld = Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
  if (daysOld <= 30) return { freshness: "fresh", daysOld };
  if (daysOld <= 60) return { freshness: "older", daysOld };
  return { freshness: "stale", daysOld };
}

export function parseRelativeAge(age?: string): string | null {
  if (!age) return null;
  const normalized = age.toLowerCase();
  const match = normalized.match(/(\d+)\s*(minute|hour|day|week|month)/);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    minute: 1 / 1_440,
    hour: 1 / 24,
    day: 1,
    week: 7,
    month: 30,
  };
  const date = new Date(Date.now() - value * multipliers[unit] * DAY_MS);
  return date.toISOString();
}
