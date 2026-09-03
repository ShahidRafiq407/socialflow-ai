/**
 * CODED-SITE SETUP SUITE — the documentation is code, so it is tested like code.
 *
 * WHY THIS EXISTS: for a WordPress user, connecting is a URL and an application
 * password. For someone whose site is hand-built, connecting means writing the
 * receiving end — and the only version of that instruction worth shipping is the
 * exact one: which file, which path, which line holds the secret, where that
 * secret goes on their host, and a handler whose signature check passes first try.
 *
 * The connector claims to support any language on any host. That claim is only as
 * good as the recipes behind it, so this file proves each one is complete and
 * verifies the request we actually send:
 *
 *   - the formula the snippets tell people to compute is the one `custom.ts` signs,
 *   - every recipe names its file, its env line and the traps of its own stack,
 *   - every recipe hashes timestamp + dot + RAW body and compares in constant time,
 *   - every language group in the dropdown has at least one stack behind it,
 *   - every host says where the variable goes and what makes it live,
 *   - the documented ping is the exact ping `verify()` posts,
 *   - and the connector's field help stayed one line, which is the regression this
 *     all started as — the entire contract was once crammed under a field.
 *
 * Nothing here touches the network.
 */
import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { customProvider, signPayload } from "@/lib/cms/custom";
import { getPluginEntry } from "@/lib/plugins/catalog";
import {
  CUSTOM_PING_BODY,
  CUSTOM_PUBLISH_BODY,
  CUSTOM_REQUEST_HEADERS,
  CUSTOM_RESPONSE_CONTRACT,
  CUSTOM_TARGET_CONTRACT,
  CUSTOM_TROUBLESHOOTING,
  CUSTOM_VERIFY_FACTS,
  PING_EVENT,
  PUBLISH_EVENT,
  REQUEST_TIMEOUT_SECONDS,
  SECRET_GENERATOR_COMMANDS,
  SIGNATURE_HEADER,
  SIGNING_SECRET_ENV,
  SUGGESTED_ROUTE_PATH,
  TIMESTAMP_HEADER,
  TIMESTAMP_TOLERANCE_SECONDS,
} from "@/lib/cms/customContract";
import {
  CUSTOM_CURL_SELFTEST,
  CUSTOM_HANDLERS,
  CUSTOM_HANDLER_EXAMPLE,
  CUSTOM_HOSTS,
  CUSTOM_LANGUAGES,
  DEFAULT_HANDLER_ID,
  DEFAULT_HOST_ID,
  DEFAULT_LANGUAGE,
  getHandlerRecipe,
  getHostGuide,
  handlersForLanguage,
} from "@/lib/cms/customStacks";

/** The language-neutral fallback is exempt from the code-shape rules by design. */
const CODED = CUSTOM_HANDLERS.filter((r) => r.id !== "any");
const ANY = getHandlerRecipe("any");
describe("the signature the guide tells people to compute", () => {
  it("is the one we actually send", () => {
    // Computed the way every snippet computes it: HMAC-SHA256 over the timestamp,
    // a dot, then the raw body — hex, with the sha256= prefix.
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
  it("covers the stacks the dropdown promises, well past the JS ones", () => {
    const labels = CUSTOM_HANDLERS.map((r) => r.label).join(" | ");
    expect(CUSTOM_HANDLERS.length).toBeGreaterThanOrEqual(15);
    for (const stack of [
      "Next.js",
      "Astro",
      "Express",
      "Laravel",
      "Django",
      "Flask",
      "FastAPI",
      "Rails",
      "Go",
      "ASP.NET",
      "Spring",
    ]) {
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
    for (const recipe of CODED) {
      // A path, not prose: no sentence, no "then", no trailing full stop.
      expect(recipe.file).toMatch(/^[\w./+-]+\.(ts|tsx|js|php|py|rb|go|cs|java)$/);
    }
  });

  it("keeps the second file and the extra edit as separate fields", () => {
    // Both were once crammed into `file`, which put "routes/publish.js — then
    // app.use(...)" in a copy button.
    for (const recipe of CUSTOM_HANDLERS) {
      if (recipe.fileAlt) expect(recipe.fileAlt.length).toBeGreaterThan(5);
      if (recipe.alsoTouches) expect(recipe.alsoTouches.length).toBeGreaterThan(5);
      expect(recipe.file).not.toContain(" — then ");
    }
  });
});
describe("every recipe says where the secret lives and how it is read", () => {
  it("gives a placeholder line, never a real-looking secret", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.envFile.length).toBeGreaterThan(0);
      expect(recipe.envRead.length).toBeGreaterThan(0);
      expect(recipe.envLine).toContain("paste-the-same");
    }
  });

  it("names the variable the handler reads, allowing a framework prefix", () => {
    // Nuxt only exposes runtimeConfig values prefixed with NUXT_, and plain PHP
    // is handed a config file rather than an env line — everything else is the
    // bare variable.
    for (const recipe of CUSTOM_HANDLERS) {
      if (recipe.id === "php-plain") {
        expect(recipe.envLine).toContain("return [");
        continue;
      }
      expect(recipe.envLine).toContain(`${SIGNING_SECRET_ENV}=`);
    }
  });

  it("warns about the traps of its own stack", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.notes.length).toBeGreaterThan(0);
      for (const note of recipe.notes) expect(note.length).toBeGreaterThan(20);
    }
  });

  it("suggests the same endpoint the field's placeholder does", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.endpoint).toContain("https://");
      expect(recipe.endpoint).toContain(SUGGESTED_ROUTE_PATH);
    }
  });
});
describe("every handler verifies the request the way we send it", () => {
  // PHP renames headers to HTTP_X_POSTLOOM_… and Rails title-cases them, so the
  // comparison is on the shape of the name, not its casing.
  const normalise = (code: string) => code.toLowerCase().replace(/_/g, "-");

  it("reads both headers by their real names", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(normalise(recipe.code)).toContain(TIMESTAMP_HEADER);
      expect(normalise(recipe.code)).toContain(SIGNATURE_HEADER);
    }
  });

  it("compares against the sha256= prefixed value, not a bare hex digest", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.code).toContain("sha256=");
    }
  });

  it("hashes timestamp + dot + raw body, in that order, in every language", () => {
    const joins = [
      'ts + "." + ', // JS, Go, Java
      "$ts . '.' . $raw", // PHP
      "{ts}.{raw}", // Python f-string, C# interpolation
      "#{ts}.#{raw}", // Ruby
      'timestamp + "." + raw', // the language-neutral steps
    ];
    for (const recipe of CUSTOM_HANDLERS) {
      const found = joins.filter((marker) => recipe.code.includes(marker));
      expect(found.length, `${recipe.id} does not join the timestamp to the raw body`)
        .toBeGreaterThan(0);
    }
  });

  it("rejects a stale timestamp with the tolerance we document", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(recipe.code).toContain(String(TIMESTAMP_TOLERANCE_SECONDS));
      const lower = recipe.code.toLowerCase();
      expect(lower.includes("stale timestamp") || lower.includes("seconds away")).toBe(true);
    }
  });

  it("compares in constant time, with that language's own primitive", () => {
    const safe = [
      "timingSafeEqual", // node
      "hash_equals", // PHP
      "compare_digest", // Python
      "secure_compare", // Ruby
      "hmac.Equal", // Go
      "FixedTimeEquals", // .NET
      "MessageDigest.isEqual", // Java
      "diff |=", // the Web Crypto worker, which has no helper
    ];
    for (const recipe of CUSTOM_HANDLERS) {
      const found = safe.filter((marker) => recipe.code.includes(marker));
      expect(found.length, `${recipe.id} compares the signature unsafely`).toBeGreaterThan(0);
    }
  });

  it("answers the ping and stops there", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      const quoted =
        recipe.code.includes(`"${PING_EVENT}"`) || recipe.code.includes(`'${PING_EVENT}'`);
      expect(quoted).toBe(true);
    }
  });

  it("reads the secret from the variable the guide sets", () => {
    for (const recipe of CODED) {
      expect(recipe.code).toContain(SIGNING_SECRET_ENV);
    }
  });

  it("does not tell PHP to swap the key and the data", () => {
    // hash_hmac takes (algo, data, key). Backwards produces a valid digest of the
    // wrong thing, which is the hardest kind of bug to see.
    for (const id of ["laravel", "php-plain", "symfony"]) {
      expect(getHandlerRecipe(id).code).toContain(
        "hash_hmac('sha256', $ts . '.' . $raw, $secret)"
      );
    }
  });
});
describe("the language dropdown cannot offer an empty answer", () => {
  it("lists every language a recipe claims", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(CUSTOM_LANGUAGES).toContain(recipe.language);
    }
  });

  it("has at least one stack behind every option", () => {
    for (const language of CUSTOM_LANGUAGES) {
      expect(handlersForLanguage(language).length, `${language} has no stacks`).toBeGreaterThan(0);
    }
  });

  it("returns only that language's stacks", () => {
    for (const language of CUSTOM_LANGUAGES) {
      for (const recipe of handlersForLanguage(language)) {
        expect(recipe.language).toBe(language);
      }
    }
  });

  it("covers the eight language families, not just JavaScript", () => {
    const all = CUSTOM_LANGUAGES.join(" | ");
    for (const language of ["JavaScript", "PHP", "Python", "Ruby", "Go", "C#", "Java"]) {
      expect(all).toContain(language);
    }
    expect(CUSTOM_LANGUAGES.length).toBeGreaterThanOrEqual(8);
  });

  it("opens on a language whose first stack is the default one", () => {
    expect(handlersForLanguage(DEFAULT_LANGUAGE)[0].id).toBe(DEFAULT_HANDLER_ID);
  });

  it("gives an unlisted stack the same contract, written as steps", () => {
    expect(ANY.id).toBe("any");
    expect(handlersForLanguage(ANY.language)).toContain(ANY);
    for (const step of ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8."]) {
      expect(ANY.code).toContain(step);
    }
    expect(ANY.code.toLowerCase()).toContain("constant-time");
    expect(ANY.code).toContain("HMAC_SHA256");
  });
});

describe("getHandlerRecipe", () => {
  it("returns each stack by its own id", () => {
    for (const recipe of CUSTOM_HANDLERS) {
      expect(getHandlerRecipe(recipe.id)).toBe(recipe);
    }
  });

  it("falls back to the language-neutral steps rather than handing back undefined", () => {
    expect(getHandlerRecipe("perl-cgi").id).toBe("any");
    expect(getHandlerRecipe("").id).toBe("any");
  });

  it("keeps the original single export pointing at the default", () => {
    expect(CUSTOM_HANDLER_EXAMPLE).toBe(getHandlerRecipe(DEFAULT_HANDLER_ID).code);
  });
});
describe("the host dropdown answers where the variable goes", () => {
  it("gives every host a click-path and the step that makes it live", () => {
    for (const host of CUSTOM_HOSTS) {
      expect(host.label.length).toBeGreaterThan(0);
      expect(host.where.length, `${host.id} does not say where`).toBeGreaterThan(20);
      expect(host.after.length, `${host.id} does not say what makes it live`).toBeGreaterThan(20);
    }
  });

  it("lists no host twice", () => {
    const ids = CUSTOM_HOSTS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers the hosts a non-Vercel site actually runs on", () => {
    const labels = CUSTOM_HOSTS.map((h) => h.label).join(" | ");
    for (const host of [
      "Vercel",
      "Netlify",
      "Cloudflare",
      "Railway",
      "Render",
      "Fly.io",
      "Heroku",
      "cPanel",
      "VPS",
      "Docker",
      "AWS",
    ]) {
      expect(labels).toContain(host);
    }
    expect(CUSTOM_HOSTS.length).toBeGreaterThanOrEqual(12);
  });

  it("has an option for a host we did not name", () => {
    const fallback = CUSTOM_HOSTS[CUSTOM_HOSTS.length - 1];
    expect(fallback.id).toBe("other");
    expect(getHostGuide("some-panel-we-never-heard-of")).toBe(fallback);
  });

  it("resolves the default and never returns undefined", () => {
    expect(getHostGuide(DEFAULT_HOST_ID).id).toBe(DEFAULT_HOST_ID);
    for (const host of CUSTOM_HOSTS) expect(getHostGuide(host.id)).toBe(host);
  });

  it("says the variable is read at boot, because that is the 500 people hit", () => {
    const vercel = getHostGuide("vercel");
    expect(`${vercel.where} ${vercel.after}`.toLowerCase()).toContain("redeploy");
  });

  it("keeps the secret out of the web root on shared hosting", () => {
    const cpanel = getHostGuide("cpanel");
    const text = `${cpanel.where} ${cpanel.after} ${(cpanel.notes || []).join(" ")}`;
    expect(text).toContain("public_html");
  });
});

describe("the curl self-test proves the route before the app is involved", () => {
  it("signs the documented ping with the documented scheme", () => {
    expect(CUSTOM_CURL_SELFTEST).toContain("openssl dgst -sha256 -hmac");
    expect(CUSTOM_CURL_SELFTEST).toContain("printf '%s.%s'");
    expect(CUSTOM_CURL_SELFTEST).toContain(`"${TIMESTAMP_HEADER}: $TS"`);
    expect(CUSTOM_CURL_SELFTEST).toContain(`"${SIGNATURE_HEADER}: $SIG"`);
    expect(CUSTOM_CURL_SELFTEST).toContain(`"event":"${PING_EVENT}"`);
  });

  it("reads back the statuses it can return", () => {
    for (const status of ["2xx", "401", "404", "301"]) {
      expect(CUSTOM_CURL_SELFTEST).toContain(status);
    }
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
      // The regression that started this: CUSTOM_TARGET_CONTRACT was the help text
      // for the endpoint field, so the dialog rendered the whole wire format as one
      // run-on paragraph. The contract belongs in the guide.
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

  it("promises no framework and no host the picker cannot back up", () => {
    expect(customProvider.description.toLowerCase()).not.toContain("vercel");
    expect(customProvider.description.toLowerCase()).not.toContain("next.js");
  });
});
describe("the directory row sends people to the picker, not to one stack", () => {
  // The catalog is pure data with no imports on purpose, so these strings are
  // duplicated there by design. That makes drift possible — hence this block.
  const entry = getPluginEntry("custom");
  const text = (entry?.setup || [])
    .map((s) => `${s.title} ${s.detail || ""} ${s.copy || ""}`)
    .join(" ");

  it("still exists as a CMS row", () => {
    expect(entry).toBeDefined();
    expect(entry?.backend).toBe("cms");
  });

  it("no longer names one framework or one host in the blurb", () => {
    const blurb = (entry?.blurb || "").toLowerCase();
    expect(blurb.length).toBeGreaterThan(0);
    for (const claim of ["next.js", "astro", "laravel", "vercel"]) {
      expect(blurb).not.toContain(claim);
    }
  });

  it("walks the user from picker to file to secret to endpoint", () => {
    const steps = entry?.setup || [];
    expect(steps.length).toBeGreaterThanOrEqual(4);
    for (const step of steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect((step.detail || "").length).toBeGreaterThan(20);
    }
    expect(steps.some((s) => (s.copy || "").startsWith(`${SIGNING_SECRET_ENV}=`))).toBe(true);
  });

  it("tells people the dropdowns decide the rest", () => {
    expect(text.toLowerCase()).toContain("dropdown");
    expect(text).toContain(PING_EVENT);
  });

  it("names the language families rather than a single file path", () => {
    for (const language of ["JavaScript", "PHP", "Python", "Ruby", "Go", "Java"]) {
      expect(text).toContain(language);
    }
    // The exact paths belong to the picker, which knows which one applies.
    for (const recipe of CODED) {
      expect(text, `the row hard-codes ${recipe.file}`).not.toContain(recipe.file);
    }
  });
});
