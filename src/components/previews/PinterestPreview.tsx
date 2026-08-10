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
}

export default function PinterestPreview({
  currentFormatName,
  isHtmlSlideFormat,
  isCurrentSlideLoading,
  currentHtmlSlide,
  displayImageUrl,
  campaignTopic,
  userName,
  userImage
}: PinterestPreviewProps) {
  return (
    <div className="w-full max-w-[250px] flex flex-col gap-2.5 mx-auto">
      <div className={`relative rounded-[24px] overflow-hidden bg-slate-100 dark:bg-slate-800/50 group ${currentFormatName === 'Pin' ? 'aspect-[2/3]' : 'aspect-[9/16]'}`}>
        {isHtmlSlideFormat ? (
          isCurrentSlideLoading ? (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse flex items-center justify-center"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>
          ) : currentHtmlSlide ? (
            <iframe srcDoc={currentHtmlSlide} className="w-full h-full border-0 pointer-events-none" title="Idea Pin" sandbox="allow-same-origin" />
          ) : (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center"><Sparkles className="h-5 w-5 text-slate-400" /></div>
          )
        ) : displayImageUrl ? (
          <img src={displayImageUrl} alt="Pin" className="w-full h-full object-cover group-hover:scale-105" />
        ) : (
          <div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse"></div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col justify-between p-4 cursor-pointer">
          <div className="flex justify-end w-full">
            <button className="bg-[#e60023] hover:bg-[#ad081b] text-white font-bold text-[15px] px-4 py-3 rounded-full leading-none">Save</button>
          </div>
          <div className="flex justify-end gap-2.5">
            <button className="h-9 w-9 bg-white/90 rounded-full flex items-center justify-center backdrop-blur-md"><Share2 className="h-[18px] w-[18px] text-slate-900" /></button>
            <button className="h-9 w-9 bg-white/90 rounded-full flex items-center justify-center backdrop-blur-md"><MoreHorizontal className="h-[18px] w-[18px] text-slate-900" /></button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 px-1">
        <h3 className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight line-clamp-2 pl-0.5">{campaignTopic || "Aesthetics Inspiration"}</h3>
        <div className="flex items-center gap-2 mt-1">
          <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0 overflow-hidden">
            {userImage && <img src={userImage} alt={userName} className="h-full w-full object-cover" />}
          </div>
          <span className="text-[13px] text-slate-700 dark:text-slate-300 line-clamp-1">{userName}</span>
        </div>
      </div>
    </div>
  );
}
