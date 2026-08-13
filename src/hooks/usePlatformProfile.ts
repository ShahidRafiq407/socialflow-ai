"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchPlatformProfile, PlatformProfile } from "@/actions/fetch-profile";

interface UsePlatformProfileResult {
  profile: PlatformProfile | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch real-time platform profile data with skeleton loading state
 */
export function usePlatformProfile(platformKey: string): UsePlatformProfileResult {
  const [profile, setProfile] = useState<PlatformProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchPlatformProfile(platformKey);
      setProfile(data);
      if (data.error) {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch profile");
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [platformKey]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    isLoading,
    error,
    refetch: fetchProfile,
  };
}

/**
 * Hook to fetch profiles for multiple platforms in parallel
 */
export function useAllPlatformProfiles(platformKeys: string[]): Record<string, UsePlatformProfileResult> {
  const results: Record<string, UsePlatformProfileResult> = {};

  for (const key of platformKeys) {
    results[key] = usePlatformProfile(key);
  }

  return results;
}