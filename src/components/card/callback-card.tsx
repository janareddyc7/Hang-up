"use client";

import { useEffect, useState } from "react";
import { savePreferences } from "../../../app/actions/preferences";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "hang-up-callback-card-v1";
type Numbers = { bank: string; familyOne: string; familyTwo: string };
const emptyNumbers: Numbers = { bank: "", familyOne: "", familyTwo: "" };

export function CallbackCard({ initialSafeWordSet }: { initialSafeWordSet: boolean }) {
  const [numbers, setNumbers] = useState<Numbers>(emptyNumbers);
  const [safeWordSet, setSafeWordSet] = useState(initialSafeWordSet);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let frame: number | undefined;
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
      if (stored && typeof stored === "object") {
        const record = stored as Record<string, unknown>;
        frame = window.requestAnimationFrame(() => setNumbers({ bank: typeof record.bank === "string" ? record.bank : "", familyOne: typeof record.familyOne === "string" ? record.familyOne : "", familyTwo: typeof record.familyTwo === "string" ? record.familyTwo : "" }));
      }
    } catch {
      frame = window.requestAnimationFrame(() => setMessage("Saved phone numbers could not be read from this browser."));
    }
    return () => { if (frame !== undefined) window.cancelAnimationFrame(frame); };
  }, []);

  function update(key: keyof Numbers, value: string) {
    const next = { ...numbers, [key]: value };
    setNumbers(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { setMessage("Your browser could not save these numbers. They will still appear until you leave this page."); }
  }

  async function changeSafeWordSet(checked: boolean) {
    setMessage("");
    setSaving(true);
    try {
      const result = await savePreferences({ safeWordSet: checked });
      if (!result.ok) { setMessage(result.error); return; }
      setSafeWordSet(checked);
      setMessage("Family safe-word setting saved. The word itself is never stored.");
    } catch {
      setMessage("The setting could not be saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="callback-number-form" aria-labelledby="callback-numbers-title">
        <h2 id="callback-numbers-title">Add trusted numbers</h2>
        <p>These numbers stay in this browser only. They are never sent to Hang Up.</p>
        <label htmlFor="callback-bank">My bank</label><input id="callback-bank" type="tel" autoComplete="tel" value={numbers.bank} onChange={(event) => update("bank", event.currentTarget.value)} />
        <label htmlFor="callback-family-one">Family or trusted contact</label><input id="callback-family-one" type="tel" autoComplete="tel" value={numbers.familyOne} onChange={(event) => update("familyOne", event.currentTarget.value)} />
        <label htmlFor="callback-family-two">Another trusted contact (optional)</label><input id="callback-family-two" type="tel" autoComplete="tel" value={numbers.familyTwo} onChange={(event) => update("familyTwo", event.currentTarget.value)} />
        <label className="settings-check"><input type="checkbox" checked={safeWordSet} disabled={saving} onChange={(event) => void changeSafeWordSet(event.currentTarget.checked)} /> We set a family safe word</label>
        {message && <p role="status">{message}</p>}
      </section>
      <article className="callback-print-card" aria-label="Printable scam response card">
        <p className="callback-brand">Hang Up · A quick reminder</p>
        <h1>Before you send money or share a code, hang up and call:</h1>
        <dl>
          <div><dt>My bank</dt><dd>{numbers.bank || "________________________________"}</dd></div>
          {numbers.familyOne && <div><dt>Family or trusted contact</dt><dd>{numbers.familyOne}</dd></div>}
          {numbers.familyTwo && <div><dt>Another trusted contact</dt><dd>{numbers.familyTwo}</dd></div>}
        </dl>
        <p className="callback-safe-word">Our safe word is <span>________________</span></p>
        <p className="callback-reminder">A real bank will never ask you to move money to protect it or share a one-time code.</p>
      </article>
      <div className="callback-print-actions"><Button size="lg" onClick={() => window.print()}>Print my callback card</Button></div>
    </>
  );
}
