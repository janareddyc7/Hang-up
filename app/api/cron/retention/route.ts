import { and, eq, isNull, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { db } from "@/db/client";
import { drills } from "@/db/schema";
import { judgeDrillRetentionCutoff } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "Retention job is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const cutoff = judgeDrillRetentionCutoff(Date.now());
  const removed = await db.delete(drills).where(and(
    eq(drills.mode, "judge"),
    isNull(drills.userId),
    lt(drills.startedAt, cutoff),
  )).returning({ id: drills.id });

  return NextResponse.json({ deletedJudgeDrills: removed.length });
}
