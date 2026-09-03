"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2, Sparkles, Sun, Moon, Monitor } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { applyThemePreference, useThemePreference } from "@/components/marketing/theme-toggle";
import type { ChatSettingsSummary, SettingsData } from "./types";

/**
 * Preferences section — appearance and the AI assistant's defaults.
 *
 * Appearance writes straight to localStorage and re-applies the theme (same
 * store the header toggle uses). AI defaults are patched to /api/chat/settings
 * the moment they change, with a subtle saved indicator — there is no separate
 * "save" step to forget.
 */

type ThemeChoice = "dark" | "light" | "system";

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: React.ReactNode }[] = [
  { value: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
  { value: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
  { value: "system", label: "System", icon: <Monitor className="h-3.5 w-3.5" /> },
];

const LANGUAGE_OPTIONS: { value: ChatSettingsSummary["replyLanguage"]; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "english", label: "English" },
  { value: "roman-urdu", label: "Roman Urdu" },
  { value: "urdu", label: "Urdu" },
];

const STYLE_OPTIONS: { value: ChatSettingsSummary["replyStyle"]; label: string }[] = [
  { value: "executive", label: "Executive" },
  { value: "detailed", label: "Detailed" },
  { value: "concise", label: "Concise" },
];

const AUTONOMY_OPTIONS: { value: ChatSettingsSummary["autonomy"]; label: string }[] = [
  { value: "auto", label: "Act automatically" },
  { value: "confirm", label: "Ask me first" },
];

function Segmented<T extends string>({
  value,
  options,
  onChange,
  name,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  name: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="inline-flex flex-wrap gap-1 p-1 rounded-xl border border-border bg-muted/40"
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        checked ? "bg-primary border-primary" : "bg-muted border-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[1.4rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
        state === "error" ? "text-destructive" : "text-primary"
      }`}
      role="status"
    >
      {state === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {state === "saved" && <Check className="h-3.5 w-3.5" />}
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Could not save — check your connection"}
    </span>
  );
}

export function PreferencesCard({ data }: { data: SettingsData }) {
  // ── Appearance ──
  // Hydration-safe: the server snapshot is "dark" (the init script default),
  // then the store syncs with the real stored preference after mount.
  const theme = useThemePreference();

  const chooseTheme = (next: ThemeChoice) => {
    applyThemePreference(next);
  };

  // ── AI defaults ──
  const [ai, setAi] = useState<ChatSettingsSummary>(data.chatSettings);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const patchSettings = async (patch: Partial<ChatSettingsSummary>) => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/chat/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: data.workspace.id, settings: patch }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
    }
  };

  const updateAi = (patch: Partial<ChatSettingsSummary>) => {
    setAi((prev) => ({ ...prev, ...patch }));
    void patchSettings(patch);
  };

  const updateInstructions = (value: string) => {
    setAi((prev) => ({ ...prev, customInstructions: value }));
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void patchSettings({ customInstructions: value });
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Dark is the default. System follows your device&apos;s colour scheme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="inline-flex flex-wrap gap-1 p-1 rounded-xl border border-border bg-muted/40"
          >
            {THEME_OPTIONS.map((option) => {
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => chooseTheme(option.value)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-background hover:text-foreground"
                  }`}
                >
                  {option.icon}
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Applies instantly across the whole app, including the marketing pages.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-secondary" />
            AI assistant defaults
          </CardTitle>
          <CardDescription>
            How your AI assistant talks and acts in chat. Changes save automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Reply language</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Auto detects the language you write in and answers in it.
              </p>
            </div>
            <Segmented
              name="Reply language"
              value={ai.replyLanguage}
              options={LANGUAGE_OPTIONS}
              onChange={(v) => updateAi({ replyLanguage: v })}
            />
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Reply style</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Executive leads with the answer, detailed explains the reasoning.
              </p>
            </div>
            <Segmented
              name="Reply style"
              value={ai.replyStyle}
              options={STYLE_OPTIONS}
              onChange={(v) => updateAi({ replyStyle: v })}
            />
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Autonomy</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Whether publishing and deleting actions run immediately or wait for your OK.
              </p>
            </div>
            <Segmented
              name="Autonomy"
              value={ai.autonomy}
              options={AUTONOMY_OPTIONS}
              onChange={(v) => updateAi({ autonomy: v })}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Memory</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Let the assistant remember facts about your business across chats.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Toggle
                checked={ai.memoryEnabled}
                onChange={(v) => updateAi({ memoryEnabled: v })}
                label="Memory enabled"
              />
              <span className="text-xs text-muted-foreground w-14">
                {ai.memoryEnabled ? "On" : "Off"}
              </span>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Custom instructions</p>
              <SaveIndicator state={saveState} />
            </div>
            <Textarea
              value={ai.customInstructions}
              onChange={(e) => updateInstructions(e.target.value)}
              onBlur={() => {
                if (debounceTimer.current) clearTimeout(debounceTimer.current);
                void patchSettings({ customInstructions: ai.customInstructions });
              }}
              placeholder="e.g. Always mention our free audit offer. Never use hashtags on LinkedIn."
              maxLength={4000}
              className="min-h-24"
            />
            <p className="text-[11px] text-muted-foreground">
              Always-on guidance for the assistant, applied to every chat. Saves a second after you
              stop typing.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
