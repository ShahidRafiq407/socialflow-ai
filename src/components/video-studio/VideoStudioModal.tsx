"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Sparkles,
  Play,
  Pause,
  Upload,
  Video as VideoIcon,
  Music,
  Type,
  Sliders,
  Scissors,
  Layers,
  Wand2,
  Check,
  Plus,
  Tv,
  Mic,
  Film,
  Sparkle,
  Volume2,
  Loader2,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  FastForward
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import StockMediaModal from "@/components/stock-media/StockMediaModal";
import { generateAIReelPackage, ReelScene } from "@/actions/ai-reel-generator";
import { StockHit } from "@/actions/stock-media";

interface VideoStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVideo: (videoUrl: string) => void;
  platform: string;
  formatName: string;
  defaultTopic?: string;
}

const TOPIC_PRESETS = [
  "5 Habits of Successful Entrepreneurs",
  "3 AI Tools That Will Replace 90% of Software Jobs",
  "How to Scale Your Business in 2026",
  "5 Morning Routines for Maximum Productivity",
  "3 Secret Marketing Strategies for Explosive Growth"
];

export default function VideoStudioModal({
  isOpen,
  onClose,
  onSelectVideo,
  platform,
  formatName,
  defaultTopic = ""
}: VideoStudioModalProps) {
  // Main Studio Mode Tabs
  const [activeTab, setActiveTab] = useState<"ai_reel" | "canva" | "heygen" | "veo3">("ai_reel");

  // --- STRATEGY 1: GROQ + PIXABAY AUTO AI REEL STATE ---
  const [reelTopic, setReelTopic] = useState<string>(defaultTopic || "5 Habits of Successful Entrepreneurs");
  const [isGeneratingReel, setIsGeneratingReel] = useState<boolean>(false);
  const [scenes, setScenes] = useState<ReelScene[]>([
    {
      id: 1,
      text: "Stop wasting time on low-impact tasks!",
      keyword: "businessman working desk",
      durationSeconds: 4,
      videoUrl: "https://cdn.pixabay.com/video/2021/04/12/70868-536412678_tiny.mp4",
      mediaType: "video"
    },
    {
      id: 2,
      text: "Focus 80% of your energy on high ROI goals.",
      keyword: "growth chart analytics strategy",
      durationSeconds: 4,
      videoUrl: "https://cdn.pixabay.com/video/2020/05/25/40150-425126838_tiny.mp4",
      mediaType: "video"
    },
    {
      id: 3,
      text: "Automate repetitive workflows with AI tools.",
      keyword: "future technology artificial intelligence",
      durationSeconds: 4,
      videoUrl: "https://cdn.pixabay.com/video/2019/04/23/23011-332490515_tiny.mp4",
      mediaType: "video"
    }
  ]);

  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const [isPlayingReel, setIsPlayingReel] = useState<boolean>(false);
  const [captionStyle, setCaptionStyle] = useState<"yellow_bold" | "clean_white" | "neon_box">("yellow_bold");
  const [isStockModalOpen, setIsStockModalOpen] = useState<boolean>(false);
  const [targetSceneId, setTargetSceneId] = useState<number | null>(null);

  // File Ref for Manual PC Media Upload per scene
  const pcFileRef = useRef<HTMLInputElement>(null);

  // Auto-play cycling timer for Reel Canvas
  useEffect(() => {
    let timer: any;
    if (isPlayingReel && scenes.length > 0) {
      const currentDuration = (scenes[activeSceneIdx]?.durationSeconds || 4) * 1000;
      timer = setTimeout(() => {
        setActiveSceneIdx(prev => (prev + 1) % scenes.length);
      }, currentDuration);
    }
    return () => clearTimeout(timer);
  }, [isPlayingReel, activeSceneIdx, scenes]);

  // Voiceover Text-To-Speech Synthesis helper
  const playVoiceover = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const currentText = scenes[activeSceneIdx]?.text || "";
      if (currentText) {
        const utterance = new SpeechSynthesisUtterance(currentText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  // Trigger Full AI Reel Generation (Groq + Pixabay API)
  const handleGenerateAIReel = async (topicToUse?: string) => {
    const targetTopic = topicToUse || reelTopic;
    if (!targetTopic.trim()) return;

    setIsGeneratingReel(true);
    setIsPlayingReel(false);

    try {
      const res = await generateAIReelPackage(targetTopic, 4);
      if (res.success && res.scenes && res.scenes.length > 0) {
        setScenes(res.scenes);
        setActiveSceneIdx(0);
        setIsPlayingReel(true);
      }
    } catch (error) {
      console.error("AI Reel Generation failed:", error);
    }

    setIsGeneratingReel(false);
  };

  // Manual Scene Media Update (Pixabay Stock Modal callback)
  const handleSelectStockForScene = (item: StockHit) => {
    if (targetSceneId !== null) {
      setScenes(prev =>
        prev.map(s => (s.id === targetSceneId ? { ...s, videoUrl: item.url, mediaType: item.type } : s))
      );
    }
    setIsStockModalOpen(false);
    setTargetSceneId(null);
  };

  // Manual PC Media Upload Callback for Scene
  const handlePCFileUploadForScene = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && targetSceneId !== null) {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/");
      setScenes(prev =>
        prev.map(s => (s.id === targetSceneId ? { ...s, videoUrl: url, mediaType: isVideo ? "video" : "image" } : s))
      );
    }
    setTargetSceneId(null);
  };

  // Final Action: Add Video Reel to Post
  const handleApplyAndClose = () => {
    const primaryVideo = scenes[0]?.videoUrl || "";
    onSelectVideo(primaryVideo);
    onClose();
  };

  if (!isOpen) return null;

  const currentScene = scenes[activeSceneIdx] || scenes[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-950 rounded-3xl w-full max-w-6xl h-[92vh] border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-white">
        
        {/* ============================================================================ */}
        {/* HEADER BAR: STUDIO TITLE & ENGINE TABS */}
        {/* ============================================================================ */}
        <div className="p-3.5 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 text-white shadow-lg">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide text-white uppercase">AI Video & Reel Creator Studio</h2>
                <Badge variant="outline" className="text-[10px] font-extrabold uppercase border-purple-500/40 text-purple-300 bg-purple-950/40">
                  {formatName} ({platform.toUpperCase()})
                </Badge>
              </div>
              <p className="text-xs text-slate-400">Groq AI Multi-Scene Scripting, HD Stock Videos & Kinetic Voiceover Subtitles</p>
            </div>
          </div>

          {/* ENGINE TABS */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab("ai_reel")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                activeTab === "ai_reel"
                  ? "bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>⚡ Groq AI Reel Builder</span>
            </button>

            <button
              onClick={() => setActiveTab("canva")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                activeTab === "canva"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <Tv className="h-3.5 w-3.5" />
              <span>Canva Video Studio</span>
            </button>

            <button
              onClick={() => setActiveTab("heygen")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                activeTab === "heygen"
                  ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
              <span>HeyGen Avatar</span>
            </button>

            <button
              onClick={() => setActiveTab("veo3")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                activeTab === "veo3"
                  ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <VideoIcon className="h-3.5 w-3.5" />
              <span>Google Veo 3 / Sora</span>
            </button>
          </div>

          {/* CLOSE BUTTON */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hidden PC File Input for Manual Upload per Scene */}
        <input
          type="file"
          ref={pcFileRef}
          accept="video/*,image/*"
          className="hidden"
          onChange={handlePCFileUploadForScene}
        />

        {/* ============================================================================ */}
        {/* MAIN BODY AREA */}
        {/* ============================================================================ */}
        <div className="flex-1 flex overflow-hidden">

          {/* -------------------------------------------------------------------------- */}
          {/* TAB 1: GROQ AI REEL BUILDER (STRATEGY 1) */}
          {/* -------------------------------------------------------------------------- */}
          {activeTab === "ai_reel" && (
            <div className="w-full h-full flex flex-col md:flex-row overflow-hidden p-4 gap-5">
              
              {/* LEFT SIDE: AI GENERATOR & SCENE LIST EDITOR */}
              <div className="w-full md:w-1/2 flex flex-col space-y-4 overflow-y-auto pr-1">
                
                {/* 1. TOPIC INPUT & GROQ GENERATE BAR */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase text-purple-400 tracking-wider flex items-center gap-2">
                      <Sparkles className="h-4 w-4" /> AI Script & Scene Generator (Groq Powered)
                    </h3>
                    <Badge variant="outline" className="text-[9px] border-purple-500/40 text-purple-300">100% Free Engine</Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={reelTopic}
                      onChange={e => setReelTopic(e.target.value)}
                      placeholder="Enter Reel Topic or Niche (e.g. 5 Fitness Hacks)..."
                      className="text-xs bg-slate-950 border-slate-800 text-white focus:border-purple-500"
                    />
                    <Button
                      disabled={isGeneratingReel}
                      onClick={() => handleGenerateAIReel()}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white font-extrabold text-xs shrink-0 gap-1.5"
                    >
                      {isGeneratingReel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                      <span>{isGeneratingReel ? "Generating..." : "Auto Build Reel"}</span>
                    </Button>
                  </div>

                  {/* Topic Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] font-bold text-slate-400">Presets:</span>
                    {TOPIC_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setReelTopic(preset); handleGenerateAIReel(preset); }}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 hover:bg-purple-900/40 hover:text-purple-300 border border-slate-700 transition-colors"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. SCENES EDITOR LIST (User can edit text, swap stock, or upload PC file) */}
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-slate-300 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-pink-400" /> Multi-Scene Timeline Breakdown ({scenes.length} Scenes)
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newId = scenes.length + 1;
                        setScenes([...scenes, { id: newId, text: `Scene ${newId} Text Overlay`, keyword: "business", durationSeconds: 4, mediaType: "video" }]);
                      }}
                      className="h-7 text-[11px] font-bold gap-1 border-slate-700 bg-slate-950"
                    >
                      <Plus className="h-3 w-3 text-emerald-400" /> Add Scene
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {scenes.map((scene, idx) => (
                      <div
                        key={scene.id}
                        onClick={() => setActiveSceneIdx(idx)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                          activeSceneIdx === idx
                            ? "bg-slate-950 border-purple-500 shadow-md ring-1 ring-purple-500/50"
                            : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-extrabold text-[10px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-extrabold text-white">Scene {idx + 1}</span>
                            <Badge variant="outline" className="text-[9px] text-slate-400 border-slate-800">{scene.durationSeconds}s</Badge>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Manual Pixabay Picker */}
                            <button
                              title="Pick Stock Video from Pixabay"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTargetSceneId(scene.id);
                                setIsStockModalOpen(true);
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-pink-900/40 text-[10px] font-bold text-pink-300 border border-slate-700 flex items-center gap-1"
                            >
                              <ImageIcon className="h-3 w-3 text-pink-400" /> Stock
                            </button>

                            {/* Manual PC Upload */}
                            <button
                              title="Upload Video/Image from PC"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTargetSceneId(scene.id);
                                pcFileRef.current?.click();
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-emerald-900/40 text-[10px] font-bold text-emerald-300 border border-slate-700 flex items-center gap-1"
                            >
                              <Upload className="h-3 w-3 text-emerald-400" /> PC Upload
                            </button>

                            {/* Delete Scene */}
                            {scenes.length > 1 && (
                              <button
                                title="Delete Scene"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setScenes(scenes.filter(s => s.id !== scene.id));
                                  setActiveSceneIdx(0);
                                }}
                                className="p-1 rounded-lg hover:bg-red-950 text-slate-400 hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Scene Caption Input */}
                        <Textarea
                          rows={2}
                          value={scene.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setScenes(scenes.map(s => s.id === scene.id ? { ...s, text: val } : s));
                          }}
                          placeholder="Type caption overlay text for this scene..."
                          className="text-xs bg-slate-900 border-slate-800 text-white focus:border-purple-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* RIGHT SIDE: CAPCUT / INVIDEO STYLE 9:16 VERTICAL CANVASS PREVIEW */}
              <div className="w-full md:w-1/2 bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col items-center justify-between relative overflow-hidden">
                
                {/* TOP CANVAS CONTROLS */}
                <div className="w-full flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-600 text-white text-[10px] font-black uppercase">
                      Scene {activeSceneIdx + 1}/{scenes.length}
                    </Badge>
                    <span className="text-xs font-bold text-slate-300 truncate max-w-[180px]">
                      {currentScene?.keyword || "Stock Video"}
                    </span>
                  </div>

                  {/* Subtitle Style Selector */}
                  <select
                    value={captionStyle}
                    onChange={e => setCaptionStyle(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-extrabold px-2 py-1 text-purple-300 focus:outline-none"
                  >
                    <option value="yellow_bold">CapCut Yellow Subtitles</option>
                    <option value="clean_white">Clean Bold White</option>
                    <option value="neon_box">Cyberpunk Neon Box</option>
                  </select>
                </div>

                {/* 9:16 VERTICAL REEL CANVAS */}
                <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-3xl overflow-hidden border-4 border-purple-500/50 shadow-2xl bg-black flex items-center justify-center group">
                  {currentScene?.videoUrl ? (
                    currentScene.mediaType === "image" ? (
                      <img src={currentScene.videoUrl} alt="Scene" className="w-full h-full object-cover" />
                    ) : (
                      <video
                        key={currentScene.videoUrl}
                        src={currentScene.videoUrl}
                        className="w-full h-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                    )
                  ) : (
                    <div className="text-center p-4 text-slate-400 text-xs">
                      <Film className="h-8 w-8 mx-auto mb-2 opacity-40 animate-pulse" />
                      No Video Attached
                    </div>
                  )}

                  {/* CAPCUT ANIMATED KINETIC TYPOGRAPHY OVERLAY */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30 p-5 flex flex-col justify-between pointer-events-none z-10">
                    <div className="flex justify-end">
                      <Badge className="bg-black/60 text-pink-400 border border-pink-500/30 text-[9px] font-extrabold uppercase">
                        AI Reel
                      </Badge>
                    </div>

                    {/* CAPTION TEXT BOX */}
                    <div className="mb-8 text-center px-2">
                      {captionStyle === "yellow_bold" && (
                        <h3 className="text-yellow-300 text-lg font-black leading-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] tracking-wide uppercase stroke-black">
                          {currentScene?.text || "Your Viral Caption Overlay"}
                        </h3>
                      )}
                      {captionStyle === "clean_white" && (
                        <h3 className="text-white text-lg font-extrabold leading-snug drop-shadow-md">
                          {currentScene?.text || "Your Viral Caption Overlay"}
                        </h3>
                      )}
                      {captionStyle === "neon_box" && (
                        <div className="bg-purple-900/90 text-cyan-300 text-sm font-black p-2.5 rounded-xl border border-cyan-400 shadow-lg">
                          {currentScene?.text || "Your Viral Caption Overlay"}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* OVERLAY PLAY/PAUSE BUTTON */}
                  <button
                    onClick={() => {
                      setIsPlayingReel(!isPlayingReel);
                      playVoiceover();
                    }}
                    className="absolute inset-0 m-auto h-12 w-12 rounded-full bg-black/70 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:scale-110"
                  >
                    {isPlayingReel ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                  </button>
                </div>

                {/* BOTTOM PLAYBACK TIMELINE TRACK */}
                <div className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2 mt-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setIsPlayingReel(!isPlayingReel);
                          playVoiceover();
                        }}
                        className="p-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                      >
                        {isPlayingReel ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={playVoiceover}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-pink-300 flex items-center gap-1"
                      >
                        <Volume2 className="h-3 w-3 text-pink-400" /> Voiceover TTS
                      </button>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-extrabold text-slate-300">
                      <button onClick={() => setActiveSceneIdx(prev => Math.max(0, prev - 1))}>
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span>{activeSceneIdx + 1} / {scenes.length}</span>
                      <button onClick={() => setActiveSceneIdx(prev => (prev + 1) % scenes.length)}>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Scene Progress Bars */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {scenes.map((s, idx) => (
                      <div
                        key={s.id}
                        onClick={() => setActiveSceneIdx(idx)}
                        className={`h-2 rounded-full cursor-pointer transition-all ${
                          activeSceneIdx === idx ? "bg-purple-500" : "bg-slate-800 hover:bg-slate-700"
                        }`}
                      />
                    ))}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* -------------------------------------------------------------------------- */}
          {/* TAB 2: CANVA VIDEO STUDIO */}
          {/* -------------------------------------------------------------------------- */}
          {activeTab === "canva" && (
            <div className="w-full h-full flex items-center justify-center p-8 text-center text-slate-400">
              <div>
                <Tv className="h-12 w-12 mx-auto mb-3 opacity-50 text-blue-400" />
                <h3 className="text-base font-bold text-white mb-1">Canva Video Preset Editor</h3>
                <p className="text-xs text-slate-400 max-w-sm">Use pre-designed graphic video layouts and custom text overlays.</p>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------------------- */}
          {/* TAB 3 & 4: HEYGEN & VEO 3 */}
          {/* -------------------------------------------------------------------------- */}
          {(activeTab === "heygen" || activeTab === "veo3") && (
            <div className="w-full h-full flex items-center justify-center p-8 text-center text-slate-400">
              <div>
                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50 text-pink-400 animate-pulse" />
                <h3 className="text-base font-bold text-white mb-1">AI Avatar & Motion Studio</h3>
                <p className="text-xs text-slate-400 max-w-sm">High-end cloud AI avatar and motion generation engines.</p>
              </div>
            </div>
          )}

        </div>

        {/* ============================================================================ */}
        {/* FOOTER BAR: CANCEL & APPLY TO POST BUTTON */}
        {/* ============================================================================ */}
        <div className="p-4 px-6 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={handleApplyAndClose}
            className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-90 text-white font-extrabold px-6 py-2.5 rounded-xl shadow-lg gap-2 text-xs"
          >
            <Sparkles className="h-4 w-4" />
            <span>Add AI Reel Video to Post</span>
          </Button>
        </div>

      </div>

      {/* MANUAL STOCK MEDIA PICKER MODAL FOR ANY SCENE */}
      <StockMediaModal
        isOpen={isStockModalOpen}
        allowedType="video"
        onClose={() => setIsStockModalOpen(false)}
        onSelect={handleSelectStockForScene}
      />
    </div>
  );
}
