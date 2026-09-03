// ============================================================================
// PLUGIN CATALOG — one directory over three different backends
//
// A workspace connects things in three unrelated ways: connectors with API keys
// (`userConnection`), publishing platforms (`cms:` connections) and MCP servers.
// Nobody using the app thinks in those terms, so the catalog is one flat list of
// rows and each row names the backend that opens when it is clicked.
//
// Pure data with no imports, deliberately: the browser renders the directory
// from it and the server reads the same rows when it tells the AI CEO what is
// connected, so the two can never describe a different set of plugins.
// ============================================================================

/** Which subsystem actually stores this plugin's connection. */
export type PluginBackend = "connector" | "cms" | "mcp" | "tag";

export type PluginSectionKey = "popular" | "commerce" | "content" | "productivity" | "mcp";

export interface PluginSection {
  key: PluginSectionKey;
  title: string;
}

export const PLUGIN_SECTIONS: PluginSection[] = [
  { key: "popular", title: "Popular" },
  { key: "commerce", title: "Commerce" },
  { key: "content", title: "Content & publishing" },
  { key: "productivity", title: "Productivity" },
  { key: "mcp", title: "Free MCP servers" },
];

export type PluginLogoId =
  | "github"
  | "wordpress"
  | "woocommerce"
  | "shopify"
  | "canva"
  | "heygen"
  | "gmail"
  | "gdrive"
  | "code"
  | "tag"
  | "mcp"
  | "huggingface"
  | "microsoft"
  | "zapier"
  | "stripe";

/**
 * One step of a setup guide. A step is a line, not a paragraph — the fields are
 * this narrow on purpose, because the old help text was a wall nobody read.
 */
export interface PluginSetupStep {
  title: string;
  detail?: string;
  href?: string;
  linkLabel?: string;
  /** A value worth a copy button: scopes, a redirect URI, a route path. */
  copy?: string;
}

/** A free MCP server we can prefill, so connecting one is a click and a check. */
export interface McpPreset {
  suggestedName: string;
  url: string;
  /** The header this server wants, when it wants one at all. */
  authHeader?: string;
  /** Set when the URL itself is per-user and has to be generated first. */
  urlIsPersonal?: boolean;
}

export interface PluginCatalogEntry {
  key: string;
  backend: PluginBackend;
  name: string;
  /** The single grey line under the name in the directory. */
  blurb: string;
  section: PluginSectionKey;
  logo: PluginLogoId;
  setup: PluginSetupStep[];
  /** What the AI CEO can do with it — chips in the dialog, never prose. */
  can: string[];
  mcp?: McpPreset;
  docsUrl?: string;
}

export const PLUGIN_CATALOG: PluginCatalogEntry[] = [
  // ---------------------------------------------------------------- popular
  {
    key: "github",
    backend: "connector",
    name: "GitHub",
    blurb: "Create repos, push generated files and publish READMEs from chat.",
    section: "popular",
    logo: "github",
    can: ["Create repos", "Push files", "Publish a README"],
    docsUrl: "https://github.com/settings/personal-access-tokens/new",
    setup: [
      {
        title: "Open fine-grained tokens",
        detail: "GitHub → Settings → Developer settings → Fine-grained tokens.",
        href: "https://github.com/settings/personal-access-tokens/new",
        linkLabel: "Open GitHub tokens",
      },
      {
        title: "Choose which repositories it may touch",
        detail: "All of them, or only the ones you want the AI CEO working in.",
      },
      {
        title: "Set two permissions",
        detail: "Contents: Read and write. Administration: Read and write, only if it should create new repos.",
      },
      {
        title: "Generate, copy, paste it below",
        detail: "GitHub shows the token once. We call your account with it before saving anything.",
      },
    ],
  },
  {
    key: "wordpress",
    backend: "cms",
    name: "WordPress",
    blurb: "Publish finished articles with SEO meta, categories and a featured image.",
    section: "popular",
    logo: "wordpress",
    can: ["Publish articles", "Write SEO meta", "Pick categories"],
    docsUrl: "https://wordpress.org/documentation/article/application-passwords/",
    setup: [
      {
        title: "Open your WordPress profile",
        detail: "WP Admin → Users → Profile, then scroll to Application Passwords.",
      },
      {
        title: "Add an application password",
        detail: "Name it AI CEO. WordPress shows it once — copy it with the spaces in it.",
      },
      {
        title: "Use your username, not your email",
        detail: "Site URL is the front page, e.g. https://example.com.",
      },
      {
        title: "Say which SEO plugin you run",
        detail: "Yoast or Rank Math, so the meta title and description land in the fields your theme reads.",
      },
    ],
  },
  {
    key: "gmail",
    backend: "connector",
    name: "Gmail",
    blurb: "Read the inbox, draft replies and send email as you from chat.",
    section: "popular",
    logo: "gmail",
    can: ["Search the inbox", "Draft replies", "Send email"],
    docsUrl: "https://developers.google.com/gmail/api/quickstart/js",
    setup: [
      {
        title: "Enable the Gmail API",
        detail: "Google Cloud Console → APIs & Services → Library → Gmail API → Enable.",
        href: "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
        linkLabel: "Enable Gmail API",
      },
      {
        title: "Create an OAuth client (Web application)",
        detail: "Credentials → Create credentials → OAuth client ID. Add this as an authorised redirect URI:",
        href: "https://console.cloud.google.com/apis/credentials",
        linkLabel: "Open Credentials",
        copy: "https://developers.google.com/oauthplayground",
      },
      {
        title: "Swap it for a refresh token",
        detail: "OAuth Playground → gear icon → Use your own OAuth credentials, then authorise these scopes:",
        href: "https://developers.google.com/oauthplayground",
        linkLabel: "Open OAuth Playground",
        copy: "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",
      },
      {
        title: "Paste the client ID, secret and refresh token",
        detail: "A short-lived access token is minted per call, so nothing expires on you.",
      },
    ],
  },
  {
    key: "canva",
    backend: "connector",
    name: "Canva",
    blurb: "List designs, export them as PNG or PDF and pull them into posts.",
    section: "popular",
    logo: "canva",
    can: ["List designs", "Export a design", "Reuse brand assets"],
    docsUrl: "https://www.canva.dev/docs/connect/authentication/",
    setup: [
      {
        title: "Create a private integration",
        detail: "Canva Developers → Your integrations → Create an integration.",
        href: "https://www.canva.com/developers/integrations",
        linkLabel: "Open Canva Developers",
      },
      {
        title: "Add the read scopes and a redirect URL",
        detail: "Any URL you control works — you only need it once, to complete the handshake.",
        copy: "design:meta:read design:content:read asset:read profile:read",
      },
      {
        title: "Authorise once, keep the refresh token",
        detail: "Open your integration's authorize URL, approve it, exchange the code at /rest/v1/oauth/token.",
        href: "https://www.canva.dev/docs/connect/authentication/",
        linkLabel: "Canva auth guide",
      },
      {
        title: "Paste the client ID, secret and refresh token",
        detail: "Canva access tokens last hours; the refresh token is what keeps this connected.",
      },
    ],
  },

  // --------------------------------------------------------------- commerce
  {
    key: "shopify",
    backend: "cms",
    name: "Shopify",
    blurb: "Publish blog articles to your store with SEO fields filled in.",
    section: "commerce",
    logo: "shopify",
    can: ["Publish blog articles", "Write SEO meta", "Set a featured image"],
    docsUrl: "https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens",
    setup: [
      {
        title: "Shopify admin → Settings → Apps and sales channels",
        detail: "Then Develop apps → Create an app.",
        href: "https://admin.shopify.com/settings/apps/development",
        linkLabel: "Open app development",
      },
      {
        title: "Give the app the blog scopes",
        detail: "Configure Admin API scopes, then tick these two:",
        copy: "read_content write_content",
      },
      {
        title: "Install it and reveal the Admin API access token",
        detail: "Starts with shpat_ and is shown once.",
      },
      {
        title: "Use the myshopify domain",
        detail: "your-store.myshopify.com — a custom domain will not answer the Admin API.",
      },
    ],
  },
  {
    key: "woocommerce",
    backend: "connector",
    name: "WooCommerce",
    blurb: "Read your catalogue and create or update products from chat.",
    section: "commerce",
    logo: "woocommerce",
    can: ["List products", "Create products", "Update price & stock"],
    docsUrl: "https://woocommerce.com/document/woocommerce-rest-api/",
    setup: [
      {
        title: "WooCommerce → Settings → Advanced → REST API",
        detail: "Then Add key.",
      },
      {
        title: "Set permissions to Read/Write",
        detail: "Read alone cannot create or price a product.",
      },
      {
        title: "Copy both halves of the key",
        detail: "Consumer key (ck_…) and consumer secret (cs_…), shown once.",
      },
      {
        title: "Store URL is the shop's front page",
        detail: "https://example.com — the /wp-json/wc/v3 part is added for you.",
      },
    ],
  },

  // ---------------------------------------------------- content & publishing
  {
    key: "custom",
    backend: "cms",
    name: "Custom / coded site",
    blurb: "Next.js, Astro, Laravel — we POST signed JSON to a route you own.",
    section: "content",
    logo: "code",
    can: ["Publish anywhere", "Signed requests", "Your own schema"],
    setup: [
      {
        title: "Add a POST route to your site",
        detail: "Anything public. It only has to answer 2xx for our ping.",
        copy: "/api/publish",
      },
      {
        title: "Invent a long random signing secret",
        detail: "Put it in your site's environment, paste the same string here.",
      },
      {
        title: "Verify the signature before trusting the body",
        detail: "HMAC-SHA256 over `timestamp.rawBody`. The full guide and a handler you can paste are below the directory.",
      },
    ],
  },
  {
    key: "heygen",
    backend: "connector",
    name: "HeyGen",
    blurb: "Generate avatar videos from a script and save them to your library.",
    section: "content",
    logo: "heygen",
    can: ["List avatars", "Generate a video", "Save to media library"],
    docsUrl: "https://app.heygen.com/settings?nav=API",
    setup: [
      {
        title: "Open HeyGen → Settings → API",
        detail: "Subscription required; the trial key works for testing.",
        href: "https://app.heygen.com/settings?nav=API",
        linkLabel: "Open HeyGen API settings",
      },
      {
        title: "Copy your API key",
        detail: "One key, no OAuth. Paste it below and we call /v2/user/remaining_quota to check it.",
      },
    ],
  },

  // ----------------------------------------------------------- productivity
  {
    key: "google-drive",
    backend: "connector",
    name: "Google Drive",
    blurb: "Find files, read docs and drop generated documents into a folder.",
    section: "productivity",
    logo: "gdrive",
    can: ["Search files", "Read a doc", "Upload a file"],
    docsUrl: "https://developers.google.com/drive/api/quickstart/js",
    setup: [
      {
        title: "Enable the Drive API",
        detail: "Google Cloud Console → APIs & Services → Library → Google Drive API → Enable.",
        href: "https://console.cloud.google.com/apis/library/drive.googleapis.com",
        linkLabel: "Enable Drive API",
      },
      {
        title: "Reuse the OAuth client you made for Gmail",
        detail: "Same project, same client ID and secret. Only the scopes differ.",
        href: "https://console.cloud.google.com/apis/credentials",
        linkLabel: "Open Credentials",
      },
      {
        title: "Get a refresh token for the Drive scope",
        detail: "OAuth Playground → your own credentials → authorise this scope:",
        href: "https://developers.google.com/oauthplayground",
        linkLabel: "Open OAuth Playground",
        copy: "https://www.googleapis.com/auth/drive",
      },
      {
        title: "Paste the client ID, secret and refresh token",
        detail: "Use drive.file instead of drive if you only want us to touch files we create.",
      },
    ],
  },
  {
    key: "website-tag",
    backend: "tag",
    name: "Website lead tag",
    blurb: "One script on your site turns visitors into leads the AI CEO can see.",
    section: "productivity",
    logo: "tag",
    can: ["Capture leads", "Track page views", "Attribute campaigns"],
    setup: [
      {
        title: "Copy your workspace snippet",
        detail: "It is generated for you below — no keys to create anywhere.",
      },
      {
        title: "Paste it before </body>",
        detail: "Every page, or just your landing pages. Events show up within a minute.",
      },
    ],
  },

  // ------------------------------------------------------- free MCP servers
  // Prefilled, not silently installed: one click opens the MCP dialog with the
  // URL already in it, so connecting is a confirm rather than a copy-paste job.
  {
    key: "mcp-context7",
    backend: "mcp",
    name: "Context7",
    blurb: "Up-to-date docs and code examples for any library, by version.",
    section: "mcp",
    logo: "mcp",
    can: ["Look up library docs", "Resolve a package", "Cite versions"],
    mcp: { suggestedName: "Context7", url: "https://mcp.context7.com/mcp" },
    setup: [
      {
        title: "No key needed",
        detail: "Free and public. Press Connect and we discover its tools straight away.",
      },
    ],
  },
  {
    key: "mcp-deepwiki",
    backend: "mcp",
    name: "DeepWiki",
    blurb: "Ask questions about any public GitHub repository in plain English.",
    section: "mcp",
    logo: "mcp",
    can: ["Read a repo", "Ask about code", "Summarise structure"],
    mcp: { suggestedName: "DeepWiki", url: "https://mcp.deepwiki.com/mcp" },
    setup: [
      {
        title: "No key needed",
        detail: "Free and public, run by Devin. Works on any repo that is public.",
      },
    ],
  },
  {
    key: "mcp-gitmcp",
    backend: "mcp",
    name: "GitMCP",
    blurb: "Turn one GitHub repo into a documentation server the AI CEO can read.",
    section: "mcp",
    logo: "github",
    can: ["Search a repo's docs", "Fetch files", "Answer from source"],
    mcp: { suggestedName: "GitMCP", url: "https://gitmcp.io/docs" },
    setup: [
      {
        title: "Point it at a repo",
        detail: "Replace /docs with /<owner>/<repo> to scope it to one project.",
        copy: "https://gitmcp.io/owner/repo",
      },
    ],
  },
  {
    key: "mcp-huggingface",
    backend: "mcp",
    name: "Hugging Face",
    blurb: "Search models, datasets and Spaces, and read model cards.",
    section: "mcp",
    logo: "huggingface",
    can: ["Search models", "Search datasets", "Read a model card"],
    mcp: {
      suggestedName: "Hugging Face",
      url: "https://huggingface.co/mcp",
      authHeader: "Authorization",
    },
    setup: [
      {
        title: "Anonymous works, a token gives you more",
        detail: "Create a read token if you want private repos or higher limits.",
        href: "https://huggingface.co/settings/tokens",
        linkLabel: "Create a HF token",
      },
      {
        title: "If you use one, send it as a header",
        detail: "Header name Authorization, value below with your token appended.",
        copy: "Bearer hf_xxx",
      },
    ],
  },
  {
    key: "mcp-microsoft-learn",
    backend: "mcp",
    name: "Microsoft Learn",
    blurb: "Official Microsoft and Azure documentation, searched and quoted.",
    section: "mcp",
    logo: "microsoft",
    can: ["Search Learn docs", "Fetch a page", "Cite official guidance"],
    mcp: { suggestedName: "Microsoft Learn", url: "https://learn.microsoft.com/api/mcp" },
    setup: [
      {
        title: "No key needed",
        detail: "Run by Microsoft, free and public.",
      },
    ],
  },
  {
    key: "mcp-zapier",
    backend: "mcp",
    name: "Zapier",
    blurb: "Reach 8,000 apps through Zaps you pick — Sheets, Slack, HubSpot, Trello.",
    section: "mcp",
    logo: "zapier",
    can: ["Run a Zap", "Add a row", "Post to Slack"],
    mcp: {
      suggestedName: "Zapier",
      url: "https://mcp.zapier.com/api/mcp/mcp",
      urlIsPersonal: true,
    },
    setup: [
      {
        title: "Create an MCP server in Zapier",
        detail: "Zapier MCP → New server, then choose which actions it may run.",
        href: "https://mcp.zapier.com/",
        linkLabel: "Open Zapier MCP",
      },
      {
        title: "Copy your personal server URL",
        detail: "It contains your own key, so treat it as a secret — paste that URL, not the example.",
      },
      {
        title: "Only the actions you ticked are possible",
        detail: "Add more in Zapier later and press Check connection to pick them up.",
      },
    ],
  },
  {
    key: "mcp-stripe",
    backend: "mcp",
    name: "Stripe",
    blurb: "Read customers, invoices and payments — and search Stripe's docs.",
    section: "mcp",
    logo: "stripe",
    can: ["List customers", "Read invoices", "Search Stripe docs"],
    mcp: {
      suggestedName: "Stripe",
      url: "https://mcp.stripe.com",
      authHeader: "Authorization",
    },
    setup: [
      {
        title: "Create a restricted key",
        detail: "Stripe → Developers → API keys → Create restricted key. Read-only is enough.",
        href: "https://dashboard.stripe.com/apikeys",
        linkLabel: "Open Stripe API keys",
      },
      {
        title: "Send it as a header",
        detail: "Header name Authorization, value below with your rk_ key appended.",
        copy: "Bearer rk_live_xxx",
      },
    ],
  },
];

// ============================================================================
// LOOKUPS
//
// The deep link `?connector=wp` has to land on the WordPress row, and the AI CEO
// says "connect WooCommerce" in whatever casing it likes. One resolver, so a new
// spelling is a line here instead of a branch in a component.
// ============================================================================

/** Spellings that should land on a row but are not its key or its name. */
const PLUGIN_ALIASES: Record<string, string> = {
  wp: "wordpress",
  "wordpress-pro": "wordpress",
  wpsite: "wordpress",
  woo: "woocommerce",
  "woo-commerce": "woocommerce",
  drive: "google-drive",
  gdrive: "google-drive",
  "google drive": "google-drive",
  mail: "gmail",
  email: "gmail",
  "coded-site": "custom",
  "custom-site": "custom",
  code: "custom",
  website: "website-tag",
  websitetag: "website-tag",
  "lead-tag": "website-tag",
  leadtag: "website-tag",
  tracking: "website-tag",
  "tracking-tag": "website-tag",
  "lead-capture": "website-tag",
  context7: "mcp-context7",
  deepwiki: "mcp-deepwiki",
  gitmcp: "mcp-gitmcp",
  huggingface: "mcp-huggingface",
  "hugging-face": "mcp-huggingface",
  "microsoft-learn": "mcp-microsoft-learn",
  zapier: "mcp-zapier",
  stripe: "mcp-stripe",
};

export function getPluginEntry(key: string): PluginCatalogEntry | undefined {
  return PLUGIN_CATALOG.find((entry) => entry.key === key);
}

export function pluginsInSection(section: PluginSectionKey): PluginCatalogEntry[] {
  return PLUGIN_CATALOG.filter((entry) => entry.section === section);
}

/**
 * Turn anything the user or a deep link says into a catalog key.
 * Matches, in order: exact key, alias table, then the display name.
 */
export function resolvePluginKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;

  if (getPluginEntry(needle)) return needle;

  const alias = PLUGIN_ALIASES[needle];
  if (alias && getPluginEntry(alias)) return alias;

  const byName = PLUGIN_CATALOG.find((entry) => entry.name.toLowerCase() === needle);
  return byName ? byName.key : null;
}

/** Every catalog row that the given backend owns. */
export function pluginsForBackend(backend: PluginBackend): PluginCatalogEntry[] {
  return PLUGIN_CATALOG.filter((entry) => entry.backend === backend);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The catalog row an attached MCP server came from, or undefined when the user
 * typed a server of their own.
 *
 * Matched on hostname rather than the whole URL: Zapier hands out a personal URL
 * and GitMCP takes a repo path, so the path differs per workspace while the host
 * is what identifies the service. Every preset host here is distinct, which is
 * what makes that safe.
 */
export function matchMcpPlugin(url: string): PluginCatalogEntry | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  return PLUGIN_CATALOG.find((entry) => entry.mcp && hostOf(entry.mcp.url) === host);
}
