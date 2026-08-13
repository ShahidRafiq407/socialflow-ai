"use client";

import React, { useState, useEffect } from "react";
import {
  Database,
  Globe,
  Users,
  PenTool,
  Image as ImageIcon,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Video,
  Edit,
  BarChart2,
  X,
  Minus,
  Maximize2,
  Sparkles,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MultiAgentStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  platforms: string[];
  contentTypes: Record<string, string[]>;
  onCompletePayload: (payload: any) => void;
}

type AgentStatus = "waiting" | "running" | "completed" | "error";

interface Agent {
  id: string;
  number: number;
  name: string;
  icon: React.ElementType;
  status: AgentStatus;
  description: string;
}

export default function MultiAgentStreamModal({
  isOpen,
  onClose,
  platforms,
  contentTypes,
  onCompletePayload,
}: MultiAgentStreamModalProps) {
  // Static Dummy State for UI Review
  const [isCompleted, setIsCompleted] = useState(false);
  const [activeAgentIndex, setActiveAgentIndex] = useState(3); // "Content Creator" is active in the spec
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (isOpen) {
      const timer = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const agents: Agent[] = [
    {
      id: "brand_analyst",
      number: 1,
      name: "Brand Analyst",
      icon: Database,
      status: isCompleted ? "completed" : activeAgentIndex > 0 ? "completed" : "running",
      description: "Loaded brand DNA from database",
    },
    {
      id: "trend_researcher",
      number: 2,
      name: "Trend Researcher",
      icon: Globe,
      status: isCompleted ? "completed" : activeAgentIndex > 1 ? "completed" : activeAgentIndex === 1 ? "running" : "waiting",
      description: "Completed live trend research",
    },
    {
      id: "competitor_analyst",
      number: 3,
      name: "Competitor Analyst",
      icon: Users,
      status: isCompleted ? "completed" : activeAgentIndex > 2 ? "completed" : activeAgentIndex === 2 ? "running" : "waiting",
      description: "Competitor analysis completed",
    },
    {
      id: "content_creator",
      number: 4,
      name: "Content Creator",
      icon: PenTool,
      status: isCompleted ? "completed" : activeAgentIndex > 3 ? "completed" : activeAgentIndex === 3 ? "running" : "waiting",
      description: "Writing campaign content based on research",
    },
    {
      id: "visualizer",
      number: 5,
      name: "Visualizer",
      icon: ImageIcon,
      status: isCompleted ? "completed" : activeAgentIndex > 4 ? "completed" : activeAgentIndex === 4 ? "running" : "waiting",
      description: "Waiting for content",
    },
    {
      id: "ceo_auditor",
      number: 6,
      name: "CEO Auditor",
      icon: ShieldCheck,
      status: isCompleted ? "completed" : activeAgentIndex > 5 ? "completed" : activeAgentIndex === 5 ? "running" : "waiting",
      description: "Final review pending",
    },
  ];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const activeAgent = agents[activeAgentIndex] || agents[3];

  const handleApplyToEditors = () => {
    // Dummy payload for UI testing
    onCompletePayload({ success: true, dummy: true });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all duration-300 font-sans">
      {/* Debug Toggle for UI Review */}
      <button
        onClick={() => setIsCompleted(!isCompleted)}
        className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium z-50 backdrop-blur-md border border-white/20"
      >
        Debug: Toggle State (Currently: {isCompleted ? "Completed" : "Processing"})
      </button>

      {/* Main Modal Container */}
      <div
        className={`relative overflow-hidden shadow-2xl transition-all duration-500 ease-in-out ${
          isCompleted
            ? "w-[730px] max-w-[calc(100vw-32px)] bg-white rounded-[20px] border border-[#E5E7EB]"
            : "w-[1180px] min-h-[680px] max-w-[calc(100vw-32px)] bg-[#0B0D10] rounded-[18px] border border-[#252A32]"
        }`}
      >
        {/* Processing State */}
        {!isCompleted && (
          <div className="flex flex-col h-full text-white">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#252A32]">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">AI Studio</h2>
                  <p className="text-sm text-[#9CA3AF]">Multi-Agent Campaign</p>
                </div>
                <div className="h-4 w-px bg-[#252A32] mx-2"></div>
                <div className="flex items-center gap-2 px-3 py-1 bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse"></div>
                  <span className="text-xs font-medium text-[#22C55E]">Live</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="p-2 text-[#9CA3AF] hover:text-white transition-colors"><Minus className="w-4 h-4" /></button>
                <button className="p-2 text-[#9CA3AF] hover:text-white transition-colors"><Maximize2 className="w-4 h-4" /></button>
                <button onClick={onClose} className="p-2 text-[#9CA3AF] hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Campaign Status */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-[#252A32] bg-[#11141A]">
              <h3 className="text-[#9CA3AF] font-medium text-sm">Creating your campaign...</h3>
              <div className="text-sm font-mono text-[#9CA3AF]">{formatTime(elapsedTime)}</div>
            </div>

            {/* Two Column Layout */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Column: Agents List */}
              <div className="w-[32%] border-r border-[#252A32] overflow-y-auto p-4 space-y-2">
                {agents.map((agent) => {
                  const Icon = agent.icon;
                  const isActive = agent.id === activeAgent.id;
                  const isCompleted = agent.status === "completed";
                  const isWaiting = agent.status === "waiting";

                  return (
                    <div
                      key={agent.id}
                      className={`flex items-start gap-4 p-4 rounded-xl border transition-all duration-300 ${
                        isActive
                          ? "bg-[#161920] border-[#8B5CF6]/30 shadow-[0_0_15px_rgba(139,92,246,0.1)]"
                          : isCompleted
                          ? "bg-transparent border-[#252A32] opacity-80"
                          : "bg-transparent border-transparent opacity-50"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border ${
                          isCompleted
                            ? "bg-[#22C55E]/10 border-[#22C55E]/20 text-[#22C55E]"
                            : isActive
                            ? "bg-[#8B5CF6]/10 border-[#8B5CF6]/20 text-[#8B5CF6]"
                            : "bg-[#1A1D24] border-[#252A32] text-[#9CA3AF]"
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={`text-sm font-semibold truncate ${isActive ? "text-white" : "text-[#9CA3AF]"}`}>
                            {agent.name}
                          </h4>
                          {isActive && (
                            <span className="text-[10px] font-mono text-[#8B5CF6] bg-[#8B5CF6]/10 px-2 py-0.5 rounded-full border border-[#8B5CF6]/20">
                              {formatTime(elapsedTime % 45)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">{agent.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Active Agent Panel */}
              <div className="w-[68%] p-8 bg-[#0B0D10] overflow-y-auto">
                <div className="max-w-2xl mx-auto space-y-8">
                  {/* Active Agent Header */}
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.15)] relative">
                      <activeAgent.icon className="w-8 h-8 text-[#8B5CF6]" />
                      <div className="absolute inset-0 rounded-2xl border border-[#8B5CF6] opacity-50 animate-ping" style={{ animationDuration: '3s' }}></div>
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold tracking-wider text-[#8B5CF6] uppercase bg-[#8B5CF6]/10 px-2 py-1 rounded-md">
                          IN PROGRESS
                        </span>
                      </div>
                      <h3 className="text-2xl font-semibold text-white mb-2">{activeAgent.name}</h3>
                      <p className="text-[#9CA3AF] text-sm">{activeAgent.description}...</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2 pt-4">
                    <div className="flex justify-between text-xs font-medium text-[#9CA3AF]">
                      <span>Overall Progress</span>
                      <span className="text-white">62%</span>
                    </div>
                    <div className="h-2 w-full bg-[#1A1D24] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#A78BFA] w-[62%] transition-all duration-1000 ease-out rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]"></div>
                    </div>
                  </div>

                  {/* Activity Card */}
                  <div className="bg-[#11141A] border border-[#252A32] rounded-[16px] p-6">
                    <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
                      What I'm doing
                    </h4>
                    <div className="space-y-4">
                      {[
                        { label: "Analyzing audience and intent", status: "completed" },
                        { label: "Generating hook variations", status: "running" },
                        { label: "Crafting engaging copy", status: "pending" },
                        { label: "Building strong call to action", status: "pending" },
                        { label: "Optimizing tone and readability", status: "pending" },
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          {item.status === "completed" ? (
                            <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                          ) : item.status === "running" ? (
                            <Loader2 className="w-4 h-4 text-[#8B5CF6] animate-spin" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-[#252A32]" />
                          )}
                          <span
                            className={`text-sm ${
                              item.status === "completed"
                                ? "text-[#9CA3AF]"
                                : item.status === "running"
                                ? "text-white font-medium"
                                : "text-[#4B5563]"
                            }`}
                          >
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[#252A32] flex items-center justify-between bg-[#0B0D10]">
              <span className="text-xs text-[#6B7280]">You can close this window, we'll keep working.</span>
              <Button
                variant="outline"
                className="bg-transparent border-[#252A32] text-[#EF4444] hover:bg-[#EF4444]/10 hover:border-[#EF4444]/30 text-sm h-9 px-4 rounded-lg transition-colors"
                onClick={onClose}
              >
                Cancel Campaign
              </Button>
            </div>
          </div>
        )}

        {/* Completed State */}
        {isCompleted && (
          <div className="flex flex-col text-[#111318] p-8 animate-in fade-in zoom-in-95 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-bold tracking-tight">AI Studio</h2>
                <p className="text-sm text-[#6B7280]">Multi-Agent Campaign</p>
              </div>
              <button onClick={onClose} className="p-2 text-[#6B7280] hover:text-[#111318] hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success Message */}
            <div className="flex flex-col items-center text-center space-y-4 mb-8">
              <div className="w-[86px] h-[86px] rounded-full bg-[#22C55E]/10 flex items-center justify-center mb-2">
                <CheckCircle2 className="w-[48px] h-[48px] text-[#22C55E]" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">Campaign Ready!</h3>
                <p className="text-[#6B7280]">Your content has been successfully created.</p>
              </div>
            </div>

            {/* Summary & Assets */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Campaign Summary */}
              <div className="bg-gray-50 border border-[#E5E7EB] rounded-[16px] p-5">
                <h4 className="text-sm font-semibold mb-4 text-[#111318]">Campaign Summary</h4>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-[#6B7280] block mb-1">Campaign Name</span>
                    <span className="text-sm font-medium">Social Media Campaign</span>
                  </div>
                  <div>
                    <span className="text-xs text-[#6B7280] block mb-1">ID</span>
                    <span className="text-sm font-mono bg-white border border-[#E5E7EB] px-2 py-0.5 rounded text-[#111318]">CMP-XXXXXX</span>
                  </div>
                  <div className="pt-2 flex flex-wrap gap-2">
                    {["6 agents completed", "12 sources", "3 assets generated"].map((stat, i) => (
                      <span key={i} className="text-xs bg-white border border-[#E5E7EB] px-2 py-1 rounded-md text-[#6B7280]">
                        {stat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Assets Generated */}
              <div className="bg-gray-50 border border-[#E5E7EB] rounded-[16px] p-5">
                <h4 className="text-sm font-semibold mb-4 text-[#111318]">Assets Generated</h4>
                <div className="space-y-2">
                  {[
                    { label: "Content", icon: FileText },
                    { label: "Image", icon: ImageIcon },
                    { label: "Video", icon: Video },
                  ].map((asset, i) => (
                    <div key={i} className="flex items-center justify-between bg-white border border-[#E5E7EB] p-3 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 border border-[#E5E7EB] flex items-center justify-center">
                          <asset.icon className="w-4 h-4 text-[#6B7280]" />
                        </div>
                        <span className="text-sm font-medium">{asset.label}</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#22C55E] bg-[#22C55E]/10 px-2 py-1 rounded-md uppercase">Ready</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Button
                onClick={handleApplyToEditors}
                className="w-full h-[56px] bg-[#0B0D10] hover:bg-black text-white rounded-xl text-base font-medium transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <Edit className="w-5 h-5" />
                Add Content to Editor
                <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
              </Button>
              <Button
                variant="outline"
                className="w-full h-[56px] bg-white border border-[#E5E7EB] text-[#111318] hover:bg-gray-50 rounded-xl text-base font-medium transition-colors flex items-center justify-center gap-2"
              >
                <BarChart2 className="w-5 h-5 text-[#6B7280]" />
                View Campaign Details
              </Button>
              <button onClick={onClose} className="mt-2 text-sm text-[#6B7280] hover:text-[#111318] font-medium transition-colors">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
