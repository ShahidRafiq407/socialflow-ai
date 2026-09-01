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
    key: "heygen",
    name: "HeyGen",
    tagline: "AI avatar video generation",
    description:
      "Generate AI avatar videos with your own script and voice, saved directly to your Media Assets for scheduling.",
    category: "media",
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
];
