import React from "react";
import { ThumbsUp, MessageCircle, Share2, RotateCcw } from "lucide-react";

interface YoutubePreviewProps {
  displayImageUrl: string | null;
  userName: string;
  userImage: string | null;
  currentCaption: string;
}

export default function YoutubePreview({
  displayImageUrl,
  userName,
  userImage,
  currentCaption
}: YoutubePreviewProps) {
  const isVideoUrl = (url: string | null) => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.webm') || lowerUrl.includes('.mp4?') || lowerUrl.includes('pixabay.com/video/');
  };

  return (
    <div className="relative border-[8px] border-slate-900 rounded-[32px] bg-[#0f0f0f] text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/16]">
      <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
        {displayImageUrl && isVideoUrl(displayImageUrl) ? (
          <video src={displayImageUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
        ) : displayImageUrl ? (
          <img src={displayImageUrl} alt="Shorts" className="w-full h-full object-cover" />
        ) : null}
      </div>
      <div className="absolute right-2 bottom-16 flex flex-col items-center gap-5 z-20">
        <div className="flex flex-col items-center gap-1"><ThumbsUp className="h-6 w-6 text-white fill-white" /><span className="text-[11px] font-bold text-white">12K</span></div>
        <div className="flex flex-col items-center gap-1"><ThumbsUp className="h-6 w-6 text-white rotate-180" /><span className="text-[11px] font-bold text-white">Dislike</span></div>
        <div className="flex flex-col items-center gap-1"><MessageCircle className="h-6 w-6 text-white fill-white" /><span className="text-[11px] font-bold text-white">45</span></div>
        <div className="flex flex-col items-center gap-1"><Share2 className="h-6 w-6 text-white fill-white" /><span className="text-[11px] font-bold text-white">Share</span></div>
        <div className="flex flex-col items-center gap-1"><RotateCcw className="h-6 w-6 text-white" /><span className="text-[11px] font-bold text-white">Remix</span></div>
      </div>
      <div className="absolute bottom-0 left-0 right-14 p-3 pb-4 z-20 bg-gradient-to-t from-black/90 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-red-600 text-white font-bold text-xs shrink-0 overflow-hidden flex items-center justify-center">
            {userImage ? (
              <img src={userImage} alt={userName} className="h-full w-full object-cover" />
            ) : (
              (userName || "YT").substring(0, 2).toUpperCase()
            )}
          </div>
          <p className="text-[13px] font-bold text-white">{userName}</p>
          <button className="bg-white text-black text-[11px] font-bold px-2.5 py-1 rounded-full">Subscribe</button>
        </div>
        <p className="text-[13px] leading-snug line-clamp-2 text-white">{currentCaption}</p>
      </div>
    </div>
  );
}
