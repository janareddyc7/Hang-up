import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { AcceptInviteButton } from "@/components/circle/accept-invite-button";
import { db } from "@/db/client";
import { circleInvites, circles } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { hashCircleInvite } from "@/lib/circle/invites";

export const metadata: Metadata = {
  title: "Family Circle invitation | Hang Up",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CircleInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const validShape = /^[A-Za-z0-9_-]{40,100}$/.test(token);
  const [invite] = validShape
    ? await db.select({ circleId: circleInvites.circleId, circleName: circles.name, role: circleInvites.role, email: circleInvites.email, expiresAt: circleInvites.expiresAt })
      .from(circleInvites)
      .innerJoin(circles, eq(circles.id, circleInvites.circleId))
      .where(and(eq(circleInvites.tokenHash, hashCircleInvite(token)), isNull(circleInvites.acceptedAt), gt(circleInvites.expiresAt, new Date())))
      .limit(1)
    : [];

  if (!invite) {
    return (
      <main id="main-content" className="invite-main">
        <section className="invite-card">
          <p className="eyebrow">Family Circle</p>
          <h1>This invitation can’t be used.</h1>
          <p>It may have expired or already been accepted. Ask the circle’s coach to send a new invitation.</p>
          <Link className="invite-home-link" href="/circle">Go to Family Circle</Link>
        </section>
      </main>
    );
  }

  const session = await getSession();
  const callbackURL = `/circle/invite/${encodeURIComponent(token)}`;
  const emailMatches = session?.user.email.trim().toLowerCase() === invite.email;

  return (
    <main id="main-content" className="invite-main">
      <section className="invite-card">
        <p className="eyebrow">Family Circle invitation</p>
        <h1>Join {invite.circleName}</h1>
        <p>You were invited as a <strong>{invite.role}</strong>. This invitation expires {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(invite.expiresAt)}.</p>
        {!session ? (
          <>
            <p>Sign in with the email address that received the invitation to accept it.</p>
            <Link className="invite-sign-in-link" href={`/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`}>Sign in to accept</Link>
          </>
        ) : (
          <>
            <p>{emailMatches ? "This invitation is addressed to the signed-in account." : "This invitation must be accepted from the email account it was sent to."}</p>
            <AcceptInviteButton token={token} />
          </>
        )}
      </section>
    </main>
  );
}
