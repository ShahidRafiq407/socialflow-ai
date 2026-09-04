"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshConfigAction } from "@/actions/admin";

/** Forces this instance to re-read every setting; for "I changed it and don't see it". */
export function RefreshConfigButton() {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await refreshConfigAction();
        setBusy(false);
        startTransition(() => router.refresh());
      }}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      Reload config
    </Button>
  );
}
