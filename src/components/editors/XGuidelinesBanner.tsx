import React from "react";
import { FileText, Image as ImageIcon, Video, CheckCircle2 } from "lucide-react";

export default function XGuidelinesBanner({ format }: { format: string }) {
  const isThread = format === "Thread";

  return (
    <div className="mb-4 p-3.5 bg-sky-50/80 dark:bg-sky-950/30 rounded-xl border border-sky-200 dark:border-sky-900/50">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1 bg-sky-500 rounded text-white shadow-sm">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="w-3.5 h-3.5 fill-current"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.976H5.078z"></path></g></svg>
        </div>
        <h3 className="text-[11px] font-extrabold text-sky-900 dark:text-sky-100 uppercase tracking-widest">
          Official X {isThread ? "Thread" : "Post"} Guidelines
        </h3>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 mt-1 text-[11px]">
        <div className="flex items-start gap-2">
          <FileText className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-sky-900 dark:text-sky-200">Text Content</p>
            <p className="text-sky-700/90 dark:text-sky-300/80 mt-0.5 leading-snug">
              {isThread ? "Max 280 characters per tweet. Thread can contain up to 10 sequential tweets." : "Max 280 characters per tweet. Links count as 23 characters."}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <ImageIcon className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-sky-900 dark:text-sky-200">Images</p>
            <p className="text-sky-700/90 dark:text-sky-300/80 mt-0.5 leading-snug">
              Up to 4 images per tweet. Max 5MB each. Supported Formats: JPG, PNG, WEBP.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Video className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-sky-900 dark:text-sky-200">Video</p>
            <p className="text-sky-700/90 dark:text-sky-300/80 mt-0.5 leading-snug">
              1 video per tweet. Max 140s (2m20s) standard. Max 512MB. Supported Formats: MP4, MOV.
            </p>
          </div>
        </div>
        
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-sky-900 dark:text-sky-200">Layout Best Practices</p>
            <p className="text-sky-700/90 dark:text-sky-300/80 mt-0.5 leading-snug">
              16:9 Landscape or 1:1 Square recommended for optimal timeline visibility. Mix & match not advised.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
