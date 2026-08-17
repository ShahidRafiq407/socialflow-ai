import React from "react";
import { ThumbsUp, MessageCircle, Share2, RotateCcw, Video } from "lucide-react";

interface YoutubePreviewProps {
  currentFormatName?: string;
  displayImageUrl: string | null;
  displayMediaIsVideo?: boolean;
  userName: string;
  userImage: string | null;
  currentCaption: string;
  isLoading?: boolean;
  isConnected?: boolean;
}

export default function YoutubePreview({
  currentFormatName = "Shorts",
  displayImageUrl,
  displayMediaIsVideo = false,
  userName,
  userImage,
  currentCaption,
  isLoading = false,
  isConnected = false,
}: YoutubePreviewProps) {
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

  const channelTitle = isConnected ? userName : "YouTube Channel";
  const isStandardVideo = currentFormatName === "Video";

  if (isStandardVideo) {
    return (
      <div className="w-full max-w-[420px] rounded-xl border border-slate-200 dark:border-slate-800 bg-[#0f0f0f] text-white shadow-md overflow-hidden text-left">
        <div className="w-full aspect-[16/9] bg-slate-900 flex items-center justify-center overflow-hidden relative">
          {displayImageUrl && (displayMediaIsVideo || isVideoUrl(displayImageUrl)) ? (
            <video src={displayImageUrl} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-[#0f0f0f] flex flex-col items-center justify-center text-slate-500 text-xs gap-1 p-4 text-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">YouTube Video Preview (16:9)</span>
              <span className="text-[11px] text-slate-500">No video generated yet</span>
            </div>
          )}
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
            10:24
          </div>
        </div>
        <div className="p-3 space-y-2">
          <p className="text-[14px] font-bold text-white leading-snug line-clamp-2">{currentCaption || "Video Title"}</p>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-red-600 shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-white">
                {userImage ? <img src={userImage} alt={channelTitle} className="h-full w-full object-cover" /> : <Video className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-xs font-bold text-white truncate max-w-[130px]">{channelTitle}</p>
                <p className="text-[10px] text-slate-400">125K subscribers</p>
              </div>
            </div>
            <button className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-full shrink-0">Subscribe</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative border-[8px] border-slate-900 rounded-[32px] bg-[#0f0f0f] text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/16]">
      <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
        {displayImageUrl && (displayMediaIsVideo || isVideoUrl(displayImageUrl)) ? (
          <video src={displayImageUrl} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[#0f0f0f] flex flex-col items-center justify-center text-slate-500 text-xs gap-1 p-4 text-center">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">YouTube Shorts Preview</span>
            <span className="text-[11px] text-slate-500">No video generated yet</span>
          </div>
        )}
      </div>
      <div className="absolute right-2 bottom-16 flex flex-col items-center gap-5 z-20">
        <div className="flex flex-col items-center gap-1"><ThumbsUp className="h-6 w-6 text-white fill-white" /><span className="text-[11px] font-bold text-white">12K</span></div>
        <div className="flex flex-col items-center gap-1"><ThumbsUp className="h-6 w-6 text-white rotate-180" /><span className="text-[11px] font-bold text-white">Dislike</span></div>
        <div className="flex flex-col items-center gap-1"><MessageCircle className="h-6 w-6 text-white fill-white" /><span className="text-[11px] font-bold text-white">45</span></div>
        <div className="flex flex-col items-center gap-1"><Share2 className="h-6 w-6 text-white fill-white" /><span className="text-[11px] font-bold text-white">Share</span></div>
        <div className="flex flex-col items-center gap-1"><RotateCcw className="h-6 w-6 text-white" /><span className="text-[11px] font-bold text-white">Remix</span></div>
      </div>
      <div className="absolute bottom-0 left-0 right-14 p-3 pb-4 z-20 bg-gradient-to-t from-black/90 to-transparent">
        {isLoading ? (
          <div className="flex items-center gap-2 mb-2 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-slate-700 shrink-0" />
            <div className="h-3.5 w-24 bg-slate-700 rounded" />
          </div>
        ) : (
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-red-600 text-white font-bold text-xs shrink-0 overflow-hidden flex items-center justify-center">
              {userImage ? (
                <img src={userImage} alt={channelTitle} className="h-full w-full object-cover" />
              ) : (
                <Video className="h-4 w-4 text-white" />
              )}
            </div>
            <p className="text-[13px] font-bold text-white truncate max-w-[110px]">{channelTitle}</p>
            <button className="bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">Subscribe</button>
          </div>
        )}
        <p className="text-[13px] leading-snug line-clamp-2 text-white">{currentCaption}</p>
      </div>
    </div>
  );
}
