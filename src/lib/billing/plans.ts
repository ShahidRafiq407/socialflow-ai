export type PlanTier = "FREE" | "PRO" | "AGENCY";

export interface PlanConfig {
  id: PlanTier;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  maxSocialAccounts: number;
  canAccessAI: boolean;
  canGenerateVideo: boolean;
  canUploadZip: boolean;
  aiCreditsPerMonth: number; // 0 = none, -1 = unlimited
  supportedPlatforms: number; // 2, 4, or 6
  features: string[];
  highlight?: boolean;
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  FREE: {
    id: "FREE",
    name: "Free Starter",
    tagline: "Essential manual social posting & scheduling",
    priceMonthly: 0,
    priceYearly: 0,
    maxSocialAccounts: 2,
    canAccessAI: false,
    canGenerateVideo: false,
    canUploadZip: false,
    aiCreditsPerMonth: 0,
    supportedPlatforms: 2,
    features: [
      "Connect up to 2 social accounts",
      "Manual post composer & formatting",
      "Local media upload & storage",
      "Manual scheduling & publishing",
      "Content Library draft management",
      "Standard platform previews",
      "Basic workspace settings",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Creator Pro",
    tagline: "Full AI Studio & AI Brain for growing creators",
    priceMonthly: 29,
    priceYearly: 290,
    maxSocialAccounts: 4,
    canAccessAI: true,
    canGenerateVideo: false,
    canUploadZip: false,
    aiCreditsPerMonth: 100,
    supportedPlatforms: 4,
    highlight: true,
    features: [
      "Connect up to 4 social accounts",
      "Full 6-agent AI Studio campaign generation",
      "Studio-grade AI image generation",
      "Google Search grounded trend & competitor research",
      "Chat AI Brain with natural language platform control",
      "Multimodal document understanding (PDF, DOCX, TXT, CSV)",
      "Article Writer (Longform SEO articles & schema markup)",
      "AI analyzed optimal peak publishing times",
      "100 AI generation credits per month",
      "Brand DNA voice & style grounding",
    ],
  },
  AGENCY: {
    id: "AGENCY",
    name: "Agency & Scale",
    tagline: "Maximum AI power & all 6 platforms for scaling brands",
    priceMonthly: 79,
    priceYearly: 790,
    maxSocialAccounts: 6,
    canAccessAI: true,
    canGenerateVideo: true,
    canUploadZip: true,
    aiCreditsPerMonth: -1, // Unlimited
    supportedPlatforms: 6,
    features: [
      "Connect all 6 supported platforms (Instagram, Facebook, LinkedIn, TikTok, YouTube, Pinterest)",
      "Unlimited AI Studio campaign generation",
      "AI Video generation (Veo engine)",
      "ZIP archive inspection & multi-file extraction",
      "Continuous Article Writer with citations & export",
      "Lead Goal Growth Engine & Autopilot strategy",
      "Priority AI queue & generation speed",
      "Multi-workspace & brand profile switching",
      "Full analytics & performance intelligence",
      "Dedicated priority email & community support",
    ],
  },
};

export function getPlanConfig(tier: string | null | undefined): PlanConfig {
  const normalized = (tier || "FREE").toUpperCase() as PlanTier;
  return PLANS[normalized] || PLANS.FREE;
}

export function canAccessAI(tier: string | null | undefined): boolean {
  return getPlanConfig(tier).canAccessAI;
}

export function getMaxSocialAccounts(tier: string | null | undefined): number {
  return getPlanConfig(tier).maxSocialAccounts;
}

export function canGenerateVideo(tier: string | null | undefined): boolean {
  return getPlanConfig(tier).canGenerateVideo;
}
