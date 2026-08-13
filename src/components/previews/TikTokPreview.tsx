import React from "react";
import { Heart, MessageCircle, Bookmark, Share2, Music, Video } from "lucide-react";

interface TikTokPreviewProps {
  displayImageUrl: string | null;
  userName: string;
  userImage: string | null;
  userHandle: string;
  currentCaption: string;
  isLoading?: boolean;
  isConnected?: boolean;
}

export default function TikTokPreview({
  displayImageUrl,
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
    return lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.webm') || lowerUrl.includes('.mp4?') || lowerUrl.includes('pixabay.com/video/');
  };

  const handleText = isConnected ? (userHandle.startsWith("@") ? userHandle : `@${userHandle}`) : "@your_tiktok";
  const nameText = isConnected ? (userName || userHandle.replace(/^@/, '')) : "TikTok Creator";

  return (
    <div className="relative border-[8px] border-slate-900 rounded-[32px] bg-black text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/16]">
      <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
        {displayImageUrl && isVideoUrl(displayImageUrl) ? (
          <video src={displayImageUrl} autoPlay loop muted playsInline className="w-full h-full object-cover opacity-90" />
        ) : displayImageUrl ? (
          <img src={displayImageUrl} alt="TikTok" className="w-full h-full object-cover opacity-90" />
        ) : (
          <div className="text-slate-600 text-xs">Preview Video</div>
        )}
      </div>
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
