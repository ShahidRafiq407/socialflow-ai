// ============================================================================
// POST /api/chat/stream
//
// The single endpoint the chat runs on. Server-Sent Events, one event per thing
// that happens: thoughts as the model thinks, text as it writes, a tool card per
// call, an artifact card per real result. Both messages are persisted so a
// refresh restores the turn exactly as it streamed.
// ============================================================================

import { checkAIAccess } from "@/lib/billing/gate";
import { resolveIdentity } from "@/lib/agents/controller/auth";
import { getChatSettings } from "@/lib/agents/controller/settings";
import { runController, type ControllerAttachment } from "@/lib/agents/controller/runtime";
import {
  openSession,
  refreshSessionSummary,
  saveAssistantMessage,
  saveUserMessage,
} from "@/lib/agents/controller/session";
import { sseFrame, type AttachmentRef, type ControllerEvent } from "@/lib/agents/controller/types";
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

  const gate = await checkAIAccess(workspaceId);
  if (!gate.allowed) {
    return errorStream({
      type: "error",
      message: gate.message || "This feature needs a paid plan.",
      code: "plan_blocked",
    });
  }

  const settings = await getChatSettings(workspaceId);

  const [{ attachments, refs }, session] = await Promise.all([
    prepareAttachments(files),
    openSession({
      workspaceId,
      sessionId: requestedSessionId,
      firstMessage: message,
      model: modelOverride || settings.model,
    }),
  ]);

  const userMessageId = await saveUserMessage({
    sessionId: session.sessionId,
    content: message,
    attachments: refs,
  }).catch(() => "pending");

  const encoder = new TextEncoder();
  const abort = new AbortController();

  // The client closing the tab (or hitting Stop) must actually stop the model.
  req.signal?.addEventListener("abort", () => abort.abort(), { once: true });

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
        const result = await runController({
          workspaceId,
          userId,
          sessionId: session.sessionId,
          message,
          attachments,
          history: session.history,
          sessionSummary: session.summary,
          modelOverride,
          settings,
          signal: abort.signal,
          emit: send,
        });

        const messageId = await saveAssistantMessage({
          sessionId: session.sessionId,
          content: result.text,
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

        // Fold anything that fell out of the live window into the rolling summary.
        if (session.overflow.length > 0) {
          await refreshSessionSummary({
            sessionId: session.sessionId,
            existingSummary: session.summary,
            overflow: session.overflow,
          });
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
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
