"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";

export const THEMES = ["light", "dark", "high-contrast"] as const;
export type Theme = (typeof THEMES)[number];

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = "hang-up-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);
const listeners = new Set<() => void>();
let sessionTheme: Theme | null = null;

function isTheme(value: string | null): value is Theme {
  return THEMES.some((theme) => theme === value);
}

function readStoredTheme() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getThemeSnapshot(): Theme {
  const stored = readStoredTheme();
  if (isTheme(stored)) return stored;
  if (sessionTheme) return sessionTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

function notifyThemeChange() {
  for (const listener of listeners) listener();
}

function subscribeToTheme(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue === null) sessionTheme = null;
    listener();
  };
  media.addEventListener("change", listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  if (theme === "high-contrast") {
    root.setAttribute("data-contrast", "high");
  } else {
    root.removeAttribute("data-contrast");
  }
}

function saveTheme(theme: Theme) {
  sessionTheme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Keep the selection for this session when browser storage is unavailable.
  }
  applyTheme(theme);
  notifyThemeChange();
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  useEffect(() => applyTheme(theme), [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: saveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return value;
}
