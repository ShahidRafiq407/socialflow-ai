import { NextRequest, NextResponse } from "next/server";

/**
 * Website lead-capture tag.
 *
 * The user pastes ONE line into their site:
 *   <script defer src="https://<app>/api/track/t.js?k=<trackingKey}"></script>
 *
 * What it does:
 *  - stores first-touch attribution (utm_source / utm_campaign / utm_content)
 *    in a first-party cookie, so a lead can be traced back to the exact post
 *    or article that sent the visitor;
 *  - sends ONE "install" ping per browser session so the dashboard can verify
 *    the tag is live — no row is written for it;
 *  - fires a "lead" event only on real intent: form submit, mailto/tel click,
 *    WhatsApp link, or any element marked data-lead.
 *
 * Pageviews are deliberately never sent. That keeps the visitor's privacy and
 * keeps the database small.
 */

export const dynamic = "force-dynamic";

function buildScript(endpoint: string): string {
  return `(function(){
  "use strict";
  var s = document.currentScript;
  if (!s) {
    var all = document.getElementsByTagName("script");
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && all[i].src.indexOf("/api/track/t.js") > -1) { s = all[i]; break; }
    }
  }
  if (!s || !s.src) return;

  var key = "";
  try { key = new URL(s.src).searchParams.get("k") || ""; } catch (e) { return; }
  if (!key) return;

  var ENDPOINT = ${JSON.stringify(endpoint)};
  var COOKIE = "sf_attr";
  var sent = {};

  function readCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }

  function writeCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + d.toUTCString() +
      "; path=/; SameSite=Lax" + secure;
  }

  // ── first-touch attribution ────────────────────────────────────────────────
  var attr = {};
  try { attr = JSON.parse(readCookie(COOKIE) || "{}") || {}; } catch (e) { attr = {}; }

  var q = null;
  try { q = new URL(location.href).searchParams; } catch (e) { q = null; }

  if (q && (q.get("utm_source") || q.get("utm_content") || q.get("utm_campaign"))) {
    // A fresh campaign visit always wins, so the newest post gets the credit.
    attr = {
      s: q.get("utm_source") || "",
      m: q.get("utm_medium") || "",
      c: q.get("utm_campaign") || "",
      ct: q.get("utm_content") || "",
      r: document.referrer || "",
      t: Date.now()
    };
    writeCookie(COOKIE, JSON.stringify(attr), 90);
  } else if (!attr.t) {
    attr = { s: "", m: "", c: "", ct: "", r: document.referrer || "", t: Date.now() };
    writeCookie(COOKIE, JSON.stringify(attr), 90);
  }

  function post(body) {
    var payload = JSON.stringify(body);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
        return;
      }
    } catch (e) {}
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        mode: "cors"
      })["catch"](function () {});
    } catch (e) {}
  }

  function base(type) {
    return {
      k: key,
      type: type,
      url: location.href.slice(0, 500),
      path: location.pathname.slice(0, 300),
      title: (document.title || "").slice(0, 200),
      ref: attr.r || "",
      utm_source: attr.s || "",
      utm_medium: attr.m || "",
      utm_campaign: attr.c || "",
      utm_content: attr.ct || ""
    };
  }

  // ── one install ping per session (verification only, nothing stored) ───────
  try {
    if (!sessionStorage.getItem("sf_ping")) {
      sessionStorage.setItem("sf_ping", "1");
      post(base("install"));
    }
  } catch (e) { post(base("install")); }

  function lead(action, detail) {
    var k = action + "|" + (detail || "");
    if (sent[k]) return;
    sent[k] = 1;
    var b = base("lead");
    b.action = action;
    if (detail) b.detail = String(detail).slice(0, 200);
    post(b);
  }

  // ── real intent signals only ──────────────────────────────────────────────
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (!f || f.tagName !== "FORM") return;
    if (f.getAttribute("data-lead") === "false") return;
    // Search boxes are not leads
    if (f.getAttribute("role") === "search") return;
    var q = f.querySelector('input[type="search"], input[name="s"], input[name="q"]');
    if (q && f.elements.length <= 2) return;

    var name = "", contact = "";
    try {
      var el = f.querySelector('input[type="email"], input[name*="mail" i]');
      if (el && el.value) contact = el.value;
      if (!contact) {
        var tel = f.querySelector('input[type="tel"], input[name*="phone" i]');
        if (tel && tel.value) contact = tel.value;
      }
      var nm = f.querySelector('input[name*="name" i]');
      if (nm && nm.value) name = nm.value;
    } catch (err) {}

    var b = base("lead");
    b.action = "form_submit";
    b.formId = (f.getAttribute("id") || f.getAttribute("name") || "").slice(0, 80);
    if (name) b.name = String(name).slice(0, 120);
    if (contact) b.contact = String(contact).slice(0, 160);
    post(b);
  }, true);

  document.addEventListener("click", function (e) {
    var el = e.target;
    for (var i = 0; el && i < 5; i++) {
      if (el.hasAttribute && el.hasAttribute("data-lead")) {
        lead(el.getAttribute("data-lead") || "custom", el.getAttribute("data-lead-detail") || "");
        return;
      }
      if (el.tagName === "A" && el.href) {
        var h = el.href;
        if (h.indexOf("mailto:") === 0) return lead("mailto", h.slice(7, 100));
        if (h.indexOf("tel:") === 0) return lead("tel", h.slice(4, 60));
        if (/wa\\.me|api\\.whatsapp\\.com|web\\.whatsapp\\.com/.test(h)) return lead("whatsapp", "");
        if (/calendly\\.com|cal\\.com\\/|hubspot|typeform/.test(h)) return lead("booking", "");
      }
      el = el.parentElement;
    }
  }, true);
})();`;
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const script = buildScript(`${origin}/api/track/lead`);

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Same script for every workspace (the key comes from the query string),
      // so it can be cached hard at the edge.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
