# SocialFlow AI — Engineering Handoff & Platform Status

**Updated:** 2026-08-21 | **Author/Brand:** SMB Robotics | **Production:** `https://socialflow-ai-akel.vercel.app` | **Repo:** `https://github.com/ShahidRafiq407/socialflow-ai`

---

## 1. System Architecture & Core Stack
- **Framework:** Next.js 16 (App Router, Turbopack, Server Actions)
- **Database & Auth:** Prisma 7 + PostgreSQL / Neon, Clerk Auth (`@clerk/nextjs`)
- **AI Models:** Google Cloud Model Garden (`gemini-3-pro-image` exclusively for image synthesis, Vertex AI / Gemini 2.5 Flash for copy & multi-agent pipeline)
- **State & Sync:** Zustand (`useContentStudioStore`), LocalStorage persistence, Base64 Data URL conversion for PC/Stock uploads with automatic same-format family sync across selected platforms (e.g. Instagram Reel <-> Facebook Reel <-> TikTok Video <-> YouTube Shorts).
- **Drafts Lifecycle:** AI Generation no longer auto-creates records in Content Library; posts are strictly saved to Content Library only when the user clicks "Save Draft" or dispatches "Publish / Schedule".
- **Media Pipeline:** Public HTTPS streaming `/api/media/[id]` (converts base64/blob to binary stream with caching for external crawler ingestion by Meta/Pinterest/LinkedIn/TikTok/YouTube)

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
- **`collectCampaignPosts(onlyActive?: boolean)`**: Strictly filters posts by `selectedPlatforms` and `selectedContentTypes`. Uses case-normalized key deduplication (`seenKeys.has(platform-format)`) to prevent duplicate post dispatches (e.g. `Feed` vs `feed`).
- **`PublishStatusModal.tsx`**: Renders live platform feedback with direct permalinks (`[View Live Post ↗]`), scheduled timestamps, or exact platform error messages with deep connection links.

### B. Safe Server Actions (`src/actions/publish.ts`)
- `publishNow(postId)` and `saveDraft(postData)` wrap all database and publisher calls in try/catch and return structured `{ success: boolean, error?: string, post?: Post, liveUrl?: string }`.
- Prevents Next.js opaque *"An error occurred in the Server Components render"* crashes in production builds.

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
