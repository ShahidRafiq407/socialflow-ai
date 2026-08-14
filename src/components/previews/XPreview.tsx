import React from "react";
import { Check, MoreHorizontal, MessageCircle, Repeat2, Heart, Bookmark, Share2 } from "lucide-react";

interface XPreviewProps {
  currentFormatName?: string;
  displayImageUrl: string | null;
  userName: string;
  userImage: string | null;
  userHandle: string;
  currentCaption: string;
  isLoading?: boolean;
  isConnected?: boolean;
}

export default function XPreview({
  currentFormatName = "Post",
  displayImageUrl,
  userName,
  userImage,
  userHandle,
  currentCaption,
  isLoading = false,
  isConnected = false,
}: XPreviewProps) {
  const nameText = isConnected ? userName : "X User";
  const handleText = isConnected ? (userHandle.startsWith("@") ? userHandle : `@${userHandle}`) : "@your_x_handle";

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

  const isThread = currentFormatName === "Thread";

  return (
    <div className="w-full max-w-[420px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4 rounded-xl shadow-xs space-y-3">
      {/* TWEET 1 */}
      <div className="flex gap-3 relative">
        {isThread && (
          <div className="absolute left-[19px] top-10 bottom-0 w-[2px] bg-slate-200 dark:bg-slate-800 z-10" />
        )}
        {isLoading ? (
          <div className="flex gap-3 w-full animate-pulse">
            <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          </div>
        ) : (
          <>
            <div className="h-10 w-10 rounded-full bg-slate-900 dark:bg-slate-800 text-white font-bold text-sm shrink-0 overflow-hidden flex items-center justify-center border border-slate-800 z-20">
              {userImage ? (
                <img src={userImage} alt={nameText} className="h-full w-full object-cover" />
              ) : (
                <span className="font-extrabold text-xs">𝕏</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[140px]">{nameText}</span>
                  <Check className="h-3.5 w-3.5 text-blue-400 bg-black rounded-full" />
                  <span className="text-[13px] text-slate-500 truncate">{handleText} · 2h</span>
                </div>
                <MoreHorizontal className="h-4 w-4 text-slate-500 cursor-pointer shrink-0" />
              </div>
              <p className="text-[13.5px] text-slate-900 dark:text-white mt-1 mb-2 leading-relaxed whitespace-pre-wrap">{currentCaption}</p>
              {displayImageUrl && (
                <div className="w-full max-h-[280px] bg-slate-900 rounded-2xl overflow-hidden mt-3 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                  {isVideoUrl(displayImageUrl) ? (
                    <video src={displayImageUrl} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover" />
                  ) : (
                    <img src={displayImageUrl} alt="Tweet" className="w-full h-full object-cover" />
                  )}
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
          </>
        )}
      </div>

      {/* THREAD SECOND TWEET MOCKUP */}
      {isThread && (
        <div className="flex gap-3 pt-2">
          <div className="h-10 w-10 rounded-full bg-slate-900 dark:bg-slate-800 text-white font-bold text-sm shrink-0 overflow-hidden flex items-center justify-center border border-slate-800 z-20">
            {userImage ? (
              <img src={userImage} alt={nameText} className="h-full w-full object-cover" />
            ) : (
              <span className="font-extrabold text-xs">𝕏</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[140px]">{nameText}</span>
                <Check className="h-3.5 w-3.5 text-blue-400 bg-black rounded-full" />
                <span className="text-[13px] text-slate-500 truncate">{handleText} · 1h</span>
              </div>
            </div>
            <p className="text-[13.5px] text-slate-900 dark:text-white mt-1 leading-relaxed">
              2/2 Here are the key takeaways and implementation insights from our strategy... 🧵
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
