"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite } from "../../../app/actions/circle";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function accept() {
    setPending(true);
    setError("");
    try {
      const result = await acceptInvite({ token });
      if (!result.ok) { setError(result.error); return; }
      router.replace("/circle");
      router.refresh();
    } catch {
      setError("The invitation could not be accepted. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="invite-accept-control">
      <Button size="lg" onClick={() => void accept()} disabled={pending}>
        {pending ? "Checking invitation…" : "Accept invitation"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
