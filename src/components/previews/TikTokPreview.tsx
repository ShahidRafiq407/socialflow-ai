import React from "react";
import { Heart, MessageCircle, Bookmark, Share2, Music } from "lucide-react";

interface TikTokPreviewProps {
  displayImageUrl: string | null;
  userName: string;
  userImage: string | null;
  userHandle: string;
  currentCaption: string;
}

export default function TikTokPreview({
  displayImageUrl,
  userName,
  userImage,
  userHandle,
  currentCaption
}: TikTokPreviewProps) {
  return (
    <div className="relative border-[8px] border-slate-900 rounded-[32px] bg-black text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/16]">
      <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
        {displayImageUrl && <img src={displayImageUrl} alt="TikTok" className="w-full h-full object-cover opacity-90" />}
      </div>
      <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 z-20">
        <div className="h-10 w-10 rounded-full border-2 border-white bg-slate-800 font-bold text-xs shrink-0 overflow-hidden flex items-center justify-center text-white">
          {userImage ? (
            <img src={userImage} alt={userName} className="h-full w-full object-cover" />
          ) : (
            (userHandle || userName || "TK").substring(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex flex-col items-center gap-1"><Heart className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">45.2K</span></div>
        <div className="flex flex-col items-center gap-1"><MessageCircle className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">128</span></div>
        <div className="flex flex-col items-center gap-1"><Bookmark className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">1.2K</span></div>
        <div className="flex flex-col items-center gap-1"><Share2 className="h-7 w-7 text-white fill-white" /><span className="text-[11px] font-bold text-white">44</span></div>
      </div>
      <div className="absolute bottom-0 left-0 right-16 p-3 z-20 bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-[14px] font-bold text-white mb-1">@{userHandle}</p>
        <p className="text-[13px] leading-snug line-clamp-3 text-white">{currentCaption}</p>
        <div className="flex items-center gap-1 mt-2 text-[12px] font-semibold text-white">
          <Music className="h-3 w-3" /> <span>Original sound - {userName}</span>
        </div>
      </div>
    </div>
  );
}
