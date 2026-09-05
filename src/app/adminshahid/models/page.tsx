// ============================================================================
// /adminshahid/models — AI MODELS
// ============================================================================

import { getModelsView } from "@/lib/admin/models";
import { ModelsManager } from "@/components/dashboard/admin/ModelsManager";

export const metadata = { title: "AI Models — Admin Control Plane" };

export default async function AdminModelsPage() {
  const view = await getModelsView();
  return <ModelsManager view={view} />;
}
