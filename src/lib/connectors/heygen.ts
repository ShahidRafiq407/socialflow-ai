// ============================================================================
// HEYGEN API CLIENT — server-only. Used by the Plugins connection test and
// by the AI CEO chat tools. Never import this from a client component.
//
// HeyGen v2 API reference: https://docs.heygen.com
// Auth: X-Api-Key header with a key from HeyGen Settings → API Key.
// ============================================================================

const HEYGEN_API = "https://api.heygen.com";

export interface HeyGenQuota {
  remaining: number | null;
  used: number | null;
}

export interface HeyGenAvatar {
  avatarId: string;
  name: string;
  gender: string;
  previewImageUrl: string | null;
  premium: boolean;
}

export interface HeyGenVoice {
  voiceId: string;
  name: string;
  language: string;
  gender: string;
}

export type HeyGenVideoStatus =
  | "processing"
  | "completed"
  | "failed"
  | "unknown";

interface HeyGenEnvelope {
  code?: number;
  message?: string;
  error?: { message?: string } | null;
}

interface HeyGenResponse<T> extends HeyGenEnvelope {
  data?: T;
}

async function hg<T>(
  path: string,
  apiKey: string,
  init?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  try {
    const res = await fetch(`${HEYGEN_API}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "X-Api-Key": apiKey,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers || {}),
      },
    });

    if (!res.ok) {
      let message = `HeyGen API error ${res.status}`;
      try {
        const body = (await res.json()) as HeyGenEnvelope;
        if (body?.message) message = `HeyGen API error ${res.status}: ${body.message}`;
        else if (body?.error?.message) {
          message = `HeyGen API error ${res.status}: ${body.error.message}`;
        }
      } catch {
        // keep default message
      }
      return { ok: false, error: message, status: res.status };
    }

    if (res.status === 204) return { ok: true };
    const body = (await res.json()) as HeyGenResponse<T>;

    // HeyGen wraps responses in { code, message, data } — code 100 means OK.
    if (typeof body?.code === "number" && body.code !== 100) {
      return {
        ok: false,
        error: body.message || body.error?.message || `HeyGen API error code ${body.code}`,
      };
    }

    return { ok: true, data: body?.data };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error contacting HeyGen.",
    };
  }
}

/** Verifies an API key by reading the account quota. */
export async function getHeyGenAccount(
  apiKey: string
): Promise<{ success: boolean; quota?: HeyGenQuota; error?: string }> {
  if (!apiKey?.trim()) return { success: false, error: "No API key provided." };

  const res = await hg<{ remaining_quota?: number; used_quota?: number }>(
    "/v2/user/remaining_quota",
    apiKey.trim()
  );
  if (!res.ok) {
    return {
      success: false,
      error:
        res.status === 401
          ? "HeyGen rejected the API key. Check that it is valid and active."
          : res.error || "Could not verify the API key.",
    };
  }

  return {
    success: true,
    quota: {
      remaining: res.data?.remaining_quota ?? null,
      used: res.data?.used_quota ?? null,
    },
  };
}

/** Lists the account's talking avatars (avatar_id is needed to generate). */
export async function listHeyGenAvatars(
  apiKey: string
): Promise<{ success: boolean; avatars?: HeyGenAvatar[]; error?: string }> {
  const res = await hg<{
    avatars?: Array<{
      avatar_id?: string;
      avatar_name?: string;
      gender?: string;
      preview_image_url?: string;
      premium?: boolean;
    }>;
  }>("/v2/avatars", apiKey);

  if (!res.ok) return { success: false, error: res.error };

  const avatars = (res.data?.avatars || [])
    .filter((a) => a?.avatar_id)
    .map((a) => ({
      avatarId: String(a.avatar_id),
      name: a.avatar_name || "Unnamed avatar",
      gender: a.gender || "unknown",
      previewImageUrl: a.preview_image_url ?? null,
      premium: a.premium === true,
    }));

  return { success: true, avatars };
}

/** Lists the account's voices (voice_id is needed to generate). */
export async function listHeyGenVoices(
  apiKey: string
): Promise<{ success: boolean; voices?: HeyGenVoice[]; error?: string }> {
  const res = await hg<{
    voices?: Array<{ voice_id?: string; name?: string; language?: string; gender?: string }>;
  }>("/v2/voices", apiKey);

  if (!res.ok) return { success: false, error: res.error };

  const voices = (res.data?.voices || [])
    .filter((v) => v?.voice_id)
    .map((v) => ({
      voiceId: String(v.voice_id),
      name: v.name || "Unnamed voice",
      language: v.language || "",
      gender: v.gender || "unknown",
    }));

  return { success: true, voices };
}

export type HeyGenOrientation = "9:16" | "16:9";

const DIMENSIONS: Record<HeyGenOrientation, { width: number; height: number }> = {
  "9:16": { width: 720, height: 1280 },
  "16:9": { width: 1280, height: 720 },
};

/**
 * Starts an avatar video render. Returns the HeyGen video_id — generation
 * takes minutes, so callers poll with getHeyGenVideoStatus.
 */
export async function startHeyGenVideo(
  apiKey: string,
  input: {
    avatarId: string;
    voiceId: string;
    script: string;
    orientation?: HeyGenOrientation;
    backgroundColor?: string;
    test?: boolean;
  }
): Promise<{ success: boolean; videoId?: string; error?: string }> {
  const script = (input.script || "").trim();
  if (!script) return { success: false, error: "Script text is required." };
  if (script.length > 1500) {
    return { success: false, error: "Script is too long (max 1500 characters)." };
  }
  if (!input.avatarId) return { success: false, error: "avatarId is required." };
  if (!input.voiceId) return { success: false, error: "voiceId is required." };

  const res = await hg<{ video_id?: string }>("/v2/video/generate", apiKey, {
    method: "POST",
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: input.avatarId,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: script,
            voice_id: input.voiceId,
          },
          ...(input.backgroundColor
            ? { background: { type: "color", value: input.backgroundColor } }
            : {}),
        },
      ],
      dimension: DIMENSIONS[input.orientation || "9:16"],
      ...(input.test === true ? { test: true } : {}),
    }),
  });

  if (!res.ok) return { success: false, error: res.error };
  if (!res.data?.video_id) {
    return { success: false, error: "HeyGen did not return a video id." };
  }

  return { success: true, videoId: res.data.video_id };
}

export interface HeyGenVideoInfo {
  status: HeyGenVideoStatus;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

/** Reads the render status for one video_id. */
export async function getHeyGenVideoStatus(
  apiKey: string,
  videoId: string
): Promise<{ success: boolean; info?: HeyGenVideoInfo; error?: string }> {
  if (!videoId?.trim()) return { success: false, error: "videoId is required." };

  const res = await hg<{
    status?: string;
    video_url?: string;
    thumbnail_url?: string;
    error?: { message?: string } | string | null;
  }>(`/v2/videos/${encodeURIComponent(videoId.trim())}`, apiKey);

  if (!res.ok) return { success: false, error: res.error };

  const rawStatus = (res.data?.status || "").toLowerCase();
  const status: HeyGenVideoStatus =
    rawStatus === "completed" || rawStatus === "complete"
      ? "completed"
      : rawStatus === "failed" || rawStatus === "fail" || rawStatus === "error"
      ? "failed"
      : rawStatus === "processing" || rawStatus === "pending" || rawStatus === "generating"
      ? "processing"
      : "unknown";

  const errMessage =
    typeof res.data?.error === "string"
      ? res.data.error
      : res.data?.error?.message || undefined;

  return {
    success: true,
    info: {
      status,
      videoUrl: res.data?.video_url || undefined,
      thumbnailUrl: res.data?.thumbnail_url || undefined,
      error: status === "failed" ? errMessage || "HeyGen reported the render as failed." : undefined,
    },
  };
}

/**
 * Picks a sensible avatar from the account list: keyword match on the name
 * (e.g. "sarah", "professional", "male"), premium preferred, English default.
 */
export function pickAvatar(
  avatars: HeyGenAvatar[],
  keyword?: string
): HeyGenAvatar | null {
  if (avatars.length === 0) return null;

  const kw = (keyword || "").trim().toLowerCase();
  if (kw) {
    const match = avatars.find((a) => a.name.toLowerCase().includes(kw));
    if (match) return match;
  }

  return avatars.find((a) => a.premium) || avatars[0];
}

/**
 * Picks a sensible voice: keyword match (e.g. "female", "male", "en-GB"),
 * then first English voice, then any voice. Gender is matched exactly so
 * "male" never matches "female" (substring trap).
 */
export function pickVoice(voices: HeyGenVoice[], keyword?: string): HeyGenVoice | null {
  if (voices.length === 0) return null;

  const kw = (keyword || "").trim().toLowerCase();
  if (kw) {
    const gender = kw === "male" || kw === "female" ? kw : null;
    const match = voices.find(
      (v) =>
        v.name.toLowerCase().includes(kw) ||
        v.language.toLowerCase().includes(kw) ||
        (gender !== null && v.gender.toLowerCase() === gender)
    );
    if (match) return match;
  }

  const english = voices.find((v) => v.language.toLowerCase().startsWith("en"));
  return english || voices[0];
}
