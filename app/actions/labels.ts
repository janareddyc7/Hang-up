"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { drills, moveLabels, turns } from "@/db/schema";
import { env } from "@/env";
import { requireUser } from "@/lib/auth/session";
import { redact } from "@/lib/engine/wallet";
import { UserMoveSchema } from "@/lib/engine/schema";

const LabelSchema = z.object({ turnId: z.number().int().positive(), move: UserMoveSchema, notes: z.string().trim().max(1000).optional() }).strict();

export async function submitHumanLabel(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = LabelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose one of the available labels." };
  const currentUser = await requireUser();
  if (!env.ADMIN_EMAILS.some((email) => email.toLowerCase() === currentUser.email.toLowerCase())) {
    return { ok: false, error: "You are not allowed to review labels." };
  }
  try {
    const [turn] = await db.select({ wallet: drills.wallet }).from(turns)
      .innerJoin(drills, eq(drills.id, turns.drillId))
      .where(and(eq(turns.id, parsed.data.turnId), eq(turns.speaker, "user")))
      .limit(1);
    if (!turn) return { ok: false, error: "That turn is unavailable for review." };
    const [alreadyLabeled] = await db.select({ id: moveLabels.id }).from(moveLabels).where(eq(moveLabels.turnId, parsed.data.turnId)).limit(1);
    if (alreadyLabeled) return { ok: false, error: "That turn already has a human label." };
    const notes = parsed.data.notes ? redact(parsed.data.notes, turn.wallet) : null;
    await db.insert(moveLabels).values({ turnId: parsed.data.turnId, labeledBy: currentUser.id, move: parsed.data.move, notes });
    revalidatePath("/admin/labels");
    return { ok: true };
  } catch {
    return { ok: false, error: "The label could not be saved. Refresh and try again." };
  }
}
