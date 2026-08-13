import { NextResponse } from "next/server";
import { discoverJobs } from "@/lib/jobs/discovery";
import { DEFAULT_SEARCH_PREFERENCES, type SearchPreferences } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await discoverJobs(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda. Intenta de nuevo." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { preferences?: Partial<SearchPreferences> };
    const preferences = normalizePreferences(payload.preferences);
    return NextResponse.json(await discoverJobs(preferences), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda. Intenta de nuevo." },
      { status: 500 },
    );
  }
}

function normalizePreferences(input?: Partial<SearchPreferences>): SearchPreferences {
  const cleanList = (values: unknown, fallback: string[]) => Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean).slice(0, 15)
    : fallback;
  const requestedScore = typeof input?.minimumScore === "number" ? input.minimumScore : DEFAULT_SEARCH_PREFERENCES.minimumScore;

  return {
    targetRoles: cleanList(input?.targetRoles, DEFAULT_SEARCH_PREFERENCES.targetRoles),
    skills: cleanList(input?.skills, DEFAULT_SEARCH_PREFERENCES.skills),
    minimumScore: Math.min(85, Math.max(50, Math.round(requestedScore))),
    enabledSources: {
      brave: input?.enabledSources?.brave !== false,
      remotive: input?.enabledSources?.remotive !== false,
    },
  };
}
