import React from "react";
import { Check, MoreHorizontal, MessageCircle, Repeat2, Heart, Bookmark, Share2 } from "lucide-react";

interface XPreviewProps {
  displayImageUrl: string | null;
  userName: string;
  userImage: string | null;
  userHandle: string;
  currentCaption: string;
}

export default function XPreview({
  displayImageUrl,
  userName,
  userImage,
  userHandle,
  currentCaption
}: XPreviewProps) {
  return (
    <div className="w-full max-w-[420px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4">
      <div className="flex gap-3">
        <div className="h-10 w-10 rounded-full bg-slate-800 text-white font-bold text-sm shrink-0 overflow-hidden flex items-center justify-center">
          {userImage ? (
            <img src={userImage} alt={userName} className="h-full w-full object-cover" />
          ) : (
            (userName || "X").substring(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight">{userName}</span>
              <Check className="h-3.5 w-3.5 text-blue-400 bg-white dark:bg-black rounded-full" />
              <span className="text-[13px] text-slate-500">@{userHandle.replace(/^@/, '')} · 2h</span>
            </div>
            <MoreHorizontal className="h-4 w-4 text-slate-500 cursor-pointer" />
          </div>
          <p className="text-[13.5px] text-slate-900 dark:text-white mt-1 mb-2 leading-relaxed whitespace-pre-wrap">{currentCaption}</p>
          {displayImageUrl && (
            <div className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 mt-2 max-h-[280px] aspect-video bg-slate-900 flex items-center justify-center">
              <img src={displayImageUrl} alt="Tweet" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex items-center justify-between mt-3 max-w-md text-slate-500">
            <button className="flex items-center gap-2 text-[13px] hover:text-blue-500"><MessageCircle className="h-4 w-4" /> 12</button>
            <button className="flex items-center gap-2 text-[13px] hover:text-emerald-500"><Repeat2 className="h-4 w-4" /> 45</button>
            <button className="flex items-center gap-2 text-[13px] hover:text-pink-500"><Heart className="h-4 w-4" /> 392</button>
            <button className="flex items-center gap-2 text-[13px] hover:text-blue-500"><Bookmark className="h-4 w-4" /></button>
            <button className="flex items-center gap-2 text-[13px] hover:text-blue-500"><Share2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
