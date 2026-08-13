import React from "react";
import { Loader2, Sparkles, Share2, MoreHorizontal } from "lucide-react";

interface PinterestPreviewProps {
  currentFormatName: string;
  isHtmlSlideFormat: boolean;
  isCurrentSlideLoading: boolean;
  currentHtmlSlide: string | null;
  displayImageUrl: string | null;
  campaignTopic: string;
  userName: string;
  userImage: string | null;
  isLoading?: boolean;
  isConnected?: boolean;
}

export default function PinterestPreview({
  currentFormatName,
  isHtmlSlideFormat,
  isCurrentSlideLoading,
  currentHtmlSlide,
  displayImageUrl,
  campaignTopic,
  userName,
  userImage,
  isLoading = false,
  isConnected = false,
}: PinterestPreviewProps) {
  const pinTitle = campaignTopic || "Aesthetics & Strategy Inspiration";
  const pinUser = isConnected ? userName : "Pinterest Creator";

  return (
    <div className="w-full max-w-[250px] flex flex-col gap-2.5 mx-auto">
      <div className="relative rounded-[24px] overflow-hidden bg-slate-100 dark:bg-slate-800/50 group max-h-[320px] aspect-[2/3] flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-sm">
        {isHtmlSlideFormat ? (
          isCurrentSlideLoading ? (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse flex items-center justify-center"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>
          ) : currentHtmlSlide ? (
            <iframe srcDoc={currentHtmlSlide} className="w-full h-full border-0 pointer-events-none" title="Idea Pin" sandbox="allow-same-origin" />
          ) : (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center"><Sparkles className="h-5 w-5 text-slate-400" /></div>
          )
        ) : displayImageUrl ? (
          (displayImageUrl.toLowerCase().endsWith('.mp4') || displayImageUrl.toLowerCase().endsWith('.webm') || displayImageUrl.includes('.mp4?') || displayImageUrl.includes('pixabay.com/video/')) ? (
            <video src={displayImageUrl} autoPlay loop muted playsInline className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <img src={displayImageUrl} alt="Pin" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          )
        ) : (
          <div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse flex items-center justify-center text-slate-500 text-xs">Preview Visual</div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col justify-between p-4 cursor-pointer transition-opacity">
          <div className="flex justify-end w-full">
            <button className="bg-[#e60023] hover:bg-[#ad081b] text-white font-bold text-[15px] px-4 py-2 rounded-full leading-none shadow-md">Save</button>
          </div>
          <div className="flex justify-end gap-2.5">
            <button className="h-9 w-9 bg-white/90 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm"><Share2 className="h-[18px] w-[18px] text-slate-900" /></button>
            <button className="h-9 w-9 bg-white/90 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm"><MoreHorizontal className="h-[18px] w-[18px] text-slate-900" /></button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 px-1">
        <h3 className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight line-clamp-2 pl-0.5">{pinTitle}</h3>
        {isLoading ? (
          <div className="flex items-center gap-2 mt-1 animate-pulse">
            <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1">
            <div className="h-7 w-7 rounded-full bg-[#e60023] text-white font-bold text-xs shrink-0 overflow-hidden flex items-center justify-center">
              {userImage ? (
                <img src={userImage} alt={pinUser} className="h-full w-full object-cover" />
              ) : (
                <span className="font-black text-[10px] text-white">📌</span>
              )}
            </div>
            <span className="text-[13px] text-slate-700 dark:text-slate-300 line-clamp-1 font-medium">{pinUser}</span>
          </div>
        )}
      </div>
    </div>
  );
}
