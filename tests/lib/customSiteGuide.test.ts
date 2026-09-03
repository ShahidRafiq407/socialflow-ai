/**
 * CODED-SITE GUIDE SUITE — the documentation is code, so it is tested like code.
 *
 * WHY THIS EXISTS: for a WordPress user, connecting is a URL and an application
 * password. For someone whose site is Next.js, Astro or Laravel, connecting means
 * writing the receiving end — and the only version of that instruction worth
 * shipping is the exact one: which file, which path, which line holds the secret,
 * and a handler whose signature check passes on the first try.
 *
 * Documentation that drifts is worse than none, because the user trusts it and
 * then spends an afternoon on a 401. So the guide is built from the same
 * constants `custom.ts` signs with, and this file proves the two still agree:
 *
 *   - the formula the snippets tell people to compute is the one we actually send,
 *   - every recipe names the file, the env line and the traps for its own stack,
 *   - the documented ping is the exact ping `verify()` posts,
 *   - and the connector's field help stayed one line, which is the regression
 *     this all started as — the entire contract was once crammed under a field.
 *
 * Nothing here touches the network.
 */
import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { customProvider, signPayload } from "@/lib/cms/custom";
import { getPluginEntry } from "@/lib/plugins/catalog";
import {
  CUSTOM_HANDLERS,
  CUSTOM_HANDLER_EXAMPLE,
  CUSTOM_PING_BODY,
  CUSTOM_PUBLISH_BODY,
  CUSTOM_REQUEST_HEADERS,
  CUSTOM_RESPONSE_CONTRACT,
  CUSTOM_TARGET_CONTRACT,
  CUSTOM_TROUBLESHOOTING,
  CUSTOM_VERIFY_FACTS,
  DEFAULT_HANDLER_ID,
  PING_EVENT,
  PUBLISH_EVENT,
  REQUEST_TIMEOUT_SECONDS,
  SECRET_GENERATOR_COMMANDS,
  SIGNATURE_HEADER,
  SIGNING_SECRET_ENV,
  SUGGESTED_ROUTE_PATH,
  TIMESTAMP_HEADER,
  TIMESTAMP_TOLERANCE_SECONDS,
  getHandlerRecipe,
} from "@/lib/cms/customContract";

describe("the signature the guide tells people to compute", () => {
  it("is the one we actually send", () => {
    // Computed the way every snippet in the guide computes it: HMAC-SHA256 over
    // the timestamp, a dot, then the raw body — hex, with the sha256= prefix.
    const secret = "a-long-random-string";
    const ts = 1767225600;
    const raw = '{"event":"article.publish","title":"Hello"}';

    const asDocumented =
      "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");

    expect(signPayload(secret, ts, raw)).toBe(asDocumented);
  });

  it("changes with the body, the timestamp and the secret", () => {
    const base = signPayload("k", 1767225600, "body");
    expect(signPayload("k", 1767225600, "body!")).not.toBe(base);
    expect(signPayload("k", 1767225601, "body")).not.toBe(base);
    expect(signPayload("k2", 1767225600, "body")).not.toBe(base);
  });
});

describe("every handler recipe is complete enough to paste", () => {
  it("ships at least the five stacks the blurb promises", () => {
    const labels = CUSTOM_HANDLERS.map((r) => r.label).join(" ");
    expect(CUSTOM_HANDLERS.length).toBeGreaterThanOrEqual(5);
    for (const stack of ["Next.js", "Astro", "Laravel", "Express"]) {
      expect(labels).toContain(stack);
    }
  });

  it("gives each stack a unique id and label", () => {
    const ids = CUSTOM_HANDLERS.map((r) => r.id);
    const labels = CUSTOM_HANDLERS.map((r) => r.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("names an exact file path, not a description of one", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      // A path, not prose: no sentence, no "then", no trailing full stop.
      expect(recipe.file).toMatch(/^[\w./-]+\.(ts|js|php)$/);
      if (recipe.fileAlt) expect(recipe.fileAlt).toMatch(/^src\/[\w./-]+\.(ts|js)$/);
    }
  });

  it("says where the secret goes and gives the exact line", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.envFile.length).toBeGreaterThan(0);
      expect(recipe.envLine.startsWith(`${SIGNING_SECRET_ENV}=`)).toBe(true);
      // A placeholder, never a real-looking secret someone might reuse.
      expect(recipe.envLine).toContain("paste-the-same");
    }
  });

  it("warns about the traps of its own stack", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.notes.length).toBeGreaterThan(0);
      for (const note of recipe.notes) expect(note.length).toBeGreaterThan(20);
    }
  });
});

describe("every handler recipe verifies the request the way we send it", () => {
  it("reads both headers by their real names", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.code).toContain(TIMESTAMP_HEADER);
      expect(recipe.code).toContain(SIGNATURE_HEADER);
    }
  });

  it("compares against the sha256= prefixed value, not a bare hex digest", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.code).toContain("sha256=");
    }
  });

  it("hashes timestamp + dot + raw body, in that order", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      const js = recipe.code.includes('update(ts + "." + raw)');
      const php = recipe.code.includes("$ts . '.' . $raw");
      expect(js || php).toBe(true);
    }
  });

  it("rejects a stale timestamp with the tolerance we document", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.code).toContain(String(TIMESTAMP_TOLERANCE_SECONDS));
      expect(recipe.code.toLowerCase()).toContain("stale timestamp");
    }
  });

  it("compares in constant time", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      const js = recipe.code.includes("timingSafeEqual");
      const php = recipe.code.includes("hash_equals");
      expect(js || php).toBe(true);
    }
  });

  it("answers the ping and stops there", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      const quoted =
        recipe.code.includes(`"${PING_EVENT}"`) || recipe.code.includes(`'${PING_EVENT}'`);
      expect(quoted).toBe(true);
    }
  });

  it("reads the secret from the environment variable the guide names", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.code).toContain(SIGNING_SECRET_ENV);
    }
  });

  it("passes the raw body to the hash, never a re-serialised object", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      // The call, not the word — every snippet also mentions the parse in a
      // comment above the line that reads the body, which is the point.
      const parseAt = Math.max(
        recipe.code.indexOf("JSON.parse(raw)"),
        recipe.code.indexOf("json_decode($raw")
      );
      const compareAt = Math.max(
        recipe.code.indexOf("timingSafeEqual"),
        recipe.code.indexOf("hash_equals")
      );
      expect(compareAt).toBeGreaterThan(-1);
      expect(parseAt).toBeGreaterThan(compareAt);
    }
  });

  it("does not tell PHP to swap the key and the data", () => {
    // hash_hmac takes (algo, data, key). Getting it backwards produces a valid
    // digest of the wrong thing, which is the hardest kind of bug to see.
    const laravel = getHandlerRecipe("laravel");
    expect(laravel.code).toContain("hash_hmac('sha256', $ts . '.' . $raw, $secret)");
  });
});

describe("getHandlerRecipe", () => {
  it("resolves the default the guide opens on", () => {
    expect(getHandlerRecipe(DEFAULT_HANDLER_ID).id).toBe(DEFAULT_HANDLER_ID);
  });

  it("returns each stack by its own id", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(getHandlerRecipe(recipe.id)).toBe(recipe);
    }
  });

  it("falls back rather than handing the guide undefined", () => {
    expect(getHandlerRecipe("rails").id).toBe(DEFAULT_HANDLER_ID);
    expect(getHandlerRecipe("").id).toBe(DEFAULT_HANDLER_ID);
  });

  it("keeps the original single export pointing at the default", () => {
    expect(CUSTOM_HANDLER_EXAMPLE).toBe(getHandlerRecipe(DEFAULT_HANDLER_ID).code);
  });
});

describe("the documented request is the request custom.ts sends", () => {
  it("shows both headers and a POST to the suggested path", () => {
    expect(CUSTOM_REQUEST_HEADERS).toContain(`${TIMESTAMP_HEADER}:`);
    expect(CUSTOM_REQUEST_HEADERS).toContain(`${SIGNATURE_HEADER}: sha256=`);
    expect(CUSTOM_REQUEST_HEADERS.startsWith("POST https://")).toBe(true);
    expect(CUSTOM_REQUEST_HEADERS).toContain(SUGGESTED_ROUTE_PATH);
    expect(CUSTOM_REQUEST_HEADERS).toContain("Content-Type: application/json");
  });

  it("documents a ping with exactly the keys verify() posts", () => {
    const ping = JSON.parse(CUSTOM_PING_BODY);
    expect(Object.keys(ping).sort()).toEqual(["event", "sentAt"]);
    expect(ping.event).toBe(PING_EVENT);
    expect(typeof ping.sentAt).toBe("string");
  });

  it("documents every field a real publish carries", () => {
    expect(CUSTOM_PUBLISH_BODY).toContain(PUBLISH_EVENT);
    for (const field of [
      "contentType",
      "status",
      "title",
      "slug",
      "html",
      "excerpt",
      "seo",
      "metaTitle",
      "metaDescription",
      "focusKeyword",
      "schema",
      "tags",
      "featuredImage",
    ]) {
      expect(CUSTOM_PUBLISH_BODY).toContain(`"${field}"`);
    }
  });

  it("says what a 2xx has to contain, and that redirects are refused", () => {
    expect(CUSTOM_RESPONSE_CONTRACT).toContain('"url"');
    expect(CUSTOM_RESPONSE_CONTRACT).toContain("2xx");
    expect(CUSTOM_RESPONSE_CONTRACT.toLowerCase()).toContain("redirect");
  });

  it("assembles the one-block version from the same three parts", () => {
    expect(CUSTOM_TARGET_CONTRACT).toContain(CUSTOM_REQUEST_HEADERS);
    expect(CUSTOM_TARGET_CONTRACT).toContain(CUSTOM_PUBLISH_BODY);
    expect(CUSTOM_TARGET_CONTRACT).toContain(CUSTOM_RESPONSE_CONTRACT);
  });
});

describe("what the verify button does is stated, not implied", () => {
  it("names the ping, the 2xx rule and the real timeout", () => {
    const all = CUSTOM_VERIFY_FACTS.join(" ");
    expect(CUSTOM_VERIFY_FACTS.length).toBeGreaterThanOrEqual(4);
    expect(all).toContain(PING_EVENT);
    expect(all).toContain("2xx");
    expect(all).toContain(String(REQUEST_TIMEOUT_SECONDS));
  });

  it("warns that a private address is refused before any request", () => {
    expect(CUSTOM_VERIFY_FACTS.join(" ").toLowerCase()).toContain("localhost");
  });

  it("offers a command for the secret instead of asking people to invent one", () => {
    expect(SECRET_GENERATOR_COMMANDS).toContain("openssl rand -hex 32");
    expect(SECRET_GENERATOR_COMMANDS).toContain("randomBytes(32)");
  });
});

describe("troubleshooting covers the statuses the app can actually show", () => {
  it("maps each symptom to one cause and one fix", () => {
    expect(CUSTOM_TROUBLESHOOTING.length).toBeGreaterThanOrEqual(6);
    for (const row of CUSTOM_TROUBLESHOOTING) {
      expect(row.symptom.length).toBeGreaterThan(0);
      expect(row.cause.length).toBeGreaterThan(10);
      expect(row.fix.length).toBeGreaterThan(10);
    }
  });

  it("lists no symptom twice", () => {
    const symptoms = CUSTOM_TROUBLESHOOTING.map((r) => r.symptom);
    expect(new Set(symptoms).size).toBe(symptoms.length);
  });

  it("covers the four failures a first attempt really hits", () => {
    const symptoms = CUSTOM_TROUBLESHOOTING.map((r) => r.symptom).join(" | ");
    for (const status of ["401", "404", "405", "419"]) {
      expect(symptoms).toContain(status);
    }
  });
});

describe("the connector form stayed a form", () => {
  it("keeps every field's help to a single short line", () => {
    for (const field of customProvider.fields) {
      if (!field.help) continue;
      // The regression that started this: CUSTOM_TARGET_CONTRACT was the help
      // text for the endpoint field, so the dialog rendered the whole wire
      // format as one run-on paragraph. The contract belongs in the guide.
      expect(field.help).not.toContain("\n");
      expect(field.help.length).toBeLessThan(220);
    }
  });

  it("asks for the endpoint, the secret and nothing else mandatory", () => {
    const required = customProvider.fields.filter((f) => f.required).map((f) => f.key);
    expect(required.sort()).toEqual(["endpointUrl", "signingSecret"]);
  });

  it("shows the suggested route in the placeholder people copy", () => {
    const endpoint = customProvider.fields.find((f) => f.key === "endpointUrl");
    expect(endpoint?.placeholder).toContain(SUGGESTED_ROUTE_PATH);
  });

  it("never stores the endpoint as a credential, nor the secret as readable meta", () => {
    const byKey = new Map(customProvider.fields.map((f) => [f.key, f]));
    expect(byKey.get("endpointUrl")?.store).toBe("meta");
    expect(byKey.get("endpointUrl")?.secret).toBe(false);
    expect(byKey.get("signingSecret")?.store).toBe("credentials");
    expect(byKey.get("signingSecret")?.secret).toBe(true);
    expect(byKey.get("bearerToken")?.store).toBe("credentials");
    expect(byKey.get("bearerToken")?.secret).toBe(true);
  });

  it("points the secret field at the environment variable the guide sets", () => {
    const secretField = customProvider.fields.find((f) => f.key === "signingSecret");
    expect(secretField?.help).toContain(SIGNING_SECRET_ENV);
  });
});

describe("the directory row and the guide tell the same story", () => {
  // The catalog is pure data with no imports on purpose, so these strings are
  // duplicated there by design. That makes drift possible — hence this block.
  const entry = getPluginEntry("custom");

  it("still exists as a CMS row", () => {
    expect(entry).toBeDefined();
    expect(entry?.backend).toBe("cms");
  });

  it("walks the user from file to secret to endpoint, with something to copy", () => {
    const steps = entry?.setup || [];
    expect(steps.length).toBeGreaterThanOrEqual(4);
    for (const step of steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect((step.detail || "").length).toBeGreaterThan(20);
    }
    expect(steps.some((s) => (s.copy || "").startsWith(`${SIGNING_SECRET_ENV}=`))).toBe(true);
  });

  it("names the same exact file paths the guide hands out", () => {
    const text = (entry?.setup || []).map((s) => `${s.title} ${s.detail} ${s.copy || ""}`).join(" ");
    const listed = CUSTOM_HANDLERS.filter((recipe) => text.includes(recipe.file));
    expect(listed.length).toBeGreaterThanOrEqual(3);
    expect(text).toContain(SUGGESTED_ROUTE_PATH);
    expect(text).toContain(PING_EVENT);
  });
});
