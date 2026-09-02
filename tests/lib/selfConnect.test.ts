/**
 * TRACE SUITE — constrained self-connect (the controller attaching an MCP server)
 *
 * WHY THIS EXISTS: this is the one place the controller can extend its own reach.
 * Saying yes points this product at an outside host and hands that host the
 * workspace's auth headers, so the rules of the handshake are pinned here rather
 * than left to a prompt. Three invariants matter most: (1) FAIL CLOSED — silence,
 * a changed subject, an over-long message, or an unreadable reply all read as
 * "not yet", and a decline anywhere in a message beats an approval in the same
 * message; (2) WHAT WAS APPROVED IS WHAT GETS ATTACHED — a parked request
 * round-trips byte-for-byte and refuses to exist without both a name and a URL,
 * so the confirm step can take an id alone; (3) SECRETS STAY OUT OF WORDS —
 * everything the user reads quotes header NAMES only, never a value.
 * The rest pins the TTL, the header normalisation, and the two rendered messages.
 */
import { describe, it, expect } from "vitest";
import {
  CONNECT_REQUEST_CATEGORY,
  CONNECT_REQUEST_TTL_MS,
  MAX_APPROVAL_CHARS,
  MAX_CONNECT_HEADERS,
  buildConnectRequestContent,
  describeConnectedServer,
  describeProposalForUser,
  headerKeysOf,
  isConnectRequestExpired,
  normalizeHeaders,
  parseConnectRequest,
  readApproval,
  readApprovalFromReplies,
  toHeaderMap,
  type ConnectRequestRecord,
} from "@/lib/agents/controller/selfConnect";

const RECORD: ConnectRequestRecord = {
  name: "Linear",
  url: "https://mcp.linear.app/mcp",
  reason: "so I can file issues from chat",
  headerKeys: ["Authorization"],
  toolNames: ["list_issues", "create_issue"],
  secret: "enc:v1:abc",
};

describe("normalizeHeaders", () => {
  it("accepts the pair-array shape a model tends to emit", () => {
    expect(normalizeHeaders([{ key: "Authorization", value: "Bearer abc" }])).toEqual([
      { key: "Authorization", value: "Bearer abc" },
    ]);
  });

  it("accepts a plain object too, and tolerates `name` for the key", () => {
    expect(normalizeHeaders({ "X-Api-Key": "k1" })).toEqual([{ key: "X-Api-Key", value: "k1" }]);
    expect(normalizeHeaders([{ name: "X-Api-Key", value: "k1" }])).toEqual([{ key: "X-Api-Key", value: "k1" }]);
  });

  it("drops entries missing a key or a value", () => {
    expect(normalizeHeaders([{ key: "Authorization", value: "" }, { key: "  ", value: "v" }, "nope"])).toEqual([]);
  });

  it("keeps the first of a case-insensitive duplicate", () => {
    expect(
      normalizeHeaders([
        { key: "Authorization", value: "first" },
        { key: "authorization", value: "second" },
      ])
    ).toEqual([{ key: "Authorization", value: "first" }]);
  });

  it("caps how many headers one proposal may carry", () => {
    const raw = Array.from({ length: MAX_CONNECT_HEADERS + 4 }, (_, i) => ({ key: `H${i}`, value: "v" }));
    expect(normalizeHeaders(raw)).toHaveLength(MAX_CONNECT_HEADERS);
  });

  it("trims a value but never rewrites its insides — a token is not prose", () => {
    expect(normalizeHeaders([{ key: "  Authorization  ", value: "  Bearer a  b  " }])).toEqual([
      { key: "Authorization", value: "Bearer a  b" },
    ]);
  });

  it("returns [] for anything that isn't a header collection", () => {
    expect(normalizeHeaders(undefined)).toEqual([]);
    expect(normalizeHeaders(null)).toEqual([]);
    expect(normalizeHeaders("Authorization: Bearer abc")).toEqual([]);
  });

  it("splits into names-only and a real header map", () => {
    const headers = normalizeHeaders([{ key: "Authorization", value: "Bearer abc" }]);
    expect(headerKeysOf(headers)).toEqual(["Authorization"]);
    expect(toHeaderMap(headers)).toEqual({ Authorization: "Bearer abc" });
  });
});

describe("buildConnectRequestContent / parseConnectRequest", () => {
  it("round-trips exactly what will be attached", () => {
    const content = buildConnectRequestContent(RECORD);
    expect(parseConnectRequest(content)).toEqual(RECORD);
  });

  it("refuses to park a stub — no name or no URL means nothing to approve", () => {
    expect(buildConnectRequestContent({ name: "", url: "https://mcp.example.com/mcp" })).toBe("");
    expect(buildConnectRequestContent({ name: "Linear", url: "   " })).toBe("");
  });

  it("carries the ciphertext through but defaults it to null", () => {
    const parsed = parseConnectRequest(buildConnectRequestContent({ name: "N", url: "https://x.dev/mcp" }));
    expect(parsed!.secret).toBeNull();
  });

  it("never mistakes another system row for a pending connection", () => {
    expect(parseConnectRequest("The user's brand tone is playful.")).toBeNull();
    expect(parseConnectRequest("")).toBeNull();
    expect(parseConnectRequest("{not json")).toBeNull();
    expect(parseConnectRequest('{"outcome":"published","platform":"LinkedIn"}')).toBeNull();
    expect(parseConnectRequest('{"kind":"connect_request"}')).toBeNull();
  });

  it("caps the fields so one proposal cannot become a payload", () => {
    const parsed = parseConnectRequest(
      buildConnectRequestContent({
        name: "N".repeat(80),
        url: "https://x.dev/mcp",
        reason: "r".repeat(400),
        toolNames: Array.from({ length: 90 }, (_, i) => `tool_${i}`),
      })
    )!;
    expect(parsed.name).toHaveLength(40);
    expect(parsed.reason).toHaveLength(240);
    expect(parsed.toolNames).toHaveLength(50);
  });
});

describe("isConnectRequestExpired", () => {
  const now = 1_700_000_000_000;

  it("keeps a fresh request alive", () => {
    expect(isConnectRequestExpired(new Date(now - 60_000), now)).toBe(false);
  });

  it("retires one past the TTL", () => {
    expect(isConnectRequestExpired(new Date(now - CONNECT_REQUEST_TTL_MS - 1), now)).toBe(true);
  });

  it("treats a missing or unreadable timestamp as expired, not as fresh", () => {
    expect(isConnectRequestExpired(null, now)).toBe(true);
    expect(isConnectRequestExpired(undefined, now)).toBe(true);
    expect(isConnectRequestExpired(new Date("nonsense"), now)).toBe(true);
  });
});

describe("readApproval — fails closed", () => {
  it("reads a plain yes, in either language", () => {
    for (const yes of ["yes", "Yes!", "ok", "sure", "haan", "theek hai", "kar do", "go ahead", "connect it"]) {
      expect(readApproval(yes)).toBe("approved");
    }
  });

  it("reads a plain no, in either language", () => {
    for (const no of ["no", "nope", "nahi", "cancel", "abhi nahi", "later", "never mind", "stop"]) {
      expect(readApproval(no)).toBe("declined");
    }
  });

  it("lets a decline beat an approval inside the same message", () => {
    expect(readApproval("haan mat karo")).toBe("declined");
    expect(readApproval("yes but wait")).toBe("declined");
  });

  it("says unclear for silence or for an unrelated reply", () => {
    expect(readApproval("")).toBe("unclear");
    expect(readApproval("   ")).toBe("unclear");
    expect(readApproval(null)).toBe("unclear");
    expect(readApproval("what does that server even do?")).toBe("unclear");
    expect(readApproval("!!!")).toBe("unclear");
  });

  it("refuses to mine consent out of a paragraph", () => {
    const long = `yes ${"x".repeat(MAX_APPROVAL_CHARS)}`;
    expect(long.length).toBeGreaterThan(MAX_APPROVAL_CHARS);
    expect(readApproval(long)).toBe("unclear");
  });

  it("matches whole words only, so a yes inside another word does not count", () => {
    expect(readApproval("okra")).toBe("unclear");
    expect(readApproval("jissey")).toBe("unclear");
    expect(readApproval("connection")).toBe("unclear");
  });

  it("leaves the too-ambiguous Roman Urdu tokens out on purpose", () => {
    // "ya kia hai" / "theek hai na" land inside ordinary sentences far too often
    // to spend a workspace's credentials on. Asking again is the cheap failure.
    expect(readApproval("ya")).toBe("unclear");
    expect(readApproval("ha")).toBe("unclear");
  });

  it("ignores punctuation and apostrophes around the answer", () => {
    expect(readApproval("yes, please do")).toBe("approved");
    expect(readApproval("don't")).toBe("declined");
  });
});

describe("readApprovalFromReplies", () => {
  it("takes the answer even when it arrives after a detour", () => {
    expect(readApprovalFromReplies(["what does that server even do?", "haan karo"])).toBe("approved");
  });

  it("treats an earlier no as final", () => {
    expect(readApprovalFromReplies(["nahi", "ok fine yes"])).toBe("declined");
  });

  it("reads hesitation as a no, so a later yes needs a fresh proposal", () => {
    // "wait" / "hold on" / "later" all land on the decline side deliberately: the
    // wrong answer here spends the workspace's credentials, so hesitation stops it.
    expect(readApprovalFromReplies(["wait, what is that", "yes ok"])).toBe("declined");
  });

  it("says unclear when the user never actually answered", () => {
    expect(readApprovalFromReplies([])).toBe("unclear");
    expect(readApprovalFromReplies(["and what about instagram"])).toBe("unclear");
  });
});

describe("describeProposalForUser", () => {
  it("quotes the parked URL, the header names and the real tool list", () => {
    const text = describeProposalForUser(RECORD);
    expect(text).toContain('Connect "Linear" to this workspace?');
    expect(text).toContain("- Server: https://mcp.linear.app/mcp");
    expect(text).toContain("- Auth headers it will be sent: Authorization (values hidden)");
    expect(text).toContain("- Tools this would add (2): list_issues, create_issue");
    expect(text).toContain("- Why: so I can file issues from chat");
    expect(text).toContain("Nothing is attached until you answer.");
  });

  it("never leaks a header value or the ciphertext", () => {
    const text = describeProposalForUser({ ...RECORD, secret: "enc:v1:SUPERSECRET" });
    expect(text).not.toContain("SUPERSECRET");
    expect(text).not.toContain("enc:v1:");
  });

  it("says so plainly when no auth is involved", () => {
    expect(describeProposalForUser({ ...RECORD, headerKeys: [] })).toContain("- Auth headers: none");
  });

  it("omits the lines it has nothing to put in", () => {
    const text = describeProposalForUser({ ...RECORD, reason: "", toolNames: [] });
    expect(text).not.toContain("- Why:");
    expect(text).not.toContain("Tools this would add");
  });

  it("truncates a long tool list rather than dumping it", () => {
    const toolNames = Array.from({ length: 20 }, (_, i) => `tool_${i}`);
    const text = describeProposalForUser({ ...RECORD, toolNames });
    expect(text).toContain("Tools this would add (20):");
    expect(text).toContain("+8 more");
    expect(text).not.toContain("tool_19");
  });
});

describe("describeConnectedServer", () => {
  it("reports the count and that the tools arrive next message", () => {
    const text = describeConnectedServer("Linear", ["list_issues", "create_issue"]);
    expect(text).toContain('Connected "Linear" — 2 tools attached: list_issues, create_issue');
    expect(text).toContain("callable from your next message");
  });

  it("says the truth when the server exposed nothing", () => {
    expect(describeConnectedServer("Empty", [])).toContain("exposed no tools");
  });

  it("gets the singular right", () => {
    expect(describeConnectedServer("Solo", ["only_tool"])).toContain("1 tool attached");
  });
});

describe("constants", () => {
  it("parks requests under their own category, never as a remembered fact", () => {
    expect(CONNECT_REQUEST_CATEGORY).toBe("connect_request");
  });

  it("expires consent inside one sitting", () => {
    expect(CONNECT_REQUEST_TTL_MS).toBe(15 * 60 * 1000);
  });
});
