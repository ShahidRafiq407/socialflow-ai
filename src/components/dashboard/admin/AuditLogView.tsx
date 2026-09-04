"use client";

import Link from "next/link";
import type { AuditRow } from "@/lib/admin/audit";
import { Empty, Section, fmtDate } from "./primitives";

export function AuditLogView({ rows }: { rows: AuditRow[] }) {
  return (
    <Section title="Audit log" description="Every admin action, newest first. Nothing here can be edited or deleted from the dashboard.">
      {rows.length === 0 ? (
        <Empty>No admin actions recorded yet.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">When</th>
                <th className="py-1 pr-2 font-medium">Admin</th>
                <th className="py-1 pr-2 font-medium">Action</th>
                <th className="py-1 pr-2 font-medium">Target</th>
                <th className="py-1 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                  <td className="py-1.5 pr-2">{r.adminEmail || r.adminId}</td>
                  <td className="py-1.5 pr-2 font-mono font-medium">{r.action}</td>
                  <td className="py-1.5 pr-2">
                    {r.targetType === "user" && r.targetId ? (
                      <Link href={`/dashboard/admin/users/${r.targetId}`} className="font-mono text-[10px] text-primary hover:underline">
                        {r.targetId}
                      </Link>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {r.targetType ? `${r.targetType}:` : ""}
                        {r.targetId || "—"}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {r.details ? (
                      <pre className="max-h-20 max-w-[420px] overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-1.5 text-[10px]">
                        {JSON.stringify(r.details)}
                      </pre>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
