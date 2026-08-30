"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function subscribe(callback: () => void) {
  window.addEventListener("postloom-theme-change", callback);
  return () => window.removeEventListener("postloom-theme-change", callback);
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

function setTheme(next: Theme) {
  document.documentElement.classList.toggle("light", next === "light");
  document.documentElement.classList.toggle("dark", next === "dark");
  localStorage.setItem("postloom-theme", next);
  window.dispatchEvent(new Event("postloom-theme-change"));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = useCallback(() => {
    setTheme(getSnapshot() === "dark" ? "light" : "dark");
  }, []);

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark / light mode"
      className="w-10 h-10 rounded-full border border-white/10 mkt-surface flex items-center justify-center mkt-muted hover:mkt-text hover:border-[#18713C]/50 transition-all duration-300"
    >
      {theme === "dark" ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
    </button>
  );
}

/** Inline script to apply saved theme before paint (no flash). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("postloom-theme")||"dark";var d=document.documentElement;d.classList.toggle("light",t==="light");d.classList.toggle("dark",t!=="light");}catch(e){}})();`;

