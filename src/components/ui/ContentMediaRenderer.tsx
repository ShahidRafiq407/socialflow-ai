"use client";

import React, { useState } from "react";
import { Trash2, AlertCircle, Play, Pause, Volume2, VolumeX } from "lucide-react";
import VideoPreviewPlayer from "./VideoPreviewPlayer";

export const isMediaVideo = (url: string | null, explicitType?: "image" | "video" | string): boolean => {
  if (explicitType === "video") return true;
  if (explicitType === "image") return false;
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.endsWith(".mp4") ||
    lowerUrl.endsWith(".webm") ||
    lowerUrl.endsWith(".mov") ||
    lowerUrl.endsWith(".ogg") ||
    lowerUrl.includes(".mp4?") ||
    lowerUrl.includes(".webm?") ||
    lowerUrl.includes("pixabay.com/video/") ||
    lowerUrl.startsWith("data:video/")
  );
};

interface ContentMediaRendererProps {
  url: string | null;
  mediaType?: "image" | "video" | "auto";
  alt?: string;
  className?: string;
  isVertical?: boolean;
  onRemove?: () => void;
  showRemoveButton?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
}

export default function ContentMediaRenderer({
  url,
  mediaType = "auto",
  alt = "Post media preview",
  className = "w-full h-full object-cover rounded-xl",
  isVertical = false,
  onRemove,
  showRemoveButton = true,
  autoPlay = true,
  loop = true,
  muted = true,
}: ContentMediaRendererProps) {
  const [hasError, setHasError] = useState(false);

  if (!url) return null;

  const isVideo = isMediaVideo(url, mediaType);

  if (hasError) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-4 text-center rounded-xl">
        <AlertCircle className="h-7 w-7 text-red-400 mb-2 opacity-80" />
        <p className="text-xs font-semibold text-slate-300">Media preview unavailable</p>
        <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{url}</p>
        {onRemove && showRemoveButton && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors z-30 shadow-md"
            title="Remove Media"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden group">
      {isVideo ? (
        <VideoPreviewPlayer
          src={url}
          isVertical={isVertical}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          className={className}
          showAlwaysPlayButton={true}
        />
      ) : (
        <img
          src={url}
          alt={alt}
          onError={() => setHasError(true)}
          className={className}
        />
      )}

      {onRemove && showRemoveButton && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors z-30 shadow-md backdrop-blur-xs opacity-80 group-hover:opacity-100"
          title="Remove Media"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
