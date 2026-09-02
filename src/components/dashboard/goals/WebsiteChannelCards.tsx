"use client";

import React from "react";
import { Chip, ConnectionStrip } from "./shared";
import type { GoalHQData } from "./types";

/**
 * The website channel's setup strip: is the site connected, and is the lead tag
 * on it.
 *
 * Nothing here connects anything. Both of these live in Plugins, so there is
 * exactly one place in the app where a site is linked and exactly one truth
 * about whether it is. This reports that truth and links to it — which is also
 * why it can never disagree with the Plugins page.
 */

function fmtDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function WebsiteStatusCards({ data }: { data: GoalHQData }) {
  const wp = data.wordpress;
  const tag = data.tracking;

  const wpNote = wp.connected
    ? `Publishing to ${wp.siteUrl}${
        wp.lastVerifiedAt ? ` — last checked ${fmtDate(wp.lastVerifiedAt)}` : ""
      }. Articles go out as ${wp.defaultStatus === "draft" ? "drafts you approve" : "live posts"}.`
    : undefined;

  const wpWarning = wp.lastError
    ? `The last attempt to reach your site failed: ${wp.lastError}. Until it succeeds, no article can be published.`
    : "No website is connected, so the AI cannot publish an article anywhere. Connect your site in Plugins and this tab starts working on its own.";

  // Installed-but-silent is its own state on purpose: a tag that was removed
  // from the site looks identical to a quiet week unless we say which it is.
  const tagState: { tone: "primary" | "secondary" | "danger" | "muted"; text: string } = !tag.installed
    ? { tone: "danger", text: "Not installed" }
    : tag.stale
      ? { tone: "muted", text: "No leads in the last 7 days" }
      : tag.verifiedAt
        ? { tone: "primary", text: "Verified" }
        : { tone: "secondary", text: "Waiting for the first lead" };

  return (
    <div className="space-y-2">
      <ConnectionStrip
        connected={wp.connected}
        label="Your website"
        connectedNote={wpNote}
        warning={wpWarning}
        href="/dashboard/plugins?connector=wordpress"
        hrefLabel={wp.connected ? "Manage in Plugins" : "Connect your site"}
        info="The AI writes the article, adds the schema and meta tags, and publishes it to this site itself. The connection is stored once in Plugins and every part of the app reads that one connection."
        extra={
          wp.connected ? (
            <>
              <Chip tone={wp.defaultStatus === "draft" ? "muted" : "primary"}>
                {wp.defaultStatus === "draft" ? "Saved as draft" : "Published live"}
              </Chip>
              {wp.enableYoastSeo && <Chip tone="secondary">SEO meta tags on</Chip>}
            </>
          ) : undefined
        }
      />

      <ConnectionStrip
        connected={tag.installed && !tag.stale}
        label="Lead tag on your site"
        connectedNote={`${tag.leadsCaptured} lead${tag.leadsCaptured === 1 ? "" : "s"} captured so far${
          tag.domain ? ` from ${tag.domain}` : ""
        }. Each one is traced back to the post or article that sent the visitor.`}
        warning={
          tag.installed
            ? "The tag is installed but no lead has come through in the last 7 days. That is either a quiet week or the snippet was removed from your site — check it in Plugins."
            : "Without the tag, a form submit or WhatsApp tap on your site cannot be counted, so website leads stay at zero even when they happen. The snippet is one line, in Plugins."
        }
        href="/dashboard/plugins?connector=website-tag"
        hrefLabel={tag.installed ? "Manage in Plugins" : "Install the tag"}
        info="One line of JavaScript on your site. It fires only when someone submits a form, taps WhatsApp, an email address or a phone number — never on a plain page view — and it carries the tracking code from the post that brought them, which is how a website lead gets credited to a post."
        extra={
          <>
            <Chip tone={tagState.tone}>{tagState.text}</Chip>
            {tag.verifiedAt && <Chip tone="muted">First lead {fmtDate(tag.verifiedAt)}</Chip>}
          </>
        }
      />
    </div>
  );
}
