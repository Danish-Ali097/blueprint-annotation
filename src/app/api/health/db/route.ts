import { NextResponse } from "next/server";

import { pingDatabase } from "@/services/health-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await pingDatabase());
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: "down",
        error: error instanceof Error ? error.message : "Unknown database error",
      },
      { status: 500 },
    );
  }
}
