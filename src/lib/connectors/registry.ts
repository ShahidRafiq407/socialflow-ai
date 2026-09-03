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

