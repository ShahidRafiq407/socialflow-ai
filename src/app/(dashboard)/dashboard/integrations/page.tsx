import React, { Suspense } from "react";
import { getWorkspaceIntegrations } from "@/actions/integrations";
import { IntegrationsHQ } from "@/components/dashboard/IntegrationsHQ";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const integrations = await getWorkspaceIntegrations();

  return (
    <div className="w-full">
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading integrations...</div>}>
        <IntegrationsHQ initialIntegrations={integrations} />
      </Suspense>
    </div>
  );
}
