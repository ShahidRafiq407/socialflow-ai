import React, { useState } from "react";
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
  const [expanded, setExpanded] = useState(false);
  const isLong = (currentCaption || "").length > 120;

  return (
    <div className="w-full max-w-[400px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#242526] shadow-md overflow-hidden text-left">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 overflow-hidden shrink-0 flex items-center justify-center text-white font-bold text-sm">
            {userImage ? (
              <img src={userImage} alt={userName} className="h-full w-full object-cover" />
            ) : (
              userName.substring(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-900 dark:text-[#e4e6eb] leading-tight flex items-center gap-1">
              {userName} <Check className="h-3 w-3 bg-blue-500 text-white rounded-full p-[1px]" />
            </p>
            <p className="text-[11px] text-slate-500 dark:text-[#b0b3b8] flex items-center gap-1 mt-0.5">
              2h • <Globe className="h-3 w-3" />
            </p>
          </div>
        </div>
        <div className="flex gap-2 text-slate-500">
          <MoreHorizontal className="h-5 w-5 cursor-pointer hover:text-slate-700" />
          <X className="h-5 w-5 cursor-pointer hover:text-slate-700" />
        </div>
      </div>

      <div className="px-3 pb-2 text-[13px] text-slate-900 dark:text-[#e4e6eb] leading-relaxed">
        {expanded || !isLong ? (
          <span className="whitespace-pre-wrap">{currentCaption}</span>
        ) : (
          <span>
            {currentCaption.substring(0, 110)}...{" "}
            <button
              onClick={() => setExpanded(true)}
              className="text-slate-500 dark:text-[#b0b3b8] font-semibold hover:underline"
            >
              See more
            </button>
          </span>
        )}
      </div>

      {displayImageUrl && (
        <div className={`w-full bg-slate-900 flex items-center justify-center overflow-hidden ${isVertical ? 'aspect-[4/5]' : 'aspect-square'}`}>
          <img src={displayImageUrl} alt="FB Post" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-3 py-2 border-b border-slate-100 dark:border-[#3e4042]">
        <div className="flex items-center justify-between text-[12px] text-slate-500 dark:text-[#b0b3b8]">
          <div className="flex items-center gap-1">
            <div className="bg-blue-500 rounded-full p-1">
              <ThumbsUp className="h-2.5 w-2.5 text-white fill-white" />
            </div>
            <span className="font-medium">1.2K</span>
          </div>
          <div className="flex gap-2 font-medium">
            <span>120 comments</span>
            <span>15 shares</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 py-0.5">
        {['Like', 'Comment', 'Share'].map(btn => (
          <button key={btn} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[12px] font-semibold text-slate-600 dark:text-[#b0b3b8] hover:bg-slate-100 dark:hover:bg-[#3a3b3c] rounded-md transition-colors">
            {btn === 'Like' ? <ThumbsUp className="h-4 w-4" /> : btn === 'Comment' ? <MessageCircle className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {btn}
          </button>
        ))}
      </div>
    </div>
  );
}
