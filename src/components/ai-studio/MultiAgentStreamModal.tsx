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
    onCompletePayload({ success: true, dummy: true });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm transition-all duration-300 font-sans overflow-hidden">
      {/* Debug Toggle for UI Review */}
      <button
        onClick={() => setIsCompleted(!isCompleted)}
        className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium z-50 backdrop-blur-md border border-white/20 shadow-lg"
      >
        Toggle State ({isCompleted ? "Completed" : "Processing"})
      </button>

      {/* Main Modal Container */}
      <div
        className={`relative overflow-hidden shadow-2xl transition-all duration-300 ease-in-out w-full flex flex-col ${
          isCompleted
            ? "max-w-[730px] max-h-[90vh] bg-white rounded-2xl md:rounded-[20px] border border-[#E5E7EB] overflow-y-auto"
            : "max-w-[1180px] h-[92vh] max-h-[750px] min-h-[500px] bg-[#0B0D10] rounded-2xl md:rounded-[18px] border border-[#252A32]"
        }`}
      >
        {/* Processing State */}
        {!isCompleted && (
          <div className="flex flex-col h-full text-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[#252A32] shrink-0">
              <div className="flex items-center gap-3 sm:gap-4">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold tracking-tight">AI Studio</h2>
                  <p className="text-xs sm:text-sm text-[#9CA3AF]">Multi-Agent Campaign</p>
                </div>
                <div className="h-4 w-px bg-[#252A32] hidden sm:block mx-1"></div>
                <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-0.5 sm:py-1 bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse"></div>
                  <span className="text-[10px] sm:text-xs font-medium text-[#22C55E]">Live</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-3">
                <button className="p-1.5 sm:p-2 text-[#9CA3AF] hover:text-white transition-colors hidden sm:block"><Minus className="w-4 h-4" /></button>
                <button className="p-1.5 sm:p-2 text-[#9CA3AF] hover:text-white transition-colors hidden sm:block"><Maximize2 className="w-4 h-4" /></button>
                <button onClick={onClose} className="p-1.5 sm:p-2 text-[#9CA3AF] hover:text-white transition-colors"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Campaign Status */}
            <div className="px-4 sm:px-6 py-3 flex items-center justify-between border-b border-[#252A32] bg-[#11141A] shrink-0">
              <h3 className="text-[#9CA3AF] font-medium text-xs sm:text-sm truncate">Creating your campaign...</h3>
              <div className="text-xs sm:text-sm font-mono text-[#9CA3AF] shrink-0 ml-2">{formatTime(elapsedTime)}</div>
            </div>

            {/* Responsive Layout: Stacked on mobile/tablet, 2-column on desktop */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
              {/* Left Column / Top Section: Agents List */}
              <div className="w-full md:w-[35%] lg:w-[32%] md:min-w-[280px] border-b md:border-b-0 md:border-r border-[#252A32] overflow-y-auto p-3 sm:p-4 space-y-2 max-h-[180px] sm:max-h-[220px] md:max-h-none shrink-0 md:shrink">
                {agents.map((agent) => {
                  const Icon = agent.icon;
                  const isActive = agent.id === activeAgent.id;
                  const isAgentCompleted = agent.status === "completed";

                  return (
                    <div
                      key={agent.id}
                      onClick={() => setActiveAgentIndex(agent.number - 1)}
                      className={`flex items-start gap-3 p-3 sm:p-3.5 rounded-xl border cursor-pointer transition-all duration-200 ${
                        isActive
                          ? "bg-[#161920] border-[#8B5CF6]/40 shadow-[0_0_15px_rgba(139,92,246,0.15)]"
                          : isAgentCompleted
                          ? "bg-transparent border-[#252A32] opacity-80 hover:bg-[#11141A]"
                          : "bg-transparent border-transparent opacity-50 hover:opacity-75"
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center border mt-0.5 ${
                          isAgentCompleted
                            ? "bg-[#22C55E]/10 border-[#22C55E]/20 text-[#22C55E]"
                            : isActive
                            ? "bg-[#8B5CF6]/10 border-[#8B5CF6]/20 text-[#8B5CF6]"
                            : "bg-[#1A1D24] border-[#252A32] text-[#9CA3AF]"
                        }`}
                      >
                        {isAgentCompleted ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <h4 className={`text-xs sm:text-sm font-semibold truncate ${isActive ? "text-white" : "text-[#9CA3AF]"}`}>
                            {agent.name}
                          </h4>
                          {isActive && (
                            <span className="text-[9px] sm:text-[10px] font-mono text-[#8B5CF6] bg-[#8B5CF6]/10 px-1.5 py-0.5 rounded-full border border-[#8B5CF6]/20 shrink-0 ml-1">
                              {formatTime(elapsedTime % 45)}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-[#6B7280] line-clamp-1 md:line-clamp-2 leading-tight sm:leading-relaxed">{agent.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column / Bottom Section: Active Agent Panel */}
              <div className="flex-1 p-4 sm:p-6 md:p-8 bg-[#0B0D10] overflow-y-auto">
                <div className="max-w-2xl mx-auto space-y-6">
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-[#9CA3AF]">
                      <span>Overall Progress</span>
                      <span className="text-white">62%</span>
                    </div>
                    <div className="h-2 w-full bg-[#1A1D24] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#A78BFA] w-[62%] transition-all duration-1000 ease-out rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]"></div>
                    </div>
                  </div>

                  {/* Activity Card - What I'm doing */}
                  <div className="bg-[#11141A] border border-[#252A32] rounded-[16px] p-4 sm:p-6">
                    <h4 className="text-xs sm:text-sm font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#8B5CF6]" />
                      What I'm doing
                    </h4>
                    <div className="space-y-3 sm:space-y-4">
                      {[
                        { label: "Analyzing audience and intent", status: "completed" },
                        { label: "Generating hook variations", status: "running" },
                        { label: "Crafting engaging copy", status: "pending" },
                        { label: "Building strong call to action", status: "pending" },
                        { label: "Optimizing tone and readability", status: "pending" },
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          {item.status === "completed" ? (
                            <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
                          ) : item.status === "running" ? (
                            <Loader2 className="w-4 h-4 text-[#8B5CF6] animate-spin shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-[#252A32] shrink-0" />
                          )}
                          <span
                            className={`text-xs sm:text-sm truncate ${
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
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-[#252A32] flex items-center justify-end bg-[#0B0D10] shrink-0">
              <Button
                variant="outline"
                className="bg-transparent border-[#252A32] text-[#EF4444] hover:bg-[#EF4444]/10 hover:border-[#EF4444]/30 text-xs sm:text-sm h-8 sm:h-9 px-3 sm:px-4 rounded-lg transition-colors shrink-0"
                onClick={onClose}
              >
                Cancel Campaign
              </Button>
            </div>
          </div>
        )}

        {/* Completed State */}
        {isCompleted && (
          <div className="flex flex-col text-[#111318] p-4 sm:p-6 md:p-8 animate-in fade-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 sm:mb-8">
              <div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">AI Studio</h2>
                <p className="text-xs sm:text-sm text-[#6B7280]">Multi-Agent Campaign</p>
              </div>
              <button onClick={onClose} className="p-2 text-[#6B7280] hover:text-[#111318] hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success Message */}
            <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4 mb-6 sm:mb-8">
              <div className="w-[64px] h-[64px] sm:w-[86px] sm:h-[86px] rounded-full bg-[#22C55E]/10 flex items-center justify-center mb-1 sm:mb-2">
                <CheckCircle2 className="w-[36px] h-[36px] sm:w-[48px] sm:h-[48px] text-[#22C55E]" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">Campaign Ready!</h3>
                <p className="text-xs sm:text-sm text-[#6B7280]">Your content has been successfully created.</p>
              </div>
            </div>

            {/* Summary & Assets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {/* Campaign Summary */}
              <div className="bg-gray-50 border border-[#E5E7EB] rounded-[16px] p-4 sm:p-5">
                <h4 className="text-xs sm:text-sm font-semibold mb-3 sm:mb-4 text-[#111318]">Campaign Summary</h4>
                <div className="space-y-3">
                  <div>
                    <span className="text-[11px] sm:text-xs text-[#6B7280] block mb-0.5">Campaign Name</span>
                    <span className="text-xs sm:text-sm font-medium">Social Media Campaign</span>
                  </div>
                  <div>
                    <span className="text-[11px] sm:text-xs text-[#6B7280] block mb-0.5">ID</span>
                    <span className="text-xs sm:text-sm font-mono bg-white border border-[#E5E7EB] px-2 py-0.5 rounded text-[#111318]">CMP-XXXXXX</span>
                  </div>
                  <div className="pt-1 sm:pt-2 flex flex-wrap gap-1.5 sm:gap-2">
                    {["6 agents completed", "12 sources", "3 assets generated"].map((stat, i) => (
                      <span key={i} className="text-[10px] sm:text-xs bg-white border border-[#E5E7EB] px-2 py-1 rounded-md text-[#6B7280]">
                        {stat}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Assets Generated */}
              <div className="bg-gray-50 border border-[#E5E7EB] rounded-[16px] p-4 sm:p-5">
                <h4 className="text-xs sm:text-sm font-semibold mb-3 sm:mb-4 text-[#111318]">Assets Generated</h4>
                <div className="space-y-2">
                  {[
                    { label: "Content", icon: FileText },
                    { label: "Image", icon: ImageIcon },
                    { label: "Video", icon: Video },
                  ].map((asset, i) => (
                    <div key={i} className="flex items-center justify-between bg-white border border-[#E5E7EB] p-2.5 sm:p-3 rounded-xl">
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-50 border border-[#E5E7EB] flex items-center justify-center">
                          <asset.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#6B7280]" />
                        </div>
                        <span className="text-xs sm:text-sm font-medium">{asset.label}</span>
                      </div>
                      <span className="text-[9px] sm:text-[10px] font-bold text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 sm:py-1 rounded-md uppercase">Ready</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <Button
                onClick={handleApplyToEditors}
                className="w-full h-12 sm:h-[56px] bg-[#0B0D10] hover:bg-black text-white rounded-xl text-sm sm:text-base font-medium transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <Edit className="w-4 h-4 sm:w-5 sm:h-5" />
                Add Content to Editor
                <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 sm:h-[56px] bg-white border border-[#E5E7EB] text-[#111318] hover:bg-gray-50 rounded-xl text-sm sm:text-base font-medium transition-colors flex items-center justify-center gap-2"
              >
                <BarChart2 className="w-4 h-4 sm:w-5 sm:h-5 text-[#6B7280]" />
                View Campaign Details
              </Button>
              <button onClick={onClose} className="mt-1 text-xs sm:text-sm text-[#6B7280] hover:text-[#111318] font-medium transition-colors">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
