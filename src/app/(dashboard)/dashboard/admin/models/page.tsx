// ============================================================================
// /dashboard/admin/models — MODELS
//
// Which model each agent role runs on, the models the admin has added, what
// the chat picker shows as a result, and the rate card. Every change here is
// live on the next request — no deploy.
// ============================================================================

import { getModelsView } from "@/lib/admin/models";
import { ModelsManager } from "@/components/dashboard/admin/ModelsManager";

export const metadata = { title: "Models — admin" };

export default async function AdminModelsPage() {
  const view = await getModelsView();
  return <ModelsManager view={view} />;
}
