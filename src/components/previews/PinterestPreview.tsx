import React from "react";
import { Loader2, Sparkles, Share2, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";

interface PinterestPreviewProps {
  currentFormatName: string;
  isHtmlSlideFormat?: boolean;
  isCurrentSlideLoading?: boolean;
  currentHtmlSlide?: string | null;
  displayImageUrl: string | null;
  displayImageUrls?: string[];
  displayOverlayTexts?: any[];
  activeSlideIdx?: number;
  onSlideChange?: (idx: number) => void;
  campaignTopic: string;
  userName: string;
  userImage: string | null;
  isLoading?: boolean;
  isConnected?: boolean;
}

export default function PinterestPreview({
  currentFormatName,
  isHtmlSlideFormat = false,
  isCurrentSlideLoading = false,
  currentHtmlSlide = null,
  displayImageUrl,
  displayImageUrls = [],
  displayOverlayTexts = [],
  activeSlideIdx = 0,
  onSlideChange,
  campaignTopic,
  userName,
  userImage,
  isLoading = false,
  isConnected = false,
}: PinterestPreviewProps) {
  const pinTitle = campaignTopic || "Aesthetics & Strategy Inspiration";
  const pinUser = isConnected ? userName : "Pinterest Creator";

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

  const isIdeaPin = currentFormatName === "Idea Pin" || isHtmlSlideFormat;
  const totalSlides = displayImageUrls.length > 0 ? displayImageUrls.length : 1;
  const currentSlideMedia = (displayImageUrls && displayImageUrls[activeSlideIdx]) || displayImageUrl;

  return (
    <div className="w-full max-w-[250px] flex flex-col gap-2.5 mx-auto text-left">
      <div className="relative rounded-[24px] overflow-hidden bg-slate-100 dark:bg-slate-800/50 group max-h-[320px] aspect-[2/3] flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* IDEA PIN PROGRESS BARS */}
        {isIdeaPin && totalSlides > 1 && (
          <div className="absolute top-2.5 left-2.5 right-2.5 flex gap-1 z-20">
            {Array.from({ length: totalSlides }).map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full flex-1 transition-all ${
                  i === activeSlideIdx ? "bg-white shadow-sm" : i < activeSlideIdx ? "bg-white/80" : "bg-white/35"
                }`}
              />
            ))}
          </div>
        )}

        {isHtmlSlideFormat ? (
          isCurrentSlideLoading ? (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse flex items-center justify-center"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>
          ) : currentHtmlSlide ? (
            <iframe srcDoc={currentHtmlSlide} className="w-full h-full border-0 pointer-events-none" title="Idea Pin" sandbox="allow-same-origin" />
          ) : (
            <div className="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center"><Sparkles className="h-5 w-5 text-slate-400" /></div>
          )
        ) : currentFormatName === "Video Pin" ? (
          currentSlideMedia && isVideoUrl(currentSlideMedia) ? (
            <video src={currentSlideMedia} autoPlay loop muted playsInline className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-slate-500 text-xs gap-1 p-3 text-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Video Pin Preview</span>
              <span className="text-[11px] text-slate-500">No video generated yet</span>
            </div>
          )
        ) : currentSlideMedia ? (
          isVideoUrl(currentSlideMedia) ? (
            <video src={currentSlideMedia} autoPlay loop muted playsInline className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <img src={currentSlideMedia} alt={`Pin Slide ${activeSlideIdx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          )
        ) : (
          <div className="w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 text-xs">Preview Visual</div>
        )}

        {/* STEP OVERLAY (for Idea Pins) */}
        {displayOverlayTexts[activeSlideIdx] && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex flex-col justify-end p-3.5 z-10 pointer-events-none">
            <div className="bg-[#e60023] text-white text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-sm w-max mb-1 shadow-sm">
              Idea {displayOverlayTexts[activeSlideIdx].step || activeSlideIdx + 1}
            </div>
            <h3 className="text-white font-extrabold text-sm leading-tight mb-0.5 drop-shadow-md line-clamp-2">
              {displayOverlayTexts[activeSlideIdx].title}
            </h3>
            <p className="text-slate-200 text-[10px] font-medium leading-snug drop-shadow-sm line-clamp-2">
              {displayOverlayTexts[activeSlideIdx].body}
            </p>
          </div>
        )}

        {/* INTERACTIVE ARROWS FOR MULTI-SLIDE IDEA PINS */}
        {isIdeaPin && totalSlides > 1 && onSlideChange && (
          <>
            {activeSlideIdx > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSlideChange(activeSlideIdx - 1);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center z-30 shadow-md backdrop-blur-xs transition-transform hover:scale-105"
                title="Previous Slide"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {activeSlideIdx < totalSlides - 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSlideChange(activeSlideIdx + 1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center z-30 shadow-md backdrop-blur-xs transition-transform hover:scale-105"
                title="Next Slide"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col justify-between p-3.5 cursor-pointer transition-opacity pointer-events-auto">
          <div className="flex justify-end w-full">
            <button className="bg-[#e60023] hover:bg-[#ad081b] text-white font-bold text-[13px] px-3.5 py-1.5 rounded-full leading-none shadow-md">Save</button>
          </div>
          <div className="flex justify-end gap-2">
            <button className="h-8 w-8 bg-white/90 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm"><Share2 className="h-4 w-4 text-slate-900" /></button>
            <button className="h-8 w-8 bg-white/90 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm"><MoreHorizontal className="h-4 w-4 text-slate-900" /></button>
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
