// ============================================================================
// CONNECTOR REGISTRY — single source of truth for external services a
// workspace can connect to from the Plugins tab.
//
// Pure data only (no functions, no secrets) so it can be imported safely by
// both client components and server code. Adding a new connector means:
//   1. Add its definition here.
//   2. Implement its API client in src/lib/connectors/<key>.ts
//   3. Register a tester in src/actions/connections.ts
// ============================================================================

export type ConnectorCategory = "dev" | "media" | "ecommerce" | "automation";

export interface ConnectorFieldDef {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder?: string;
  required: boolean;
  help?: string;
  docsUrl?: string;
}

export interface ConnectorDef {
  key: string;
  name: string;
  tagline: string;
  description: string;
  category: ConnectorCategory;
  fields: ConnectorFieldDef[];
  /** Names of the AI CEO chat tools unlocked once connected. */
  chatTools?: string[];
}

export const CONNECTOR_REGISTRY: ConnectorDef[] = [
  {
    key: "github",
    name: "GitHub",
    tagline: "Repository creation, file push & README publishing",
    description:
      "Connect a Personal Access Token and the AI CEO can create repositories, push generated project files, and publish READMEs directly to your GitHub account from chat.",
    category: "dev",
    fields: [
      {
        key: "personalAccessToken",
        label: "Personal Access Token (fine-grained)",
        type: "password",
        required: true,
        placeholder: "github_pat_...",
        help: "GitHub → Settings → Developer settings → Fine-grained tokens. Repository permissions: Contents (Read and write) for pushing files, Administration (Read and write) for creating repos.",
        docsUrl: "https://github.com/settings/personal-access-tokens/new",
      },
    ],
    chatTools: [
      "github_status",
      "github_list_repos",
      "github_create_repo",
      "github_push_files",
    ],
  },
  {
    key: "heygen",
    name: "HeyGen",
    tagline: "AI avatar video generation → saved to Media Assets",
    description:
      "Connect an API key and the AI CEO can generate talking-avatar videos with your script, then save them to your Media Assets for use in posts and scheduling. Each render uses HeyGen credits.",
    category: "media",
    fields: [
      {
        key: "apiKey",
        label: "HeyGen API Key",
        type: "password",
        required: true,
        placeholder: "your-heygen-api-key",
        help: "HeyGen → Settings → API Key (Personalize / Apps section). The key is verified against your account quota before saving.",
        docsUrl: "https://app.heygen.com/settings",
      },
    ],
    chatTools: [
      "heygen_status",
      "heygen_generate_video",
      "heygen_check_video",
    ],
  },
];

export function getConnector(key: string): ConnectorDef | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.key === key);
}

// ---------------------------------------------------------------------------
// Planned connectors — honest "not built yet" cards. No fake states.
// Each becomes real by moving its definition into CONNECTOR_REGISTRY above
// and implementing the client + tester.
// ---------------------------------------------------------------------------

export interface PlannedConnectorDef {
  key: string;
  name: string;
  tagline: string;
  description: string;
  category: ConnectorCategory;
}

export const PLANNED_CONNECTORS: PlannedConnectorDef[] = [
  {
    key: "woocommerce",
    name: "WooCommerce",
    tagline: "Product publishing on top of your WordPress connection",
    description:
      "Generate SEO product descriptions, prices and SKUs, then publish products straight to your WooCommerce store via its REST API.",
    category: "ecommerce",
  },
  {
    key: "shopify",
    name: "Shopify",
    tagline: "Store automation connector",
    description:
      "Connect a Shopify store to auto-generate promotional videos, tweets and SEO product copy for your catalog.",
    category: "ecommerce",
  },
  {
    key: "canva",
    name: "Canva",
    tagline: "Visual design import",
    description:
      "Bridge your Canva workspace so AI-designed carousels and thumbnails flow into your posting calendar.",
    category: "media",
  },
  {
    key: "gmail",
    name: "Gmail",
    tagline: "Read, draft and manage email with AI CEO",
    description:
      "Connect Gmail to let AI CEO find context, draft replies and organize email workflows from chat.",
    category: "automation",
  },
  {
    key: "google-drive",
    name: "Google Drive",
    tagline: "RAW media asset reader",
    description:
      "Scan Drive folders for raw video clips and product photos to turn into social media reels.",
    category: "media",
  },
  {
    key: "zapier",
    name: "Zapier / Make.com",
    tagline: "Webhook automation bridge",
    description:
      "Receive instant webhooks from 5,000+ apps to trigger automated social media posts.",
    category: "automation",
  },
  {
    key: "custom-website",
    name: "Custom coded website",
    tagline: "Publish to your own website API",
    description:
      "Use the secure signed webhook connection to publish AI-generated pages and posts to any coded website.",
    category: "dev",
  },
];
