# SocialFlow AI — Engineering Handoff & Platform Status

**Updated:** 2026-08-28 | **Author/Brand:** SMB Robotics | **Production:** `https://socialflow-ai-akel.vercel.app` | **Repo:** `https://github.com/ShahidRafiq407/socialflow-ai`

---

## 1. System Architecture & Core Stack
- **Framework:** Next.js 16 (App Router, Turbopack, Server Actions)
- **Database & Auth:** Prisma 7 + PostgreSQL / Neon, Clerk Auth (`@clerk/nextjs`)
- **AI Models:** Google Cloud Model Garden (`gemini-3-pro-image` exclusively for image synthesis, Vertex AI / Gemini 2.5 Flash for copy & multi-agent pipeline)
- **State & Sync:** Zustand (`useAIStudioSessionStore`), LocalStorage + Native browser **IndexedDB** (`socialflow_media_db` in `src/lib/indexedDbMedia.ts`) to persist large PC/Stock video and image uploads across browser page reloads (F5) without 5MB quota restrictions.
- **Format Families:** `vertical_video` format family includes: `Instagram Reel`, `Facebook Reel`, `TikTok Video`, `YouTube Shorts`, and `Pinterest Video Pin` for seamless 1-click cross-platform media synchronization.
- **Drafts Lifecycle:** AI Generation no longer auto-creates records in Content Library; posts are strictly saved to Content Library only when the user clicks "Save Draft" or dispatches "Publish / Schedule".
- **Media Pipeline:** Multi-tier storage in `src/lib/supabase.ts` + `/api/uploads` (Supabase Storage with automatic fallback to `/public/uploads/` and `MediaAsset` records), with public streaming and anti-hotlink proxy in `/api/media/[id]` for external crawler ingestion by Meta/Pinterest/LinkedIn/TikTok/YouTube without 403 Forbidden blocks.
- **Redis:** Upstash Redis via `@upstash/redis` REST client (`src/lib/redis.ts`). Reads `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (fallback `REDIS_URL` / `REDIS_TOKEN`). Used for schedule queue (sorted set), distributed cron lock, and trend caching. **NOTE:** Upstash uses an HTTPS REST endpoint + token — NOT the raw TCP protocol that `ioredis` expects.

---

## 2. Multi-Platform Publishing Audit Matrix

| Platform | OAuth & Tokens | Publish Engine | Media Support | Status & Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Instagram** | Meta OAuth (`v21.0`) with `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_manage_posts`, `business_management` | `src/lib/publishers/instagram.ts` (`POST /{igUserId}/media` -> `media_publish`) | Images & Reels via `/api/media/[id]` | ✅ **LIVE ON PLATFORM** (Verified working. 4-tier discovery resolves Business Portfolio `1772056396948184` & Page `SMB Robotics` -> IG `smbrobotics`). |
| **LinkedIn** | LinkedIn OAuth 2.0 (`openid`, `profile`, `email`, `w_member_social`) | `src/lib/publishers/linkedin.ts` (`POST /v2/ugcPosts` or `/v2/posts`) | 3-step asset upload: `registerUpload` -> binary `PUT` -> `shareMediaCategory: 'IMAGE'` | ⚠️ **PARTIAL** (Text posts published successfully. Image upload flow is implemented with Alt Text & Hashtags, but requires testing token permissions if 500 error occurs on UGC registerUpload). |
| **Pinterest** | Pinterest OAuth 2.0 (`boards:read`, `boards:write`, `pins:read`, `pins:write`, `user_accounts:read`) | `src/lib/publishers/pinterest.ts` (`POST /v5/pins`) | Base64 and Image URL ingestion | ⚠️ **TRIAL MODE** (API v5 Pin & Board creation implemented. Trial apps restrict pins to account owner until Standard Access video demo is approved). In-app Board Creator live at `/api/pinterest/boards`. |
| **Facebook** | Meta OAuth (`pages_manage_posts`, `pages_read_engagement`, `pages_show_list`) | `src/lib/publishers/facebook.ts` (`POST /{pageId}/photos` or `/feed`) | Multipart binary Blob & URL proxy | ⚠️ **PAGE TOKEN REQUIRED** (Meta deprecates user profile posting; requires Facebook Page ID & Page Access Token from `me/accounts`). |
| **X (Twitter)** | Twitter OAuth 2.0 (`tweet.read`, `tweet.write`, `users.read`) | `src/lib/publishers/x.ts` (`POST /2/tweets`) | Text-first (v2 endpoint with reply & sensitivity settings) | ⚠️ **TIER DEPENDENT** (Strict response validation implemented. Free/Basic tier rate limits apply). |
| **YouTube** | Google OAuth (`youtube.upload`, `youtube.readonly`) | `src/lib/publishers/youtube.ts` | Video uploads via Googleapis | ✅ Ready (Supports privacy, tags, and MadeForKids toggles). |
| **TikTok** | TikTok OAuth (`video.upload`, `video.publish`) | `src/lib/publishers/tiktok.ts` | Video uploads with privacy & duet settings | ✅ Ready. |

---

## 3. Key Components & Implementation Details

### A. AI Studio Media Resolution (`src/app/(dashboard)/dashboard/ai-studio/page.tsx`)
- **`resolvePostMediaUrls(platform, format, data)`**: Pulls rendered AI images from `renderedImageUrlsDict`, custom uploads from `customMediaDict`, multi-slides `0..9`, and same-family cross-platform sync. Prevents empty media URLs from being dispatched.
- **`uploadSingleFile(file)`**: Dedicated client-side upload pipeline. Files > 3MB use a Supabase **signed-URL direct upload** (`GET /api/uploads?filename=...` → `PUT` to signed URL), then a `HEAD` verification on the public URL before applying media. Files ≤ 3MB use standard multipart `POST /api/uploads`. Returns clean Supabase public URLs to avoid 50MB Base64 Server Action payload bloat.
- **`collectCampaignPosts(onlyActive?: boolean)`**: Strictly filters posts by `selectedPlatforms` and `selectedContentTypes`. Uses case-normalized key deduplication (`seenKeys.has(platform-format)`) to prevent duplicate post dispatches (e.g. `Feed` vs `feed`).
- **`PublishStatusModal.tsx`**: Renders live platform feedback with direct permalinks (`[View Live Post ↗]`), scheduled timestamps, or exact platform error messages with deep connection links.

### B. Safe Server Actions (`src/actions/publish.ts`)
- `publishNow(postId)` and `saveDraft(postData)` wrap all database and publisher calls in try/catch and return structured `{ success: boolean, error?: string, post?: Post, liveUrl?: string }`.
- Sanitized return DTOs prevent Next.js *"An unexpected response was received from the server"* serialization digest crashes.

### C. Visualizer & Prompt Quality (`src/app/api/ai-studio/route.ts` & `src/lib/agents/mediaGenerator.ts`)
- System prompt elevated for 95–100/100 relevance: deeply parses caption subject, hardware, robotics actuators, sensory dynamics, and photorealistic 8K compositions.
- Image synthesis strictly utilizes `gemini-3-pro-image` (Nano Banana Pro).

---

## 4. Immediate Next Steps / Troubleshooting Notes for Future Agents
1. **LinkedIn Publisher:**
   - If LinkedIn returns `401/403` or asset registration failure: inspect `account.accountId` (should be Person URN e.g. `urn:li:person:...`) and confirm `w_member_social` permission is granted during OAuth callback.
2. **Pinterest Standard Access:**
   - App owner submitted/is submitting a 30s video demo on `developers.pinterest.com/apps/{appId}/upgrade` to transition from Trial (owner-only pins) to Standard (global public pins).
3. **Facebook Publishing:**
   - Ensure user has reconnected Facebook so `finalAccessToken` holds the **Page Access Token** for the "SMB Robotics" Facebook Page instead of personal user token.

## 5. Media Upload Pipeline — RESOLVED (2026-08-28)

### Root Cause (was "Upload Hanging")
Local/Stock media failed to publish while AI-generated media worked. Two concrete bugs:

1. **Malformed Supabase signed-upload URL (PRIMARY).** `formatSignedUploadUrl()` in `src/lib/supabase.ts` prepended `/storage/v1` to Supabase's `/object/upload/sign/...` relative path, producing `https://xxx.supabase.co/storage/v1/object/upload/sign/...` (wrong — should be `https://xxx.supabase.co/object/upload/sign/...`). The signed `PUT` returned 404/400, so large files (>3MB) were never written to Supabase, yet the frontend still used the (dead) `publicUrl`. **FIXED** — now correctly handles `/object/` paths.

2. **Stock media silent fallback to hotlink-protected URL (SECONDARY).** `StockMediaModal`'s `onSelect` fell back to the raw Pixabay/Pexels CDN URL when the server-side download failed. Meta/Instagram crawlers can't fetch hotlink-protected URLs (403). **FIXED** — now surfaces a clear error instead of storing a dead URL.

### Why AI Media Worked
AI-generated media is re-uploaded at publish time via `ensureCleanMediaUrl()` → `POST /api/uploads` (the correct `uploadFile()` path), so it always ends up as a valid Supabase public URL.

### Additional Hardening
- `uploadSingleFile()` and `handleManualFileChange()` now do a `HEAD` verification on the public URL after the signed `PUT` before applying media.
- `saveMediaBuffer()` now **rejects files > 5MB** in the DB-base64 fallback (instead of silently storing entire videos as base64 in Postgres `text`), surfacing a clear error when Supabase is unavailable.
- Removed the unused `/api/uploads/chunk` route (frontend uses signed-URL direct upload instead).

### Environment Variables Required (Vercel)
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` — already configured in Vercel.
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `REDIS_URL` / `REDIS_TOKEN`) — **must be added** for Redis schedule queue / cron lock / caching to function. Without them, Redis silently no-ops (schedule queue falls back to DB scan).
