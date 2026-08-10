import React from "react";
import { Check, Globe, MoreHorizontal, X, ThumbsUp, MessageCircle, Share2 } from "lucide-react";

interface FacebookPreviewProps {
  displayImageUrl: string | null;
  userName: string;
  userImage: string | null;
  currentCaption: string;
  isVertical: boolean;
}

export default function FacebookPreview({
  displayImageUrl,
  userName,
  userImage,
  currentCaption,
  isVertical
}: FacebookPreviewProps) {
  return (
    <div className="w-full max-w-[400px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#242526] shadow-md">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            {userImage && <img src={userImage} alt={userName} className="h-full w-full object-cover" />}
          </div>
          <div>
            <p className="text-[14px] font-bold text-slate-900 dark:text-[#e4e6eb] leading-tight flex items-center gap-1">{userName} <Check className="h-3 w-3 bg-blue-500 text-white rounded-full p-[1px]" /></p>
            <p className="text-[12px] text-slate-500 dark:text-[#b0b3b8] flex items-center gap-1 mt-0.5">2h • <Globe className="h-3 w-3" /></p>
          </div>
        </div>
        <div className="flex gap-2 text-slate-500"><MoreHorizontal className="h-5 w-5" /><X className="h-5 w-5" /></div>
      </div>
      <div className="px-3 pb-2 text-[14px] text-slate-900 dark:text-[#e4e6eb] whitespace-pre-wrap line-clamp-4">{currentCaption}</div>
      {displayImageUrl && (
        <div className={`w-full bg-slate-100 dark:bg-[#18191a] ${isVertical ? 'aspect-[4/5]' : 'aspect-square'}`}>
          <img src={displayImageUrl} alt="FB Post" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-[#3e4042]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1"><div className="bg-blue-500 rounded-full p-1"><ThumbsUp className="h-3 w-3 text-white fill-white" /></div><span className="text-[13px] text-slate-500 dark:text-[#b0b3b8]">1.2K</span></div>
          <div className="text-[13px] text-slate-500 dark:text-[#b0b3b8] flex gap-2"><span>120 comments</span><span>15 shares</span></div>
        </div>
      </div>
      <div className="flex items-center justify-between px-2 py-1">
        {['Like', 'Comment', 'Share'].map(btn => (
          <button key={btn} className="flex-1 flex items-center justify-center gap-2 py-2 text-[14px] font-semibold text-slate-600 dark:text-[#b0b3b8] hover:bg-slate-100 dark:hover:bg-[#3a3b3c] rounded-md">
            {btn === 'Like' ? <ThumbsUp className="h-5 w-5" /> : btn === 'Comment' ? <MessageCircle className="h-5 w-5" /> : <Share2 className="h-5 w-5" />}
            {btn}
          </button>
        ))}
      </div>
    </div>
  );
}
