import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { practiceCallConsents } from "@/db/schema";
import { env } from "@/env";
import { eq } from "drizzle-orm";
import { SettingsForm } from "@/components/settings/settings-form";
import { PracticeCallsSettings } from "@/components/settings/practice-calls-settings";

export default async function SettingsPage() {
  const currentUser = await requireUser();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, currentUser.id)).limit(1);
  const [consent] = await db.select({ verifiedAt: practiceCallConsents.phoneVerifiedAt })
    .from(practiceCallConsents).where(eq(practiceCallConsents.userId, currentUser.id)).limit(1);
  return (
    <main id="main-content" className="settings-main">
      <header className="settings-intro"><p className="eyebrow">Settings</p><h1>Make practice work for you.</h1><p>Choose the text size, contrast, and call style that feel comfortable. You can change these any time.</p></header>
      <section className="settings-panel" aria-labelledby="accessibility-title">
        <h2 id="accessibility-title">Accessibility and call preferences</h2>
        <SettingsForm initial={{ textScale: profile?.textScale ?? 1, speechRate: profile?.speechRate ?? 1, highContrast: profile?.highContrast ?? false, prefersText: profile?.prefersText ?? false }} />
      </section>
      <PracticeCallsSettings enabled={env.PRACTICE_CALLS_ENABLED && env.PRACTICE_CALLS_ADULT_REVIEWED} consentActive={Boolean(consent?.verifiedAt)} />
      <section className="settings-help-panel"><h2>Real help</h2><p>Hang Up is practice, not a safeguard. If a caller asks for money or a code, hang up and call the number on the back of your card. You can also report fraud at <a href="https://reportfraud.ftc.gov/">ReportFraud.ftc.gov</a> or call the DOJ National Elder Fraud Hotline at <a href="tel:18333728311">1-833-FRAUD-11</a>.</p></section>
    </main>
  );
}
