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
  AlertCircle,
} from "lucide-react";
import {
  BrandDNAFormValues,
  saveWorkspaceBrandDNA,
  extractAndApplyBrandDNAFromUrl,
  extractAndApplyBrandDNAFromDocument,
} from "@/actions/brand";
import { useFeature } from "@/components/billing/AccessProvider";
import { FeatureGate, FeatureNotice } from "@/components/billing/FeatureLock";

interface BrandDNAHQProps {
  workspaceId: string;
  initialData: BrandDNAFormValues;
}

/**
 * Vercel caps a serverless request body at ~4.5 MB and the file arrives base64-encoded,
 * which costs about a third on top — so the ceiling on real bytes is nearer 3 MB. A
 * brand deck is comfortably inside that; a 20 MB scan is not, and refusing it here with
 * its own size in the message beats a request that dies without one.
 */
const MAX_DOC_BYTES = 3 * 1024 * 1024;

export function BrandDNAHQ({
  workspaceId,
  initialData,
}: BrandDNAHQProps) {
  const [formData, setFormData] = useState<BrandDNAFormValues>(initialData);
  const [isSaving, startSavingTransition] = useTransition();
  const [isScanning, startScanningTransition] = useTransition();
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  // Both quick-import buttons are the same priced action, and on the entry plan it
  // is capped rather than absent. The count is shown before it runs out, because a
  // limit a customer only learns about by hitting it reads as a fault.
  const brandAI = useFeature("brandDna.analyze");
  // Both imports are metered, so both can be refused — for the month's cap, for the
  // plan, or for a file we cannot read. Every one of those refusals arrives as a
  // sentence worth showing, and until this the component logged it and left the
  // button looking broken.
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to update field & clear save success state
  const updateField = (key: keyof BrandDNAFormValues, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (saveSuccess) setSaveSuccess(false);
  };

  // Handle URL scanning
  const handleScanWebsite = () => {
    if (!formData.website.trim()) return;
    setImportError(null);
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
        setImportError(error?.message || "We could not read that website. Check the address and try again.");
      }
    });
  };

  const handlePdfUploadClick = () => {
    fileInputRef.current?.click();
  };

  /**
   * Reads the file in the browser and hands the server a data URL, which is what
   * `parseUploadedFile` already accepts. Nothing is uploaded to storage: the document
   * is read once for its text and never kept.
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setImportError(null);

    if (file.size > MAX_DOC_BYTES) {
      setImportError(
        `${file.name} is ${(file.size / 1048576).toFixed(1)} MB. Uploads are capped at 3 MB — export a smaller version, or scan your website instead.`
      );
      return;
    }

    setIsUploadingPdf(true);
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("The file could not be read from your device."));
        reader.readAsDataURL(file);
      });

      const result = await extractAndApplyBrandDNAFromDocument(workspaceId, {
        name: file.name,
        type: file.type || "application/octet-stream",
        content,
      });
      setFormData(result);
      setSaveSuccess(true);
    } catch (error: any) {
      console.error("Document import error:", error);
      setImportError(error?.message || "We could not read that document. Try a PDF, Word file, or deck.");
    } finally {
      setIsUploadingPdf(false);
    }
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
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                AI Quick Import (Optional)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Paste your website URL, or upload a deck, brief, or PDF to auto-fill the form below.
              </p>
              {typeof brandAI.cap === "number" && brandAI.cap > 0 && (
                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {Math.max(0, brandAI.remaining ?? brandAI.cap)} of {brandAI.cap} brand reads left
                  this period.
                </p>
              )}
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
              <FeatureGate feature="brandDna.analyze" side="bottom">
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
              </FeatureGate>
            </div>

            {/* HIDDEN FILE INPUT & UPLOAD BUTTON */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md"
              className="hidden"
            />
            <FeatureGate feature="brandDna.analyze" side="bottom">
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
                    <span>Upload document</span>
                  </>
                )}
              </Button>
            </FeatureGate>
          </div>
          </div>

          {/* Explains itself in place when the plan or the period's count is the
              reason both buttons above are locked. Renders nothing when they work. */}
          <FeatureNotice feature="brandDna.analyze" />

          {importError && (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-[11px] leading-relaxed text-red-600 dark:text-red-400"
            >
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{importError}</span>
            </p>
          )}
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
