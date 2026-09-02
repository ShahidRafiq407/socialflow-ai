// ============================================================================
// ARTIFACTS
//
// Turns a tool result into the cards the chat renders: generated media, deep
// links, publish receipts, saved posts. Derived from the tool result rather than
// from anything the model says, so a card can never describe work that did not
// actually happen.
// ============================================================================

import type { Artifact } from "./types";
import { deepLinkLabel, isDashboardTab, studioLinkForPost, type DashboardTab } from "./navigation";

let counter = 0;
function artifactId(kind: string): string {
  counter += 1;
  return `${kind}-${Date.now().toString(36)}-${counter}`;
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : null;
}

function truthyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Maps one successful tool call to zero or more cards.
 * Returns [] for tools whose output is only useful as prose.
 */
export function artifactsFromToolResult(toolName: string, result: unknown): Artifact[] {
  const r = asRecord(result);
  if (!r || truthyString(r.error)) return [];

  const out: Artifact[] = [];

  switch (toolName) {
    case "generate_image": {
      const url = truthyString(r.url);
      if (!url) break;
      const postId = truthyString(r.id);
      out.push({
        id: artifactId("image"),
        kind: "image",
        title: `${truthyString(r.platform) || "Brand"} image`,
        subtitle: [truthyString(r.format), truthyString(r.aspectRatio)].filter(Boolean).join(" · ") || undefined,
        url,
        href: postId ? studioLinkForPost(postId) : undefined,
        hrefLabel: postId ? deepLinkLabel("ai-studio") : undefined,
        tab: postId ? "ai-studio" : undefined,
        meta: {
          model: truthyString(r.model) || null,
          "reference image": r.hasReferenceImage === true,
          "in library": r.savedToContentLibrary === true,
        },
      });
      break;
    }

    case "generate_video":
    case "heygen_generate_video": {
      const url = truthyString(r.url) || truthyString(r.videoUrl);
      const postId = truthyString(r.id) || truthyString(r.postId);
      if (!url) {
        // HeyGen renders asynchronously — show a pending card so the user knows.
        const jobId = truthyString(r.videoId) || truthyString(r.jobId);
        if (jobId) {
          out.push({
            id: artifactId("video"),
            kind: "video",
            title: "Avatar video rendering",
            subtitle: "HeyGen is still processing this render",
            meta: { "job id": jobId, status: truthyString(r.status) || "processing" },
          });
        }
        break;
      }
      out.push({
        id: artifactId("video"),
        kind: "video",
        title: `${truthyString(r.platform) || "Social"} video`,
        subtitle: truthyString(r.aspectRatio) || truthyString(r.duration) || undefined,
        url,
        href: postId ? studioLinkForPost(postId) : undefined,
        hrefLabel: postId ? deepLinkLabel("ai-studio") : undefined,
        tab: postId ? "ai-studio" : undefined,
        meta: { model: truthyString(r.model) || null },
      });
      break;
    }

    case "open_tab": {
      const href = truthyString(r.href);
      if (!href) break;
      const tab = truthyString(r.tab);
      out.push({
        id: artifactId("link"),
        kind: "link",
        title: truthyString(r.title) || truthyString(r.tabLabel) || "Open",
        subtitle: truthyString(r.note),
        href,
        hrefLabel: truthyString(r.label) || "Open",
        tab: tab && isDashboardTab(tab) ? tab : undefined,
      });
      break;
    }

    case "save_draft":
    case "create_campaign_post":
    case "update_post": {
      const postId = truthyString(r.id);
      if (!postId) break;
      out.push({
        id: artifactId("post"),
        kind: "post",
        title: `${truthyString(r.platform) || "Post"} ${toolName === "update_post" ? "updated" : "saved"}`,
        subtitle: [truthyString(r.format), truthyString(r.status)].filter(Boolean).join(" · ") || undefined,
        href: studioLinkForPost(postId),
        hrefLabel: deepLinkLabel("ai-studio"),
        tab: "ai-studio",
        url: truthyString(r.imageUrl) || truthyString(r.mediaUrl),
        meta: { id: postId },
      });
      break;
    }

    case "schedule_post":
    case "reschedule_post": {
      const postId = truthyString(r.id);
      out.push({
        id: artifactId("post"),
        kind: "post",
        title: `Scheduled for ${truthyString(r.scheduledFor) || "the calendar"}`,
        subtitle: [truthyString(r.platform), truthyString(r.format)].filter(Boolean).join(" · ") || undefined,
        href: postId ? studioLinkForPost(postId) : undefined,
        hrefLabel: postId ? deepLinkLabel("ai-studio") : undefined,
        tab: postId ? "ai-studio" : undefined,
        meta: { status: truthyString(r.status) || "SCHEDULED" },
      });
      break;
    }

    case "publish_post": {
      const liveUrl = truthyString(r.liveUrl) || truthyString(r.url) || truthyString(r.permalink);
      out.push({
        id: artifactId("publish"),
        kind: "publish",
        title: `Published to ${truthyString(r.platform) || "social"}`,
        subtitle: liveUrl ? "Live now" : truthyString(r.status),
        href: liveUrl,
        hrefLabel: liveUrl ? "View live post" : undefined,
        meta: {
          platform: truthyString(r.platform) || null,
          "published at": truthyString(r.publishedAt) || null,
        },
      });
      break;
    }

    case "github_create_repo": {
      const url = truthyString(r.url) || truthyString(r.htmlUrl) || asRecord(r.repo)?.htmlUrl;
      if (!url) break;
      out.push({
        id: artifactId("link"),
        kind: "link",
        title: `Repository created`,
        subtitle: truthyString(r.name) || truthyString(r.fullName),
        href: url,
        hrefLabel: "Open on GitHub",
      });
      break;
    }

    case "github_push_files": {
      const url = truthyString(r.commitUrl) || truthyString(r.url) || truthyString(r.htmlUrl);
      const pushed = Array.isArray(r.pushed) ? r.pushed.length : Number(r.count ?? r.fileCount ?? 0);
      out.push({
        id: artifactId("link"),
        kind: "link",
        title: `Pushed ${pushed || ""} file${pushed === 1 ? "" : "s"} to GitHub`.replace("  ", " "),
        subtitle: truthyString(r.repo) || truthyString(r.message),
        href: url,
        hrefLabel: url ? "View commit" : undefined,
      });
      break;
    }

    case "report_limitation": {
      // Only surface a card when there's somewhere for the user to actually go —
      // a "turn it on" / "connect it" / "see plans" link. A plain apology needs
      // no card; the prose already carries it.
      const fix = asRecord(r.fix);
      const href = fix ? truthyString(fix.href) : undefined;
      if (!href) break;
      const tab = fix ? truthyString(fix.tab) : undefined;
      out.push({
        id: artifactId("link"),
        kind: "link",
        title: truthyString(fix?.label) || "Lift this limit",
        subtitle: "Here's where to change that.",
        href,
        hrefLabel: truthyString(fix?.label) || "Open",
        tab: tab && isDashboardTab(tab) ? (tab as DashboardTab) : undefined,
      });
      break;
    }

    default:
      break;
  }

  return out;
}

/** Drops duplicate cards (same url+href) that repeated tool calls can produce. */
export function dedupeArtifacts(artifacts: Artifact[]): Artifact[] {
  const seen = new Set<string>();
  const out: Artifact[] = [];
  for (const a of artifacts) {
    const key = `${a.kind}|${a.url || ""}|${a.href || ""}|${a.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** Card for a link the model wrote in prose to a tab we know about. */
export function linkArtifact(tab: DashboardTab, href: string, title: string, subtitle?: string): Artifact {
  return {
    id: artifactId("link"),
    kind: "link",
    title,
    subtitle,
    href,
    hrefLabel: deepLinkLabel(tab),
    tab,
  };
}
