import { NextResponse, type NextRequest } from "next/server";

const protectedPrefixes = [
  "/practice",
  "/circle",
  "/settings",
  "/card",
  "/facilitate",
  "/admin",
  "/pilot",
];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasSessionCookie = Boolean(
    request.cookies.get("better-auth.session_token")?.value ||
      request.cookies.get("__Secure-better-auth.session_token")?.value,
  );
  if (hasSessionCookie) return NextResponse.next();

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("callbackURL", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/practice/:path*", "/circle/:path*", "/settings/:path*", "/card/:path*", "/facilitate/:path*", "/admin/:path*", "/pilot/:path*"],
};
