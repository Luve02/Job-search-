import { NextResponse } from "next/server";
import { discoverJobs } from "@/lib/jobs/discovery";

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
