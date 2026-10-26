"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { ThemeProvider, THEMES, useTheme, type Theme } from "@/components/theme-provider";
import { authClient } from "@/lib/auth/client";
import { savePreferences } from "../../app/actions/preferences";

const TEXT_SIZES = [1, 1.25, 1.5] as const;
type TextSize = (typeof TEXT_SIZES)[number];
const TEXT_SIZE_KEY = "hang-up-text-size";
const textSizeListeners = new Set<() => void>();
let sessionTextSize: TextSize | null = null;

function isTextSize(value: number): value is TextSize {
  return TEXT_SIZES.some((size) => size === value);
}

function getTextSizeSnapshot(): TextSize {
  try {
    const stored = Number(window.localStorage.getItem(TEXT_SIZE_KEY));
    if (isTextSize(stored)) return stored;
  } catch {
    // Keep the session value or default if browser storage is unavailable.
  }
  return sessionTextSize ?? 1;
}

function subscribeToTextSize(listener: () => void) {
  textSizeListeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === TEXT_SIZE_KEY && event.newValue === null) sessionTextSize = null;
    listener();
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    textSizeListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function chooseTextSize(size: TextSize) {
  sessionTextSize = size;
  try {
    window.localStorage.setItem(TEXT_SIZE_KEY, String(size));
  } catch {
    // Keep the selection for this session when browser storage is unavailable.
  }
  for (const listener of textSizeListeners) listener();
}

export function applyTextScale(size: TextSize) {
  chooseTextSize(size);
  document.documentElement.style.setProperty("--text-scale", String(size));
}

function persistIfSignedIn(signedIn: boolean, preference: Parameters<typeof savePreferences>[0]) {
  if (signedIn) void savePreferences(preference).catch(() => undefined);
}

function ThemeControl({ signedIn }: { signedIn: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <label className="control-label">
      <span>Theme</span>
      <select
        className="theme-select"
        aria-label="Color theme"
        value={theme}
        onChange={(event) => {
          const next = event.currentTarget.value as Theme;
          setTheme(next);
          persistIfSignedIn(signedIn, { highContrast: next === "high-contrast" });
        }}
      >
        {THEMES.map((option) => (
          <option key={option} value={option}>
            {option === "high-contrast" ? "High contrast" : option[0]?.toUpperCase() + option.slice(1)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextSizeControl({ signedIn }: { signedIn: boolean }) {
  const textSize = useSyncExternalStore(
    subscribeToTextSize,
    getTextSizeSnapshot,
    () => 1,
  );

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(textSize));
  }, [textSize]);

  return (
    <fieldset className="control-label text-size-control">
      <legend>Text size</legend>
      {TEXT_SIZES.map((size) => (
        <Button
          key={size}
          type="button"
          variant={textSize === size ? "default" : "outline"}
          size="sm"
          className="text-size-button"
          aria-label={`Use ${size}× text size`}
          aria-pressed={textSize === size}
          onClick={() => {
            chooseTextSize(size);
            persistIfSignedIn(signedIn, { textScale: size });
          }}
        >
          {size}×
        </Button>
      ))}
    </fieldset>
  );
}

function AppHeader({ signedIn }: { signedIn: boolean }) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutError("We couldn't sign you out. Please try again.");
        setSigningOut(false);
        return;
      }
      // A full navigation clears personalized RSC/router caches after the cookie is removed.
      window.location.replace(new URL("/", window.location.origin).href);
    } catch {
      setSignOutError("We couldn't sign you out. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <header className="app-header">
      <Link className="brand" href="/" aria-label="Hang Up home">
        Hang Up
      </Link>
      {signedIn ? (
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/practice">Practice</Link>
          <Link href="/circle">Family Circle</Link>
          <Link href="/card">Callback card</Link>
          <Link href="/settings">Settings</Link>
          <Button type="button" variant="outline" size="sm" disabled={signingOut} onClick={() => void signOut()}>
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
          {signOutError && <span className="sign-out-error" role="alert">{signOutError}</span>}
        </nav>
      ) : <Link className="sign-in-nav" href="/sign-in">Sign in</Link>}
      <div className="header-controls">
        <ThemeControl signedIn={signedIn} />
        <TextSizeControl signedIn={signedIn} />
      </div>
    </header>
  );
}

type InitialPreferences = { textScale: number; highContrast: boolean } | null;

function PreferenceInitializer({ preferences }: { preferences: InitialPreferences }) {
  const { theme, setTheme } = useTheme();
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!preferences) return;
    const key = `${preferences.textScale}:${preferences.highContrast}`;
    if (applied.current === key) return;
    applied.current = key;
    const size = isTextSize(preferences.textScale) ? preferences.textScale : 1;
    applyTextScale(size);
    if (preferences.highContrast && theme !== "high-contrast") setTheme("high-contrast");
    if (!preferences.highContrast && theme === "high-contrast") setTheme("light");
  }, [preferences, setTheme, theme]);
  return null;
}

export function AppShell({ children, initialPreferences = null, signedIn = false }: { children: React.ReactNode; initialPreferences?: InitialPreferences; signedIn?: boolean }) {
  return (
    <ThemeProvider>
      <PreferenceInitializer preferences={initialPreferences} />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="app-frame">
        <AppHeader signedIn={signedIn} />
        {children}
        <footer className="site-footer">
          Hang Up is a practice tool. No real calls are made in this preview.
        </footer>
      </div>
    </ThemeProvider>
  );
}
