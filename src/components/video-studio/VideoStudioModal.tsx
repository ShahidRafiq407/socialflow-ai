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
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Trash2,
  Film,
  Settings,
  Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import StockMediaModal from "@/components/stock-media/StockMediaModal";
import VideoPreviewPlayer from "@/components/ui/VideoPreviewPlayer";
import { generateAIReelPackage, ReelScene } from "@/actions/ai-reel-generator";
import { StockHit } from "@/actions/stock-media";

interface AIStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (mediaUrls: string[]) => void;
  platform: string;
  formatName: string; // e.g., "Reel", "Carousel", "Single Image"
  defaultTopic?: string;
}

export default function VideoStudioModal({
  isOpen,
  onClose,
  onSelectMedia,
  platform,
  formatName,
  defaultTopic = ""
}: AIStudioModalProps) {
  // --- STATE ---
  const [prompt, setPrompt] = useState<string>(defaultTopic || "");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [scenes, setScenes] = useState<ReelScene[]>([]);
  const [hasGenerated, setHasGenerated] = useState<boolean>(false);
  
  // Advanced Settings State
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [artStyle, setArtStyle] = useState<string>("Cinematic");
  const [cameraMotion, setCameraMotion] = useState<string>("Slow Pan");
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const [activeSlideIdx, setActiveSlideIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [isStockModalOpen, setIsStockModalOpen] = useState<boolean>(false);
  const [targetSceneId, setTargetSceneId] = useState<number | null>(null);

  const pcFileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isVideo = formatName.toLowerCase().includes("video") || formatName.toLowerCase().includes("reel") || formatName.toLowerCase().includes("tiktok");
  const isCarousel = formatName.toLowerCase().includes("carousel");

  // --- AUTO-PLAY SCENE CYCLING (For Video/Carousel) ---
  useEffect(() => {
    let timer: any;
    if (isPlaying && scenes.length > 0) {
      const dur = (scenes[activeSlideIdx]?.durationSeconds || 5) * 1000;
      timer = setTimeout(() => {
        const nextIdx = (activeSlideIdx + 1) % scenes.length;
        setActiveSlideIdx(nextIdx);
      }, dur);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, activeSlideIdx, scenes]);

  // --- GENERATE MEDIA ---
  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setIsPlaying(false);
    setHasGenerated(false);
    setScenes([]);
    
    try {
      const numScenes = isCarousel ? 4 : isVideo ? 3 : 1;
      // In a real app, we'd pass advanced settings to the backend
      const res = await generateAIReelPackage(prompt.trim(), numScenes);
      
      if (res.success && res.scenes && res.scenes.length > 0) {
        setScenes(res.scenes);
        setActiveSlideIdx(0);
        setHasGenerated(true);

        if (isVideo) {
          setTimeout(() => setIsPlaying(true), 500);
        }
      }
    } catch (error) {
      console.error("Media Generation failed:", error);
    }

    setIsGenerating(false);
  };

  const togglePlay = () => setIsPlaying(!isPlaying);
  const goToSlide = (idx: number) => setActiveSlideIdx(idx);

  const handleSelectStock = (item: StockHit) => {
    if (targetSceneId !== null) {
      setScenes(prev => prev.map(s => s.id === targetSceneId ? { ...s, videoUrl: item.url, mediaType: item.type } : s));
    }
    setIsStockModalOpen(false);
    setTargetSceneId(null);
  };

  const handlePCUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && targetSceneId !== null) {
      const url = URL.createObjectURL(file);
      const isVid = file.type.startsWith("video/");
      setScenes(prev => prev.map(s => s.id === targetSceneId ? { ...s, videoUrl: url, mediaType: isVid ? "video" : "image" } : s));
    }
    setTargetSceneId(null);
    if (e.target) e.target.value = "";
  };

  const handleAddToPost = () => {
    const urls = scenes.map(s => s.videoUrl).filter(Boolean);
    if (urls.length > 0) {
      // If the parent expects a single string, we'll join or just send the first
      // But the interface in page.tsx might expect onSelectVideo(url: string)
      // I will adapt it to pass a single string for backward compatibility or let the parent handle it
      onSelectMedia(urls as any);
    }
    onClose();
  };

  if (!isOpen) return null;

  const currentScene = scenes[activeSlideIdx] || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-950 rounded-3xl w-full max-w-6xl h-[92vh] border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-white">
        
        {/* ═══════════════ HEADER ═══════════════ */}
        <div className="p-3.5 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-emerald-500 text-white shadow-lg">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-wide text-white uppercase">AI Media Studio</h2>
              <p className="text-xs text-slate-400">Professional Generation Suite</p>
            </div>
            <Badge variant="outline" className="text-[10px] font-extrabold uppercase border-purple-500/40 text-purple-300 bg-purple-950/40">
              {formatName} • {platform}
            </Badge>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <input type="file" ref={pcFileRef} accept="video/*,image/*" className="hidden" onChange={handlePCUpload} />

        {/* ═══════════════ MAIN BODY ═══════════════ */}
        <div className="flex-1 flex overflow-hidden">

          {/* ──────── LEFT: PROMPT + SETTINGS ──────── */}
          <div className="w-full md:w-[45%] flex flex-col border-r border-slate-800 bg-slate-950 overflow-y-auto">

            <div className="p-5 border-b border-slate-800 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 mb-1.5 block uppercase tracking-wider">AI Prompt</label>
                <Textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe your vision..."
                  className="bg-slate-900 border-slate-700 text-white focus:border-purple-500 min-h-[80px] resize-none"
                  disabled={isGenerating}
                />
              </div>

              {/* Advanced Settings Toggle */}
              <div>
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-purple-400 transition-colors"
                >
                  <Settings className="h-3.5 w-3.5" /> 
                  Advanced Configuration
                  <ChevronRight className={`h-3 w-3 transition-transform ${showSettings ? "rotate-90" : ""}`} />
                </button>
                
                {showSettings && (
                  <div className="mt-3 p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 mb-1 block uppercase">Aspect Ratio</label>
                        <select 
                          value={aspectRatio}
                          onChange={e => setAspectRatio(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="9:16">Vertical (9:16)</option>
                          <option value="1:1">Square (1:1)</option>
                          <option value="16:9">Landscape (16:9)</option>
                          <option value="4:5">Portrait (4:5)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 mb-1 block uppercase">Art Style</label>
                        <select 
                          value={artStyle}
                          onChange={e => setArtStyle(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="Cinematic">Cinematic</option>
                          <option value="Photorealistic">Photorealistic</option>
                          <option value="Digital Art">Digital Art</option>
                          <option value="Anime">Anime</option>
                          <option value="Minimalist">Minimalist</option>
                        </select>
                      </div>
                      {isVideo && (
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 mb-1 block uppercase">Camera Motion</label>
                          <select 
                            value={cameraMotion}
                            onChange={e => setCameraMotion(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                          >
                            <option value="Slow Pan">Slow Pan</option>
                            <option value="Zoom In">Zoom In</option>
                            <option value="Static">Static</option>
                            <option value="FPV Drone">FPV Drone</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Button
                disabled={isGenerating || !prompt.trim()}
                onClick={handleGenerate}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white font-extrabold text-sm h-11 px-5 gap-2"
              >
                {isGenerating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                ) : (
                  <><Wand2 className="h-4 w-4" /> Generate {isCarousel ? "Carousel" : isVideo ? "Video" : "Image"}</>
                )}
              </Button>
            </div>

            {/* SCENE LIST (Layers) */}
            <div className="flex-1 p-4 space-y-2 overflow-y-auto">
              {!isGenerating && scenes.length === 0 && (
                 <div className="text-center mt-10">
                   <Layers className="h-10 w-10 text-slate-700 mx-auto mb-2" />
                   <p className="text-xs text-slate-500 font-semibold">Enter a prompt to create AI media.</p>
                 </div>
              )}
              
              {scenes.map((scene, idx) => (
                <div
                  key={scene.id}
                  onClick={() => goToSlide(idx)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeSlideIdx === idx
                      ? "bg-purple-950/30 border-purple-500 ring-1 ring-purple-500/40"
                      : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center">{idx + 1}</span>
                      <span className="text-xs font-bold text-white">{isCarousel ? `Slide ${idx + 1}` : isVideo ? `Scene ${idx + 1}` : 'Media'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setTargetSceneId(scene.id); setIsStockModalOpen(true); }}
                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-pink-900/30 text-[10px] font-bold text-pink-300 border border-slate-700 flex items-center gap-1"
                      >
                        <ImageIcon className="h-3 w-3" /> Stock
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setTargetSceneId(scene.id); pcFileRef.current?.click(); }}
                        className="px-2 py-1 rounded-md bg-slate-800 hover:bg-emerald-900/30 text-[10px] font-bold text-emerald-300 border border-slate-700 flex items-center gap-1"
                      >
                        <Upload className="h-3 w-3" /> Upload
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">{scene.text || "AI Generated Media"}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ──────── RIGHT: PREVIEW (Single, Video, Carousel) ──────── */}
          <div className="hidden md:flex w-[55%] flex-col items-center justify-center bg-slate-900/30 p-6 relative">

            {/* PREVIEW CANVAS */}
            <div className={`relative w-full overflow-hidden flex items-center justify-center group ${aspectRatio === '9:16' ? 'max-w-[280px] aspect-[9/16] rounded-3xl border-4 border-purple-500/40 bg-black shadow-2xl' : aspectRatio === '1:1' ? 'max-w-md aspect-square rounded-2xl border-4 border-purple-500/40 bg-black shadow-xl' : 'max-w-lg aspect-video rounded-xl border-4 border-purple-500/40 bg-black shadow-xl'}`}>
              
              {currentScene?.videoUrl ? (
                currentScene.mediaType === "image" ? (
                  <div className="relative w-full h-full">
                    <img src={currentScene.videoUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setScenes(prev => prev.map((s, idx) => idx === activeSlideIdx ? { ...s, videoUrl: "" } : s))}
                      className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors z-30"
                      title="Remove Media"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative w-full h-full">
                    <VideoPreviewPlayer
                      src={currentScene.videoUrl}
                      duration={currentScene.durationSeconds}
                      className="w-full h-full"
                      showAlwaysPlayButton={true}
                    />
                    <button
                      onClick={() => setScenes(prev => prev.map((s, idx) => idx === activeSlideIdx ? { ...s, videoUrl: "" } : s))}
                      className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-white hover:bg-red-600 transition-colors z-30"
                      title="Remove Media"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              ) : hasGenerated ? (
                <div className="text-center p-6 text-slate-400 text-xs">
                  <Film className="h-8 w-8 mx-auto mb-2 opacity-50 text-purple-400" />
                  <p className="font-bold text-white mb-2">No Media for Scene {activeSlideIdx + 1}</p>
                  <div className="flex gap-2 justify-center mt-3">
                    <button
                      onClick={() => { setTargetSceneId(currentScene?.id || 1); setIsStockModalOpen(true); }}
                      className="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-md"
                    >
                      + Add Stock
                    </button>
                    <button
                      onClick={() => { setTargetSceneId(currentScene?.id || 1); pcFileRef.current?.click(); }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md"
                    >
                      + Upload
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 text-slate-600">
                  <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-xs font-semibold">Preview Canvas</p>
                </div>
              )}

              {/* CAROUSEL ARROWS */}
              {isCarousel && hasGenerated && scenes.length > 1 && (
                <>
                  <button 
                    onClick={() => goToSlide(activeSlideIdx === 0 ? scenes.length - 1 : activeSlideIdx - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 opacity-70 hover:opacity-100 z-20"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => goToSlide((activeSlideIdx + 1) % scenes.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 opacity-70 hover:opacity-100 z-20"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {/* CAROUSEL DOTS */}
            {isCarousel && hasGenerated && scenes.length > 1 && (
               <div className="mt-6 flex items-center justify-center gap-2">
                 {scenes.map((_, idx) => (
                   <div 
                     key={idx}
                     onClick={() => goToSlide(idx)}
                     className={`h-2 rounded-full cursor-pointer transition-all ${activeSlideIdx === idx ? "w-6 bg-purple-500" : "w-2 bg-slate-700 hover:bg-slate-500"}`}
                   />
                 ))}
               </div>
            )}
            
            {/* VIDEO TIMELINE */}
            {isVideo && hasGenerated && scenes.length > 0 && (
               <div className="mt-6 w-full max-w-sm flex gap-1">
                 {scenes.map((s, idx) => (
                   <div
                     key={s.id}
                     onClick={() => goToSlide(idx)}
                     className={`h-1.5 rounded-full cursor-pointer transition-all flex-1 ${
                       activeSlideIdx === idx ? "bg-purple-500" : idx < activeSlideIdx ? "bg-purple-800" : "bg-slate-800"
                     }`}
                   />
                 ))}
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
                size="sm"
                onClick={handleAddToPost}
                className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-90 text-white font-extrabold px-8 py-2.5 rounded-xl shadow-lg text-xs"
              >
                Confirm Media
              </Button>
            </div>
          )}
        </div>

      </div>

      <StockMediaModal
        isOpen={isStockModalOpen}
        allowedType={isVideo ? "video" : "image"}
        onClose={() => setIsStockModalOpen(false)}
        onSelect={handleSelectStock}
      />
    </div>
  );
}
