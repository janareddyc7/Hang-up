"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ConversationProvider,
  useConversationControls,
  useConversationInput,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import { Mic, MicOff, MessageSquareText, Phone, X } from "lucide-react";
import { attachConversation, finishDrill, localTextTurn, startDrill } from "../../../app/actions/drills";
import { Button } from "@/components/ui/button";
import type { Difficulty, PracticeWallet } from "@/lib/engine/schema";
import type { PilotPhase } from "@/lib/pilot/protocol";

type Mode = "judge" | "sparring" | "assigned" | "group";
type Caption = { id: number; speaker: "caller" | "you"; text: string };

export function CallExperience(props: {
  scenario: string;
  callerName: string;
  callerIdDisplay: string;
  difficulty: Difficulty;
  mode: Mode;
  initialTextOnly: boolean;
  initialOffline: boolean;
  assignmentId?: string;
  groupSessionId?: string;
  groupJoinCode?: string;
  speechRate: number;
  pilotPhase?: PilotPhase;
}) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [wallet, setWallet] = useState<PracticeWallet | null>(null);
  const [unread, setUnread] = useState(true);
  const [answered, setAnswered] = useState(false);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [textOnly, setTextOnly] = useState(props.initialTextOnly || props.initialOffline);
  const [textFallback, setTextFallback] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [stopped, setStopped] = useState(false);
  const controls = useConversationControls();
  const status = useConversationStatus();
  const mode = useConversationMode();
  const input = useConversationInput();
  const router = useRouter();
  const finishedDrills = useRef(new Set<string>());
  const finishPromises = useRef(new Map<string, Promise<void>>());
  const captionId = useRef(0);
  const startedAt = useRef<number | null>(null);
  const voiceFallbackActive = useRef(false);
  const starting = useRef(false);
  const sendingReply = useRef(false);
  const ending = useRef(false);
  const connectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openingLine = useRef("");

  const clearConnectionTimer = useCallback(() => {
    if (connectionTimer.current) clearTimeout(connectionTimer.current);
    connectionTimer.current = null;
  }, []);

  useEffect(() => () => {
    ending.current = true;
    clearConnectionTimer();
  }, [clearConnectionTimer]);

  const addCaption = useCallback((speaker: Caption["speaker"], text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setCaptions((current) => {
      const last = current.at(-1);
      if (last?.speaker === speaker && last.text === clean) return current;
      return [...current, { id: ++captionId.current, speaker, text: clean }].slice(-2);
    });
  }, []);

  const addFallbackOpening = useCallback((text: string) => {
    setCaptions((current) => current.length > 0
      ? current
      : [{ id: ++captionId.current, speaker: "caller", text }]);
  }, []);

  const goToReplay = useCallback((id = drillId): Promise<void> => {
    if (!id) return Promise.resolve();
    const pending = finishPromises.current.get(id);
    if (pending) return pending;
    if (finishedDrills.current.has(id)) return Promise.resolve();

    const finishAndNavigate = (async () => {
      ending.current = true;
      setStopped(true);
      clearConnectionTimer();
      setFinishing(true);
      setError("");
      try {
        const result = await finishDrill({ drillId: id });
        if (!result.ok) throw new Error(result.error);
        finishedDrills.current.add(id);
        router.push(`/replay/${id}`);
      } catch {
        setError("Your call has stopped. The replay could not be saved yet. Check your connection, then choose Retry replay.");
      } finally {
        finishPromises.current.delete(id);
        setFinishing(false);
      }
    })();
    finishPromises.current.set(id, finishAndNavigate);
    return finishAndNavigate;
  }, [clearConnectionTimer, drillId, router]);

  useEffect(() => {
    if (!answered || !startedAt.current) return;
    const tick = () => setElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [answered]);

  const continueInText = useCallback((firstMessage = openingLine.current) => {
    if (ending.current || voiceFallbackActive.current) return;
    voiceFallbackActive.current = true;
    clearConnectionTimer();
    controls.endSession();
    setTextFallback(true);
    setTextOnly(true);
    setBusy(false);
    addFallbackOpening(firstMessage);
    setError("Voice has stopped. Continue this practice in text, or hang up to see your replay.");
  }, [addFallbackOpening, clearConnectionTimer, controls]);

  useEffect(() => {
    if (answered && elapsed >= 15 * 60 && !ending.current) {
      controls.endSession();
      void goToReplay();
    }
  }, [answered, controls, elapsed, goToReplay]);

  const begin = async (asText: boolean) => {
    if (starting.current || answered) return;
    starting.current = true;
    ending.current = false;
    setError("");
    setBusy(true);
    let startedDrill: { drillId: string; firstMessage: string } | null = null;
    try {
      if (!asText && !props.initialOffline) {
        setError("Allow microphone access so the caller can hear your practice reply. No real call is placed.");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      setError("");
      // Text practice uses our server directly and never starts a provider session.
      const offline = asText || props.initialOffline;
      const result = await startDrill({
        personaId: props.scenario,
        difficulty: props.difficulty,
        mode: props.mode,
        textOnly: asText,
        offline,
        ...(props.pilotPhase ? { pilotPhase: props.pilotPhase } : {}),
        ...(props.mode === "assigned" && props.assignmentId ? { assignmentId: props.assignmentId } : {}),
        ...(props.mode === "group" && props.groupSessionId ? { groupSessionId: props.groupSessionId } : {}),
      });
      if (!result.ok) throw new Error(result.error);

      startedDrill = { drillId: result.drillId, firstMessage: result.firstMessage };
      openingLine.current = result.firstMessage;
      setDrillId(result.drillId);
      setWallet(result.wallet);
      setAnswered(true);
      setTextOnly(asText || result.offlineFallback);
      setTextFallback(result.offlineFallback);
      startedAt.current = Date.now();

      if (!result.connection) {
        addCaption("caller", result.firstMessage);
        setError(props.initialOffline || asText
          ? "Text practice is ready. No microphone or voice session is used."
          : "Voice is unavailable right now. Your practice is ready to continue in text.");
        return;
      }

      const connection = result.connection;
      voiceFallbackActive.current = false;
      controls.startSession({
        ...("conversationToken" in connection
          ? { conversationToken: connection.conversationToken }
          : { signedUrl: connection.signedUrl }),
        userId: result.sessionUserId ?? undefined,
        customLlmExtraBody: { drill_id: result.drillId },
        dynamicVariables: { drill_id: result.drillId, first_message: result.firstMessage },
        textOnly: asText,
        overrides: {
          tts: { voiceId: result.voiceId, speed: props.speechRate },
        },
        onConnect: ({ conversationId: id }) => {
          clearConnectionTimer();
          if (ending.current || voiceFallbackActive.current) { controls.endSession(); return; }
          void attachConversation({ drillId: result.drillId, conversationId: id }).catch(() => undefined);
        },
        onMessage: (message) => {
          if (!ending.current && !voiceFallbackActive.current) addCaption(message.source === "user" ? "you" : "caller", message.message);
        },
        onDisconnect: (details) => {
          clearConnectionTimer();
          if (voiceFallbackActive.current || ending.current) return;
          if (details.reason === "error") continueInText(result.firstMessage);
          else void goToReplay(result.drillId);
        },
        onError: () => {
          continueInText(result.firstMessage);
        },
      });
      // This SDK's startSession returns void; startup rejection arrives through onError.
      if (!voiceFallbackActive.current && !ending.current) {
        connectionTimer.current = setTimeout(() => continueInText(result.firstMessage), 15_000);
      }
    } catch (cause) {
      if (startedDrill) {
        continueInText(startedDrill.firstMessage);
      } else {
        const message = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "NotFoundError")
          ? "Your microphone is unavailable. Choose Continue with text to practice without it."
          : cause instanceof Error ? cause.message : "The practice call could not start.";
        setError(message);
        if (!startedDrill) setAnswered(false);
      }
    } finally {
      setBusy(false);
      starting.current = false;
    }
  };

  const hangUp = async () => {
    ending.current = true;
    clearConnectionTimer();
    controls.endSession();
    await goToReplay();
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !drillId || sendingReply.current || ending.current) return;
    sendingReply.current = true;
    setError("");
    setSending(true);
    try {
      if (textFallback) {
        const result = await localTextTurn({ drillId, text });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setReply("");
        addCaption("you", text);
        if (result.result.kind === "speak") addCaption("caller", result.result.text);
        else if (result.result.line) addCaption("caller", result.result.line);
        if (result.result.kind === "end") await goToReplay();
      } else {
        if (status.status !== "connected") throw new Error("disconnected");
        controls.sendUserMessage(text);
        setReply("");
        addCaption("you", text);
      }
    } catch {
      setError("Your reply could not be sent. It is still safe to hang up and review this practice.");
    } finally {
      setSending(false);
      sendingReply.current = false;
    }
  };

  return (
    <main id="main-content" className="call-surface call-screen" aria-label="Practice call">
      {!answered ? (
        <section className="incoming-call">
          <p className="eyebrow">Incoming practice call</p>
          <div className="caller-avatar ringing" aria-hidden="true"><Phone size={42} /></div>
          <h1>{props.callerName}</h1>
          <p>{props.callerIdDisplay}</p>
          <p className="call-disclosure">This is a practice conversation. No real call is being made.</p>
          {props.initialOffline && <p className="call-offline-note">Offline text mode · no microphone or ElevenLabs voice session</p>}
          {props.groupJoinCode && <GroupRoomBanner code={props.groupJoinCode} />}
          <WalletPanel wallet={wallet} unread={unread} setUnread={setUnread} />
          {error && <p className="call-error" role="status">{error}</p>}
          <div className="call-actions">
            <Button variant="call-hangup" size="lg" disabled={busy} aria-label="Decline practice call" onClick={() => router.push("/")}><X /></Button>
            <Button variant="call-answer" size="lg" disabled={busy} aria-label="Answer practice call" onClick={() => void begin(textOnly)}><Phone /></Button>
          </div>
          {error && !props.initialOffline && <Button variant="outline" disabled={busy} onClick={() => void begin(true)}>Continue with text</Button>}
          {!props.initialOffline && <Button variant="link" disabled={busy} onClick={() => setTextOnly((value) => !value)} aria-pressed={textOnly}>{textOnly ? "Text practice selected" : "Use text instead"}</Button>}
        </section>
      ) : (
        <section className="in-call">
          <header className="call-header">
            <p>{props.callerName}</p>
            <p>{props.callerIdDisplay} · {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</p>
            {props.groupJoinCode && <GroupRoomBanner code={props.groupJoinCode} />}
          </header>
          {!textFallback && <div className="call-orb" aria-hidden="true"><div className={mode.isSpeaking ? "orb-pulse speaking" : "orb-pulse"} /></div>}
          <p className="call-status" role="status">{stopped ? (finishing ? "Saving your replay…" : "Call stopped") : textFallback ? "Text practice" : status.status === "connecting" ? "Connecting…" : status.status === "connected" ? (mode.isSpeaking ? "Caller speaking" : "Your turn") : "Starting practice…"}</p>
          <div className="captions" aria-live="polite" aria-relevant="additions text">{captions.map((item) => <p key={item.id}><strong>{item.speaker === "caller" ? props.callerName : "You"}:</strong> {item.text}</p>)}</div>
          <WalletPanel wallet={wallet} unread={unread} setUnread={setUnread} />
          {(textOnly || textFallback) && (
            <form className="text-reply" onSubmit={(event) => { event.preventDefault(); void sendReply(); }}>
              <label htmlFor="reply">Your reply</label>
              <textarea id="reply" value={reply} onChange={(event) => setReply(event.target.value)} disabled={sending || stopped} maxLength={4000} autoComplete="off" />
              <Button type="submit" disabled={sending || stopped || reply.trim().length === 0}>{sending ? "Sending…" : "Send reply"}</Button>
            </form>
          )}
          {error && <p className="call-error" role="status">{error}</p>}
          <div className="call-controls">
            {!textFallback && !stopped && <Button variant="outline" aria-label={input.isMuted ? "Unmute microphone" : "Mute microphone"} disabled={status.status !== "connected"} onClick={() => input.setMuted(!input.isMuted)}>{input.isMuted ? <MicOff /> : <Mic />}</Button>}
            {!textFallback && !stopped && <Button variant="outline" onClick={() => continueInText()}><MessageSquareText /> Continue with text</Button>}
            {stopped ? <Button disabled={finishing} onClick={() => void goToReplay()}>{finishing ? "Saving replay…" : "Retry replay"}</Button> : <Button variant="call-hangup" size="lg" aria-label="Hang up" disabled={sending} onClick={() => void hangUp()}><Phone /></Button>}
          </div>
        </section>
      )}
    </main>
  );
}

function GroupRoomBanner({ code }: { code: string }) {
  return <p className="group-call-code">Room code <strong>{code}</strong> · <a href={`/group/${code}`} target="_blank" rel="noopener noreferrer">Open participant view</a></p>;
}

function WalletPanel({ wallet, unread, setUnread }: { wallet: PracticeWallet | null; unread: boolean; setUnread: (value: boolean) => void }) {
  if (!wallet) return null;
  return (
    <details className="practice-wallet">
      <summary>Practice wallet · fictional details</summary>
      <p>{wallet.fullName} · {wallet.bankName}</p>
      <p>{wallet.city} · account ending {wallet.accountNumber.slice(-4)}</p>
      <button className="wallet-message" type="button" aria-expanded={!unread} onClick={() => setUnread(false)}>
        <MessageSquareText size={18} /> New text message {unread && <span className="unread-dot" aria-label="Unread" />}
      </button>
      {!unread && <p>Your one-time practice code is <strong>{wallet.oneTimeCode}</strong>.</p>}
    </details>
  );
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [muted, setMuted] = useState(false);
  return <ConversationProvider isMuted={muted} onMutedChange={setMuted}>{children}</ConversationProvider>;
}
