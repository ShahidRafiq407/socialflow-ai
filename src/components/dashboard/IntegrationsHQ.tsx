"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Link2,
  Link2Off,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ExternalLink,
  Clock,
  AlertCircle,
  User,
} from "lucide-react";
import {
  SocialPlatformIntegration,
  disconnectPlatform,
} from "@/actions/integrations";
import { useSearchParams } from "next/navigation";

interface IntegrationsHQProps {
  initialIntegrations: SocialPlatformIntegration[];
}

export function IntegrationsHQ({ initialIntegrations }: IntegrationsHQProps) {
  const [integrations, setIntegrations] =
    useState<SocialPlatformIntegration[]>(initialIntegrations);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Flash messages from OAuth callback
  const successMsg = searchParams.get("success");
  const errorMsg = searchParams.get("error");
  const [showFlash, setShowFlash] = useState(true);

  useEffect(() => {
    if (successMsg || errorMsg) {
      setShowFlash(true);
      const timer = setTimeout(() => setShowFlash(false), 6000);
      return () => clearTimeout(timer);
    }
  }, [successMsg, errorMsg]);

  // Platforms that don't have OAuth support yet
  const comingSoonPlatforms = ["reddit"];

  const handleConnect = (platformKey: string) => {
    // Redirect to OAuth authorize endpoint
    window.location.href = `/api/auth/${platformKey}/authorize`;
  };

  const handleDisconnect = async (platformKey: string) => {
    setLoadingId(platformKey);
    try {
      await disconnectPlatform(platformKey);
      setIntegrations((prev) =>
        prev.map((item) =>
          item.platformKey === platformKey
            ? { ...item, isConnected: false, handle: "", pageName: null }
            : item
        )
      );
    } catch (error) {
      console.error("Error disconnecting:", error);
    } finally {
      setTimeout(() => setLoadingId(null), 500);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto font-sans pb-20 space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Social Media Integrations
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Connect your accounts with one-click OAuth to publish content directly.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>OAuth 2.0 Secure</span>
        </div>
      </div>

      {/* FLASH MESSAGES (from OAuth redirect) */}
      {showFlash && successMsg && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium">{successMsg}</p>
        </div>
      )}

      {showFlash && errorMsg && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      {/* INTEGRATION CARDS */}
      <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {integrations.map((item) => {
            const isLoading = loadingId === item.platformKey;
            const isComingSoon = comingSoonPlatforms.includes(item.platformKey);

            return (
              <div
                key={item.platformKey}
                className={`p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${
                  isComingSoon
                    ? "opacity-50 bg-slate-50/50 dark:bg-slate-900/50"
                    : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                }`}
              >
                {/* LEFT: PLATFORM ICON + INFO */}
                <div className="flex items-start gap-4">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-xs shrink-0 mt-0.5"
                    style={{ backgroundColor: item.color }}
                  >
                    {item.platform.slice(0, 2).toUpperCase()}
                  </div>

                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                        {item.platform}
                      </h3>

                      {item.isConnected ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Connected</span>
                        </span>
                      ) : isComingSoon ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold text-[11px] border border-amber-500/20">
                          <Clock className="h-3 w-3" />
                          <span>Coming Soon</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium text-[11px]">
                          Not Connected
                        </span>
                      )}
                    </div>

                    {/* Connected profile info */}
                    {item.isConnected && (item.handle || item.pageName) && (
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {item.handle && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                            <User className="h-3 w-3 text-slate-400" />
                            {item.handle}
                          </span>
                        )}
                        {item.pageName && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-md">
                            {item.pageName}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed max-w-xl">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* RIGHT: ACTION BUTTON */}
                <div className="w-full sm:w-auto flex justify-end shrink-0">
                  {isComingSoon ? (
                    <Button
                      disabled
                      variant="outline"
                      className="h-9 px-4 text-xs font-semibold rounded-xl opacity-50 cursor-not-allowed"
                    >
                      <Clock className="h-3.5 w-3.5 mr-1.5" />
                      <span>Coming Soon</span>
                    </Button>
                  ) : item.isConnected ? (
                    <Button
                      onClick={() => handleDisconnect(item.platformKey)}
                      disabled={isLoading}
                      variant="outline"
                      className="h-9 px-4 text-xs font-semibold rounded-xl transition-all border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 hover:border-red-300"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          <span>Disconnecting...</span>
                        </>
                      ) : (
                        <>
                          <Link2Off className="h-3.5 w-3.5 mr-1.5" />
                          <span>Disconnect</span>
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleConnect(item.platformKey)}
                      variant="default"
                      className="h-9 px-4 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-2xs transition-all gap-1.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Connect with {item.platform}</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* CALLBACK URL REFERENCE (for developer setup) */}
      <div className="text-xs text-slate-400 dark:text-slate-500 space-y-1 px-2">
        <p className="font-semibold text-slate-500 dark:text-slate-400">OAuth Callback URLs (configure in each platform&apos;s developer portal):</p>
        {integrations
          .filter(i => !comingSoonPlatforms.includes(i.platformKey))
          .map(i => (
            <p key={i.platformKey} className="font-mono text-[11px]">
              {i.platform}: {process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/auth/{i.platformKey}/callback
            </p>
          ))
        }
      </div>
    </div>
  );
}
