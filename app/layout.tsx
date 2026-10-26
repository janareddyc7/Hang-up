import type { Metadata } from "next";
import localFont from "next/font/local";
import { env } from "@/env";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import "./globals.css";

const atkinson = localFont({
  src: "../src/assets/fonts/atkinson-hyperlegible-next-latin.woff2",
  weight: "400 700",
  variable: "--font-atkinson",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: "Hang Up — Phone scam practice",
  description: "Practice spotting phone scams in a safe AI simulation.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const [profile] = session
    ? await db.select({ textScale: profiles.textScale, highContrast: profiles.highContrast }).from(profiles).where(eq(profiles.userId, session.user.id)).limit(1)
    : [];
  return (
    <html lang="en" className={atkinson.variable} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <AppShell initialPreferences={profile ?? null} signedIn={Boolean(session)}>{children}</AppShell>
      </body>
    </html>
  );
}
