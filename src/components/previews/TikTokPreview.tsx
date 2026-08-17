import React from "react";
import { Heart, MessageCircle, Bookmark, Share2, Music, Video } from "lucide-react";

interface TikTokPreviewProps {
  currentFormatName?: string;
  displayImageUrl: string | null;
  displayMediaIsVideo?: boolean;
  displayImageUrls?: string[];
  activeSlideIdx?: number;
  onSlideChange?: (idx: number) => void;
  userName: string;
  userImage: string | null;
  userHandle: string;
  currentCaption: string;
  isLoading?: boolean;
  isConnected?: boolean;
}

export default function TikTokPreview({
  currentFormatName = "Video",
  displayImageUrl,
  displayMediaIsVideo = false,
  displayImageUrls = [],
  activeSlideIdx = 0,
  onSlideChange,
  userName,
  userImage,
  userHandle,
  currentCaption,
  isLoading = false,
  isConnected = false,
}: TikTokPreviewProps) {
  const isVideoUrl = (url: string | null) => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.endsWith('.mp4') ||
      lowerUrl.endsWith('.webm') ||
      lowerUrl.includes('.mp4?') ||
      lowerUrl.includes('pixabay.com/video/') ||
      lowerUrl.startsWith('data:video/')
    );
  };

  const handleText = isConnected ? (userHandle.startsWith("@") ? userHandle : `@${userHandle}`) : "@your_tiktok";
  const nameText = isConnected ? (userName || userHandle.replace(/^@/, '')) : "TikTok Creator";

  // Photo Mode = swipeable image carousel: show the active photo + position dots
  const isPhotoMode = currentFormatName === "Photo";
  const totalPhotos = displayImageUrls.filter(Boolean).length;
  const activePhoto = displayImageUrls[activeSlideIdx] || displayImageUrls.find(Boolean) || displayImageUrl;
  const activeDot = displayImageUrls[activeSlideIdx] ? activeSlideIdx : Math.max(0, displayImageUrls.findIndex(Boolean));

  return (
    <div className="relative border-[8px] border-slate-900 rounded-[32px] bg-black text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/16]">
      <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
        {isPhotoMode ? (
          activePhoto ? (
            <img src={activePhoto} alt={`TikTok Photo ${activeDot + 1}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-black flex flex-col items-center justify-center text-slate-500 text-xs gap-1 p-4 text-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">TikTok Photo Mode</span>
              <span className="text-[11px] text-slate-500">No photos added yet</span>
            </div>
          )
        ) : displayImageUrl && (displayMediaIsVideo || isVideoUrl(displayImageUrl)) ? (
          <video src={displayImageUrl} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover opacity-90" />
        ) : (
          <div className="w-full h-full bg-black flex flex-col items-center justify-center text-slate-500 text-xs gap-1 p-4 text-center">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">TikTok Video Preview</span>
            <span className="text-[11px] text-slate-500">No video generated yet</span>
          </div>
        )}
      </div>
      {isPhotoMode && totalPhotos > 1 && (
        <div className="absolute top-2.5 left-2.5 right-2.5 flex gap-1 z-20">
          {displayImageUrls.filter(Boolean).map((_, i) => (
            <div
              key={`tiktok-dot-${i}`}
              className={`h-1 rounded-full flex-1 transition-all ${i === activeDot ? "bg-white" : i < activeDot ? "bg-white/80" : "bg-white/35"}`}
            />
          ))}
        </div>
      )}
      <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 z-20">
        {isLoading ? (
          <div className="h-10 w-10 rounded-full bg-slate-800 animate-pulse border-2 border-white/50" />
        ) : (
          <div className="h-10 w-10 rounded-full border-2 border-white bg-slate-900 font-bold text-xs shrink-0 overflow-hidden flex items-center justify-center text-white">
            {userImage ? (
              <img src={userImage} alt={nameText} className="h-full w-full object-cover" />
            ) : (
              <Video className="h-5 w-5 text-cyan-400" />
            )}
          </div>
        )}
        <div className="flex flex-col items-center gap-1"><Heart className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">45.2K</span></div>
        <div className="flex flex-col items-center gap-1"><MessageCircle className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">128</span></div>
        <div className="flex flex-col items-center gap-1"><Bookmark className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">1.2K</span></div>
        <div className="flex flex-col items-center gap-1"><Share2 className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">44</span></div>
      </div>
      <div className="absolute bottom-0 left-0 right-16 p-3 z-20 bg-gradient-to-t from-black/80 to-transparent">
        {isLoading ? (
          <div className="space-y-1.5 animate-pulse">
            <div className="h-3.5 w-24 bg-slate-700 rounded" />
            <div className="h-3 w-32 bg-slate-700 rounded" />
          </div>
        ) : (
          <>
            <p className="text-[14px] font-bold text-white mb-1 truncate">{handleText}</p>
            <p className="text-[13px] leading-snug line-clamp-3 text-white">{currentCaption}</p>
            <div className="flex items-center gap-1 mt-2 text-[12px] font-semibold text-white">
              <Music className="h-3 w-3" /> <span className="truncate">Original sound - {nameText}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
