"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

function safeCallback(value: string | null) {
  if (!value?.startsWith("/")) return "/";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export function SignInForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSending(true);

    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: safeCallback(searchParams.get("callbackURL")),
      });
      if (result.error) {
        setError("We couldn't send your sign-in link. Check the email address and try again.");
      } else {
        setMessage("If that address can sign in, a link is on its way. Check your inbox.");
      }
    } catch {
      setError("We couldn't send your sign-in link. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 grid max-w-xl gap-5">
      <label className="grid gap-2 text-lg font-semibold" htmlFor="email">
        Email address
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          className="min-h-14 rounded-lg border border-border bg-background px-4 text-lg text-foreground"
        />
      </label>
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
      <p aria-live="polite" role={error ? "alert" : "status"} className="text-base">
        {error || message}
      </p>
    </form>
  );
}
