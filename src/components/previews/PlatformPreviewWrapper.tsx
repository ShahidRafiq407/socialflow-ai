"use client";

import React, { useState, useEffect } from "react";
import { fetchPlatformProfile, PlatformProfile } from "@/actions/fetch-profile";
import InstagramPreview from "./InstagramPreview";
import LinkedInPreview from "./LinkedInPreview";
import XPreview from "./XPreview";
import TikTokPreview from "./TikTokPreview";
import YoutubePreview from "./YoutubePreview";
import FacebookPreview from "./FacebookPreview";
import PinterestPreview from "./PinterestPreview";
import { AlertCircle, RefreshCw, Link2, UserX } from "lucide-react";

interface PlatformPreviewWrapperProps {
  platformKey: string;
  // Instagram
  currentFormatName?: string;
  displayImageUrl?: string | null;
  displayImageUrls?: string[];
  displayOverlayTexts?: any[];
  activeSlideIdx?: number;
  onSlideChange?: (idx: number) => void;
  currentCaption?: string;
  // X Thread
  threadPosts?: Array<{ text: string; mediaUrl?: string | null }>;
  // Facebook / LinkedIn — vertical frame for 9:16 video formats
  isVertical?: boolean;
  // Explicit media type from the pipeline (URL extensions can lie)
  displayMediaIsVideo?: boolean;
  // Pinterest
  isHtmlSlideFormat?: boolean;
  isCurrentSlideLoading?: boolean;
  currentHtmlSlide?: string | null;
  campaignTopic?: string;
}

interface ProfileState {
  profile: PlatformProfile | null;
  isLoading: boolean;
  error: string | null;
}

export default function PlatformPreviewWrapper({
  platformKey,
  currentFormatName = "Feed",
  displayImageUrl = null,
  displayImageUrls = [],
  displayOverlayTexts = [],
  activeSlideIdx = 0,
  onSlideChange,
  currentCaption = "",
  threadPosts = [],
  isVertical = false,
  displayMediaIsVideo = false,
  isHtmlSlideFormat = false,
  isCurrentSlideLoading = false,
  currentHtmlSlide = null,
  campaignTopic = "",
}: PlatformPreviewWrapperProps) {
  const [profileState, setProfileState] = useState<ProfileState>({
    profile: null,
    isLoading: true,
    error: null,
  });

  const fetchProfile = async () => {
    setProfileState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const data = await fetchPlatformProfile(platformKey);
      setProfileState({ profile: data, isLoading: false, error: data.error || null });
    } catch (err: any) {
      setProfileState({ profile: null, isLoading: false, error: err.message || "Failed to fetch profile" });
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [platformKey]);

  const { profile, isLoading, error } = profileState;
  const isConnected = profile?.isConnected || false;
  const isTokenExpired = profile?.isTokenExpired || false;

  // Skeleton loader components for each platform
  const renderSkeleton = () => {
    switch (platformKey) {
      case "instagram":
        return (
          <div className="relative border-[8px] border-slate-900 dark:border-slate-800 rounded-[38px] bg-slate-950 text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/18] animate-pulse">
            <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between z-20">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-slate-700" />
                <div className="h-3 w-20 bg-slate-700 rounded" />
              </div>
              <div className="h-4 w-4 bg-slate-700 rounded" />
            </div>
            <div className="absolute inset-0 bg-slate-900" />
            <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4 z-20">
              <div className="h-6 w-6 bg-slate-700 rounded-full" />
              <div className="h-6 w-6 bg-slate-700 rounded-full" />
              <div className="h-5 w-5 bg-slate-700 rounded-full" />
              <div className="h-5 w-5 bg-slate-700 rounded-full" />
            </div>
            <div className="absolute bottom-0 left-0 right-16 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-12 z-20">
              <div className="h-3 w-24 bg-slate-700 rounded mb-1" />
              <div className="h-3 w-32 bg-slate-700 rounded" />
              <div className="h-3 w-28 bg-slate-700 rounded mt-1" />
            </div>
          </div>
        );
      case "linkedin":
        return (
          <div className="w-full max-w-[400px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1b1f23] shadow-sm overflow-hidden text-left animate-pulse">
            <div className="flex items-start gap-3 p-3.5 pb-2">
              <div className="h-11 w-11 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-2.5 w-44 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
              <div className="h-5 w-5 bg-slate-200 dark:bg-slate-800 rounded shrink-0" />
            </div>
            <div className="px-3.5 pb-2">
              <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded mb-2" />
              <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
            <div className="w-full max-h-[320px] bg-slate-100 dark:bg-slate-900" />
            <div className="px-3.5 py-1.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          </div>
        );
      case "x":
        return (
          <div className="w-full max-w-[420px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-black p-4 rounded-xl shadow-xs animate-pulse">
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-36 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3 w-5/6 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="w-full max-h-[280px] bg-slate-900 rounded-2xl" />
              </div>
            </div>
          </div>
        );
      case "tiktok":
        return (
          <div className="relative border-[8px] border-slate-900 rounded-[32px] bg-black text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/16] animate-pulse">
            <div className="absolute inset-0 bg-slate-900" />
            <div className="absolute right-2 bottom-20 flex flex-col items-center gap-4 z-20">
              <div className="h-10 w-10 rounded-full bg-slate-800 border-2 border-white/50" />
              <div className="h-7 w-7 bg-slate-800 rounded-full" />
              <div className="h-7 w-7 bg-slate-800 rounded-full" />
              <div className="h-7 w-7 bg-slate-800 rounded-full" />
              <div className="h-7 w-7 bg-slate-800 rounded-full" />
            </div>
            <div className="absolute bottom-0 left-0 right-16 p-3 z-20 bg-gradient-to-t from-black/80 to-transparent">
              <div className="h-3.5 w-24 bg-slate-700 rounded mb-1" />
              <div className="h-3 w-32 bg-slate-700 rounded" />
              <div className="h-3 w-28 bg-slate-700 rounded mt-2" />
            </div>
          </div>
        );
      case "youtube":
        return (
          <div className="relative border-[8px] border-slate-900 rounded-[32px] bg-[#0f0f0f] text-white overflow-hidden shadow-2xl mx-auto w-full max-w-[270px] aspect-[9/16] animate-pulse">
            <div className="absolute inset-0 bg-slate-900" />
            <div className="absolute right-2 bottom-16 flex flex-col items-center gap-5 z-20">
              <div className="h-6 w-6 bg-slate-700 rounded-full" />
              <div className="h-6 w-6 bg-slate-700 rounded-full" />
              <div className="h-6 w-6 bg-slate-700 rounded-full" />
              <div className="h-6 w-6 bg-slate-700 rounded-full" />
              <div className="h-6 w-6 bg-slate-700 rounded-full" />
            </div>
            <div className="absolute bottom-0 left-0 right-14 p-3 pb-4 z-20 bg-gradient-to-t from-black/90 to-transparent">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-slate-700 shrink-0" />
                <div className="h-3.5 w-24 bg-slate-700 rounded" />
              </div>
              <div className="h-3 w-full bg-slate-700 rounded" />
              <div className="h-3 w-3/4 bg-slate-700 rounded mt-1" />
            </div>
          </div>
        );
      case "facebook":
        return (
          <div className="w-full max-w-[400px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#242526] shadow-md overflow-hidden text-left animate-pulse">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                <div className="space-y-1">
                  <div className="h-3.5 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-2.5 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-5 w-5 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-5 w-5 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
            </div>
            <div className="px-3 pb-2">
              <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded mb-2" />
              <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
            <div className="w-full max-h-[300px] bg-slate-100 dark:bg-slate-900" />
            <div className="px-3 py-2 border-b border-slate-100 dark:border-[#3e4042]">
              <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          </div>
        );
      case "pinterest":
        return (
          <div className="w-full max-w-[250px] flex flex-col gap-2.5 mx-auto animate-pulse">
            <div className="relative rounded-[24px] overflow-hidden bg-slate-100 dark:bg-slate-800/50 group max-h-[320px] aspect-[2/3] flex items-center justify-center border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="w-full h-full bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="flex flex-col gap-1 px-1">
              <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="flex items-center gap-2 mt-1">
                <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
            </div>
          </div>
        );
      default:
        return <div className="animate-pulse h-64 bg-slate-200 dark:bg-slate-800 rounded-xl" />;
    }
  };

  // Error/Disconnected state
  const renderErrorState = () => {
    const platformLabels: Record<string, string> = {
      instagram: "Instagram",
      linkedin: "LinkedIn",
      x: "X (Twitter)",
      tiktok: "TikTok",
      youtube: "YouTube",
      facebook: "Facebook",
      pinterest: "Pinterest",
    };

    const platformLabel = platformLabels[platformKey] || platformKey;

    if (!isConnected) {
      return (
        <div className="w-full max-w-[400px] rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-8 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <UserX className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            {platformLabel} Not Connected
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-xs mx-auto">
            Connect your {platformLabel} account to see live preview with your real profile picture and username.
          </p>
          <button
            onClick={fetchProfile}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Connection
          </button>
        </div>
      );
    }

    if (isTokenExpired) {
      return (
        <div className="w-full max-w-[400px] rounded-xl border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-8 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            {platformLabel} Token Expired
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-xs mx-auto">
            Your {platformLabel} access token has expired. Please reconnect your account to restore live preview.
          </p>
          <button
            onClick={fetchProfile}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Reconnect Account
          </button>
        </div>
      );
    }

    if (error && (!profile || (!profile.username && !profile.displayName))) {
      return (
        <div className="w-full max-w-[400px] rounded-xl border-2 border-dashed border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-8 text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-rose-600 dark:text-rose-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Failed to Load {platformLabel} Profile
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-xs mx-auto">
            {error}
          </p>
          <button
            onClick={fetchProfile}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/30 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      );
    }

    return null;
  };

  // Render the actual preview component with live profile data
  const renderPreview = () => {
    if (!profile) return null;

    const userName = profile.displayName || profile.username || "Unknown User";
    const userImage = profile.avatarUrl;
    const userHandle = profile.username ? (profile.username.startsWith("@") ? profile.username : `@${profile.username}`) : "@unknown";

    const commonProps = {
      currentFormatName,
      displayImageUrl,
      displayImageUrls,
      displayOverlayTexts,
      activeSlideIdx,
      onSlideChange,
      currentCaption,
      isLoading: false,
      isConnected: true,
    };

    // Use a key that includes format name and vertical state to force instant re-render on format switch
    const previewKey = `${platformKey}-${currentFormatName}-${isVertical ? 'vertical' : 'horizontal'}`;

    switch (platformKey) {
      case "instagram":
        return (
          <InstagramPreview
            key={previewKey}
            {...commonProps}
            userName={userName}
            userImage={userImage}
            userHandle={userHandle}
            displayMediaIsVideo={displayMediaIsVideo}
          />
        );
      case "linkedin":
        return (
          <LinkedInPreview
            key={previewKey}
            {...commonProps}
            userName={userName}
            userImage={userImage}
            isVertical={isVertical}
            displayMediaIsVideo={displayMediaIsVideo}
          />
        );
      case "x":
        return (
          <XPreview
            key={previewKey}
            {...commonProps}
            userName={userName}
            userImage={userImage}
            userHandle={userHandle}
            threadPosts={threadPosts}
            displayMediaIsVideo={displayMediaIsVideo}
          />
        );
      case "tiktok":
        return (
          <TikTokPreview
            key={previewKey}
            {...commonProps}
            userName={userName}
            userImage={userImage}
            userHandle={userHandle}
            displayMediaIsVideo={displayMediaIsVideo}
          />
        );
      case "youtube":
        return (
          <YoutubePreview
            key={previewKey}
            {...commonProps}
            userName={userName}
            userImage={userImage}
            displayMediaIsVideo={displayMediaIsVideo}
          />
        );
      case "facebook":
        return (
          <FacebookPreview
            key={previewKey}
            {...commonProps}
            userName={userName}
            userImage={userImage}
            isVertical={isVertical}
            displayMediaIsVideo={displayMediaIsVideo}
          />
        );
      case "pinterest":
        return (
          <PinterestPreview
            key={previewKey}
            {...commonProps}
            userName={userName}
            userImage={userImage}
            isHtmlSlideFormat={isHtmlSlideFormat}
            isCurrentSlideLoading={isCurrentSlideLoading}
            currentHtmlSlide={currentHtmlSlide}
            campaignTopic={campaignTopic}
            displayMediaIsVideo={displayMediaIsVideo}
          />
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return <>{renderSkeleton()}</>;
  }

  const errorState = renderErrorState();
  if (errorState) {
    return <>{errorState}</>;
  }

  return <>{renderPreview()}</>;
}