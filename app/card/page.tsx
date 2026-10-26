import { eq } from "drizzle-orm";
import { CallbackCard } from "@/components/card/callback-card";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";

export default async function CardPage() {
  const currentUser = await requireUser();
  const [profile] = await db.select({ safeWordSet: profiles.safeWordSet }).from(profiles).where(eq(profiles.userId, currentUser.id)).limit(1);
  return (
    <main id="main-content" className="callback-main">
      <header className="settings-intro"><p className="eyebrow">Callback card</p><h1>Keep a trusted number close.</h1><p>Write down numbers you already trust. The safe word stays blank so your family can add it by hand.</p></header>
      <CallbackCard initialSafeWordSet={profile?.safeWordSet ?? false} />
    </main>
  );
}
