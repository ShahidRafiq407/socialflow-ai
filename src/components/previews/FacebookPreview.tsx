import React, { useState } from "react";
import { Check, Globe, MoreHorizontal, X, ThumbsUp, MessageCircle, Share2, Camera } from "lucide-react";

interface FacebookPreviewProps {
  currentFormatName?: string;
  displayImageUrl: string | null;
  userName: string;
  userImage: string | null;
  currentCaption: string;
  isVertical?: boolean;
  displayMediaIsVideo?: boolean;
  isLoading?: boolean;
  isConnected?: boolean;
}

export default function FacebookPreview({
  currentFormatName = "Feed",
  displayImageUrl,
  userName,
  userImage,
  currentCaption,
  isVertical = false,
  displayMediaIsVideo = false,
  isLoading = false,
  isConnected = false,
}: FacebookPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (currentCaption || "").length > 120;

  const pageTitle = isConnected ? userName : "Facebook Page";

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

  const isReelFormat = currentFormatName === "Reel" || currentFormatName === "Reels" || (isVertical && currentFormatName !== "Story");
  const isStoryFormat = currentFormatName === "Story";

  if (isReelFormat || isStoryFormat) {
    return (
      <div className="relative border-[8px] border-slate-900 dark:border-slate-800 rounded-[38px] bg-slate-950 text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/18]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-28 bg-slate-900 rounded-b-xl z-30" />
        
        {isStoryFormat ? (
          /* STORY TOP BAR */
          <div className="absolute top-3 left-3 right-3 z-30 space-y-2">
            <div className="w-full bg-white/30 h-1 rounded-full overflow-hidden">
              <div className="bg-white h-full w-2/3" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-[#1877F2] p-[1.5px] shrink-0 overflow-hidden">
                  {userImage ? (
                    <img src={userImage} alt={pageTitle} className="h-full w-full object-cover rounded-full" />
                  ) : (
                    <Globe className="h-4 w-4 text-white m-auto" />
                  )}
                </div>
                <span className="text-xs font-bold text-white drop-shadow-md truncate max-w-[120px]">{pageTitle}</span>
                <span className="text-[10px] text-white/80">3h</span>
              </div>
              <MoreHorizontal className="h-4 w-4 text-white drop-shadow-md cursor-pointer" />
            </div>
          </div>
        ) : (
          /* REELS TOP BAR */
          <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between z-20">
            <span className="text-white font-bold text-sm drop-shadow-md">Reels</span>
            <Camera className="h-5 w-5 text-white drop-shadow-md" />
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          {(displayImageUrl && (displayMediaIsVideo || isVideoUrl(displayImageUrl))) ? (
            <video src={displayImageUrl} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover" />
          ) : isStoryFormat && displayImageUrl ? (
            <img src={displayImageUrl} alt="Story" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-500 text-xs gap-1 p-4 text-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                {isStoryFormat ? "Story Preview" : "Reel Video Preview"}
              </span>
              <span className="text-[11px] text-slate-500">
                {isStoryFormat ? "No media added yet" : "No video generated yet"}
              </span>
            </div>
          )}
        </div>

        {!isStoryFormat && (
          /* REELS RIGHT ACTION BAR */
          <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5 z-20">
            <div className="flex flex-col items-center gap-1"><ThumbsUp className="h-6 w-6 text-white fill-white drop-shadow-md" /><span className="text-[10px] font-semibold text-white drop-shadow-md">1.2K</span></div>
            <div className="flex flex-col items-center gap-1"><MessageCircle className="h-6 w-6 text-white fill-white drop-shadow-md" /><span className="text-[10px] font-semibold text-white drop-shadow-md">120</span></div>
            <div className="flex flex-col items-center gap-1"><Share2 className="h-6 w-6 text-white fill-white drop-shadow-md" /><span className="text-[10px] font-semibold text-white drop-shadow-md">Share</span></div>
            <MoreHorizontal className="h-5 w-5 text-white drop-shadow-md" />
          </div>
        )}

        {/* BOTTOM CAPTION BAR */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-12 z-20">
          {isLoading ? (
            <div className="flex items-center gap-2 mb-2 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-slate-700 shrink-0" />
              <div className="h-3.5 w-24 bg-slate-700 rounded" />
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-[#1877F2] overflow-hidden shrink-0 flex items-center justify-center text-white font-bold text-sm">
                {userImage ? (
                  <img src={userImage} alt={pageTitle} className="h-full w-full object-cover" />
                ) : (
                  <Globe className="h-4 w-4 text-white" />
                )}
              </div>
              <p className="text-[13px] font-bold text-white truncate max-w-[110px]">{pageTitle}</p>
              <button className="text-white border border-white text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 backdrop-blur-sm bg-white/10">Follow</button>
            </div>
          )}
          <p className="text-[12px] leading-snug line-clamp-2 text-white">{currentCaption}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[400px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#242526] shadow-md overflow-hidden text-left">
      <div className="flex items-center justify-between p-3">
        {isLoading ? (
          <div className="flex items-center gap-2.5 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
            <div className="space-y-1">
              <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-2.5 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-full bg-[#1877F2] overflow-hidden shrink-0 flex items-center justify-center text-white font-bold text-sm">
              {userImage ? (
                <img src={userImage} alt={pageTitle} className="h-full w-full object-cover" />
              ) : (
                <Globe className="h-5 w-5 text-white" />
              )}
            </div>
            <div>
              <p className="text-[13px] font-bold text-slate-900 dark:text-[#e4e6eb] leading-tight flex items-center gap-1">
                <span className="truncate max-w-[170px]">{pageTitle}</span> <Check className="h-3 w-3 bg-blue-500 text-white rounded-full p-[1px] shrink-0" />
              </p>
              <p className="text-[11px] text-slate-500 dark:text-[#b0b3b8] flex items-center gap-1 mt-0.5">
                2h • <Globe className="h-3 w-3" />
              </p>
            </div>
          </div>
        )}
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
        <div className="w-full max-h-[300px] bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden">
          {(displayImageUrl && (displayMediaIsVideo || isVideoUrl(displayImageUrl))) ? (
            <video src={displayImageUrl} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover" />
          ) : (
            <img src={displayImageUrl} alt="FB Post" className="w-full h-full object-cover" />
          )}
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
