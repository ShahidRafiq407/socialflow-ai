// ============================================================================
// SETTINGS — ACCOUNT EXPORT DOWNLOAD
//
// One helper for the two places that offer an export (Data & Privacy and the
// Danger Zone dialogs), so the endpoint, the filename and the busy-state
// behaviour can never drift between them.
// ============================================================================

export const EXPORT_FILENAME_PREFIX = "postloomai-export";

/** `postloomai-export-2026-09-03.json` — dated so two exports never collide. */
export function exportFilename(): string {
  return `${EXPORT_FILENAME_PREFIX}-${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * Fetches /api/account/export and triggers the browser download.
 * Throws on any failure — the caller decides how to surface it.
 */
export async function downloadAccountExport(): Promise<void> {
  const res = await fetch("/api/account/export");
  if (!res.ok) throw new Error("Export request failed");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename();
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
