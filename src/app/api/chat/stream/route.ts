// ============================================================================
// POST /api/chat/stream
//
// The single endpoint the chat runs on. Server-Sent Events, one event per thing
// that happens: thoughts as the model thinks, text as it writes, a tool card per
// call, an artifact card per real result. Both messages are persisted so a
// refresh restores the turn exactly as it streamed.
//
// A turn is charged per model call, not per message. `chat.message` covers the
// first call and the chores the turn ends with; every round after it — the chat
// used a tool, read the result, and carried on — is a `chat.toolLoop`. Both are
// reserved before the turn starts, for as many rounds as the plan allows, and
// settled down to the rounds actually taken.
//
// The split is what keeps the plan cards honest in both directions. `chat.message`
// carries the per-period count, so "6 chat messages" still means six messages;
// `chat.toolLoop` carries the variable cost, so a twelve-round Agency turn is
// charged twelve rounds instead of hiding eleven of them inside a flat price.
//
// The renders a turn makes are charged separately at the media choke point, per
// asset. This endpoint charges for thinking, never for pixels.
// ============================================================================

import { getEntitlements, planRank } from "@/lib/billing/plans";
import {
  completeAction,
  failAction,
  getPlanContext,
  isEntitlementError,
  requireAction,
  type ActionTicket,
} from "@/lib/billing/entitlements";
import { actionCredits } from "@/lib/billing/actions";
import { getWalletBalance } from "@/lib/billing/wallet";
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
import { getChatModel, isKnownChatModel, planMayUseModel } from "@/lib/agents/controller/models";
import { getFlags } from "@/lib/admin/runtimeConfig";

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

  // Which brain, and what it costs. The plan context is loaded once here and
  // handed to the ticket so the gate does not read it twice. The requested model
  // has to be one the admin enabled AND one this plan may use; otherwise the turn
  // falls back to the default brain rather than refusing outright, because a
  // stale picker value must not stop somebody asking a question.
  const planContext = await getPlanContext(userId);
  const settingsForModel = modelOverride ? null : await getChatSettings(workspaceId).catch(() => null);
  const pickerOn = getFlags().chatModelPickerEnabled;
  const candidate = pickerOn ? modelOverride || settingsForModel?.model || null : null;
  const chosen = getChatModel(candidate && isKnownChatModel(candidate) ? candidate : null);
  const modelAllowed = planMayUseModel(chosen, planContext.plan, planRank);
  const effectiveModel = modelAllowed ? chosen : getChatModel(null);
  const turnCredits = effectiveModel.chatCredits ?? actionCredits("chat.message");

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
      context: planContext,
      unitCredits: turnCredits,
    });
  } catch (err) {
    if (!isEntitlementError(err)) throw err;
    return errorStream({
      type: "error",
      message: err.gate.message || "This feature needs a paid plan.",
      code: "plan_blocked",
    });
  }

  // How many rounds this turn may take, and who decides.
  //
  // Three ceilings, and the lowest wins: the workspace's own setting (applied
  // inside the controller), the plan's allowance, and what the balance can pay
  // for. The last one is why this is worked out here rather than passed straight
  // down — the alternative is reserving the plan's full allowance and refusing
  // the turn outright when the balance cannot cover the worst case, which would
  // tell a customer with 20 credits left that they cannot ask a question. They
  // can. They get the answer and fewer tool rounds, which is the honest
  // degradation: the ceiling falls as the balance does, and nothing runs unpaid.
  //
  // `available` is read after the reservation above, so it already excludes the
  // credits that turn is holding.
  const planRounds = Math.max(1, getEntitlements(ticket.plan).chatMaxToolLoops);
  const roundCredits = Math.max(1, actionCredits("chat.toolLoop"));
  let extraRounds = 0;
  try {
    const wallet = await getWalletBalance(userId, ticket.plan);
    extraRounds = Math.max(0, Math.min(planRounds - 1, Math.floor(wallet.available / roundCredits)));
  } catch (err) {
    // A wallet that cannot be read is not a reason to refuse a paid-for turn. One
    // round is always affordable — it was just reserved — so fall back to it.
    console.error("[chat/stream] could not size the tool-round allowance:", err);
  }

  // Reserved up front for the rounds the turn is allowed, then settled down to the
  // rounds it took. Held rather than debited per round so the controller never has
  // to stop mid-turn for money: by the time the loop starts, every round it is
  // permitted to run is already paid for.
  let loopTicket: ActionTicket | null = null;
  if (extraRounds > 0) {
    loopTicket = await requireAction({
      userId,
      action: "chat.toolLoop",
      workspaceId,
      referenceId: requestedSessionId,
      quantity: extraRounds,
    }).catch((err) => {
      // Losing this costs tool rounds, not the turn. `chat.tools` is on every plan
      // that has `chat.message`, so a refusal here is a balance that moved under us
      // between the read above and this call. Swallowed rather than rethrown because
      // the answer call is already reserved, and throwing out of the route would
      // leave that hold for the sweeper instead of settling it.
      console.error("[chat/stream] could not reserve tool rounds:", err);
      return null;
    });
    if (!loopTicket) extraRounds = 0;
  }
  const roundsAllowed = 1 + extraRounds;

  // From here on the turn is paid for, so every exit has to either deliver it or
  // give the credits back. Both tickets are reservations, which means a hold the
  // sweeper will release on its own after `reserveMs` — but a hold left to expire
  // is a customer staring at credits they cannot spend for six minutes, so every
  // path below settles explicitly.
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
        model: effectiveModel.id,
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
    if (loopTicket) {
      await failAction(loopTicket, { note: "Refunded: the turn could not be opened" }).catch(() => null);
    }
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
   * `rounds` is the controller's own model-call counter. The answer call is the
   * first one and is charged as `chat.message`; everything after it settles the
   * loop reservation down to what was used, so a turn that was allowed six rounds
   * and took two is charged for two.
   *
   * `settled` is not defensive tidiness. `failAction` gives a period counter back,
   * and calling it twice would give back a use the customer never made.
   */
  let settled = false;
  const settleTurn = async (
    delivered: boolean,
    note: string,
    referenceId: string | null,
    rounds: number
  ) => {
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

    if (!loopTicket) return;
    // The rounds beyond the answer call. A delivered turn that never needed a tool
    // releases the whole reservation, which is the common case and has to be free.
    const used = delivered ? Math.max(0, Math.min(extraRounds, rounds - 1)) : 0;
    try {
      if (used > 0) {
        await completeAction({
          ticket: loopTicket,
          credits: used * roundCredits,
          quantity: used,
          referenceType: "chat_message",
          referenceId: referenceId ?? session.sessionId,
          note: `${used} of ${extraRounds} reserved tool rounds used`,
        });
      } else {
        await failAction(loopTicket, {
          note: delivered ? "Released: the turn needed no tool rounds" : note,
        });
      }
    } catch (billingErr) {
      console.error("[chat/stream] settling the turn's tool rounds failed:", billingErr);
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
              modelOverride: effectiveModel.id,
              settings,
              planTier: ticket.plan,
              maxToolLoops: roundsAllowed,
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
        // walks this turn's usage rows, which is what keeps the per-round price an
        // arguable number rather than an inherited one.
        const produced = result.text.trim().length > 0 || result.toolRuns.length > 0;
        await settleTurn(
          produced,
          stopped ? "Refunded: stopped before the answer began" : "Refunded: the turn produced nothing",
          messageId === "unsaved" ? null : messageId,
          result.modelCalls
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
        // already been charged for, ~$0.007 of flash between them, which is inside
        // that action's cover. They run after `settleTurn`, so their cost reaches the
        // ledger row through the nightly reconcile rather than this request's
        // `measureCost`.
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
        await settleTurn(false, `Refunded: ${detail.slice(0, 160)}`, null, 0);
        send({ type: "error", message: detail });
        send({
          type: "done",
          messageId: "unsaved",
          finishReason: "error",
          durationMs: 0,
          model: effectiveModel.id,
          toolCount: 0,
        });
      } finally {
        // A backstop, not the settle path: both branches above settle, and this
        // is a no-op once one of them has. It exists so that any exit added to
        // this block later refunds by default instead of silently keeping the
        // charge — the wrong default here costs the customer money.
        await settleTurn(false, "Refunded: the turn did not finish", null, 0);
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
