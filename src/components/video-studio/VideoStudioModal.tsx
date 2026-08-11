"use client";

import React, { useState } from "react";
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
  Volume2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

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
  // Main Studio Mode Tabs
  const [activeTab, setActiveTab] = useState<"template" | "heygen" | "veo3" | "runway">("template");

  // --- TAB 1: CANVA STUDIO STATE ---
  const [canvaSidebarTab, setCanvaSidebarTab] = useState<"templates" | "uploads" | "text" | "effects">("templates");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("product");
  const [headlineText, setHeadlineText] = useState<string>(defaultTopic || "Exciting New Product Launch");
  const [subheadlineText, setSubheadlineText] = useState<string>("Automate your social growth with AI");
  const [motionFx, setMotionFx] = useState<string>("zoom");
  const [voiceFilter, setVoiceFilter] = useState<string>("studio");
  const [trimDuration, setTrimDuration] = useState<number>(15);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);

  // --- TAB 2: HEYGEN AVATAR STATE ---
  const [heygenAvatar, setHeygenAvatar] = useState<string>("sarah");
  const [heygenVoice, setHeygenVoice] = useState<string>("en-US-female");
  const [heygenBg, setHeygenBg] = useState<string>("office");
  const [heygenScript, setHeygenScript] = useState<string>(
    defaultTopic ? `Hello! Welcome to our official update on ${defaultTopic}. Let me walk you through the key features.` : "Welcome! Today we are introducing our breakthrough AI solution engineered for growth."
  );

  // --- TAB 3 & 4: VEO 3 / SORA & RUNWAY STATE ---
  const [aiPrompt, setAiPrompt] = useState<string>(
    defaultTopic ? `Cinematic vertical reel showcasing ${defaultTopic} with futuristic lighting and dynamic camera movement.` : "Cinematic vertical reel of a sleek futuristic tech workspace with smooth camera flyover..."
  );
  const [cameraMotion, setCameraMotion] = useState<string>("pan");
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  if (!isOpen) return null;

  // Mock Video Presets for Live Editing
  const TEMPLATE_PRESETS = [
    { id: "product", name: "Product Showcase", bgUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80", color: "from-purple-900 to-indigo-950" },
    { id: "saas", name: "SaaS Feature Spotlight", bgUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80", color: "from-blue-900 to-slate-950" },
    { id: "tech", name: "Tech Announcement", bgUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80", color: "from-emerald-950 to-teal-900" },
    { id: "minimal", name: "Minimal Quote Reel", bgUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80", color: "from-slate-900 to-black" }
  ];

  const HEYGEN_AVATARS = [
    { id: "sarah", name: "Sarah (Tech Lead)", img: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&auto=format&fit=crop&q=80" },
    { id: "alex", name: "Alex (B2B Executive)", img: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&auto=format&fit=crop&q=80" },
    { id: "elena", name: "Elena (Creative Host)", img: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=80" },
    { id: "david", name: "David (Corporate Lead)", img: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80" }
  ];

  const activePreset = TEMPLATE_PRESETS.find(p => p.id === selectedTemplate) || TEMPLATE_PRESETS[0];

  const handleApplyAndClose = () => {
    // Generate high-resolution video preview URL
    let finalVideoUrl = uploadedVideoUrl || activePreset.bgUrl;
    if (activeTab === "heygen") {
      const selectedAvatarObj = HEYGEN_AVATARS.find(a => a.id === heygenAvatar);
      finalVideoUrl = selectedAvatarObj?.img || finalVideoUrl;
    }
    onSelectVideo(finalVideoUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-950 rounded-3xl w-full max-w-6xl h-[92vh] border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-white">
        
        {/* ============================================================================ */}
        {/* HEADER BAR: STUDIO TITLE & 4 MAIN ENGINE TABS */}
        {/* ============================================================================ */}
        <div className="p-3.5 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-wide text-white uppercase">AI Video Creator Studio</h2>
                <Badge variant="outline" className="text-[10px] font-extrabold uppercase border-purple-500/40 text-purple-300 bg-purple-950/40">
                  {formatName} ({platform.toUpperCase()})
                </Badge>
              </div>
              <p className="text-xs text-slate-400">Canva-style editing, HeyGen avatars, Veo 3 & Sora AI motion engines</p>
            </div>
          </div>

          {/* 4 ENGINE TABS */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab("template")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                activeTab === "template"
                  ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md"
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
                  ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Google Veo 3 / Sora</span>
            </button>

            <button
              onClick={() => setActiveTab("runway")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                activeTab === "runway"
                  ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              <VideoIcon className="h-3.5 w-3.5" />
              <span>Runway Gen-3</span>
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

        {/* ============================================================================ */}
        {/* MAIN BODY AREA */}
        {/* ============================================================================ */}
        <div className="flex-1 flex overflow-hidden">

          {/* -------------------------------------------------------------------------- */}
          {/* TAB 1: CANVA-STYLE VIDEO EDITOR STUDIO */}
          {/* -------------------------------------------------------------------------- */}
          {activeTab === "template" && (
            <div className="w-full h-full flex flex-col md:flex-row overflow-hidden">
              
              {/* SIDEBAR NAVIGATION (CANVA ICON BAR) */}
              <div className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-4 gap-5 shrink-0">
                <button
                  onClick={() => setCanvaSidebarTab("templates")}
                  className={`flex flex-col items-center gap-1 text-[10px] font-bold p-2.5 rounded-xl w-12 transition-all ${
                    canvaSidebarTab === "templates" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <Tv className="h-5 w-5" />
                  <span>Presets</span>
                </button>

                <button
                  onClick={() => setCanvaSidebarTab("uploads")}
                  className={`flex flex-col items-center gap-1 text-[10px] font-bold p-2.5 rounded-xl w-12 transition-all ${
                    canvaSidebarTab === "uploads" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <Upload className="h-5 w-5" />
                  <span>Uploads</span>
                </button>

                <button
                  onClick={() => setCanvaSidebarTab("text")}
                  className={`flex flex-col items-center gap-1 text-[10px] font-bold p-2.5 rounded-xl w-12 transition-all ${
                    canvaSidebarTab === "text" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <Type className="h-5 w-5" />
                  <span>Text</span>
                </button>

                <button
                  onClick={() => setCanvaSidebarTab("effects")}
                  className={`flex flex-col items-center gap-1 text-[10px] font-bold p-2.5 rounded-xl w-12 transition-all ${
                    canvaSidebarTab === "effects" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  <Sliders className="h-5 w-5" />
                  <span>Audio/FX</span>
                </button>
              </div>

              {/* CANVA TOOL PANEL */}
              <div className="w-72 bg-slate-900/60 border-r border-slate-800 p-4 space-y-4 overflow-y-auto shrink-0">
                {canvaSidebarTab === "templates" && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase text-purple-400 tracking-wider">Motion Presets</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {TEMPLATE_PRESETS.map(preset => (
                        <div
                          key={preset.id}
                          onClick={() => setSelectedTemplate(preset.id)}
                          className={`aspect-[9/14] rounded-xl overflow-hidden cursor-pointer border-2 relative transition-all group ${
                            selectedTemplate === preset.id ? "border-purple-500 ring-2 ring-purple-500/50 shadow-lg" : "border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          <img src={preset.bgUrl} alt={preset.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2 flex flex-col justify-end">
                            <span className="text-[10px] font-extrabold text-white leading-tight">{preset.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {canvaSidebarTab === "uploads" && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase text-emerald-400 tracking-wider">Upload Video / Audio</h3>
                    <label className="border-2 border-dashed border-slate-700 rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-emerald-500 transition-colors bg-slate-950/40">
                      <Upload className="h-8 w-8 text-emerald-400" />
                      <span className="text-xs font-bold text-slate-300">Browse Video from PC</span>
                      <span className="text-[10px] text-slate-500">MP4, MOV, WEBM (Max 100MB)</span>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setUploadedVideoUrl(URL.createObjectURL(file));
                        }}
                      />
                    </label>
                    {uploadedVideoUrl && (
                      <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-300 truncate">Custom Video Uploaded</span>
                        <Check className="h-4 w-4 text-emerald-400" />
                      </div>
                    )}
                  </div>
                )}

                {canvaSidebarTab === "text" && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider">Text & Titles</h3>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Headline Text</label>
                      <Input
                        value={headlineText}
                        onChange={e => setHeadlineText(e.target.value)}
                        placeholder="Headline overlay..."
                        className="text-xs bg-slate-950 border-slate-800 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Sub-Headline Text</label>
                      <Input
                        value={subheadlineText}
                        onChange={e => setSubheadlineText(e.target.value)}
                        placeholder="Sub-headline..."
                        className="text-xs bg-slate-950 border-slate-800 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Motion Animation Effect</label>
                      <select
                        value={motionFx}
                        onChange={e => setMotionFx(e.target.value)}
                        className="w-full h-8 text-xs rounded-lg border border-slate-800 bg-slate-950 px-2 font-semibold text-white"
                      >
                        <option value="zoom">Smooth Zoom & Slide</option>
                        <option value="bounce">Pop & Bounce Text</option>
                        <option value="lift">Fade & Lift Motion</option>
                      </select>
                    </div>
                  </div>
                )}

                {canvaSidebarTab === "effects" && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase text-amber-400 tracking-wider">Audio & Voice Filters</h3>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Voice Enhancement Filter</label>
                      <select
                        value={voiceFilter}
                        onChange={e => setVoiceFilter(e.target.value)}
                        className="w-full h-8 text-xs rounded-lg border border-slate-800 bg-slate-950 px-2 font-semibold text-white"
                      >
                        <option value="studio">Studio Crystal Clear</option>
                        <option value="bass">Deep Bass Boost</option>
                        <option value="podcast">Warm Podcast Tone</option>
                      </select>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] font-bold text-slate-400 mb-1">
                        <span>Trim Video Duration</span>
                        <span>{trimDuration}s</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="60"
                        value={trimDuration}
                        onChange={e => setTrimDuration(Number(e.target.value))}
                        className="w-full accent-purple-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* CANVA CENTER CANVAS & TIMELINE */}
              <div className="flex-1 bg-slate-950 p-6 flex flex-col justify-between items-center overflow-y-auto">
                {/* VIDEO CANVAS PREVIEW */}
                <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-3xl overflow-hidden border-4 border-slate-800 shadow-2xl bg-black flex items-center justify-center group">
                  {uploadedVideoUrl ? (
                    <video src={uploadedVideoUrl} className="w-full h-full object-cover" controls={false} autoPlay loop muted />
                  ) : (
                    <img src={activePreset.bgUrl} alt="Preview" className="w-full h-full object-cover" />
                  )}

                  {/* OVERLAY TEXT */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30 p-5 flex flex-col justify-between z-10">
                    <div className="flex justify-end">
                      <Badge className="bg-purple-600 text-white text-[10px] font-extrabold uppercase">Canva Reel</Badge>
                    </div>
                    <div className="space-y-1.5 mb-6">
                      <h2 className="text-white text-xl font-black leading-tight drop-shadow-lg animate-pulse">{headlineText}</h2>
                      <p className="text-purple-200 text-xs font-semibold drop-shadow-md">{subheadlineText}</p>
                    </div>
                  </div>

                  {/* PLAY OVERLAY BUTTON */}
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="absolute inset-0 m-auto h-12 w-12 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:scale-110"
                  >
                    {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                  </button>
                </div>

                {/* BOTTOM VIDEO TIMELINE TRACK */}
                <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2 mt-4">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                    <span className="flex items-center gap-1.5 text-purple-400"><Film className="h-3.5 w-3.5" /> Timeline Track</span>
                    <span>0:00 / 0:{trimDuration < 10 ? `0${trimDuration}` : trimDuration}</span>
                  </div>
                  <div className="h-8 bg-slate-950 rounded-xl border border-slate-800 flex items-center px-2 relative overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg w-3/4 opacity-80 flex items-center px-3 text-[11px] font-extrabold text-white">
                      Video Track - {headlineText}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------------------- */}
          {/* TAB 2: HEYGEN AI DIGITAL AVATAR PRESENTING STUDIO */}
          {/* -------------------------------------------------------------------------- */}
          {activeTab === "heygen" && (
            <div className="w-full h-full flex flex-col md:flex-row overflow-hidden p-6 gap-6">
              {/* LEFT AVATAR CONTROLS */}
              <div className="w-full md:w-1/2 space-y-4 overflow-y-auto pr-2">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                  <h3 className="text-xs font-black uppercase text-pink-400 tracking-wider flex items-center gap-2">
                    <Mic className="h-4 w-4" /> Select Digital Twin Avatar
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
                    {HEYGEN_AVATARS.map(avatar => (
                      <div
                        key={avatar.id}
                        onClick={() => setHeygenAvatar(avatar.id)}
                        className={`p-2 rounded-xl border-2 cursor-pointer flex items-center gap-2.5 transition-all ${
                          heygenAvatar === avatar.id ? "border-pink-500 bg-pink-950/20" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                        }`}
                      >
                        <img src={avatar.img} alt={avatar.name} className="h-10 w-10 rounded-full object-cover border border-pink-500/40 shrink-0" />
                        <span className="text-xs font-bold text-slate-200">{avatar.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">AI Voice & Dialect</label>
                      <select
                        value={heygenVoice}
                        onChange={e => setHeygenVoice(e.target.value)}
                        className="w-full h-9 text-xs rounded-xl border border-slate-800 bg-slate-950 px-2 font-semibold text-white"
                      >
                        <option value="en-US-female">US English - Professional Female</option>
                        <option value="en-US-male">US English - Energetic Male</option>
                        <option value="en-UK-executive">UK English - Executive Formal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Studio Environment</label>
                      <select
                        value={heygenBg}
                        onChange={e => setHeygenBg(e.target.value)}
                        className="w-full h-9 text-xs rounded-xl border border-slate-800 bg-slate-950 px-2 font-semibold text-white"
                      >
                        <option value="office">Modern Office Studio</option>
                        <option value="cyberpunk">Cyberpunk Neon Workspace</option>
                        <option value="gradient">Minimal Studio Gradient</option>
                        <option value="greenscreen">Green Screen Transparent</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Spoken Script Text</label>
                    <Textarea
                      rows={4}
                      value={heygenScript}
                      onChange={e => setHeygenScript(e.target.value)}
                      placeholder="Type text script for HeyGen avatar to speak..."
                      className="text-xs p-3 rounded-xl border border-slate-800 bg-slate-950 text-white"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Est. Duration: {Math.max(5, Math.round((heygenScript || "").split(" ").length / 2.5))} seconds
                    </p>
                  </div>
                </div>
              </div>

              {/* RIGHT AVATAR CANVAS PREVIEW */}
              <div className="w-full md:w-1/2 bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="relative w-full max-w-[280px] aspect-[9/16] rounded-3xl overflow-hidden border-4 border-pink-500/50 shadow-2xl bg-slate-950">
                  <img
                    src={HEYGEN_AVATARS.find(a => a.id === heygenAvatar)?.img}
                    alt="HeyGen Avatar"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 p-4 flex flex-col justify-between">
                    <Badge className="bg-pink-600 text-white text-[10px] font-extrabold uppercase w-max">HeyGen AI Avatar</Badge>
                    <div className="bg-black/70 backdrop-blur-md p-3 rounded-xl border border-white/10">
                      <p className="text-white text-xs leading-snug line-clamp-3 font-medium">"{heygenScript}"</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------------------------------------------------- */}
          {/* TAB 3 & 4: VEO 3, SORA & RUNWAY CINEMATIC ENGINE */}
          {/* -------------------------------------------------------------------------- */}
          {(activeTab === "veo3" || activeTab === "runway") && (
            <div className="w-full h-full flex flex-col md:flex-row overflow-hidden p-6 gap-6">
              {/* PROMPT CONTROLS */}
              <div className="w-full md:w-1/2 space-y-4">
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                  <h3 className="text-xs font-black uppercase text-blue-400 tracking-wider flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> {activeTab === "veo3" ? "Google Veo 3 / Sora 4K Prompt Studio" : "Runway Gen-3 Alpha Prompt Studio"}
                  </h3>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Visual Prompt Script</label>
                    <Textarea
                      rows={5}
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder="Describe high-tech cinematic video scene..."
                      className="text-xs p-3 rounded-xl border border-slate-800 bg-slate-950 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Camera Motion</label>
                      <select
                        value={cameraMotion}
                        onChange={e => setCameraMotion(e.target.value)}
                        className="w-full h-9 text-xs rounded-xl border border-slate-800 bg-slate-950 px-2 font-semibold text-white"
                      >
                        <option value="pan">Pan Left to Right</option>
                        <option value="zoom">Dynamic Cinematic Zoom In</option>
                        <option value="orbit">Orbit 360 Degree View</option>
                        <option value="drone">Drone Flyover Shot</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">Aspect Ratio</label>
                      <select
                        value={aspectRatio}
                        onChange={e => setAspectRatio(e.target.value)}
                        className="w-full h-9 text-xs rounded-xl border border-slate-800 bg-slate-950 px-2 font-semibold text-white"
                      >
                        <option value="9:16">9:16 Vertical Reel</option>
                        <option value="16:9">16:9 Landscape</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* CINEMATIC PREVIEW */}
              <div className="w-full md:w-1/2 bg-slate-900 border border-slate-800 rounded-3xl p-6 flex items-center justify-center">
                <div className="w-full max-w-[280px] aspect-[9/16] rounded-3xl overflow-hidden border-4 border-blue-500/50 shadow-2xl bg-black relative flex items-center justify-center">
                  <img
                    src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80"
                    alt="Veo3 Motion"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-4 flex flex-col justify-end">
                    <Badge className="bg-blue-600 text-white text-[10px] font-extrabold uppercase w-max mb-2">
                      {activeTab === "veo3" ? "Veo 3 4K Motion" : "Runway Gen-3"}
                    </Badge>
                    <p className="text-white text-xs font-bold leading-tight drop-shadow-md">{aiPrompt}</p>
                  </div>
                </div>
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
            <span>Add Video to Post & Close Studio</span>
          </Button>
        </div>

      </div>
    </div>
  );
}
