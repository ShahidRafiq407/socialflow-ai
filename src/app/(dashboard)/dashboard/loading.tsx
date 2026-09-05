import React from "react";

export default function DashboardLoading() {
  return (
    <div className="w-full max-w-7xl mx-auto space-y-5 animate-pulse px-4 sm:px-6 lg:px-8 pt-4 pb-8">
      {/* Greeting + actions */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-7 w-48 rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-28 rounded bg-slate-100 dark:bg-slate-800/60" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-8 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-5 rounded-xl bg-slate-100 dark:bg-slate-800/50 px-4 py-3">
        <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="h-1.5 flex-1 max-w-[240px] rounded bg-slate-200 dark:bg-slate-800" />
        <div className="ml-auto h-7 w-20 rounded-lg bg-slate-200 dark:bg-slate-800" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl bg-slate-100 dark:bg-slate-800/50 py-3 px-4 space-y-2"
          >
            <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-7 w-16 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-3 w-24 rounded bg-slate-200/70 dark:bg-slate-800/60" />
          </div>
        ))}
      </div>

      {/* Queue + platform results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl bg-slate-100 dark:bg-slate-800/50 p-3 space-y-3">
          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-8 rounded-lg bg-slate-200 dark:bg-slate-800" />
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-11 rounded-md bg-slate-200/80 dark:bg-slate-800"
            />
          ))}
        </div>
        <div className="rounded-xl bg-slate-100 dark:bg-slate-800/50 p-3 space-y-3">
          <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-8 rounded-lg bg-slate-200/70 dark:bg-slate-800/70" />
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-11 rounded-md bg-slate-200/80 dark:bg-slate-800"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
