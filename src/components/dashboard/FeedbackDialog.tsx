"use client";

// ============================================================================
// FEEDBACK
//
// One box, reachable from every screen in the dashboard: the header button and
// the profile menu open this same dialog. What the user writes lands in the back
// office feedback queue, beside the thumbs-up and thumbs-down from chat.
//
// It is in the header rather than the sidebar on purpose. The sidebar list is
// read as navigation in three places and again for plan locks, and feedback is
// not a page. The header is also mounted outside the workspace-keyed part of the
// shell, so switching workspace mid-sentence does not throw the sentence away.
// ============================================================================

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitProductFeedback, type FeedbackCategory } from "@/actions/feedback";

/** The five buckets, in the words a user would use rather than ours. */
const CATEGORIES: Array<{ id: FeedbackCategory; label: string }> = [
  { id: "bug", label: "Something is broken" },
  { id: "idea", label: "I have an idea" },
  { id: "praise", label: "Something I like" },
  { id: "billing", label: "Billing or plan" },
  { id: "other", label: "Something else" },
];

const MAX_LENGTH = 4000;
const MIN_LENGTH = 4;

/**
 * The tone the queue shows, worked out from the bucket rather than asked for
 * separately. A second control would have made the user say the same thing
 * twice, and the admin still wants to see at a glance which rows are complaints.
 */
function sentimentFor(category: FeedbackCategory): -1 | 0 | 1 | null {
  if (category === "bug") return -1;
  if (category === "praise") return 1;
  return null;
}

export interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const pathname = usePathname();
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // A half-written note survives the dialog being closed and opened again — that
  // is deliberate, people close it to go and check something. A sent one is
  // cleared, so reopening cannot post the same thing twice.
  useEffect(() => {
    if (open) {
      setError("");
      return;
    }
    if (sent) {
      setSent(false);
      setMessage("");
      setCategory("idea");
    }
  }, [open, sent]);

  const trimmed = message.trim();
  const tooShort = trimmed.length < MIN_LENGTH;

  async function send() {
    if (tooShort || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await submitProductFeedback({
        category,
        sentiment: sentimentFor(category),
        message: trimmed,
        // The screen they were on, which is most of the context for a bug report.
        path: pathname?.slice(0, 512) || undefined,
      });
      if (result.success) setSent(true);
      else setError(result.error);
    } catch {
      setError("That could not be sent. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(Boolean(next));
      }}
    >
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold text-foreground">Thank you — this reached us.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A real person reads every message. If it needs an answer, we will use the email on
                your account.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send us feedback</DialogTitle>
              <DialogDescription>
                Anything at all — something that broke, something missing, or something that
                worked well. It goes straight to the team.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  disabled={busy}
                  aria-pressed={category === item.id}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                    category === item.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-muted"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="grid gap-1.5">
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
                disabled={busy}
                rows={5}
                maxLength={MAX_LENGTH}
                placeholder={
                  category === "bug"
                    ? "What were you doing, and what happened instead?"
                    : "Tell us as much or as little as you like…"
                }
                className="resize-none text-sm"
                aria-label="Your feedback"
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>We can see which screen you were on, so no need to describe it.</span>
                <span>
                  {message.length}/{MAX_LENGTH}
                </span>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button disabled={tooShort || busy} onClick={() => void send()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {busy ? "Sending…" : "Send feedback"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}



