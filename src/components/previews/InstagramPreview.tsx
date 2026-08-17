import React, { useState, useRef } from "react";
import { MoreHorizontal, Heart, MessageCircle, Send, Bookmark, Camera, ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";

interface InstagramPreviewProps {
  currentFormatName: string;
  displayImageUrl: string | null;
  displayImageUrls: string[];
  displayOverlayTexts: any[];
  activeSlideIdx: number;
  onSlideChange?: (idx: number) => void;
  userName: string;
  userImage: string | null;
  userHandle: string;
  currentCaption: string;
  isLoading?: boolean;
  isConnected?: boolean;
  displayMediaIsVideo?: boolean;
}

export default function InstagramPreview({
  currentFormatName,
  displayImageUrl,
  displayImageUrls,
  displayOverlayTexts,
  activeSlideIdx,
  onSlideChange,
  userName,
  userImage,
  userHandle,
  currentCaption,
  isLoading = false,
  isConnected = false,
  displayMediaIsVideo = false,
}: InstagramPreviewProps) {
  const [isMuted, setIsMuted] = useState(true);
  const reelVideoRef = useRef<HTMLVideoElement>(null);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (reelVideoRef.current) {
      reelVideoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const isVideoUrl = (url: string | null) => {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.endsWith('.mp4') ||
      lowerUrl.endsWith('.webm') ||
      lowerUrl.endsWith('.mov') ||
      lowerUrl.includes('.mp4?') ||
      lowerUrl.includes('pixabay.com/video/') ||
      lowerUrl.startsWith('data:video/')
    );
  };

  const handleText = isConnected ? (userHandle.startsWith("@") ? userHandle : `@${userHandle}`) : "@your_instagram";
  const nameText = isConnected ? (userName || userHandle.replace(/^@/, '')) : "Instagram Account";

  const totalSlides = displayImageUrls.length > 0 ? displayImageUrls.length : 1;
  const currentSlideMedia = (displayImageUrls && displayImageUrls[activeSlideIdx]) || displayImageUrl;

  if (currentFormatName === "Story" || currentFormatName === "Reel") {
    return (
      <div className="relative border-[8px] border-slate-900 dark:border-slate-800 rounded-[38px] bg-slate-950 text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/18]">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-28 bg-slate-900 rounded-b-xl z-30" />
        <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between z-20">
          {isLoading ? (
            <div className="flex items-center gap-2 animate-pulse">
              <div className="h-7 w-7 rounded-full bg-slate-700" />
              <div className="h-3 w-20 bg-slate-700 rounded" />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px] shrink-0">
                <div className="bg-slate-900 h-full w-full rounded-full border border-slate-900 overflow-hidden flex items-center justify-center">
                  {userImage ? (
                    <img src={userImage} alt={handleText} className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-3.5 w-3.5 text-white" />
                  )}
                </div>
              </div>
              <p className="text-xs font-bold text-white shadow-sm truncate max-w-[130px]">{handleText}</p>
            </div>
          )}
          <MoreHorizontal className="h-4 w-4 text-white drop-shadow-md" />
        </div>

        {/* Audio Unmute Toggle Button */}
        {currentSlideMedia && (displayMediaIsVideo || isVideoUrl(currentSlideMedia)) && (
          <button
            type="button"
            onClick={toggleMute}
            className="absolute top-12 right-3.5 z-30 p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white hover:bg-black/80 transition-all border border-white/15 shadow-md"
            title={isMuted ? "Tap to Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
          </button>
        )}

        <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={toggleMute}>
          {currentSlideMedia && (displayMediaIsVideo || isVideoUrl(currentSlideMedia)) ? (
            <video
              ref={reelVideoRef}
              src={currentSlideMedia}
              autoPlay
              loop
              muted={isMuted}
              playsInline
              preload="auto"
              className="w-full h-full object-cover"
            />
          ) : currentSlideMedia ? (
            <img src={currentSlideMedia} alt={currentFormatName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-500 text-xs gap-1 p-4 text-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                {currentFormatName === "Story" ? "Story Preview" : "Reel Video Preview"}
              </span>
              <span className="text-[11px] text-slate-500">
                {currentFormatName === "Story" ? "No story media attached yet" : "No video generated yet"}
              </span>
            </div>
          )}
        </div>

        {currentFormatName === "Reel" ? (
          <>
            <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 z-20">
              <div className="flex flex-col items-center gap-1"><Heart className="h-6 w-6 text-white drop-shadow-md" /><span className="text-[10px] font-semibold">12k</span></div>
              <div className="flex flex-col items-center gap-1"><MessageCircle className="h-6 w-6 text-white drop-shadow-md" /><span className="text-[10px] font-semibold">456</span></div>
              <div className="flex flex-col items-center gap-1"><Send className="h-5 w-5 text-white drop-shadow-md" /><span className="text-[10px] font-semibold">Share</span></div>
              <MoreHorizontal className="h-5 w-5 text-white drop-shadow-md mt-2" />
            </div>
            <div className="absolute bottom-0 left-0 right-16 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-12 z-20">
              <p className="text-xs font-semibold text-white mb-1">{handleText}</p>
              <p className="text-[11px] leading-snug line-clamp-2 text-white">{currentCaption}</p>
            </div>
          </>
        ) : (
          <>
            {/* Top Story Progress Bar */}
            <div className="absolute top-2 left-3 right-3 flex gap-1 z-30">
              <div className="h-0.5 flex-1 bg-white/90 rounded-full" />
            </div>
            {/* Bottom Story Message Bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 z-20 space-y-1.5">
              {currentCaption && (
                <p className="text-[11px] leading-snug line-clamp-2 text-white text-center drop-shadow-md">
                  {currentCaption}
                </p>
              )}
              <div className="flex items-center gap-2">
                <div className="flex-1 py-1 px-3 rounded-full border border-white/40 bg-black/30 backdrop-blur-xs text-[10px] text-white/80">
                  Send message...
                </div>
                <Heart className="h-5 w-5 text-white drop-shadow-md" />
                <Send className="h-5 w-5 text-white drop-shadow-md" />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-[340px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-md rounded-xl overflow-hidden text-left">
      <div className="flex items-center justify-between p-3">
        {isLoading ? (
          <div className="flex items-center gap-2.5 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px] shrink-0">
              <div className="bg-slate-900 h-full w-full rounded-full border border-white dark:border-slate-900 overflow-hidden flex items-center justify-center font-bold text-[11px] text-white">
                {userImage ? (
                  <img src={userImage} alt={nameText} className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-4 w-4 text-white" />
                )}
              </div>
            </div>
            <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">{handleText}</p>
          </div>
        )}
        <MoreHorizontal className="h-4 w-4 text-slate-900 dark:text-white" />
      </div>

      <div className="w-full max-h-[320px] aspect-square relative overflow-hidden bg-slate-950 flex items-center justify-center group">
        {currentSlideMedia && (displayMediaIsVideo || isVideoUrl(currentSlideMedia)) ? (
          <video src={currentSlideMedia} autoPlay loop muted playsInline className="w-full h-full object-cover" />
        ) : currentSlideMedia ? (
          <img src={currentSlideMedia} alt={`Slide ${activeSlideIdx + 1}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-500 text-xs gap-1.5 p-4 text-center">
            <Camera className="h-7 w-7 text-slate-700 mx-auto" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Instagram {currentFormatName} Preview</span>
            <span className="text-[11px] text-slate-500">No visual generated yet</span>
          </div>
        )}

        {/* STEP OVERLAY (ONLY for Carousels / Stories / Idea Pins) */}
        {(currentFormatName === "Carousel" || currentFormatName === "Story" || currentFormatName === "Idea Pin") && displayOverlayTexts[activeSlideIdx] && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex flex-col justify-end p-4 z-10 pointer-events-none">
            <div className="bg-primary/95 text-white text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-sm w-max mb-1.5 backdrop-blur-sm shadow-sm border border-white/20">
              Step {displayOverlayTexts[activeSlideIdx].step || activeSlideIdx + 1}
            </div>
            <h3 className="text-white font-extrabold text-base sm:text-lg leading-tight mb-1 drop-shadow-md">
              {displayOverlayTexts[activeSlideIdx].title}
            </h3>
            <p className="text-slate-200 text-[11px] sm:text-xs font-medium leading-snug drop-shadow-sm max-w-[95%]">
              {displayOverlayTexts[activeSlideIdx].body}
            </p>
          </div>
        )}

        {/* CAROUSEL PAGINATION BADGE */}
        {currentFormatName === "Carousel" && totalSlides > 1 && (
          <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-xs rounded-full px-2 py-0.5 text-[10px] text-white font-bold tracking-wide z-20 shadow-sm border border-white/10">
            {activeSlideIdx + 1}/{totalSlides}
          </div>
        )}

        {/* INTERACTIVE CAROUSEL ARROWS */}
        {currentFormatName === "Carousel" && totalSlides > 1 && onSlideChange && (
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

      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4 text-slate-900 dark:text-white">
            <Heart className="h-6 w-6 cursor-pointer" /><MessageCircle className="h-6 w-6 cursor-pointer" /><Send className="h-[22px] w-[22px] cursor-pointer" />
          </div>
          {totalSlides > 1 && (
            <div className="flex items-center gap-1">
              {Array.from({ length: totalSlides }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSlideChange && onSlideChange(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeSlideIdx ? "w-4 bg-primary" : "w-1.5 bg-slate-300 dark:bg-slate-700"
                  }`}
                />
              ))}
            </div>
          )}
          <Bookmark className="h-6 w-6 text-slate-900 dark:text-white cursor-pointer" />
        </div>
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white mb-1">1,234 likes</p>
        <p className="text-[13px] text-slate-900 dark:text-white leading-snug line-clamp-3">
          <span className="font-semibold mr-1.5">{handleText}</span>
          {currentCaption}
        </p>
      </div>
    </div>
  );
}

