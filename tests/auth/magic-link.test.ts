import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const suite = testDatabaseUrl ? describe : describe.skip;
const email = `hang-up-auth-${crypto.randomUUID()}@example.test`;

suite("Better Auth magic-link flow (TEST_DATABASE_URL)", () => {
  let auth: typeof import("@/auth").auth;
  let database: typeof import("@/db/client").db;
  let schema: typeof import("@/db/schema");
  let capturedEmail: Record<string, unknown> | undefined;

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    process.env.DATABASE_URL = testDatabaseUrl;
    const [authModule, databaseModule, schemaModule] = await Promise.all([
      import("@/auth"),
      import("@/db/client"),
      import("@/db/schema"),
    ]);
    auth = authModule.auth;
    database = databaseModule.db;
    schema = schemaModule;
  });

  afterAll(async () => {
    if (!database || !schema) return;
    await database.delete(schema.user).where((await import("drizzle-orm")).eq(schema.user.email, email));
    await database
      .delete(schema.verification)
      .where((await import("drizzle-orm")).like(schema.verification.value, `%${email}%`));
  });

  it("sends a link, creates a session, and creates the first profile", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedEmail = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: "test-email-id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    try {
      const sendResponse = await auth.handler(
        new Request("http://localhost:3001/api/auth/sign-in/magic-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost:3001",
          },
          body: JSON.stringify({ email, callbackURL: "/" }),
        }),
      );
      expect(sendResponse.status).toBe(200);
      expect(await sendResponse.json()).toEqual({ status: true });
      expect(capturedEmail).toMatchObject({
        from: "Hang Up <sign-in@likhittanishq.org>",
        to: [email],
        subject: "Your Hang Up sign-in link",
      });

      const html = String(capturedEmail?.html);
      const href = html.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
      expect(href).toBeTruthy();
      expect(href).toContain("http://localhost:3001/api/auth");
      const verifyResponse = await auth.handler(new Request(href!));
      expect([302, 303]).toContain(verifyResponse.status);

      const cookies = verifyResponse.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";", 1)[0])
        .join("; ");
      expect(cookies).toContain("better-auth.session_token=");

      const session = await auth.api.getSession({
        headers: new Headers({ cookie: cookies }),
      });
      expect(session?.user.email).toBe(email);

      const [profile] = await database
        .select()
        .from(schema.profiles)
        .where((await import("drizzle-orm")).eq(schema.profiles.userId, session!.user.id));
      expect(profile).toMatchObject({
        userId: session!.user.id,
        displayName: email,
      });
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });
});
