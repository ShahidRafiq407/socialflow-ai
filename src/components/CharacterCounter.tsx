"use client";

import React from "react";

interface CharacterCounterProps {
  current: number;
  max?: number;
  className?: string;
}

export default function CharacterCounter({
  current,
  max,
  className = "",
}: CharacterCounterProps) {
  if (!max || max <= 0) return null;

  const remaining = max - current;
  const isOver = remaining < 0;
  const isClose = remaining <= max * 0.1 && remaining >= 0;

  return (
    <span
      className={`text-[11px] font-mono font-medium transition-colors ${
        isOver
          ? "text-red-500 font-bold animate-pulse"
          : isClose
          ? "text-amber-500 font-semibold"
          : "text-slate-400"
      } ${className}`}
    >
      {current} / {max} {isOver && `(+${Math.abs(remaining)})`}
    </span>
  );
}
