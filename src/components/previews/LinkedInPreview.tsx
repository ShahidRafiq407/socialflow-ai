import React from "react";
import { MoreHorizontal, Globe, ThumbsUp, Heart, MessageCircle, Repeat2, Send } from "lucide-react";

interface LinkedInPreviewProps {
  currentFormatName: string;
  displayImageUrl: string | null;
  userName: string;
  userImage: string | null;
  currentCaption: string;
}

export default function LinkedInPreview({
  currentFormatName,
  displayImageUrl,
  userName,
  userImage,
  currentCaption
}: LinkedInPreviewProps) {
  return (
    <div className="w-full max-w-[400px] rounded-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b1f23] shadow-sm">
      <div className="flex items-start gap-3 p-4 pb-2">
        <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 overflow-hidden">
          {userImage && <img src={userImage} alt={userName} className="h-full w-full object-cover" />}
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight">{userName}</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Automating the Future of B2B SaaS</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">1h • <Globe className="h-3 w-3" /></p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-slate-500" />
      </div>
      <div className="px-4 pb-3">
        <p className="text-[14px] text-slate-900 dark:text-slate-200 leading-relaxed whitespace-pre-wrap line-clamp-5">{currentCaption}</p>
      </div>
      {displayImageUrl && (
        <div className={`w-full bg-slate-100 dark:bg-slate-900 ${currentFormatName === 'Carousel' ? 'aspect-[4/5]' : 'aspect-video'}`}>
          <img src={displayImageUrl} alt="LinkedIn Post" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="px-4 py-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1 text-[11px] text-slate-500"><ThumbsUp className="h-3 w-3 text-blue-500" /> <Heart className="h-3 w-3 text-red-500" /> 432</div>
        <div className="text-[11px] text-slate-500">12 comments • 5 reposts</div>
      </div>
      <div className="flex items-center justify-between px-4 py-1">
        {['Like', 'Comment', 'Repost', 'Send'].map(btn => (
          <button key={btn} className="flex items-center gap-1.5 px-2 py-3 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-[13px] font-semibold text-slate-600 dark:text-slate-400">
            {btn === 'Like' ? <ThumbsUp className="h-4 w-4" /> : btn === 'Comment' ? <MessageCircle className="h-4 w-4" /> : btn === 'Repost' ? <Repeat2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">{btn}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
