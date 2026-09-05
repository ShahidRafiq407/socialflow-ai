"use client";

import React, { useState, useMemo } from "react";
import { AnalyticsSeriesPoint } from "@/actions/analytics";
import { MousePointerClick, Target, Send, Calendar } from "lucide-react";

interface DashboardTrendChartProps {
  series: AnalyticsSeriesPoint[];
}

type MetricType = "clicks" | "leads" | "posts";
type TimeframeDays = 7 | 14 | 30;

export function Sparkline({
  data,
  color = "#3b82f6",
  height = 28,
  width = 72,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible opacity-80 transition-opacity hover:opacity-100"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function DashboardTrendChart({ series }: DashboardTrendChartProps) {
  const [metric, setMetric] = useState<MetricType>("clicks");
  const [days, setDays] = useState<TimeframeDays>(7);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const activeSeries = useMemo(() => {
    if (!series || series.length === 0) return [];
    return series.slice(-days);
  }, [series, days]);

  const metricConfig = {
    clicks: {
      label: "Tracked Clicks",
      icon: MousePointerClick,
      color: "#2563eb", // blue-600
      lightColor: "#93c5fd",
      gradientFrom: "rgba(37, 99, 235, 0.25)",
      gradientTo: "rgba(37, 99, 235, 0.0)",
    },
    leads: {
      label: "Leads Gained",
      icon: Target,
      color: "#059669", // emerald-600
      lightColor: "#6ee7b7",
      gradientFrom: "rgba(5, 150, 105, 0.25)",
      gradientTo: "rgba(5, 150, 105, 0.0)",
    },
    posts: {
      label: "Posts Published",
      icon: Send,
      color: "#7c3aed", // violet-600
      lightColor: "#c4b5fd",
      gradientFrom: "rgba(124, 58, 237, 0.25)",
      gradientTo: "rgba(124, 58, 237, 0.0)",
    },
  }[metric];

  const values = useMemo(
    () => activeSeries.map((p) => Number(p[metric]) || 0),
    [activeSeries, metric]
  );

  const total = useMemo(() => values.reduce((a, b) => a + b, 0), [values]);
  const avg = useMemo(() => (values.length ? (total / values.length).toFixed(1) : "0"), [total, values]);
  const max = useMemo(() => Math.max(...values, 5), [values]);

  // Chart coordinate math
  const width = 640;
  const height = 180;
  const paddingX = 24;
  const paddingY = 20;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const points = useMemo(() => {
    if (values.length === 0) return [];
    return values.map((val, i) => {
      const x = paddingX + (i / Math.max(values.length - 1, 1)) * chartW;
      const y = height - paddingY - (val / max) * chartH;
      return { x, y, val, label: activeSeries[i]?.label || "", date: activeSeries[i]?.date || "" };
    });
  }, [values, activeSeries, max, chartW, chartH, height, paddingX, paddingY]);

  // Smooth SVG path curve
  const pathD = useMemo(() => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }, [points]);

  const areaD = useMemo(() => {
    if (!pathD || points.length === 0) return "";
    const lastX = points[points.length - 1].x;
    const firstX = points[0].x;
    const bottomY = height - paddingY;
    return `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [pathD, points, height, paddingY]);

  const activePoint = hoveredIdx !== null && points[hoveredIdx] ? points[hoveredIdx] : null;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-xs transition-all">
      {/* Header controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-3.5">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors"
            style={{
              backgroundColor: `${metricConfig.color}15`,
              color: metricConfig.color,
              borderColor: `${metricConfig.color}30`,
            }}
          >
            <metricConfig.icon className="h-4 w-4" />
          </div>
          <div>
            <h3
              className="text-sm font-semibold tracking-tight text-foreground cursor-help"
              title="Rolling velocity of clicks, leads, and published posts over 7, 14, or 30 days"
            >
              Performance Trends
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Metric switcher */}
          <div className="inline-flex rounded-lg bg-muted/60 p-0.5 text-xs font-medium">
            <button
              onClick={() => setMetric("clicks")}
              className={`rounded-md px-2.5 py-1 transition-all ${
                metric === "clicks"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Clicks
            </button>
            <button
              onClick={() => setMetric("leads")}
              className={`rounded-md px-2.5 py-1 transition-all ${
                metric === "leads"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Leads
            </button>
            <button
              onClick={() => setMetric("posts")}
              className={`rounded-md px-2.5 py-1 transition-all ${
                metric === "posts"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Posts
            </button>
          </div>

          {/* Timeframe switcher */}
          <div className="inline-flex rounded-lg bg-muted/60 p-0.5 text-xs font-medium">
            <button
              onClick={() => setDays(7)}
              className={`rounded-md px-2 py-1 transition-all ${
                days === 7
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              7D
            </button>
            <button
              onClick={() => setDays(14)}
              className={`rounded-md px-2 py-1 transition-all ${
                days === 14
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              14D
            </button>
            <button
              onClick={() => setDays(30)}
              className={`rounded-md px-2 py-1 transition-all ${
                days === 30
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              30D
            </button>
          </div>
        </div>
      </div>

      {/* Summary figures */}
      <div className="mt-3.5 mb-1 flex items-baseline gap-4 text-xs">
        <div>
          <span className="text-muted-foreground">Total: </span>
          <span className="font-semibold tabular-nums text-foreground">{total.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Daily Avg: </span>
          <span className="font-semibold tabular-nums text-foreground">{avg}</span>
        </div>
        {activePoint && (
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span>{activePoint.label}:</span>
            <span className="font-bold tabular-nums" style={{ color: metricConfig.color }}>
              {activePoint.val} {metric}
            </span>
          </div>
        )}
      </div>

      {/* SVG Chart */}
      <div className="relative w-full overflow-hidden pt-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-44 select-none overflow-visible"
        >
          <defs>
            <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={metricConfig.gradientFrom} />
              <stop offset="100%" stopColor={metricConfig.gradientTo} />
            </linearGradient>
          </defs>

          {/* Background horizontal grid lines */}
          {[0, 0.5, 1].map((ratio) => {
            const y = paddingY + ratio * chartH;
            const labelVal = Math.round((1 - ratio) * max);
            return (
              <g key={ratio}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity="0.07"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingX - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-muted-foreground text-[9px] font-mono select-none opacity-60"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          {areaD && <path d={areaD} fill={`url(#grad-${metric})`} />}

          {/* Line stroke */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke={metricConfig.color}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive circles and hover detector columns */}
          {points.map((p, idx) => {
            const isHovered = hoveredIdx === idx;
            const colWidth = chartW / Math.max(points.length - 1, 1);
            return (
              <g key={idx}>
                {/* Transparent hover touch target */}
                <rect
                  x={p.x - colWidth / 2}
                  y={0}
                  width={colWidth}
                  height={height}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />

                {/* Vertical cursor guideline when hovered */}
                {isHovered && (
                  <line
                    x1={p.x}
                    y1={paddingY}
                    x2={p.x}
                    y2={height - paddingY}
                    stroke={metricConfig.color}
                    strokeWidth="1.25"
                    strokeDasharray="2 2"
                    className="opacity-70"
                  />
                )}

                {/* Point dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 5 : 3}
                  fill={isHovered ? metricConfig.color : "var(--card)"}
                  stroke={metricConfig.color}
                  strokeWidth={isHovered ? 2.5 : 1.75}
                  className="transition-all duration-150"
                />

                {/* X-axis date labels */}
                {(days <= 14 || idx % 2 === 0 || idx === points.length - 1) && (
                  <text
                    x={p.x}
                    y={height - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px] select-none opacity-75"
                  >
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
