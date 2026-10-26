"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

const PreferencesSchema = z.object({
  textScale: z.union([z.literal(1), z.literal(1.25), z.literal(1.5)]).optional(),
  speechRate: z.number().min(0.7).max(1.2).optional(),
  highContrast: z.boolean().optional(),
  prefersText: z.boolean().optional(),
  safeWordSet: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Choose at least one preference.");

export async function savePreferences(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = PreferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check your settings and try again." };
  const currentUser = await requireUser();
  try {
    const updated = await db.update(profiles).set(parsed.data)
      .where(eq(profiles.userId, currentUser.id)).returning({ userId: profiles.userId });
    if (updated.length === 0) {
      await db.insert(profiles).values({
        userId: currentUser.id,
        displayName: currentUser.name,
        textScale: parsed.data.textScale ?? 1,
        speechRate: parsed.data.speechRate ?? 1,
        highContrast: parsed.data.highContrast ?? false,
        prefersText: parsed.data.prefersText ?? false,
        safeWordSet: parsed.data.safeWordSet ?? false,
      });
    }
    revalidatePath("/settings");
    revalidatePath("/card");
    revalidatePath("/practice");
    return { ok: true };
  } catch {
    return { ok: false, error: "Your settings could not be saved. Please try again." };
  }
}
