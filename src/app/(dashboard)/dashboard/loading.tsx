import React from "react";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col space-y-6 w-full max-w-7xl mx-auto animate-pulse p-4 md:p-6">
      {/* Top Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="space-y-2">
            <div className="h-6 w-56 rounded-md bg-slate-200 dark:bg-slate-800" />
            <div className="h-3.5 w-72 rounded-md bg-slate-100 dark:bg-slate-800/60" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-9 w-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>

      {/* KPI Cards Row Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5"
          >
            <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-7 w-20 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
          </div>
        ))}
      </div>

      {/* Main Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
          <div className="h-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="h-5 w-40 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-12 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-12 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="h-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="h-5 w-36 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="space-y-3 pt-2">
              <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
