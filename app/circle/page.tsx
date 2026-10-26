import Link from "next/link";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { AssignDrillForm, CreateCircleForm, InviteForm, TranscriptSharingControl } from "@/components/circle/circle-actions";
import { SkillBars, type DashboardSkill } from "@/components/circle/skill-bars";
import { db } from "@/db/client";
import { assignments, circleInvites, circleMembers, circles, drills, profiles, skills, user } from "@/db/schema";
import { TacticSchema } from "@/lib/engine/schema";
import { getRuntimeDeps } from "@/lib/drill/deps";
import { requireUser } from "@/lib/auth/session";

function dateLabel(value: Date | null): string {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value);
}

export default async function CirclePage() {
  const viewer = await requireUser();
  const memberships = await db.select({ circleId: circleMembers.circleId, role: circleMembers.role, name: circles.name })
    .from(circleMembers)
    .innerJoin(circles, eq(circles.id, circleMembers.circleId))
    .where(eq(circleMembers.userId, viewer.id))
    .orderBy(asc(circles.createdAt));

  const circleIds = [...new Set(memberships.map((membership) => membership.circleId))];
  if (circleIds.length === 0) {
    return (
      <main id="main-content" className="circle-main">
        <header className="circle-intro">
          <p className="eyebrow">Family Circle</p>
          <h1>Practice with someone you trust.</h1>
          <p>Create a private circle, invite a coach or trainee, and keep transcript sharing in the trainee’s hands.</p>
        </header>
        <section className="circle-panel">
          <h2>Start a circle</h2>
          <p>The person who creates a circle starts as its coach.</p>
          <CreateCircleForm />
        </section>
      </main>
    );
  }

  const members = await db.select({
    circleId: circleMembers.circleId,
    userId: circleMembers.userId,
    role: circleMembers.role,
    shareTranscripts: circleMembers.shareTranscripts,
    name: profiles.displayName,
  }).from(circleMembers)
    .innerJoin(user, eq(user.id, circleMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, circleMembers.userId))
    .where(inArray(circleMembers.circleId, circleIds))
    .orderBy(asc(user.name));

  const memberIds = [...new Set(members.map((member) => member.userId))];
  const skillRows = memberIds.length > 0
    ? await db.select().from(skills).where(inArray(skills.userId, memberIds))
    : [];
  const finishedDrills = memberIds.length > 0
    ? await db.select({ id: drills.id, userId: drills.userId, personaId: drills.personaId, startedAt: drills.startedAt, score: drills.score, outcome: drills.outcome })
      .from(drills)
      .where(and(inArray(drills.userId, memberIds), eq(drills.status, "ended")))
      .orderBy(desc(drills.startedAt))
      .limit(100)
    : [];
  const openAssignments = await db.select({ id: assignments.id, circleId: assignments.circleId, traineeId: assignments.traineeId, dueAt: assignments.dueAt, personaId: assignments.personaId, difficulty: assignments.difficulty })
    .from(assignments)
    .where(and(inArray(assignments.circleId, circleIds), isNull(assignments.completedDrillId)))
    .orderBy(asc(assignments.dueAt), asc(assignments.createdAt));
  const pendingInvites = await db.select({ id: circleInvites.id, circleId: circleInvites.circleId, email: circleInvites.email, role: circleInvites.role, expiresAt: circleInvites.expiresAt })
    .from(circleInvites)
    .where(and(inArray(circleInvites.circleId, circleIds), isNull(circleInvites.acceptedAt), gt(circleInvites.expiresAt, new Date())));

  const scenarios = [...getRuntimeDeps().personas.values()]
    .map((persona) => ({ id: persona.id, title: persona.callerIdDisplay }))
    .sort((left, right) => left.title.localeCompare(right.title));
  const memberSkills = (userId: string): DashboardSkill[] => skillRows.flatMap((row) => {
    if (row.userId !== userId) return [];
    const parsedTactic = TacticSchema.safeParse(row.tactic);
    return parsedTactic.success ? [{ tactic: parsedTactic.data, theta: row.theta, box: row.box, dueAt: row.dueAt, lastPersonaId: row.lastPersonaId ?? undefined }] : [];
  });

  return (
    <main id="main-content" className="circle-main">
      <header className="circle-intro">
        <p className="eyebrow">Family Circle</p>
        <h1>Practice with someone you trust.</h1>
        <p>Coaches can see scores and practice progress. Trainees choose whether to share their transcripts.</p>
      </header>
      <div className="circle-top-actions"><CreateCircleForm /></div>
      <div className="circle-list">
        {memberships.map((membership) => {
          const circleMembersHere = members.filter((member) => member.circleId === membership.circleId);
          const trainees = circleMembersHere.filter((member) => member.role === "trainee");
          const coaches = circleMembersHere.filter((member) => member.role === "coach");
          const ownMember = circleMembersHere.find((member) => member.userId === viewer.id);
          const invitesHere = pendingInvites.filter((invite) => invite.circleId === membership.circleId);
          const assignmentsHere = openAssignments.filter((assignment) => assignment.circleId === membership.circleId);

          return (
            <section className="family-circle-card" key={membership.circleId}>
              <header className="family-circle-heading">
                <div>
                  <p className="eyebrow">Your role: {membership.role}</p>
                  <h2>{membership.name}</h2>
                </div>
                <span className="circle-member-count">{circleMembersHere.length} {circleMembersHere.length === 1 ? "person" : "people"}</span>
              </header>

              {membership.role === "coach" ? (
                <>
                  <section className="circle-section" aria-label="Trainee progress">
                    <h3>Trainees and practice</h3>
                    {trainees.length === 0 ? (
                      <p className="circle-empty">Invite a trainee to start sharing practice progress.</p>
                    ) : (
                      <div className="trainee-grid">
                        {trainees.map((trainee) => {
                          const history = finishedDrills.filter((drill) => drill.userId === trainee.userId).slice(0, 3);
                          const openForTrainee = assignmentsHere.filter((assignment) => assignment.traineeId === trainee.userId);
                          return (
                            <article className="trainee-card" key={trainee.userId}>
                              <header className="trainee-card-heading">
                                <h4>{trainee.name || "Trainee"}</h4>
                                <span>{openForTrainee.length} open {openForTrainee.length === 1 ? "assignment" : "assignments"}</span>
                              </header>
                              <SkillBars skills={memberSkills(trainee.userId)} />
                              <div className="circle-drill-history">
                                <h5>Recent scores</h5>
                                {history.length === 0 ? <p>No completed calls yet.</p> : (
                                  <ul>
                                    {history.map((drill) => (
                                      <li key={drill.id}>
                                        <Link href={`/replay/${encodeURIComponent(drill.id)}`}>{drill.score ?? "—"}/100 · {drill.outcome ?? "Scored"}</Link>
                                        <time dateTime={drill.startedAt.toISOString()}>{dateLabel(drill.startedAt)}</time>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              {openForTrainee.length > 0 && (
                                <div className="circle-open-assignments">
                                  <h5>Open assignments</h5>
                                  <ul>{openForTrainee.map((assignment) => (
                                    <li key={assignment.id}>{assignment.personaId ? scenarios.find((scenario) => scenario.id === assignment.personaId)?.title ?? "Practice call" : "Curriculum choice"}<span>Due {dateLabel(assignment.dueAt)}</span></li>
                                  ))}</ul>
                                </div>
                              )}
                              <AssignDrillForm circleId={membership.circleId} traineeId={trainee.userId} scenarios={scenarios} />
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                  <section className="circle-section circle-invites-section">
                    <h3>People in this circle</h3>
                    <ul className="circle-people-list">
                      {coaches.map((coach) => <li key={coach.userId}><span>{coach.name || "Coach"}</span><strong>Coach</strong></li>)}
                      {trainees.map((trainee) => <li key={trainee.userId}><span>{trainee.name || "Trainee"}</span><strong>Trainee</strong></li>)}
                    </ul>
                    {invitesHere.length > 0 && <p className="pending-invites">{invitesHere.length} invitation{invitesHere.length === 1 ? "" : "s"} awaiting acceptance</p>}
                    <InviteForm circleId={membership.circleId} />
                  </section>
                </>
              ) : (
                <section className="circle-section trainee-circle-section">
                  <h3>Your practice progress</h3>
                  <p>Coaches see your scores. Your transcript stays private unless you choose to share it.</p>
                  <SkillBars skills={memberSkills(viewer.id)} />
                  <h4>Coaches</h4>
                  <ul className="circle-people-list">
                    {coaches.map((coach) => <li key={coach.userId}><span>{coach.name || "Coach"}</span><strong>Coach</strong></li>)}
                  </ul>
                  <TranscriptSharingControl circleId={membership.circleId} initialShare={ownMember?.shareTranscripts ?? false} />
                </section>
              )}
            </section>
          );
        })}
      </div>
      <aside className="circle-safety-note">
        <p>You can leave a circle by asking its coach to remove your membership. Your own replay access stays protected by your account.</p>
      </aside>
    </main>
  );
}
