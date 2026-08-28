import React from "react";
import { Check, MoreHorizontal, MessageCircle, Repeat2, Heart, Bookmark, Share2 } from "lucide-react";

interface XThreadPost {
  text: string;
  mediaUrl?: string | null;
  mediaUrls?: string[];
}

interface XPreviewProps {
  currentFormatName?: string;
  displayImageUrl: string | null;
  displayImageUrls?: string[];
  displayMediaIsVideo?: boolean;
  userName: string;
  userImage: string | null;
  userHandle: string;
  currentCaption: string;
  isLoading?: boolean;
  isConnected?: boolean;
  threadPosts?: XThreadPost[];
}

function MediaBlock({ urls, forceVideo }: { urls?: string[]; forceVideo?: boolean }) {
  if (!urls || urls.length === 0) return null;
  
  const validUrls = urls.filter(Boolean);
  if (validUrls.length === 0) return null;

  const firstUrl = validUrls[0];
  const lowerUrl = firstUrl.toLowerCase();
  const isVideo = forceVideo ||
    lowerUrl.endsWith(".mp4") ||
    lowerUrl.endsWith(".webm") ||
    lowerUrl.includes(".mp4?") ||
    lowerUrl.includes("pixabay.com/video/") ||
    lowerUrl.startsWith("data:video/");
    
  if (isVideo) {
    return (
      <div className="w-full max-h-[280px] bg-slate-900 rounded-2xl overflow-hidden mt-3 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
        <video src={firstUrl} autoPlay loop muted playsInline preload="auto" className="w-full h-full object-cover" />
      </div>
    );
  }

  // Grid layout for 1-4 images
  const count = validUrls.length;
  
  if (count === 1) {
    return (
      <div className="w-full max-h-[280px] bg-slate-900 rounded-2xl overflow-hidden mt-3 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
        <img src={validUrls[0]} alt="Post media" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="w-full h-[240px] mt-3 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-0.5">
        <img src={validUrls[0]} alt="Post media 1" className="w-full h-full object-cover bg-slate-900" />
        <img src={validUrls[1]} alt="Post media 2" className="w-full h-full object-cover bg-slate-900" />
      </div>
    );
  }
  
  if (count === 3) {
    return (
      <div className="w-full h-[240px] mt-3 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-0.5">
        <img src={validUrls[0]} alt="Post media 1" className="w-full h-full object-cover bg-slate-900" />
        <div className="grid grid-rows-2 gap-0.5 h-full">
          <img src={validUrls[1]} alt="Post media 2" className="w-full h-full object-cover bg-slate-900" />
          <img src={validUrls[2]} alt="Post media 3" className="w-full h-full object-cover bg-slate-900" />
        </div>
      </div>
    );
  }

  // 4 images
  return (
    <div className="w-full h-[240px] mt-3 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 grid grid-cols-2 grid-rows-2 gap-0.5">
      <img src={validUrls[0]} alt="Post media 1" className="w-full h-full object-cover bg-slate-900" />
      <img src={validUrls[1]} alt="Post media 2" className="w-full h-full object-cover bg-slate-900" />
      <img src={validUrls[2]} alt="Post media 3" className="w-full h-full object-cover bg-slate-900" />
      <img src={validUrls[3]} alt="Post media 4" className="w-full h-full object-cover bg-slate-900" />
    </div>
  );
}

export default function XPreview({
  currentFormatName = "Post",
  displayImageUrl,
  displayImageUrls = [],
  displayMediaIsVideo = false,
  userName,
  userImage,
  userHandle,
  currentCaption,
  isLoading = false,
  isConnected = false,
  threadPosts = [],
}: XPreviewProps) {
  const nameText = isConnected ? userName : "X User";
  const handleText = isConnected ? (userHandle.startsWith("@") ? userHandle : @\) : "@your_x_handle";

  const isThread = currentFormatName === "Thread";
  
  // Real thread data or standard Post
  const posts: XThreadPost[] =
    isThread && threadPosts.length > 0
      ? threadPosts
      : [{ 
          text: currentCaption, 
          mediaUrl: displayImageUrl, 
          mediaUrls: displayImageUrls.length > 0 ? displayImageUrls : (displayImageUrl ? [displayImageUrl] : []) 
        }];

  const postTotal = posts.length;

  const renderPost = (post: XThreadPost, idx: number, withConnector: boolean) => {
    const urls = post.mediaUrls || (post.mediaUrl ? [post.mediaUrl] : []);
    
    return (
      <div className="flex gap-3 relative pt-2" key={x-post-\}>
        {withConnector && (
          <div className="absolute left-[19px] top-0 bottom-0 w-[2px] bg-slate-200 dark:bg-slate-800 z-10" />
        )}
        <div className="h-10 w-10 rounded-full bg-slate-900 dark:bg-slate-800 text-white font-bold text-sm shrink-0 overflow-hidden flex items-center justify-center border border-slate-800 z-20">
          {userImage ? (
            <img src={userImage} alt={nameText} className="h-full w-full object-cover" />
          ) : (
            <span className="font-extrabold text-xs">??</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-[14px] font-bold text-slate-900 dark:text-white leading-tight truncate max-w-[140px]">{nameText}</span>
              <Check className="h-3.5 w-3.5 text-blue-400 bg-black rounded-full" />
              <span className="text-[13px] text-slate-500 truncate">{handleText} · {idx === 0 ? "2h" : "1h"}</span>
            </div>
            <MoreHorizontal className="h-4 w-4 text-slate-500 cursor-pointer shrink-0" />
          </div>
          {post.text && (
            <p className="text-[13.5px] text-slate-900 dark:text-white mt-1 mb-1 leading-relaxed whitespace-pre-wrap">{post.text}</p>
          )}
          <MediaBlock urls={urls} forceVideo={displayMediaIsVideo && idx === 0} />
          <div className="flex items-center justify-between mt-3 max-w-md text-slate-500">
            <button className="flex items-center gap-2 text-[13px] hover:text-blue-500"><MessageCircle className="h-4 w-4" /> 12</button>
            <button className="flex items-center gap-2 text-[13px] hover:text-emerald-500"><Repeat2 className="h-4 w-4" /> 45</button>
            <button className="flex items-center gap-2 text-[13px] hover:text-pink-500"><Heart className="h-4 w-4" /> 392</button>
            <button className="flex items-center gap-2 text-[13px] hover:text-blue-500"><Bookmark className="h-4 w-4" /></button>
            <button className="flex items-center gap-2 text-[13px] hover:text-blue-500"><Share2 className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-[420px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4 rounded-xl shadow-xs space-y-1 overflow-y-auto max-h-[640px]">
      {isLoading ? (
        <div className="flex gap-3 w-full animate-pulse py-2">
          <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
        </div>
      ) : (
        posts.map((post, idx) => (
          <div key={x-thread-post-\} className="relative">
            {isThread && postTotal > 1 && (
              <span className="absolute -top-0.5 right-0 z-30 text-[10px] font-mono font-bold text-slate-400">
                {idx + 1}/{postTotal}
              </span>
            )}
            {renderPost(post, idx, idx > 0)}
          </div>
        ))
      )}
    </div>
  );
}
