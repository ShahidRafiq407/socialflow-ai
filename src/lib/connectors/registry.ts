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
  {
    key: "woocommerce",
    name: "WooCommerce",
    tagline: "Read your catalogue, create products, update price & stock",
    description:
      "Connect a REST API key pair and the AI CEO can read your catalogue and create or update products from chat — useful when a campaign needs a landing product or a price change.",
    category: "ecommerce",
    fields: [
      {
        key: "storeUrl",
        label: "Store URL",
        type: "text",
        required: true,
        placeholder: "https://example.com",
        help: "The shop's front page. The /wp-json/wc/v3 path is added for you.",
      },
      {
        key: "consumerKey",
        label: "Consumer key",
        type: "password",
        required: true,
        placeholder: "ck_...",
        help: "WooCommerce → Settings → Advanced → REST API → Add key, with permissions set to Read/Write.",
        docsUrl: "https://woocommerce.com/document/woocommerce-rest-api/",
      },
      {
        key: "consumerSecret",
        label: "Consumer secret",
        type: "password",
        required: true,
        placeholder: "cs_...",
        help: "Shown once, next to the consumer key.",
      },
    ],
    chatTools: [
      "woocommerce_status",
      "woocommerce_list_products",
      "woocommerce_create_product",
      "woocommerce_update_product",
    ],
  },
  {
    key: "gmail",
    name: "Gmail",
    tagline: "Search the inbox, draft replies, send email as you",
    description:
      "Connect your own Google OAuth client and the AI CEO can search your inbox, draft replies and send email from chat. We store a refresh token and mint a short-lived access token per call, so nothing expires on you.",
    category: "automation",
    fields: [
      {
        key: "clientId",
        label: "OAuth client ID",
        type: "text",
        required: true,
        placeholder: "1234-abc.apps.googleusercontent.com",
        help: "Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application).",
        docsUrl: "https://console.cloud.google.com/apis/credentials",
      },
      {
        key: "clientSecret",
        label: "OAuth client secret",
        type: "password",
        required: true,
        placeholder: "GOCSPX-...",
        help: "Shown next to the client ID in the Cloud Console.",
      },
      {
        key: "refreshToken",
        label: "Refresh token",
        type: "password",
        required: true,
        placeholder: "1//0g...",
        help: "OAuth Playground → gear icon → Use your own OAuth credentials, authorise the gmail.modify and gmail.send scopes, then exchange the code.",
        docsUrl: "https://developers.google.com/oauthplayground",
      },
    ],
    chatTools: [
      "gmail_status",
      "gmail_list_messages",
      "gmail_read_message",
      "gmail_send_email",
    ],
  },
  {
    key: "google-drive",
    name: "Google Drive",
    tagline: "Find files, read documents, upload what the AI CEO writes",
    description:
      "Connect your own Google OAuth client and the AI CEO can search Drive, read a document for context and upload finished files into a folder you choose.",
    category: "automation",
    fields: [
      {
        key: "clientId",
        label: "OAuth client ID",
        type: "text",
        required: true,
        placeholder: "1234-abc.apps.googleusercontent.com",
        help: "The same client as Gmail works — enable the Drive API on that project first.",
        docsUrl: "https://console.cloud.google.com/apis/library/drive.googleapis.com",
      },
      {
        key: "clientSecret",
        label: "OAuth client secret",
        type: "password",
        required: true,
        placeholder: "GOCSPX-...",
      },
      {
        key: "refreshToken",
        label: "Refresh token",
        type: "password",
        required: true,
        placeholder: "1//0g...",
        help: "Authorise the drive scope in the OAuth Playground, or drive.file if you only want us to touch files we create.",
        docsUrl: "https://developers.google.com/oauthplayground",
      },
    ],
    chatTools: [
      "gdrive_status",
      "gdrive_list_files",
      "gdrive_read_file",
      "gdrive_upload_file",
    ],
  },
  {
    key: "canva",
    name: "Canva",
    tagline: "List designs, export them as PNG or PDF, reuse brand assets",
    description:
      "Connect a Canva private integration and the AI CEO can list your designs and export one as an image or PDF, ready to attach to a post or an article.",
    category: "media",
    fields: [
      {
        key: "clientId",
        label: "Integration client ID",
        type: "text",
        required: true,
        placeholder: "OC-...",
        help: "Canva Developers → Your integrations → the integration you created.",
        docsUrl: "https://www.canva.com/developers/integrations",
      },
      {
        key: "clientSecret",
        label: "Client secret",
        type: "password",
        required: true,
        placeholder: "cnvca...",
      },
      {
        key: "refreshToken",
        label: "Refresh token",
        type: "password",
        required: true,
        help: "Authorise your integration once with the design and asset read scopes, then exchange the code at /rest/v1/oauth/token.",
        docsUrl: "https://www.canva.dev/docs/connect/authentication/",
      },
    ],
    chatTools: ["canva_status", "canva_list_designs", "canva_export_design"],
  },
];

export function getConnector(key: string): ConnectorDef | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.key === key);
}

