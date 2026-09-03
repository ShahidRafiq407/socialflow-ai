"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Database,
  Info,
  SlidersHorizontal,
  User,
  Warehouse,
  X,
} from "lucide-react";
import { isSettingsView, type SettingsData, type SettingsToast, type SettingsView } from "./types";
import { ProfileCard } from "./ProfileCard";
import { WorkspaceCard } from "./WorkspaceCard";
import { PreferencesCard } from "./PreferencesCard";
import { BillingCard } from "./BillingCard";
import { DataPrivacyCard } from "./DataPrivacyCard";
import { DangerZoneCard } from "./DangerZoneCard";

/**
 * Settings shell — a sticky section rail on the left (a horizontal scrollable
 * tab row on mobile) and one section at a time on the right.
 *
 * Deep links (`/dashboard/settings?view=billing`) open straight on a section;
 * the param is then consumed so a later refresh does not drag the user back to
 * a section they have already left — the same behaviour as the goals shell.
 */

const SECTIONS: { key: SettingsView; label: string; icon: React.ReactNode }[] = [
  { key: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { key: "workspace", label: "Workspace", icon: <Warehouse className="h-4 w-4" /> },
  { key: "preferences", label: "Preferences", icon: <SlidersHorizontal className="h-4 w-4" /> },
  { key: "billing", label: "Billing & Plan", icon: <CreditCard className="h-4 w-4" /> },
  { key: "data", label: "Data & Privacy", icon: <Database className="h-4 w-4" /> },
  { key: "danger", label: "Danger Zone", icon: <AlertTriangle className="h-4 w-4" /> },
];

export function SettingsShell({ data }: { data: SettingsData }) {
  const [view, setView] = useState<SettingsView>("profile");
  const [toasts, setToasts] = useState<SettingsToast[]>([]);
  const counter = useRef(0);

  const pushToast = (tone: SettingsToast["tone"], text: string) => {
    const id = `s${++counter.current}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5500);
  };

  // A ?view= link opens straight on that section, then the param is consumed.
  // Reading the URL after mount (not in state initializers) keeps the server
  // and client renders identical, so nothing hydrates wrong.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = (params.get("view") || "").trim().toLowerCase();
    if (!raw) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL (external system) into view state
    if (isSettingsView(raw)) setView(raw);

    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.history.replaceState({}, "", url.pathname + (url.search || ""));
  }, []);

  const goTo = (next: SettingsView) => {
    setView(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <header className="border-b border-slate-200 dark:border-slate-800 pb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your profile, workspace, preferences, plan and data — all in one place.
        </p>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── Section rail ── */}
        <nav
          aria-label="Settings sections"
          className="w-full lg:w-56 shrink-0 lg:sticky lg:top-20"
        >
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            {SECTIONS.map((section) => {
              const active = view === section.key;
              const danger = section.key === "danger";
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => goTo(section.key)}
                  aria-current={active ? "true" : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-3 h-10 text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? danger
                        ? "bg-destructive/10 text-destructive border border-destructive/30"
                        : "bg-primary text-primary-foreground"
                      : danger
                        ? "text-destructive/80 hover:bg-destructive/5 border border-transparent hover:border-destructive/20"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent"
                  }`}
                >
                  <span
                    className={
                      active
                        ? danger
                          ? "text-destructive"
                          : "text-primary-foreground"
                        : danger
                          ? "text-destructive/70"
                          : "text-secondary"
                    }
                  >
                    {section.icon}
                  </span>
                  {section.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── Section content ── */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {view === "profile" && <ProfileCard onToast={pushToast} />}
          {view === "workspace" && <WorkspaceCard data={data} onToast={pushToast} />}
          {view === "preferences" && <PreferencesCard data={data} />}
          {view === "billing" && <BillingCard data={data} />}
          {view === "data" && <DataPrivacyCard data={data} onToast={pushToast} />}
          {view === "danger" && <DangerZoneCard data={data} onToast={pushToast} />}
        </div>
      </div>

      {/* ── Toasts ── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))]">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur bg-card/95 ${
                t.tone === "error"
                  ? "border-destructive/40"
                  : t.tone === "success"
                    ? "border-primary/40"
                    : "border-secondary/40"
              }`}
            >
              {t.tone === "error" ? (
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              ) : t.tone === "success" ? (
                <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-secondary mt-0.5 shrink-0" />
              )}
              <p className="text-xs leading-relaxed text-foreground flex-1">{t.text}</p>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
