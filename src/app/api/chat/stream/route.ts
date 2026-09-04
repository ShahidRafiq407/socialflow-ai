// ============================================================================
// POST /api/chat/stream
//
// The single endpoint the chat runs on. Server-Sent Events, one event per thing
// that happens: thoughts as the model thinks, text as it writes, a tool card per
// call, an artifact card per real result. Both messages are persisted so a
// refresh restores the turn exactly as it streamed.
//
// One turn is one `chat.message`, charged here and settled here. The tools the
// turn decides to use are not free either — a render inside the chat is charged
// per asset at the media choke point — so this charge covers exactly what it says
// it does: the model calls the turn itself makes, up to the plan's loop
// allowance. That allowance is passed down rather than looked up, so the loops
// the chat is allowed to take are the ones the plan that paid for them permits.
// ============================================================================

import { getEntitlements } from "@/lib/billing/plans";
import {
  completeAction,
  failAction,
  isEntitlementError,
  requireAction,
  type ActionTicket,
} from "@/lib/billing/entitlements";
import { withMeterContext, type MeterContext } from "@/lib/billing/meter";
import { resolveIdentity } from "@/lib/agents/controller/auth";
import { getChatSettings } from "@/lib/agents/controller/settings";
import { runController, type ControllerAttachment } from "@/lib/agents/controller/runtime";
import {
  autoTitleSession,
  openSession,
  refreshSessionSummary,
  saveAssistantMessage,
  saveUserMessage,
} from "@/lib/agents/controller/session";
import {
  sseFrame,
  STOPPED_TURN_TEXT,
  type AttachmentRef,
  type ControllerEvent,
} from "@/lib/agents/controller/types";
import { parseAllUploadedFiles } from "@/lib/agents/chat/documentParser";
import { isKnownChatModel } from "@/lib/agents/controller/models";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ATTACHMENTS = 10;

interface IncomingFile {
  name?: string;
  type?: string;
  size?: number;
  content?: string;
}

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** One-shot SSE stream for a failure that happens before the turn starts. */
function errorStream(event: ControllerEvent): Response {
  const encoder = new TextEncoder();
  return sseResponse(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseFrame(event)));
        controller.close();
      },
    })
  );
}

/**
 * Parses text-bearing attachments up front so the model's prompt can describe
 * them accurately, and keeps media as data URLs for inline multimodal use.
 */
async function prepareAttachments(
  files: IncomingFile[]
): Promise<{ attachments: ControllerAttachment[]; refs: AttachmentRef[] }> {
  const usable = files
    .filter((f) => f && typeof f.name === "string" && typeof f.content === "string" && f.content.length > 0)
    .slice(0, MAX_ATTACHMENTS);

  if (usable.length === 0) return { attachments: [], refs: [] };

  const parsed = await parseAllUploadedFiles(
    usable.map((f) => ({ name: f.name as string, type: f.type || "", content: f.content as string }))
  ).catch(() => []);

  const attachments: ControllerAttachment[] = usable.map((f, i) => {
    const p = (parsed as any[])[i];
    const kind = p?.kind || "unknown";
    const summary = p?.error ? `Could not read: ${p.error}` : p?.summary || "Attached file";
    return {
      name: f.name as string,
      type: f.type || p?.type || "application/octet-stream",
      size: typeof f.size === "number" ? f.size : (f.content as string).length,
      kind,
      content: f.content as string,
      summary,
    };
  });

  const refs: AttachmentRef[] = attachments.map((a) => ({
    name: a.name,
    type: a.type,
    size: a.size,
    kind: a.kind,
  }));

  return { attachments, refs };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const message: string = typeof body?.message === "string" ? body.message : String(body?.prompt || "");
  const requestedWorkspaceId: string | null = body?.workspaceId || null;
  const requestedSessionId: string | null = body?.sessionId || body?.chatSessionId || null;
  const modelOverride: string | undefined =
    typeof body?.model === "string" && isKnownChatModel(body.model) ? body.model : undefined;
  const files: IncomingFile[] = Array.isArray(body?.files) ? body.files : [];

  if (!message.trim() && files.length === 0) {
    return new Response(JSON.stringify({ error: "message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const identity = await resolveIdentity(requestedWorkspaceId);
  if (!identity.ok) {
    return new Response(JSON.stringify({ error: identity.error }), {
      status: identity.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { userId, workspaceId } = identity.identity;

  // Gate and charge before anything is written down. A refused turn must not leave
  // a user message in history with no answer under it — that reads as a bug rather
  // than as a plan boundary.
  //
  // The refusal goes out as an SSE `error` frame rather than a 402, because the
  // client opened an event stream and a JSON body would arrive as an unparseable
  // chunk. `code: "plan_blocked"` is what turns it into an upgrade prompt.
  let ticket: ActionTicket;
  try {
    ticket = await requireAction({
      userId,
      action: "chat.message",
      workspaceId,
      referenceId: requestedSessionId,
    });
  } catch (err) {
    if (!isEntitlementError(err)) throw err;
    return errorStream({
      type: "error",
      message: err.gate.message || "This feature needs a paid plan.",
      code: "plan_blocked",
    });
  }

  // From here on the turn is paid for, so every exit has to either deliver it or
  // give the credits back. `chat.message` is debited outright rather than held,
  // which means there is no sweeper behind this — an unsettled ticket is a charge
  // the customer keeps.
  let settings: Awaited<ReturnType<typeof getChatSettings>>;
  let attachments: ControllerAttachment[];
  let refs: AttachmentRef[];
  let session: Awaited<ReturnType<typeof openSession>>;
  let userMessageId: string;

  try {
    settings = await getChatSettings(workspaceId);

    const [prepared, opened] = await Promise.all([
      prepareAttachments(files),
      openSession({
        workspaceId,
        sessionId: requestedSessionId,
        firstMessage: message,
        model: modelOverride || settings.model,
      }),
    ]);
    attachments = prepared.attachments;
    refs = prepared.refs;
    session = opened;

    userMessageId = await saveUserMessage({
      sessionId: session.sessionId,
      content: message,
      attachments: refs,
    }).catch(() => "pending");
  } catch (err) {
    await failAction(ticket, { note: "Refunded: the turn could not be opened" }).catch(() => null);
    return errorStream({
      type: "error",
      message: err instanceof Error ? err.message : "The chat session could not be opened.",
    });
  }

  const encoder = new TextEncoder();
  const abort = new AbortController();

  // The client closing the tab (or hitting Stop) must actually stop the model.
  req.signal?.addEventListener("abort", () => abort.abort(), { once: true });

  /**
   * Closes out the turn's charge, exactly once.
   *
   * A turn earns its credits by producing something the customer can read or a
   * tool run they can see the result of. A turn that fell over before either —
   * a stop pressed on the first token, a provider that refused the request — did
   * not deliver, so it does not cost. The renders a turn made along the way are
   * charged at their own choke point and stay charged either way: the image
   * exists, whatever became of the sentence around it.
   *
   * `settled` is not defensive tidiness. `failAction` gives a period counter back,
   * and calling it twice would give back a use the customer never made.
   */
  let settled = false;
  const settleTurn = async (delivered: boolean, note: string, referenceId: string | null) => {
    if (settled) return;
    settled = true;
    try {
      if (delivered) {
        await completeAction({
          ticket,
          measureCost: true,
          referenceType: "chat_message",
          referenceId: referenceId ?? session.sessionId,
        });
      } else {
        await failAction(ticket, { note });
      }
    } catch (billingErr) {
      // The customer has their answer; a failed settle must not turn that into an
      // error frame. Loud in the logs because an uncharged turn is real money.
      console.error("[chat/stream] settling the turn's charge failed:", billingErr);
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: ControllerEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(event)));
        } catch {
          closed = true;
        }
      };

      send({
        type: "session",
        sessionId: session.sessionId,
        userMessageId,
        title: session.title,
      });

      try {
        const result = await withMeterContext(
          {
            userId,
            workspaceId,
            feature: "chat",
            action: "chat.message",
            referenceId: session.sessionId,
          },
          () =>
            runController({
              workspaceId,
              userId,
              sessionId: session.sessionId,
              message,
              attachments,
              history: session.history,
              sessionSummary: session.summary,
              modelOverride,
              settings,
              planTier: ticket.plan,
              maxToolLoops: getEntitlements(ticket.plan).chatMaxToolLoops,
              signal: abort.signal,
              emit: send,
            })
        );

        // A stopped turn still has to be saved with something in it. An empty row
        // is filtered out of history, which leaves the request above it looking
        // unanswered — and that is how a stopped media job came back to life on
        // the next message.
        const stopped = result.finishReason === "cancelled";
        const savedText = result.text.trim()
          ? stopped
            ? `${result.text.trimEnd()}\n\n${STOPPED_TURN_TEXT}`
            : result.text
          : stopped
            ? STOPPED_TURN_TEXT
            : result.text;

        const messageId = await saveAssistantMessage({
          sessionId: session.sessionId,
          content: savedText,
          reasoning: result.reasoning,
          toolRuns: result.toolRuns,
          artifacts: result.artifacts,
          suggestions: result.suggestions,
          model: result.model,
          durationMs: result.durationMs,
          finishReason: result.finishReason,
        }).catch(() => "unsaved");

        send({
          type: "done",
          messageId,
          finishReason: result.finishReason,
          durationMs: result.durationMs,
          model: result.model,
          toolCount: result.toolRuns.length,
        });

        // What the customer got. Text they can read, or a tool that ran and
        // reported back — either is the turn doing its job. `measureCost` then
        // walks this turn's usage rows, which is what keeps 25 credits an
        // arguable number rather than an inherited one.
        const produced = result.text.trim().length > 0 || result.toolRuns.length > 0;
        await settleTurn(
          produced,
          stopped ? "Refunded: stopped before the answer began" : "Refunded: the turn produced nothing",
          messageId === "unsaved" ? null : messageId
        );

        // One session, one history row — and it names itself from the exchange
        // instead of staying stuck on whatever the opening line happened to be.
        // A stopped turn is not an exchange, so it does not get to name anything.
        //
        // Both chores below are model calls on the small utility model, and both sit
        // outside the `runController` scope above — so without a context of their own
        // their usage rows land with `userId: null` and `feature: "unknown"`, which is
        // the one thing the meter is not allowed to do (`countUnattributedCalls`
        // exists to find exactly this). They are attributed to `chat.message`
        // because that is what they are: bookkeeping for the turn the customer has
        // already been charged 25 credits for, ~$0.003 of flash between them. They
        // run after `settleTurn`, so their cost reaches the ledger row through the
        // nightly reconcile rather than through this request's `measureCost`.
        const chores: MeterContext = {
          userId,
          workspaceId,
          feature: "chat",
          action: "chat.message",
          referenceId: session.sessionId,
        };

        if (!stopped && session.provisionalTitle && result.text.trim() && result.finishReason !== "error") {
          const title = await withMeterContext(chores, () =>
            autoTitleSession({
              sessionId: session.sessionId,
              userMessage: message,
              answer: result.text,
              currentTitle: session.title,
            })
          ).catch(() => null);
          if (title) send({ type: "title", sessionId: session.sessionId, title });
        }

        // Fold anything that fell out of the live window into the rolling summary.
        // Skipped on a stop: the abandoned request must stay visibly abandoned in
        // history rather than being written into memory as something that happened.
        if (!stopped && session.overflow.length > 0) {
          await withMeterContext(chores, () =>
            refreshSessionSummary({
              sessionId: session.sessionId,
              existingSummary: session.summary,
              overflow: session.overflow,
            })
          ).catch(() => null);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        await settleTurn(false, `Refunded: ${detail.slice(0, 160)}`, null);
        send({ type: "error", message: detail });
        send({
          type: "done",
          messageId: "unsaved",
          finishReason: "error",
          durationMs: 0,
          model: modelOverride || settings.model,
          toolCount: 0,
        });
      } finally {
        // A backstop, not the settle path: both branches above settle, and this
        // is a no-op once one of them has. It exists so that any exit added to
        // this block later refunds by default instead of silently keeping the
        // charge — the wrong default here costs the customer money.
        await settleTurn(false, "Refunded: the turn did not finish", null);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return sseResponse(stream);
}
