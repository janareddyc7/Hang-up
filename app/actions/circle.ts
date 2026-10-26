"use server";

import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { assignments, circleInvites, circleMembers, circles, user } from "@/db/schema";
import { env } from "@/env";
import { requireUser } from "@/lib/auth/session";
import { getRuntimeDeps } from "@/lib/drill/deps";
import { hashCircleInvite } from "@/lib/circle/invites";
import type { Difficulty } from "@/lib/engine/schema";

const CircleIdSchema = z.string().trim().min(1).max(100);
const CreateCircleSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();
const InviteSchema = z.object({
  circleId: CircleIdSchema,
  email: z.string().trim().max(254).email().transform((email) => email.toLowerCase()),
  role: z.enum(["coach", "trainee"]),
}).strict();
const AcceptInviteSchema = z.object({ token: z.string().trim().min(40).max(100) }).strict();
const ShareSchema = z.object({ circleId: CircleIdSchema, share: z.boolean() }).strict();
const AssignSchema = z.object({
  circleId: CircleIdSchema,
  traineeId: z.string().trim().min(1).max(100),
  personaId: z.string().trim().min(1).max(100).optional(),
  difficulty: z.enum(["easy", "realistic", "relentless"]).optional(),
  dueAt: z.iso.datetime({ offset: true }).optional(),
}).strict();

type ActionError = { ok: false; error: string };
type CircleRole = "coach" | "trainee";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function sendInviteEmail(input: { email: string; role: CircleRole; circleName: string; token: string }): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("Email is not configured.");
  const origin = env.BETTER_AUTH_URL ?? env.APP_URL;
  const inviteUrl = new URL(`/circle/invite/${encodeURIComponent(input.token)}`, origin).toString();
  const roleName = input.role === "coach" ? "coach" : "trainee";
  const safeCircleName = escapeHtml(input.circleName);
  const safeUrl = escapeHtml(inviteUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.email],
      subject: `Join ${input.circleName} on Hang Up`,
      html: `<p>You were invited to join <strong>${safeCircleName}</strong> as a ${roleName}.</p><p><a href="${safeUrl}">Accept this invitation</a></p><p>This link expires in seven days and can only be used by the invited email address.</p>`,
      text: `You were invited to join ${input.circleName} as a ${roleName}. Accept within seven days: ${inviteUrl}\n\nThe invitation only works for this email address.`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Email delivery failed.");
}

export async function createCircle(input: unknown): Promise<{ ok: true; circleId: string } | ActionError> {
  const parsed = CreateCircleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a circle name between 2 and 80 characters." };
  const currentUser = await requireUser();

  try {
    const circleId = `cir_${crypto.randomUUID()}`;
    await db.transaction(async (tx) => {
      await tx.insert(circles).values({ id: circleId, name: parsed.data.name, createdBy: currentUser.id });
      await tx.insert(circleMembers).values({ circleId, userId: currentUser.id, role: "coach" });
    });
    revalidatePath("/circle");
    return { ok: true, circleId };
  } catch {
    return { ok: false, error: "The Family Circle could not be created. Try again." };
  }
}

export async function inviteToCircle(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address and invitation role." };
  const currentUser = await requireUser();
  const { circleId, email, role } = parsed.data;
  let inviteId: string | undefined;

  try {
    const [circle] = await db.select({ name: circles.name }).from(circles)
      .innerJoin(circleMembers, eq(circleMembers.circleId, circles.id))
      .where(and(eq(circles.id, circleId), eq(circleMembers.userId, currentUser.id), eq(circleMembers.role, "coach")))
      .limit(1);
    if (!circle) return { ok: false, error: "Only a coach in this circle can invite someone." };

    const [existingMember] = await db.select({ userId: circleMembers.userId }).from(circleMembers)
      .innerJoin(user, eq(user.id, circleMembers.userId))
      .where(and(eq(circleMembers.circleId, circleId), sql`lower(${user.email}) = ${email}`))
      .limit(1);
    if (existingMember) return { ok: false, error: "That person is already in this circle." };

    const [pendingInvite] = await db.select({ id: circleInvites.id }).from(circleInvites)
      .where(and(eq(circleInvites.circleId, circleId), eq(circleInvites.email, email), isNull(circleInvites.acceptedAt), gt(circleInvites.expiresAt, new Date())))
      .limit(1);
    if (pendingInvite) return { ok: false, error: "An invitation is already pending for that email address." };

    const token = randomBytes(32).toString("base64url");
    inviteId = `inv_${crypto.randomUUID()}`;
    // Old or expired invitations cannot be accepted; remove them before the partial unique insert.
    await db.delete(circleInvites).where(and(
      eq(circleInvites.circleId, circleId),
      eq(circleInvites.email, email),
      isNull(circleInvites.acceptedAt),
      lte(circleInvites.expiresAt, new Date()),
    ));
    await db.insert(circleInvites).values({
      id: inviteId,
      circleId,
      email,
      role,
      tokenHash: hashCircleInvite(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await sendInviteEmail({ email, role, circleName: circle.name, token });
    revalidatePath("/circle");
    return { ok: true };
  } catch {
    if (inviteId) {
      try { await db.delete(circleInvites).where(eq(circleInvites.id, inviteId)); } catch { /* Best-effort cleanup after email failure. */ }
    }
    return { ok: false, error: "The invitation could not be sent. Check email setup and try again." };
  }
}

export async function acceptInvite(input: unknown): Promise<{ ok: true; circleId: string } | ActionError> {
  const parsed = AcceptInviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This invitation is invalid or has expired." };
  const currentUser = await requireUser();
  const now = new Date();

  try {
    const result = await db.transaction(async (tx) => {
      const [invite] = await tx.select().from(circleInvites)
        .where(eq(circleInvites.tokenHash, hashCircleInvite(parsed.data.token)))
        .for("update")
        .limit(1);
      if (!invite || invite.acceptedAt || invite.expiresAt <= now || invite.email !== currentUser.email.trim().toLowerCase()) {
        return null;
      }

      const [existingMember] = await tx.select().from(circleMembers)
        .where(and(eq(circleMembers.circleId, invite.circleId), eq(circleMembers.userId, currentUser.id)))
        .limit(1);
      if (existingMember && existingMember.role !== invite.role) return null;
      if (!existingMember) {
        await tx.insert(circleMembers).values({ circleId: invite.circleId, userId: currentUser.id, role: invite.role });
      }
      await tx.update(circleInvites).set({ acceptedAt: now })
        .where(and(eq(circleInvites.id, invite.id), isNull(circleInvites.acceptedAt)));
      return { circleId: invite.circleId };
    });
    if (!result) return { ok: false, error: "This invitation is invalid, expired, or addressed to another email." };
    revalidatePath("/circle");
    revalidatePath("/practice");
    return { ok: true, circleId: result.circleId };
  } catch {
    return { ok: false, error: "The invitation could not be accepted. Try again." };
  }
}

export async function setShareTranscripts(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = ShareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a valid sharing setting." };
  const currentUser = await requireUser();
  try {
    const updated = await db.update(circleMembers).set({ shareTranscripts: parsed.data.share })
      .where(and(
        eq(circleMembers.circleId, parsed.data.circleId),
        eq(circleMembers.userId, currentUser.id),
        eq(circleMembers.role, "trainee"),
      )).returning({ circleId: circleMembers.circleId });
    if (updated.length !== 1) return { ok: false, error: "Only the trainee can change transcript sharing." };
    revalidatePath("/circle");
    return { ok: true };
  } catch {
    return { ok: false, error: "The sharing setting could not be saved." };
  }
}

export async function assignDrill(input: unknown): Promise<{ ok: true; assignmentId: string } | ActionError> {
  const parsed = AssignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the call assignment details." };
  const currentUser = await requireUser();
  const request = parsed.data;
  if (request.personaId && !getRuntimeDeps().personas.has(request.personaId)) {
    return { ok: false, error: "Choose one of the available practice calls." };
  }
  const dueAt = request.dueAt ? new Date(request.dueAt) : null;
  if (dueAt && dueAt.getTime() < Date.now()) return { ok: false, error: "Choose a due date in the future." };

  try {
    const [coach] = await db.select({ circleId: circleMembers.circleId }).from(circleMembers)
      .where(and(eq(circleMembers.circleId, request.circleId), eq(circleMembers.userId, currentUser.id), eq(circleMembers.role, "coach")))
      .limit(1);
    if (!coach) return { ok: false, error: "Only a coach in this circle can assign a practice call." };
    const [trainee] = await db.select({ userId: circleMembers.userId }).from(circleMembers)
      .where(and(eq(circleMembers.circleId, request.circleId), eq(circleMembers.userId, request.traineeId), eq(circleMembers.role, "trainee")))
      .limit(1);
    if (!trainee) return { ok: false, error: "Choose a trainee in this circle." };

    const assignmentId = `asn_${crypto.randomUUID()}`;
    await db.insert(assignments).values({
      id: assignmentId,
      circleId: request.circleId,
      coachId: currentUser.id,
      traineeId: request.traineeId,
      personaId: request.personaId ?? null,
      difficulty: request.difficulty as Difficulty | undefined,
      dueAt,
    });
    revalidatePath("/circle");
    revalidatePath("/practice");
    return { ok: true, assignmentId };
  } catch {
    return { ok: false, error: "The practice call could not be assigned." };
  }
}
