// ============================================================================
// /dashboard/admin/feedback — CHAT FEEDBACK
//
// The thumbs users left under assistant answers. New votes are the queue; the
// by-model split says whether a model change helped.
// ============================================================================

import { getFeedbackQueue } from "@/lib/admin/feedback";
import { FeedbackQueueView } from "@/components/dashboard/admin/FeedbackQueueView";

export const metadata = { title: "Feedback — admin" };

const FILTERS = ["new", "down", "all"] as const;

export default async function AdminFeedbackPage({ searchParams }: { searchParams?: Promise<{ filter?: string }> }) {
  const params = (await searchParams) || {};
  const filter = FILTERS.includes(params.filter as (typeof FILTERS)[number]) ? (params.filter as (typeof FILTERS)[number]) : "new";
  const queue = await getFeedbackQueue({ filter });
  return <FeedbackQueueView queue={queue} filter={filter} />;
}
