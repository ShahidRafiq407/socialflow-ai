"use client";

import React from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Sparkles, Globe, FileText, Layers, Eye } from "lucide-react";

interface AgentLog {
  node: string;
  payload?: any;
  timestamp: number;
}

interface AgentProgressModalProps {
  open: boolean;
  onClose: () => void;
  agentLogs: AgentLog[];
  pipelineStep: number; // 0..N
  generationState: "idle" | "running" | "completed" | "error";
}

const STEPS = [
  { id: "brandAnalyst", label: "Brand Analyst", icon: Sparkles },
  { id: "trendResearcher", label: "Trend Researcher", icon: Globe },
  { id: "competitorAnalyst", label: "Competitor Analyst", icon: FileText },
  { id: "contentCreator", label: "Content Creator", icon: Sparkles },
  { id: "visualizerCreator", label: "Visualizer Creator", icon: Layers },
  { id: "supervisor", label: "Supervisor (CEO Agent)", icon: Check },
];

export default function AgentProgressModal({ open, onClose, agentLogs, pipelineStep, generationState }: AgentProgressModalProps) {
  if (!open) return null;

  const lastLogsByNode: Record<string, AgentLog[]> = {};
  agentLogs.forEach((l) => {
    lastLogsByNode[l.node] = lastLogsByNode[l.node] || [];
    lastLogsByNode[l.node].push(l);
  });

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-70 max-w-6xl w-full grid grid-cols-12 gap-4">
        {/* Left: Steps timeline */}
        <div className="col-span-4">
          <Card className="h-full">
            <CardHeader className="p-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Multi-Agent Progress</h3>
                <Badge className="text-xs">{generationState === 'running' ? 'Running' : generationState === 'completed' ? 'Completed' : 'Idle'}</Badge>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              <div className="space-y-2">
                {STEPS.map((s, idx) => {
                  const Icon = s.icon;
                  const isActive = idx === pipelineStep && generationState === "running";
                  const isDone = idx < pipelineStep || generationState === "completed" && idx <= pipelineStep;

                  return (
                    <div key={s.id} className="flex items-start gap-3">
                      <div className={`h-9 w-9 rounded-md flex items-center justify-center ${isActive ? 'bg-primary text-white' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">{s.label}</div>
                          <div className="text-xs text-slate-500">{isDone ? 'Done' : isActive ? 'Running' : 'Pending'}</div>
                        </div>
                        <div className="text-[12px] text-slate-500 mt-1 line-clamp-2">
                          {lastLogsByNode[s.id] && lastLogsByNode[s.id].length > 0
                            ? lastLogsByNode[s.id][lastLogsByNode[s.id].length - 1].payload?.summary || lastLogsByNode[s.id][lastLogsByNode[s.id].length - 1].payload?.message || 'See logs'
                            : (idx === 0 ? 'Analyzing brand DNA and tone' : 'Waiting for input')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t"></div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
                <Button size="sm" className="ml-auto" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Scroll to top</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center: Console stream */}
        <div className="col-span-5">
          <Card className="h-full">
            <CardHeader className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold">Live Console</h3>
                <span className="text-xs text-slate-500">real-time agent events</span>
              </div>
              <div className="text-xs text-slate-400">{new Date().toLocaleTimeString()}</div>
            </CardHeader>

            <CardContent className="p-4 bg-[#0f1724] text-slate-200 font-mono text-[13px] max-h-[420px] overflow-y-auto space-y-3">
              {agentLogs.length === 0 ? (
                <div className="text-slate-500">[system] No events yet. Waiting for agents to start...</div>
              ) : (
                agentLogs.slice(-200).map((log, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md">{log.node}</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <pre className="whitespace-pre-wrap text-[13px] text-slate-200">{JSON.stringify(log.payload, null, 2)}</pre>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Snapshot / preview */}
        <div className="col-span-3">
          <Card className="h-full">
            <CardHeader className="p-4 border-b">
              <h3 className="text-sm font-bold">Agent Snapshots</h3>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {/* Brand snapshot */}
              <div>
                <div className="text-xs font-semibold text-slate-500">Brand DNA</div>
                <div className="text-sm mt-1 text-slate-700 dark:text-slate-200">{lastLogsByNode['brandAnalyst']?.slice(-1)[0]?.payload?.brandDNA?.coreMessage || 'No brand data yet'}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-500">Top Trends</div>
                <div className="text-sm mt-1 text-slate-700 dark:text-slate-200">
                  {(lastLogsByNode['trendResearcher']?.slice(-1)[0]?.payload?.trendData || 'No trends yet')}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-500">Sample Caption</div>
                <div className="text-sm mt-1 text-slate-700 dark:text-slate-200">{lastLogsByNode['contentCreator']?.slice(-1)[0]?.payload?.caption || '—'}</div>
              </div>

              <div className="pt-2 border-t">
                <div className="text-xs text-slate-400">Supervisor status</div>
                <div className="mt-2 flex items-center gap-2">
                  {generationState === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : generationState === 'completed' ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-rose-500" />}
                  <div className="text-sm font-semibold">{generationState}</div>
                </div>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
