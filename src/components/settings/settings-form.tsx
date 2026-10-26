"use client";

import { useState } from "react";
import { savePreferences } from "../../../app/actions/preferences";
import { applyTextScale } from "@/components/app-shell";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

type Preferences = { textScale: number; speechRate: number; highContrast: boolean; prefersText: boolean };

export function SettingsForm({ initial }: { initial: Preferences }) {
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const { theme, setTheme } = useTheme();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const result = await savePreferences(values);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      applyTextScale(values.textScale as 1 | 1.25 | 1.5);
      if (values.highContrast) setTheme("high-contrast");
      else if (theme === "high-contrast") setTheme("light");
      setMessage("Your settings are saved.");
    } catch {
      setMessage("We couldn't save your settings. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="settings-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="settings-text-scale">Text size</label>
      <select id="settings-text-scale" value={values.textScale} onChange={(event) => {
        const textScale = Number(event.currentTarget.value);
        setValues((current) => ({ ...current, textScale }));
      }}>
        <option value="1">Standard</option><option value="1.25">Large</option><option value="1.5">Extra large</option>
      </select>

      <label htmlFor="settings-speech-rate">Caller speech speed</label>
      <select id="settings-speech-rate" value={values.speechRate} onChange={(event) => {
        const speechRate = Number(event.currentTarget.value);
        setValues((current) => ({ ...current, speechRate }));
      }}>
        <option value="0.7">Slowest</option><option value="0.8">Slower</option><option value="0.9">A little slower</option><option value="1">Standard</option><option value="1.1">A little faster</option><option value="1.2">Fastest</option>
      </select>
      <p className="settings-help">Speech speed applies to voice practice. Text practice is always available.</p>

      <label className="settings-check"><input type="checkbox" checked={values.highContrast} onChange={(event) => {
        const highContrast = event.currentTarget.checked;
        setValues((current) => ({ ...current, highContrast }));
      }} /> Use high contrast</label>
      <label className="settings-check"><input type="checkbox" checked={values.prefersText} onChange={(event) => {
        const prefersText = event.currentTarget.checked;
        setValues((current) => ({ ...current, prefersText }));
      }} /> Start calls in text mode</label>
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
