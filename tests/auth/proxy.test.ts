import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../proxy";

describe("authentication proxy", () => {
  it("redirects signed-out protected routes to sign-in with the original path", () => {
    const request = new NextRequest("http://localhost/practice?source=home");
    const response = proxy(request);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("callbackURL")).toBe("/practice?source=home");
  });

  it.each(["/", "/judge", "/call/demo"])("leaves public route %s alone", (path) => {
    const response = proxy(new NextRequest(`http://localhost${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows the proxy through when a Better Auth session cookie exists", () => {
    const request = new NextRequest("http://localhost/settings", {
      headers: { cookie: "better-auth.session_token=present" },
    });
    const response = proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
