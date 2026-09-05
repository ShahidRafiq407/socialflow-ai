// ============================================================================
// /adminshahid/feedback — USER & CHAT FEEDBACK
//
// One page, two sources: thumbs up/down on assistant answers, and whatever a
// user typed into the feedback box in the dashboard header.
// ============================================================================

import { getFeedbackQueue, type FeedbackFilter } from "@/lib/admin/feedback";
import { FeedbackQueueView } from "@/components/dashboard/admin/FeedbackQueueView";

export const metadata = { title: "Feedback Queue — Admin Control Plane" };

const FILTERS: FeedbackFilter[] = ["new", "down", "general", "all"];

export default async function AdminFeedbackPage({ searchParams }: { searchParams?: Promise<{ filter?: string }> }) {
  const params = (await searchParams) || {};
  // Anything else in the query string falls back to "new" rather than 404ing —
  // this link gets pasted around.
  const filter = FILTERS.includes(params.filter as FeedbackFilter) ? (params.filter as FeedbackFilter) : "new";
  const queue = await getFeedbackQueue({ filter });
  return <FeedbackQueueView queue={queue} filter={filter} />;
}
