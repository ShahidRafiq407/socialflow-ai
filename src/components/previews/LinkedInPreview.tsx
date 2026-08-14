import React, { useState } from "react";
import { MoreHorizontal, Globe, ThumbsUp, Heart, MessageCircle, Repeat2, Send, Briefcase, ChevronLeft, ChevronRight } from "lucide-react";

interface LinkedInPreviewProps {
  currentFormatName: string;
  displayImageUrl: string | null;
  displayImageUrls?: string[];
  displayOverlayTexts?: any[];
  activeSlideIdx?: number;
  onSlideChange?: (idx: number) => void;
  userName: string;
  userImage: string | null;
  currentCaption: string;
  isLoading?: boolean;
  isConnected?: boolean;
}

export default function LinkedInPreview({
  currentFormatName,
  displayImageUrl,
  displayImageUrls = [],
  displayOverlayTexts = [],
  activeSlideIdx = 0,
  onSlideChange,
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

  const isShortVideo = currentFormatName === "Short Video";
  const totalSlides = displayImageUrls.length > 0 ? displayImageUrls.length : 1;
  const currentSlideMedia = (displayImageUrls && displayImageUrls[activeSlideIdx]) || displayImageUrl;

  if (isShortVideo) {
    return (
      <div className="relative border-[8px] border-slate-900 rounded-[38px] bg-slate-950 text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/18]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-28 bg-slate-900 rounded-b-xl z-30" />
        <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-[#0A66C2] overflow-hidden shrink-0 flex items-center justify-center text-white text-xs font-bold">
              {userImage ? <img src={userImage} alt={displayName} className="h-full w-full object-cover" /> : <Briefcase className="h-3 w-3" />}
            </div>
            <span className="text-xs font-bold text-white truncate max-w-[120px]">{displayName}</span>
          </div>
          <span className="bg-[#0A66C2] text-[10px] font-semibold px-2 py-0.5 rounded text-white">Video</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          {currentSlideMedia && isVideoUrl(currentSlideMedia) ? (
            <video src={currentSlideMedia} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-500 text-xs gap-1 p-4 text-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">LinkedIn Video Preview</span>
              <span className="text-[11px] text-slate-500">No video generated yet</span>
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3 pt-10 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          <p className="text-xs font-bold text-white mb-1 truncate">{displayName}</p>
          <p className="text-[11px] leading-snug line-clamp-3 text-slate-200">{currentCaption}</p>
        </div>
      </div>
    );
  }

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

      {currentSlideMedia && (
        <div className="relative w-full max-h-[320px] bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden group">
          {currentSlideMedia && isVideoUrl(currentSlideMedia) ? (
            <video src={currentSlideMedia} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover" />
          ) : (
            <img src={currentSlideMedia} alt={`LinkedIn Slide ${activeSlideIdx + 1}`} className="w-full h-full object-cover" />
          )}

          {/* STEP OVERLAY (ONLY for Document/Carousel) */}
          {(currentFormatName === "Document" || currentFormatName === "Carousel") && displayOverlayTexts[activeSlideIdx] && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex flex-col justify-end p-4 z-10 pointer-events-none">
              <div className="bg-[#0A66C2] text-white text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-sm w-max mb-1.5 shadow-sm">
                Insight {displayOverlayTexts[activeSlideIdx].step || activeSlideIdx + 1}
              </div>
              <h3 className="text-white font-extrabold text-base leading-tight mb-1 drop-shadow-md">
                {displayOverlayTexts[activeSlideIdx].title}
              </h3>
              <p className="text-slate-200 text-xs font-medium leading-snug drop-shadow-sm max-w-[95%]">
                {displayOverlayTexts[activeSlideIdx].body}
              </p>
            </div>
          )}

          {/* SLIDE PAGINATION PILL */}
          {(currentFormatName === "Carousel" || currentFormatName === "Document") && totalSlides > 1 && (
            <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-2.5 py-0.5 rounded-full font-bold tracking-wide backdrop-blur-xs z-20 border border-white/10 shadow-sm">
              Slide {activeSlideIdx + 1} of {totalSlides}
            </div>
          )}

          {/* INTERACTIVE CAROUSEL ARROWS */}
          {(currentFormatName === "Carousel" || currentFormatName === "Document" || currentFormatName === "Multi-Image") && totalSlides > 1 && onSlideChange && (
            <>
              {activeSlideIdx > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSlideChange(activeSlideIdx - 1);
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center z-20 shadow-md backdrop-blur-xs transition-transform hover:scale-105"
                  title="Previous Slide"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {activeSlideIdx < totalSlides - 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSlideChange(activeSlideIdx + 1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center z-20 shadow-md backdrop-blur-xs transition-transform hover:scale-105"
                  title="Next Slide"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </>
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
