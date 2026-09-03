"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

/**
 * Theme preference with three states: explicit dark, explicit light, or follow
 * the OS ("system"). The preference lives in localStorage; the resolved theme
 * is applied as a `.dark` / `.light` class on <html> before first paint by
 * `themeInitScript` below. Older stored values ("dark" / "light") keep working.
 */
type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "postloom-theme";

function readStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "system" ? value : "dark";
  } catch {
    return "dark";
  }
}

/** "system" resolves through the OS preference; anything else is itself. */
function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const dark = resolveTheme(theme) === "dark";
  document.documentElement.classList.toggle("light", !dark);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(callback: () => void) {
  window.addEventListener("postloom-theme-change", callback);
  // While following the OS, a preference change must re-apply immediately.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (readStoredTheme() === "system") applyTheme("system");
    callback();
  };
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener("postloom-theme-change", callback);
    media.removeEventListener("change", onSystemChange);
  };
}

function getSnapshot(): Theme {
  return readStoredTheme();
}

function getServerSnapshot(): Theme {
  return "dark";
}

function setTheme(next: Theme) {
  applyTheme(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked — the class toggle still applies for this page view.
  }
  window.dispatchEvent(new Event("postloom-theme-change"));
}

/** Small helper so the Settings page can set the preference directly. */
export function applyThemePreference(next: Theme) {
  setTheme(next);
}

const TOGGLE_ORDER: Record<Theme, Theme> = { dark: "light", light: "system", system: "dark" };

/**
 * The stored theme preference as reactive state — hydration-safe (the server
 * snapshot is "dark", same as the no-flash init script default) and updated by
 * both the toggle and the OS preference listener above.
 */
export function useThemePreference(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ThemeToggle() {
  const theme = useThemePreference();
  const toggle = useCallback(() => {
    setTheme(TOGGLE_ORDER[theme]);
  }, [theme]);

  const label =
    theme === "dark"
      ? "Switch to light mode"
      : theme === "light"
        ? "Switch to system theme"
        : "Switch to dark mode";

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all duration-300"
    >
      {theme === "dark" ? (
        <Sun className="w-4.5 h-4.5" />
      ) : theme === "light" ? (
        <Moon className="w-4.5 h-4.5" />
      ) : (
        <Monitor className="w-4.5 h-4.5" />
      )}
    </button>
  );
}

/**
 * Inline script to apply the saved theme before paint (no flash). "system" is
 * resolved through the OS dark-mode preference; the default stays dark.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("postloom-theme")||"dark";var light=t==="light"||(t==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches===false);var d=document.documentElement;d.classList.toggle("light",light);d.classList.toggle("dark",!light);}catch(e){}})();`;
