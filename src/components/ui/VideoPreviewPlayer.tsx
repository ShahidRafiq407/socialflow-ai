"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, AlertCircle, Loader2, RefreshCw } from "lucide-react";

interface VideoPreviewPlayerProps {
  src: string;
  poster?: string;
  duration?: number;
  className?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  isVertical?: boolean;
  showAlwaysPlayButton?: boolean;
  onClick?: () => void;
}

export default function VideoPreviewPlayer({
  src,
  poster,
  duration: initialDuration = 0,
  className = "",
  autoPlay = true,
  loop = true,
  muted: initialMuted = true,
  isVertical = false,
  showAlwaysPlayButton = true,
  onClick,
}: VideoPreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsLoading(true);
    setHasError(false);

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setIsLoading(false);
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };
    const handleCanPlay = () => setIsLoading(false);
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);
    video.addEventListener("error", handleError);

    if (autoPlay) {
      video.muted = true;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsLoading(false);
          })
          .catch(() => {
            setIsPlaying(false);
            setIsLoading(false);
          });
      }
    }

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("error", handleError);
    };
  }, [src, autoPlay]);

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn("Video play error:", err);
          setIsPlaying(false);
        });
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHasError(false);
    setIsLoading(true);
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (hasError) {
    return (
      <div className={`relative group overflow-hidden bg-slate-950 flex flex-col items-center justify-center p-4 text-center select-none ${className}`}>
        <AlertCircle className="h-8 w-8 text-amber-400 mb-2 opacity-80" />
        <p className="text-xs font-bold text-slate-200">Video playback unavailable</p>
        <p className="text-[10px] text-slate-500 line-clamp-1 max-w-[200px] mt-0.5">{src}</p>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-3 px-3 py-1 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
        >
          <RefreshCw className="h-3 w-3" /> Reload Video
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative group overflow-hidden bg-slate-950 flex items-center justify-center select-none ${className}`}
      onClick={onClick || togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={isMuted}
        loop={loop}
        playsInline
        crossOrigin="anonymous"
        preload="auto"
        className="w-full h-full object-cover"
      />

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs z-10">
          <Loader2 className="h-8 w-8 text-white animate-spin opacity-80" />
        </div>
      )}

      {/* ── Center Play/Pause Overlay Button ── */}
      {showAlwaysPlayButton && !isLoading && (
        <button
          type="button"
          onClick={togglePlay}
          className={`absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-xl transition-all duration-200 hover:scale-110 active:scale-95 z-20 ${
            isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100 scale-105 bg-emerald-600/90 border-emerald-400"
          }`}
          title={isPlaying ? "Pause Video" : "Play Video"}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 text-white fill-white" />
          ) : (
            <Play className="h-5 w-5 text-white fill-white ml-0.5" />
          )}
        </button>
      )}

      {/* ── Top Bar Badges (Duration & Mute) ── */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-20 pointer-events-none">
        {duration > 0 && (
          <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-white text-[10px] font-bold tracking-wide border border-white/10 font-mono shadow-sm">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        )}
        <button
          type="button"
          onClick={toggleMute}
          className="pointer-events-auto p-1.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 hover:text-white hover:bg-black/80 transition-all border border-white/10 ml-auto"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
        </button>
      </div>

      {/* ── Bottom Video Progress Line (Left to Right from 0%) ── */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 z-20">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-100 ease-linear"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </div>
  );
}
