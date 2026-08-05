# Ultimate 8-Platform OAuth 2.0 Setup Guide for SaaS Developers

---

<div align="center">

### Built by SMB Robotics

Passionate about building smart embedded systems, IoT, and robotics solutions.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/shahid407)
[![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white)](https://web.facebook.com/smbrobotics)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/smbrobotics)

[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white)](https://www.reddit.com/user/SMB_ROBOTICS)
[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtube.com/shahidrafiq407)
[![Website](https://img.shields.io/badge/Website-00C853?style=for-the-badge&logo=google-chrome&logoColor=white)](https://smbrobotic.com)

If this project helped you, consider giving it a ⭐

</div>

---

## Executive Summary: How 1-Click "Buffer-Style" Auth Works

In enterprise SaaS platforms (like Buffer, Hootsuite, or Later), **end-users never enter API keys**. Instead, you (the SaaS Developer) register one Developer Application per social network. 

1. **You configure your OAuth Credentials** (`CLIENT_ID` and `CLIENT_SECRET`) inside `.env.local`.
2. When a user clicks **Connect Account** on your `/dashboard/integrations` page, your app redirects them to the official platform consent screen (e.g., `"Allow SMB Robotics to post on your behalf?"`).
3. Once approved, the platform redirects back to your callback URL with an authorization code, which your backend exchanges for a long-lived **Access Token** and stores securely in Prisma DB.

---

## Why Pinterest & Reddit Are Essential for Modern SaaS (Expert Recommendation)

You asked whether we should include **Pinterest** and **Reddit** alongside LinkedIn, FB, Instagram, TikTok, YouTube, and X. Here is the strategic breakdown:

### 1. Pinterest (SEO & Evergreen Visual Backlinks)
- **Why it matters:** Unlike standard social posts that disappear in 24 hours, **Pinterest pins rank on Google and live for months**.
- **Use Case:** Infographics, circuit diagrams, product feature carousels, and blog thumbnails. Each Pin includes a direct do-follow/nofollow website link, driving evergreen high-intent inbound traffic.
- **API Status:** Modern **Pinterest API v5** supports easy OAuth 2.0 authorization and programmatic Pin publishing.

### 2. Reddit (B2B & Technical Community Lead Acquisition)
- **Why it matters:** Reddit is the #1 destination for software recommendations, technical troubleshooting, and authentic developer community discussions.
- **Use Case:** Sharing helpful technical walkthroughs, open-source robotics breakdowns, and answering questions in niche subreddits (`r/robotics`, `r/SaaS`, `r/embedded`).
- **API Status:** Reddit provides a clean **OAuth 2.0 Web App API** that allows users to authorize your app to submit text posts and links to subreddits.

---

## Step-by-Step Developer App Creation & OAuth Guide

Below is the step-by-step guide to register apps and obtain API keys for all **8 Supported Platforms**.

---

### 1. LinkedIn (Company Pages & Profile Publishing)

1. **Developer Console:** Open [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps).
2. **Create App:** Click **Create App** -> Name: `SMB Robotics AI SaaS` -> Link to your LinkedIn Company Page -> Upload Logo.
3. **Required Products (Already Active in your screenshot!):** Under the **Products** tab, you only need:
   - `Share on LinkedIn` (Default Tier) -> Scope: `w_member_social`
   - `Sign In with LinkedIn using OpenID Connect` (Standard Tier) -> Scopes: `openid`, `profile`, `email`
   > [!IMPORTANT]
   > **Why are some "Request access" buttons greyed out (e.g. Community Management API, Live Events, Member Data Portability)?**  
   > Those are restricted enterprise/partner APIs that require formal Partner Program verification by LinkedIn. **You DO NOT need those greyed-out APIs!** For a Buffer/Hootsuite style AI publishing & scheduling SaaS, having **Share on LinkedIn** and **Sign In with LinkedIn** active is 100% sufficient to link user accounts and publish posts automatically.
4. **OAuth 2.0 Scopes Required:**
   - `openid`, `profile`, `email`, `w_member_social`
5. **Redirect URI Configuration:**
   - `http://localhost:3000/api/auth/callback/linkedin` (Local)
   - `https://yourdomain.com/api/auth/callback/linkedin` (Production)
6. **Keys to copy to `.env.local`:**
   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET`

---

### 2. Facebook / Meta Graph API (Facebook Pages & Instagram)

1. **Developer Console:** Open [Meta for Developers App Creation](https://developers.facebook.com/apps/creation/).
2. **Add Use Cases (Which checkboxes to select):**
   - ✅ **`Authenticate and request data from users with Facebook Login`** (Found at the bottom of the "All" list — **100% REQUIRED** for 1-Click Buffer style OAuth login).
   - ✅ **Click `Content management` on the left sidebar** and select **`Publish to Facebook Pages`** / **`Manage Facebook Page assets`** (REQUIRED for auto-posting content).
   - (Optional) ✅ **`Capture & manage ad leads with Marketing API`** (If you want to sync FB Lead Ad forms).
3. **OAuth 2.0 Scopes Required:**
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `public_profile`
4. **Redirect URI Configuration:**
   - Add `http://localhost:3000/api/auth/callback/facebook` inside **Facebook Login -> Valid OAuth Redirect URIs**.
5. **Keys to copy to `.env.local`:**
   - `FACEBOOK_CLIENT_ID` (App ID)
   - `FACEBOOK_CLIENT_SECRET` (App Secret)

---

### 3. Instagram Graph API (Business & Creator Reels/Carousels)

1. **Developer Console:** Use the same [Meta Developer Console](https://developers.facebook.com/apps) (Instagram Graph API is managed via Meta).
2. **Setup Instagram Graph API:** Ensure the user's Instagram account is converted to a **Professional/Creator Account** and linked to a Facebook Page.
3. **OAuth 2.0 Scopes Required:**
   - `instagram_basic`, `instagram_content_publish`, `pages_show_list`
4. **Redirect URI Configuration:**
   - `http://localhost:3000/api/auth/callback/instagram`
5. **Keys to copy to `.env.local`:**
   - `INSTAGRAM_CLIENT_ID`
   - `INSTAGRAM_CLIENT_SECRET`

---

### 4. TikTok Open API (Short-Form Video Publishing)

1. **Developer Console:** Open [TikTok for Developers Portal](https://developers.tiktok.com/).
2. **Create App:** Click **Connect an App** -> Category: `Social & Media Management`.
3. **Select Features:** Enable:
   - `Login Kit`
   - `Video Kit` (Direct Post / Content Posting API).
4. **OAuth 2.0 Scopes Required:**
   - `user.info.basic`, `video.publish`, `video.upload`
5. **Redirect URI Configuration:**
   - `http://localhost:3000/api/auth/callback/tiktok`
6. **Keys to copy to `.env.local`:**
   - `TIKTOK_CLIENT_KEY`
   - `TIKTOK_CLIENT_SECRET`

---

### 5. YouTube Data API v3 (Google Cloud Console)

1. **Developer Console:** Open [Google Cloud Console](https://console.cloud.google.com/).
2. **Create Project & Enable API:** Navigate to **APIs & Services** -> Search and enable **YouTube Data API v3**.
3. **Configure OAuth Consent Screen:** Set User Type to **External** -> App name: `SMB Robotics Studio` -> Add test users.
4. **OAuth 2.0 Scopes Required:**
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
5. **Redirect URI Configuration:**
   - `http://localhost:3000/api/auth/callback/youtube`
6. **Keys to copy to `.env.local`:**
   - `YOUTUBE_CLIENT_ID`
   - `YOUTUBE_CLIENT_SECRET`

---

### 6. X (formerly Twitter) API v2

1. **Developer Console:** Open [X Developer Portal](https://developer.x.com/en/portal/dashboard).
2. **Create Project & App:** Enable **OAuth 2.0 User Authentication Settings**.
3. **App Permissions:** Select **Read and Write and Direct message**.
4. **OAuth 2.0 Scopes Required:**
   - `tweet.read`, `tweet.write`, `users.read`, `offline.access`
5. **Redirect URI Configuration:**
   - `http://localhost:3000/api/auth/callback/x`
6. **Keys to copy to `.env.local`:**
   - `X_CLIENT_ID`
   - `X_CLIENT_SECRET`

---

### 7. Pinterest API v5

1. **Developer Console:** Open [Pinterest Developers](https://developers.pinterest.com/).
2. **Create App:** Go to **My Apps** -> **Create App** -> Name: `SMB Robotics Pin Automator`.
3. **OAuth 2.0 Scopes Required:**
   - `boards:read`, `boards:write`, `pins:read`, `pins:write`
4. **Redirect URI Configuration:**
   - `http://localhost:3000/api/auth/callback/pinterest`
5. **Keys to copy to `.env.local`:**
   - `PINTEREST_APP_ID`
   - `PINTEREST_APP_SECRET`

---

### 8. Reddit API (OAuth 2.0 Web App)

1. **Developer Console:** Open [Reddit App Preferences](https://www.reddit.com/prefs/apps).
2. **Create App:** Scroll to bottom -> click **create another app...**:
   - Type: Select **web app**
   - Name: `SMB Robotics Auto-Publisher`
   - redirect uri: `http://localhost:3000/api/auth/callback/reddit`
3. **OAuth 2.0 Scopes Required:**
   - `identity`, `submit`, `read`, `flair`
4. **Keys to copy to `.env.local`:**
   - `REDDIT_CLIENT_ID` (Found under App name)
   - `REDDIT_CLIENT_SECRET` (Found beside "secret")

---

## Full `.env.local` Reference Checklist

Add these variables to your environment to activate live OAuth syncing:

```env
# LinkedIn
LINKEDIN_CLIENT_ID=""
LINKEDIN_CLIENT_SECRET=""

# Facebook / Meta
FACEBOOK_CLIENT_ID=""
FACEBOOK_CLIENT_SECRET=""

# Instagram
INSTAGRAM_CLIENT_ID=""
INSTAGRAM_CLIENT_SECRET=""

# TikTok
TIKTOK_CLIENT_KEY=""
TIKTOK_CLIENT_SECRET=""

# YouTube (Google)
YOUTUBE_CLIENT_ID=""
YOUTUBE_CLIENT_SECRET=""

# X (Twitter)
X_CLIENT_ID=""
X_CLIENT_SECRET=""

# Pinterest
PINTEREST_APP_ID=""
PINTEREST_APP_SECRET=""

# Reddit
REDDIT_CLIENT_ID=""
REDDIT_CLIENT_SECRET=""
```

---

Copyright (c) 2026 SMB Robotics
