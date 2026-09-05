// ============================================================================
// NEXT INSTRUMENTATION
//
// `onRequestError` is called for every unhandled error in a route handler,
// server action, server component or middleware. It is the one place the whole
// product's failures pass through, so it is where they are written down for the
// admin's Errors tab. Never throws; a failure to record is dropped.
// ============================================================================

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordError } = await import("@/lib/admin/errors");
    const err = error as { message?: string; stack?: string; digest?: string };
    await recordError({
      source: `next:${context.routeType}`,
      message: err?.message || String(error),
      stack: err?.stack ?? null,
      path: request.path,
      method: request.method,
      kind: err?.digest ? "digest" : context.routerKind,
      context: {
        routePath: context.routePath,
        renderSource: context.renderSource,
        revalidateReason: context.revalidateReason,
      },
    });
  } catch {
    // Recording must never make a failing request worse.
  }
};
