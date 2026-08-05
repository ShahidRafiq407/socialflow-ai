"use client";

import React, { useState, useTransition, useRef } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Globe,
  FileText,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  BrandDNAFormValues,
  saveWorkspaceBrandDNA,
  extractAndApplyBrandDNAFromUrl,
} from "@/actions/brand";

interface BrandDNAHQProps {
  workspaceId: string;
  initialData: BrandDNAFormValues;
}

export function BrandDNAHQ({
  workspaceId,
  initialData,
}: BrandDNAHQProps) {
  const [formData, setFormData] = useState<BrandDNAFormValues>(initialData);
  const [isSaving, startSavingTransition] = useTransition();
  const [isScanning, startScanningTransition] = useTransition();
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to update field & clear save success state
  const updateField = (key: keyof BrandDNAFormValues, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (saveSuccess) setSaveSuccess(false);
  };

  // Handle URL scanning
  const handleScanWebsite = () => {
    if (!formData.website.trim()) return;
    startScanningTransition(async () => {
      try {
        const result = await extractAndApplyBrandDNAFromUrl(
          workspaceId,
          formData.website
        );
        setFormData(result);
        setSaveSuccess(true);
      } catch (error: any) {
        console.error("Scan error:", error);
      }
    });
  };

  // Handle simulated PDF upload & extraction
  const handlePdfUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPdf(true);
    setTimeout(() => {
      // PDF extraction coming soon — for now just acknowledge the upload
      alert(`File "${file.name}" received. PDF extraction feature coming soon. For now, use the "Scan URL" button or fill the form manually.`);
      setIsUploadingPdf(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, 800);
  };

  // Handle Save
  const handleSaveBrandDNA = () => {
    startSavingTransition(async () => {
      try {
        await saveWorkspaceBrandDNA(workspaceId, formData);
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
        }, 4000);
      } catch (error) {
        console.error("Save error:", error);
      }
    });
  };

  return (
    <div className="w-full max-w-4xl mx-auto font-sans pb-16 space-y-6">
      {/* MINIMALIST HEADER */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
          Business Profile &amp; Brand DNA
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Synchronized with your signup profile. AI automatically analyzes your tone, strategy, and audience targeting.
        </p>
      </div>

      {/* OPTIONAL: AI QUICK IMPORT BAR (URL OR PDF DECK) */}
      <Card className="border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 shadow-xs">
        <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                AI Quick Import (Optional)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Paste your website URL or upload a pitch deck PDF to auto-fill the form below.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* URL INPUT & SCAN BUTTON */}
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
              <Input
                type="url"
                value={formData.website}
                onChange={(e) => updateField("website", e.target.value)}
                placeholder="https://smbrobotic.com"
                className="h-8 w-full sm:w-52 text-xs bg-white dark:bg-slate-900"
              />
              <Button
                onClick={handleScanWebsite}
                disabled={isScanning || !formData.website}
                variant="outline"
                className="h-8 px-3 text-xs font-medium border-slate-200 dark:border-slate-700 shrink-0"
              >
                {isScanning ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Globe className="h-3 w-3 mr-1 text-primary" />
                    <span>Scan URL</span>
                  </>
                )}
              </Button>
            </div>

            {/* HIDDEN FILE INPUT & UPLOAD BUTTON */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.ppt,.pptx"
              className="hidden"
            />
            <Button
              type="button"
              onClick={handlePdfUploadClick}
              disabled={isUploadingPdf}
              variant="outline"
              className="h-8 px-3 text-xs font-medium border-slate-200 dark:border-slate-700 shrink-0"
            >
              {isUploadingPdf ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <FileText className="h-3 w-3 mr-1 text-purple-500" />
                  <span>Upload PDF</span>
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SINGLE UNIFIED BUSINESS PROFILE FORM (WITH CLEAN VERTICAL SPACING BETWEEN LABELS & BOXES) */}
      <Card className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardContent className="p-6 sm:p-8 space-y-8">
          {/* SECTION 1: IDENTITY */}
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              General Identity &amp; Positioning
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* COMPANY NAME */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Company / Brand Name
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g., SMB Robotics"
                  className="h-10 text-xs font-medium"
                />
              </div>

              {/* WEBSITE URL */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Website URL
                </label>
                <Input
                  value={formData.website}
                  onChange={(e) => updateField("website", e.target.value)}
                  placeholder="e.g., https://smbrobotic.com"
                  className="h-10 text-xs font-medium"
                />
              </div>

              {/* INDUSTRY */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Industry / Niche
                </label>
                <Input
                  value={formData.industry}
                  onChange={(e) => updateField("industry", e.target.value)}
                  placeholder="e.g., Embedded Systems, IoT & Robotics"
                  className="h-10 text-xs font-medium"
                />
              </div>

              {/* COMPETITORS */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Key Competitors / Reference Benchmarks
                </label>
                <Input
                  value={formData.competitors}
                  onChange={(e) => updateField("competitors", e.target.value)}
                  placeholder="e.g., Arduino Enterprise, Raspberry Pi Industrial"
                  className="h-10 text-xs font-medium"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: AUDIENCE & OFFER */}
          <div className="space-y-5 pt-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              Audience &amp; Value Proposition
            </h2>

            {/* TARGET AUDIENCE */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Target Audience &amp; Ideal Customer
              </label>
              <Input
                value={formData.targetAudience}
                onChange={(e) => updateField("targetAudience", e.target.value)}
                placeholder="e.g., Hardware Founders, IoT Engineers, Automation Architects"
                className="h-10 text-xs font-medium"
              />
            </div>

            {/* WHAT DOES YOUR BUSINESS DO */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                What Does Your Business Do?
              </label>
              <Textarea
                value={formData.missionVision}
                onChange={(e) => updateField("missionVision", e.target.value)}
                placeholder="e.g., Building smart embedded systems, IoT devices, and robotics solutions."
                className="min-h-[85px] text-xs font-medium leading-relaxed"
              />
            </div>
          </div>

          {/* SECTION 3: CONVERSION DRIVERS */}
          <div className="space-y-5 pt-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2.5">
              Conversion Drivers &amp; Differentiators
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* PAIN POINTS */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Customer Pain Points Solved
                </label>
                <Textarea
                  value={formData.painPoints}
                  onChange={(e) => updateField("painPoints", e.target.value)}
                  placeholder="e.g., High prototyping costs, slow hardware development cycles"
                  className="min-h-[80px] text-xs font-medium leading-relaxed"
                />
              </div>

              {/* DIFFERENTIATOR */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Key Differentiator / Why You Win
                </label>
                <Textarea
                  value={formData.differentiator}
                  onChange={(e) => updateField("differentiator", e.target.value)}
                  placeholder="e.g., Proprietary AI-assisted PCB design, 10x faster prototyping"
                  className="min-h-[80px] text-xs font-medium leading-relaxed"
                />
              </div>
            </div>

            {/* DEFAULT CTA */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Default Call-to-Action (CTA Offer)
              </label>
              <Input
                value={formData.ctaOffer}
                onChange={(e) => updateField("ctaOffer", e.target.value)}
                placeholder="e.g., Book a 1-on-1 Strategy Call at smbrobotic.com/demo"
                className="h-10 text-xs font-medium"
              />
            </div>
          </div>
        </CardContent>

        {/* MINIMALIST FOOTER WITH SUCCESS NOTIFICATION */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {saveSuccess ? (
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span>✓ Successfully saved &amp; synced with all agent workflows!</span>
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Synchronized with your onboarding profile across all agent workflows.
              </span>
            )}
          </div>

          <Button
            onClick={handleSaveBrandDNA}
            disabled={isSaving || saveSuccess}
            className={`h-9 px-6 font-medium text-white text-xs gap-2 transition-all shrink-0 ${
              saveSuccess
                ? "bg-emerald-600 hover:bg-emerald-600"
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : saveSuccess ? (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>✓ Profile Saved!</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                <span>Save Business Profile</span>
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
