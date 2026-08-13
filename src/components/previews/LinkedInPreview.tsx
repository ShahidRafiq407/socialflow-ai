import React, { useState } from "react";
import { MoreHorizontal, Globe, ThumbsUp, Heart, MessageCircle, Repeat2, Send, Briefcase } from "lucide-react";

interface LinkedInPreviewProps {
  currentFormatName: string;
  displayImageUrl: string | null;
  userName: string;
  userImage: string | null;
  currentCaption: string;
  isLoading?: boolean;
  isConnected?: boolean;
}

export default function LinkedInPreview({
  currentFormatName,
  displayImageUrl,
  userName,
  userImage,
  currentCaption,
  isLoading = false,
  isConnected = false,
}: LinkedInPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (currentCaption || "").length > 130;

  const displayName = isConnected ? userName : "LinkedIn Member / Company";
  const headline = isConnected ? "Thought Leader & Industry Innovator" : "Connect your LinkedIn account";

  return (
    <div className="w-full max-w-[400px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b1f23] shadow-sm overflow-hidden text-left">
      <div className="flex items-start gap-3 p-3.5 pb-2">
        {isLoading ? (
          <div className="flex items-center gap-3 w-full animate-pulse">
            <div className="h-11 w-11 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-2.5 w-44 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          </div>
        ) : (
          <>
            <div className="h-11 w-11 rounded-full bg-[#0A66C2] shrink-0 overflow-hidden flex items-center justify-center text-white font-bold text-sm">
              {userImage ? (
                <img src={userImage} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <Briefcase className="h-5 w-5 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight truncate">{displayName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 truncate">{headline}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">1h • <Globe className="h-3 w-3" /></p>
            </div>
            <MoreHorizontal className="h-5 w-5 text-slate-500 cursor-pointer shrink-0" />
          </>
        )}
      </div>

      <div className="px-3.5 pb-2 text-[13px] text-slate-900 dark:text-slate-200 leading-relaxed">
        {expanded || !isLong ? (
          <span className="whitespace-pre-wrap">{currentCaption}</span>
        ) : (
          <span>
            {currentCaption.substring(0, 120)}...{" "}
            <button
              onClick={() => setExpanded(true)}
              className="text-slate-500 dark:text-slate-400 font-semibold hover:underline"
            >
              ...see more
            </button>
          </span>
        )}
      </div>

      {displayImageUrl && (
        <div className="w-full max-h-[320px] bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden">
          {displayImageUrl && (displayImageUrl.toLowerCase().endsWith('.mp4') || displayImageUrl.toLowerCase().endsWith('.webm') || displayImageUrl.includes('.mp4?') || displayImageUrl.includes('pixabay.com/video/')) ? (
            <video src={displayImageUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
          ) : (
            <img src={displayImageUrl} alt="LinkedIn Post" className="w-full h-full object-cover" />
          )}
        </div>
      )}

      <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
        <div className="flex items-center gap-1">
          <ThumbsUp className="h-3 w-3 text-blue-500 fill-blue-500" />
          <Heart className="h-3 w-3 text-red-500 fill-red-500" />
          <span>432</span>
        </div>
        <div>12 comments • 5 reposts</div>
      </div>

      <div className="flex items-center justify-between px-2 py-1">
        {['Like', 'Comment', 'Repost', 'Send'].map(btn => (
          <button key={btn} className="flex items-center justify-center gap-1 px-2 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-[12px] font-semibold text-slate-600 dark:text-slate-400 transition-colors flex-1">
            {btn === 'Like' ? <ThumbsUp className="h-4 w-4" /> : btn === 'Comment' ? <MessageCircle className="h-4 w-4" /> : btn === 'Repost' ? <Repeat2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">{btn}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
