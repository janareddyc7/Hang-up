import { notFound } from "next/navigation";
import { CallExperience, CallProvider } from "@/components/call/call-experience";
import { personas } from "@/lib/personas";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { groupSessions, profiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { PilotPhaseSchema } from "@/lib/pilot/protocol";
import { assessmentPersona } from "@/lib/pilot/costume";

type Props = { params: Promise<{ scenario: string }>; searchParams: Promise<{ difficulty?: string; mode?: string; text?: string; offline?: string; assignmentId?: string; groupSessionId?: string; pilotPhase?: string }> };
const difficulties = ["easy", "realistic", "relentless"] as const;
const modes = ["judge", "sparring", "assigned", "group"] as const;

export default async function CallPage({ params, searchParams }: Props) {
  const [{ scenario }, query] = await Promise.all([params, searchParams]);
  let persona = personas.find((item) => item.id === scenario);
  if (!persona) notFound();
  const session = await getSession();
  const [profile] = session
    ? await db.select({ prefersText: profiles.prefersText, speechRate: profiles.speechRate }).from(profiles).where(eq(profiles.userId, session.user.id)).limit(1)
    : [];
  const difficulty = difficulties.find((item) => item === query.difficulty) ?? "easy";
  const mode = modes.find((item) => item === query.mode) ?? "judge";
  const offline = query.offline === "1";
  const textOnly = query.text === "1" || offline || (profile?.prefersText ?? false);
  const group = mode === "group" && session && query.groupSessionId
    ? (await db.select({ id: groupSessions.id, joinCode: groupSessions.joinCode }).from(groupSessions).where(and(
      eq(groupSessions.id, query.groupSessionId),
      eq(groupSessions.facilitatorId, session.user.id),
    )).limit(1))[0]
    : undefined;
  if (mode === "group" && !group) notFound();
  const pilotPhase = PilotPhaseSchema.safeParse(query.pilotPhase);
  if (pilotPhase.success) persona = assessmentPersona(persona, `pilot:${pilotPhase.data}:preview`);

  return <CallProvider><CallExperience scenario={persona.id} callerName={persona.callerName} callerIdDisplay={persona.callerIdDisplay} difficulty={difficulty} mode={mode} initialTextOnly={textOnly} initialOffline={offline} assignmentId={query.assignmentId} groupSessionId={group?.id} groupJoinCode={group?.joinCode} speechRate={profile?.speechRate ?? 1} pilotPhase={pilotPhase.success ? pilotPhase.data : undefined} /></CallProvider>;
}
