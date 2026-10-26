"use client";

import { useState, useSyncExternalStore } from "react";
import { beginPhoneVerification, confirmPracticeCalls, revokePracticeCalls } from "../../../app/actions/practice-calls";
import { PRACTICE_CALL_CONSENT_TEXT, PRACTICE_CALL_CONSENT_VERSION } from "@/lib/practice-calls/consent";
import { Button } from "@/components/ui/button";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const subscribeToTimezone = () => () => {};
const getBrowserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
const getServerTimezone = () => "America/New_York";

export function PracticeCallsSettings({ enabled, consentActive }: { enabled: boolean; consentActive: boolean }) {
  const [phoneE164, setPhoneE164] = useState("");
  const [code, setCode] = useState("");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5]);
  const [windowStartHour, setWindowStartHour] = useState(10);
  const [windowEndHour, setWindowEndHour] = useState(19);
  const [maxPerWeek, setMaxPerWeek] = useState<1 | 2 | 3>(1);
  const timezone = useSyncExternalStore(subscribeToTimezone, getBrowserTimezone, getServerTimezone);
  const [accepted, setAccepted] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [active, setActive] = useState(consentActive);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function toggleDay(day: number) {
    setDaysOfWeek((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort());
  }

  async function sendCode() {
    setPending(true);
    setMessage("");
    try {
      const result = await beginPhoneVerification({ phoneE164 });
      if (result.ok) {
        setCodeSent(true);
        setMessage("We sent a verification code. Enter it below to continue.");
      } else setMessage(result.error);
    } catch {
      setMessage("We couldn't send a code. Check the number and try again.");
    } finally {
      setPending(false);
    }
  }

  async function saveConsent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const result = await confirmPracticeCalls({
        phoneE164,
        code,
        consentTextVersion: PRACTICE_CALL_CONSENT_VERSION,
        accepted,
        daysOfWeek,
        windowStartMinute: windowStartHour * 60,
        windowEndMinute: windowEndHour * 60,
        timezone,
        maxPerWeek,
      });
      if (result.ok) {
        setActive(true);
        setMessage("Your verified consent and schedule are saved.");
        setPhoneE164("");
        setCode("");
      } else setMessage(result.error);
    } catch {
      setMessage("We couldn't save your consent. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function revoke() {
    setPending(true);
    setMessage("");
    try {
      const result = await revokePracticeCalls();
      if (result.ok) {
        setActive(false);
        setAccepted(false);
        setCodeSent(false);
        setPhoneE164("");
        setCode("");
        setMessage("Consent was removed and scheduled calls were canceled.");
      } else setMessage(result.error);
    } catch {
      setMessage("We couldn't remove consent. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="settings-panel practice-calls-panel" aria-labelledby="practice-calls-title">
      <h2 id="practice-calls-title">Scheduled Practice Calls</h2>
      {active ? (
        <>
          <p>Your verified schedule is active. The phone number is encrypted and is not shown here.</p>
          <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => void revoke()}>
            {pending ? "Updating…" : "Revoke consent and cancel calls"}
          </Button>
        </>
      ) : !enabled ? (
        <p>Scheduled calls are off while the adult review and release setup are pending. You can still practice in voice or text mode here.</p>
      ) : (
        <form className="settings-form" onSubmit={(event) => void saveConsent(event)}>
          <p>{PRACTICE_CALL_CONSENT_TEXT}</p>
          <label htmlFor="practice-phone">Your phone number, with country code</label>
          <input id="practice-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+14155552671" value={phoneE164} onChange={(event) => setPhoneE164(event.currentTarget.value)} required />
          {!codeSent ? (
            <Button type="button" size="lg" disabled={pending || phoneE164.trim().length < 9} onClick={() => void sendCode()}>
              {pending ? "Sending code…" : "Verify my phone"}
            </Button>
          ) : (
            <>
              <label htmlFor="practice-code">Verification code</label>
              <input id="practice-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,10}" value={code} onChange={(event) => setCode(event.currentTarget.value)} required />
              <fieldset className="practice-days">
                <legend>Choose practice days</legend>
                {DAYS.map((day, index) => (
                  <label className="settings-check" key={day}>
                    <input type="checkbox" checked={daysOfWeek.includes(index)} onChange={() => toggleDay(index)} /> {day}
                  </label>
                ))}
              </fieldset>
              <label htmlFor="practice-start">Earliest call time</label>
              <select id="practice-start" value={windowStartHour} onChange={(event) => {
                const start = Number(event.currentTarget.value);
                setWindowStartHour(start);
                if (windowEndHour <= start) setWindowEndHour(Math.min(21, start + 1));
              }}>
                {Array.from({ length: 13 }, (_, index) => index + 8).map((hour) => <option key={hour} value={hour}>{hour % 12 || 12}:00 {hour < 12 ? "a.m." : "p.m."}</option>)}
              </select>
              <label htmlFor="practice-end">Latest call time</label>
              <select id="practice-end" value={windowEndHour} onChange={(event) => setWindowEndHour(Number(event.currentTarget.value))}>
                {Array.from({ length: 21 - windowStartHour }, (_, index) => index + windowStartHour + 1).map((hour) => <option key={hour} value={hour}>{hour % 12 || 12}:00 {hour < 12 ? "a.m." : "p.m."}</option>)}
              </select>
              <label htmlFor="practice-frequency">Maximum calls per week</label>
              <select id="practice-frequency" value={maxPerWeek} onChange={(event) => setMaxPerWeek(Number(event.currentTarget.value) as 1 | 2 | 3)}>
                <option value={1}>1 call</option><option value={2}>2 calls</option><option value={3}>3 calls</option>
              </select>
              <p className="settings-help">Times use {timezone}. Calls are never scheduled before 8:00 a.m. or after 9:00 p.m. You can change or revoke this in Settings. Provider message and call charges may apply after release.</p>
              <label className="settings-check"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.currentTarget.checked)} required /> I have read this and request these practice calls.</label>
              <Button type="submit" size="lg" disabled={pending || !accepted || daysOfWeek.length === 0 || code.length < 4}>
                {pending ? "Saving consent…" : "Confirm consent and schedule"}
              </Button>
            </>
          )}
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
