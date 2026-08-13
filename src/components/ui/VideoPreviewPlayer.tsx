"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

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
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    if (autoPlay) {
      video.play().catch(() => setIsPlaying(false));
    }

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [src, autoPlay]);

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(console.error);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`relative group overflow-hidden bg-slate-950 flex items-center justify-center select-none ${className}`}
      onClick={onClick}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={isMuted}
        loop={loop}
        playsInline
        className="w-full h-full object-cover"
      />

      {/* ── Fixed Immediate Play/Pause Overlay Button ── */}
      {showAlwaysPlayButton && (
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

      {/* ── Bottom Video Duration Line (Progress Bar) ── */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 z-20">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-100 ease-linear"
          style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
        />
      </div>
    </div>
  );
}
