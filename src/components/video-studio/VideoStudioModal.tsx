"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Sparkles,
  Play,
  Pause,
  Upload,
  Video as VideoIcon,
  Wand2,
  Layers,
  Film,
  Volume2,
  Loader2,
  Trash2,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  Plus,
  RefreshCw
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

export default function VideoStudioModal({
  isOpen,
  onClose,
  onSelectVideo,
  platform,
  formatName,
  defaultTopic = ""
}: VideoStudioModalProps) {
  // --- STATE ---
  const [reelTopic, setReelTopic] = useState<string>(defaultTopic || "");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<string>("");
  const [scenes, setScenes] = useState<ReelScene[]>([]);
  const [reelTitle, setReelTitle] = useState<string>("");
  const [fullScript, setFullScript] = useState<string>("");
  const [hasGenerated, setHasGenerated] = useState<boolean>(false);

  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isVoiceoverOn, setIsVoiceoverOn] = useState<boolean>(true);

  const [isStockModalOpen, setIsStockModalOpen] = useState<boolean>(false);
  const [targetSceneId, setTargetSceneId] = useState<number | null>(null);

  const pcFileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // --- AUTO-PLAY SCENE CYCLING ---
  useEffect(() => {
    let timer: any;
    if (isPlaying && scenes.length > 0) {
      const dur = (scenes[activeSceneIdx]?.durationSeconds || 7) * 1000;
      timer = setTimeout(() => {
        const nextIdx = (activeSceneIdx + 1) % scenes.length;
        setActiveSceneIdx(nextIdx);
        // Auto voiceover for next scene
        if (isVoiceoverOn) speakText(scenes[nextIdx]?.voiceoverText || scenes[nextIdx]?.text || "");
      }, dur);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, activeSceneIdx, scenes, isVoiceoverOn]);

  // --- VOICEOVER TTS ---
  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (!text.trim()) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    // Try to find a good English voice
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(v => v.lang.startsWith("en") && v.name.includes("Google")) || voices.find(v => v.lang.startsWith("en"));
    if (englishVoice) utterance.voice = englishVoice;
    window.speechSynthesis.speak(utterance);
  }, []);

  // --- GENERATE AI REEL (Background) ---
  const handleGenerate = async () => {
    if (!reelTopic.trim() || isGenerating) return;

    setIsGenerating(true);
    setIsPlaying(false);
    setHasGenerated(false);
    setScenes([]);
    setGenerationProgress("🧠 AI is writing your viral script...");

    try {
      const res = await generateAIReelPackage(reelTopic.trim(), 4);
      
      if (res.success && res.scenes && res.scenes.length > 0) {
        setScenes(res.scenes);
        setReelTitle(res.title || reelTopic);
        setFullScript(res.fullScript || "");
        setActiveSceneIdx(0);
        setHasGenerated(true);
        setGenerationProgress("");

        // Auto-start playback with voiceover
        setTimeout(() => {
          setIsPlaying(true);
          if (isVoiceoverOn && res.scenes![0]?.voiceoverText) {
            speakText(res.scenes![0].voiceoverText);
          }
        }, 500);
      } else {
        setGenerationProgress("❌ " + (res.error || "Failed to generate. Try a different topic."));
      }
    } catch (error) {
      setGenerationProgress("❌ Generation failed. Please try again.");
      console.error("AI Reel Generation failed:", error);
    }

    setIsGenerating(false);
  };

  // --- PLAY/PAUSE ---
  const togglePlay = () => {
    const newState = !isPlaying;
    setIsPlaying(newState);
    if (newState && isVoiceoverOn) {
      speakText(scenes[activeSceneIdx]?.voiceoverText || scenes[activeSceneIdx]?.text || "");
    } else {
      window.speechSynthesis?.cancel();
    }
  };

  // --- SCENE NAVIGATION ---
  const goToScene = (idx: number) => {
    setActiveSceneIdx(idx);
    if (isPlaying && isVoiceoverOn) {
      speakText(scenes[idx]?.voiceoverText || scenes[idx]?.text || "");
    }
  };

  // --- STOCK MODAL CALLBACK ---
  const handleSelectStockForScene = (item: StockHit) => {
    if (targetSceneId !== null) {
      setScenes(prev => prev.map(s => s.id === targetSceneId ? { ...s, videoUrl: item.url, mediaType: item.type } : s));
    }
    setIsStockModalOpen(false);
    setTargetSceneId(null);
  };

  // --- PC UPLOAD CALLBACK ---
  const handlePCUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && targetSceneId !== null) {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video/");
      setScenes(prev => prev.map(s => s.id === targetSceneId ? { ...s, videoUrl: url, mediaType: isVideo ? "video" : "image" } : s));
    }
    setTargetSceneId(null);
    if (e.target) e.target.value = "";
  };

  // --- ADD REEL TO POST (Pass the active scene's video which is the first/primary one) ---
  const handleAddToPost = () => {
    // Find the first scene with a valid video URL
    const primaryScene = scenes.find(s => s.videoUrl && s.videoUrl.length > 0);
    const videoUrl = primaryScene?.videoUrl || scenes[activeSceneIdx]?.videoUrl || "";
    if (videoUrl) {
      onSelectVideo(videoUrl);
    }
    onClose();
  };

  if (!isOpen) return null;

  const currentScene = scenes[activeSceneIdx] || null;
  const totalDuration = scenes.reduce((sum, s) => sum + (s.durationSeconds || 7), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-950 rounded-3xl w-full max-w-6xl h-[92vh] border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-white">
        
        {/* ═══════════════ HEADER ═══════════════ */}
        <div className="p-3.5 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 text-white shadow-lg">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-wide text-white uppercase">AI Reel Creator</h2>
              <p className="text-xs text-slate-400">Groq AI Script + Pixabay HD Videos + Voiceover</p>
            </div>
            <Badge variant="outline" className="text-[10px] font-extrabold uppercase border-purple-500/40 text-purple-300 bg-purple-950/40">
              {formatName} • {platform}
            </Badge>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Hidden PC File Input */}
        <input type="file" ref={pcFileRef} accept="video/*,image/*" className="hidden" onChange={handlePCUpload} />

        {/* ═══════════════ MAIN BODY ═══════════════ */}
        <div className="flex-1 flex overflow-hidden">

          {/* ──────── LEFT: PROMPT + SCENE LIST ──────── */}
          <div className="w-full md:w-[45%] flex flex-col border-r border-slate-800 overflow-hidden">

            {/* PROMPT INPUT - Simple & Clean */}
            <div className="p-5 border-b border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={reelTopic}
                  onChange={e => setReelTopic(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleGenerate(); }}
                  placeholder="Describe your Reel topic (e.g. 5 Habits of Millionaires)..."
                  className="text-sm bg-slate-900 border-slate-700 text-white focus:border-purple-500 h-11"
                  disabled={isGenerating}
                />
                <Button
                  disabled={isGenerating || !reelTopic.trim()}
                  onClick={handleGenerate}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white font-extrabold text-sm h-11 px-5 shrink-0 gap-2"
                >
                  {isGenerating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
                  ) : (
                    <><Wand2 className="h-4 w-4" /> Generate Reel</>
                  )}
                </Button>
              </div>

              {/* Loading Progress */}
              {isGenerating && (
                <div className="flex items-center gap-3 bg-purple-950/30 border border-purple-800/40 rounded-xl px-4 py-3 animate-pulse">
                  <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
                  <div>
                    <p className="text-xs font-bold text-purple-300">AI is building your Reel...</p>
                    <p className="text-[11px] text-slate-400">Writing script → Matching HD stock videos → Preparing voiceover</p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {generationProgress && !isGenerating && generationProgress.startsWith("❌") && (
                <p className="text-xs text-red-400 font-semibold">{generationProgress}</p>
              )}
            </div>

            {/* SCENE LIST */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {scenes.length === 0 && !isGenerating && (
                <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 gap-3 py-16">
                  <Film className="h-12 w-12 opacity-30" />
                  <p className="text-sm font-semibold">Enter a topic above and hit Generate</p>
                  <p className="text-xs text-slate-600">AI will write the script, find matching videos, and add voiceover automatically</p>
                </div>
              )}

              {scenes.map((scene, idx) => (
                <div
                  key={scene.id}
                  onClick={() => goToScene(idx)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeSceneIdx === idx
                      ? "bg-purple-950/30 border-purple-500 ring-1 ring-purple-500/40"
                      : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-black text-[11px] flex items-center justify-center">{idx + 1}</span>
                      <span className="text-xs font-bold text-white">Scene {idx + 1}</span>
                      <Badge variant="outline" className="text-[9px] text-slate-400 border-slate-700">{scene.durationSeconds}s</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setTargetSceneId(scene.id); setIsStockModalOpen(true); }}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-pink-900/30 text-[10px] font-bold text-pink-300 border border-slate-700 flex items-center gap-1"
                      >
                        <ImageIcon className="h-3 w-3" /> Stock
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setTargetSceneId(scene.id); pcFileRef.current?.click(); }}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-emerald-900/30 text-[10px] font-bold text-emerald-300 border border-slate-700 flex items-center gap-1"
                      >
                        <Upload className="h-3 w-3" /> Upload
                      </button>
                      {scenes.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setScenes(scenes.filter(s => s.id !== scene.id)); if (activeSceneIdx >= scenes.length - 1) setActiveSceneIdx(0); }}
                          className="p-1 rounded-lg hover:bg-red-950 text-slate-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Caption */}
                  <p className="text-xs font-semibold text-white leading-snug mb-1">📝 {scene.text}</p>
                  {/* Voiceover text */}
                  <p className="text-[11px] text-slate-400 leading-snug italic">🎙️ {scene.voiceoverText}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ──────── RIGHT: 9:16 VERTICAL PREVIEW ──────── */}
          <div className="hidden md:flex w-[55%] flex-col items-center justify-center bg-slate-900/30 p-6 gap-4">

            {/* TITLE */}
            {reelTitle && hasGenerated && (
              <h3 className="text-sm font-black text-white text-center max-w-sm">{reelTitle}</h3>
            )}

            {/* 9:16 CANVAS */}
            <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-3xl overflow-hidden border-4 border-purple-500/40 shadow-2xl bg-black flex items-center justify-center group">
              {currentScene?.videoUrl ? (
                currentScene.mediaType === "image" ? (
                  <img src={currentScene.videoUrl} alt="Scene" className="w-full h-full object-cover" />
                ) : (
                  <video
                    ref={videoRef}
                    key={currentScene.videoUrl + currentScene.id}
                    src={currentScene.videoUrl}
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                )
              ) : hasGenerated ? (
                <div className="text-center p-4 text-slate-500 text-xs">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin opacity-40" />
                  Loading video...
                </div>
              ) : (
                <div className="text-center p-6 text-slate-500">
                  <Film className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-xs font-semibold">Your AI Reel preview will appear here</p>
                </div>
              )}

              {/* CAPTION OVERLAY */}
              {currentScene && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/20 p-4 flex flex-col justify-end pointer-events-none z-10">
                  <div className="mb-6 text-center px-2">
                    <h3
                      className="text-yellow-300 text-lg font-black leading-tight uppercase tracking-wide"
                      style={{ textShadow: "2px 2px 8px rgba(0,0,0,0.95), 0 0 20px rgba(0,0,0,0.8)" }}
                    >
                      {currentScene.text}
                    </h3>
                  </div>
                </div>
              )}

              {/* PLAY/PAUSE OVERLAY */}
              {hasGenerated && (
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 m-auto h-14 w-14 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:scale-110"
                >
                  {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="h-7 w-7 ml-0.5" />}
                </button>
              )}
            </div>

            {/* PLAYBACK CONTROLS */}
            {hasGenerated && scenes.length > 0 && (
              <div className="w-full max-w-sm space-y-2">
                {/* Control Bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={togglePlay} className="p-2 rounded-xl bg-purple-600 text-white hover:bg-purple-500 transition-colors">
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setIsVoiceoverOn(!isVoiceoverOn);
                        if (isVoiceoverOn) window.speechSynthesis?.cancel();
                      }}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border transition-all ${
                        isVoiceoverOn
                          ? "bg-pink-950/40 border-pink-500/40 text-pink-300"
                          : "bg-slate-900 border-slate-700 text-slate-400"
                      }`}
                    >
                      <Volume2 className="h-3.5 w-3.5" /> Voiceover {isVoiceoverOn ? "ON" : "OFF"}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                    <button onClick={() => goToScene(Math.max(0, activeSceneIdx - 1))}>
                      <ChevronLeft className="h-5 w-5 hover:text-white" />
                    </button>
                    <span>{activeSceneIdx + 1}/{scenes.length}</span>
                    <button onClick={() => goToScene((activeSceneIdx + 1) % scenes.length)}>
                      <ChevronRight className="h-5 w-5 hover:text-white" />
                    </button>
                  </div>
                </div>

                {/* Scene Progress Bars */}
                <div className="flex gap-1">
                  {scenes.map((s, idx) => (
                    <div
                      key={s.id}
                      onClick={() => goToScene(idx)}
                      className={`h-1.5 rounded-full cursor-pointer transition-all flex-1 ${
                        activeSceneIdx === idx ? "bg-purple-500" : idx < activeSceneIdx ? "bg-purple-800" : "bg-slate-800"
                      }`}
                    />
                  ))}
                </div>

                <p className="text-center text-[11px] text-slate-500 font-medium">
                  Total Duration: {totalDuration}s • {scenes.length} Scenes
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <div className="p-4 px-6 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-slate-400 hover:text-white">
            Cancel
          </Button>

          {hasGenerated && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="text-xs font-bold gap-1.5 border-slate-700"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate
              </Button>
              <Button
                size="sm"
                onClick={handleAddToPost}
                className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-90 text-white font-extrabold px-6 py-2.5 rounded-xl shadow-lg gap-2 text-xs"
              >
                <Sparkles className="h-4 w-4" />
                Add to Reel
              </Button>
            </div>
          )}
        </div>

      </div>

      {/* STOCK MEDIA PICKER */}
      <StockMediaModal
        isOpen={isStockModalOpen}
        allowedType="video"
        onClose={() => setIsStockModalOpen(false)}
        onSelect={handleSelectStockForScene}
      />
    </div>
  );
}
