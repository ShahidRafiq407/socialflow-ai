// AI Scheduler: audience peak windows per platform (user's local timezone).
// The Schedule button uses these to place each platform's post at the time its
// audience is most active (e.g. Facebook 5:00 PM, LinkedIn 9:00 AM).
export interface BestTimeSpec {
  hour: number; // 24h local time
  minute: number;
  days: number[]; // 0 = Sunday ... 6 = Saturday
  label: string; // Human-readable slot, e.g. "5:00 PM"
  reason: string; // Audience insight shown in the UI
}

export const PLATFORM_BEST_TIMES: Record<string, BestTimeSpec> = {
  facebook: { hour: 17, minute: 0, days: [2, 3, 4, 5], label: "5:00 PM", reason: "After-work scroll peak (Tue–Fri evenings)" },
  instagram: { hour: 19, minute: 0, days: [2, 3, 4], label: "7:00 PM", reason: "Evening Reels engagement peak (Tue–Thu)" },
  tiktok: { hour: 19, minute: 30, days: [2, 3, 4], label: "7:30 PM", reason: "Prime-time short-video traffic (Tue–Thu)" },
  linkedin: { hour: 9, minute: 0, days: [2, 3, 4], label: "9:00 AM", reason: "Executive morning coffee window (Tue–Thu)" },
  x: { hour: 9, minute: 0, days: [2, 3, 4], label: "9:00 AM", reason: "Morning commute discussion peak (Tue–Thu)" },
  youtube: { hour: 15, minute: 0, days: [4, 5, 6, 0], label: "3:00 PM", reason: "Afternoon watch sessions (Thu–Sun)" },
  pinterest: { hour: 20, minute: 0, days: [5, 6, 0], label: "8:00 PM", reason: "Night inspiration browsing peak (Fri–Sun)" },
};

export function getBestTimeSpec(platformId: string): BestTimeSpec {
  return (
    PLATFORM_BEST_TIMES[platformId.toLowerCase()] || {
      hour: 10,
      minute: 0,
      days: [2, 3, 4],
      label: "10:00 AM",
      reason: "General mid-morning engagement window",
    }
  );
}

// Where a best-time plan came from — shown in the UI so the user knows
// whether the AI analyzed it fresh, served it from the Redis industry cache,
// or fell back to the built-in industry standard.
export type BestTimeSource = "ai_fresh" | "ai_cached" | "industry_standard";

export interface PlatformTimeEntry {
  spec: BestTimeSpec;
  source: BestTimeSource;
}

function formatLabel(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

// Validates/clamps raw AI output into a safe BestTimeSpec, merging over the
// static default for the platform. Any garbage from the LLM degrades gracefully.
export function normalizeAiBestTime(raw: any, platformId: string): BestTimeSpec {
  const fallback = getBestTimeSpec(platformId);
  const hour = Math.min(23, Math.max(0, Math.round(Number(raw?.hour))));
  const minute = Math.min(59, Math.max(0, Math.round(Number(raw?.minute))));
  const days = Array.isArray(raw?.days)
    ? raw.days.map((d: any) => Math.round(Number(d))).filter((d: number) => d >= 0 && d <= 6)
    : [];
  return {
    hour: Number.isFinite(hour) ? hour : fallback.hour,
    minute: Number.isFinite(minute) ? minute : fallback.minute,
    days: days.length > 0 ? Array.from(new Set(days)) : fallback.days,
    label: Number.isFinite(hour) ? formatLabel(hour, Number.isFinite(minute) ? minute : 0) : fallback.label,
    reason:
      typeof raw?.reason === "string" && raw.reason.trim().length > 5
        ? raw.reason.trim().slice(0, 160)
        : fallback.reason,
  };
}

// Next upcoming slot for an explicit spec (always at least 30 minutes out).
export function getNextBestTimeFromSpec(spec: BestTimeSpec, from: Date = new Date()): Date {
  const earliest = new Date(from.getTime() + 30 * 60 * 1000);

  for (let offset = 0; offset <= 8; offset++) {
    const candidate = new Date(earliest);
    candidate.setDate(earliest.getDate() + offset);
    candidate.setHours(spec.hour, spec.minute, 0, 0);
    if (spec.days.includes(candidate.getDay()) && candidate.getTime() >= earliest.getTime()) {
      return candidate;
    }
  }

  // Fallback: same slot tomorrow even if the weekday isn't preferred
  const fallback = new Date(earliest);
  fallback.setDate(earliest.getDate() + 1);
  fallback.setHours(spec.hour, spec.minute, 0, 0);
  return fallback;
}

// Next upcoming best-time slot for a platform (>= 30 minutes from now).
export function getNextBestTime(platformId: string, from: Date = new Date()): Date {
  return getNextBestTimeFromSpec(getBestTimeSpec(platformId), from);
}
