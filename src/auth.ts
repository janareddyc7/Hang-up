import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { env } from "@/env";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

async function sendMagicLink(email: string, url: string) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Magic-link email is not configured.");

  const safeUrl = escapeHtml(url);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Hang Up sign-in link",
      html: `<p>Use this link to sign in to Hang Up:</p><p><a href="${safeUrl}">Sign in to Hang Up</a></p><p>This link expires in five minutes. If you did not request it, you can ignore this email.</p>`,
      text: `Use this link to sign in to Hang Up: ${url}\n\nThis link expires in five minutes. If you did not request it, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend could not send the sign-in email (HTTP ${response.status}).`);
  }
}

const secret = env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("BETTER_AUTH_SECRET is required to configure Better Auth.");

const configuredBaseURL = env.BETTER_AUTH_URL ?? env.APP_URL;
const baseURL =
  process.env.NODE_ENV === "production"
    ? configuredBaseURL
    : {
        // Next may use port 3001 (or another free port) when 3000 is occupied.
        // Limit dynamic host resolution to loopback addresses in local/test builds.
        allowedHosts: ["localhost:*", "127.0.0.1:*"],
        protocol: "http" as const,
        fallback: configuredBaseURL,
      };

export const auth = betterAuth({
  appName: "Hang Up",
  baseURL,
  secret,
  database: drizzleAdapter(db, { provider: "pg" }),
  plugins: [
    magicLink({
      expiresIn: 5 * 60,
      storeToken: "hashed",
      sendMagicLink: ({ email, url }) => sendMagicLink(email, url),
    }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await db
            .insert(profiles)
            .values({
              userId: createdUser.id,
              displayName: createdUser.name.trim() || createdUser.email,
            })
            .onConflictDoNothing();
        },
      },
    },
  },
});
