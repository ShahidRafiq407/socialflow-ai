"use client";

import React, { useState } from "react";
import {
  Upload,
  Sparkles,
  ImageIcon,
  Trash2,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  Tag,
  ShoppingBag,
  Info,
  Layers,
  Wand2,
  Loader2,
  Calendar,
  Check,
  Edit2,
  X,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PlatformCapability } from "@/lib/capabilities/platformCapabilities";
import VideoPreviewPlayer from "@/components/ui/VideoPreviewPlayer";

interface PinterestPinEditorProps {
  capability: PlatformCapability;
  title: string;
  onTitleChange: (val: string) => void;
  description: string;
  onDescriptionChange: (val: string) => void;
  destinationUrl: string;
  onDestinationUrlChange: (val: string) => void;
  board: string;
  onBoardChange: (val: string) => void;
  taggedTopics: string[];
  onTaggedTopicsChange: (topics: string[]) => void;
  altText: string;
  onAltTextChange: (val: string) => void;
  displayImageUrl: string | null;
  onRemoveMedia: () => void;
  onOpenUpload: () => void;
  onOpenStock: () => void;
  onRenderAI: () => void;
  isRenderingMedia: boolean;
  onGenerateCopyAI: () => void;
  isGeneratingCopy: boolean;
  prompt: string;
  onPromptChange: (val: string) => void;
  onEnhancePrompt: () => void;
  isEnhancingPrompt: boolean;
  isVideo?: boolean;
}

export default function PinterestPinEditor({
  capability,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  destinationUrl,
  onDestinationUrlChange,
  board,
  onBoardChange,
  taggedTopics,
  onTaggedTopicsChange,
  altText,
  onAltTextChange,
  displayImageUrl,
  onRemoveMedia,
  onOpenUpload,
  onOpenStock,
  onRenderAI,
  isRenderingMedia,
  onGenerateCopyAI,
  isGeneratingCopy,
  prompt,
  onPromptChange,
  onEnhancePrompt,
  isEnhancingPrompt,
  isVideo = false,
}: PinterestPinEditorProps) {
  // Pinterest Native Form State
  const [topicInput, setTopicInput] = useState("");
  const [publishLater, setPublishLater] = useState(false);
  const [isAiModified, setIsAiModified] = useState(true);
  const [includesAiPerson, setIncludesAiPerson] = useState(false);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(true);
  const [allowComments, setAllowComments] = useState(true);
  const [showSimilarProducts, setShowSimilarProducts] = useState(true);

  // Tag Products State
  const [taggedProducts, setTaggedProducts] = useState<Array<{ id: string; name: string; price: string; url: string }>>([]);
  const [isTagProductDialogOpen, setIsTagProductDialogOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductUrl, setNewProductUrl] = useState("");

  const handleAddProduct = () => {
    if (!newProductName.trim()) return;
    const newProd = {
      id: `prod_${Date.now()}`,
      name: newProductName.trim(),
      price: newProductPrice.trim(),
      url: newProductUrl.trim() || destinationUrl || "https://smbrobotic.com",
    };
    setTaggedProducts((prev) => [...prev, newProd]);
    setNewProductName("");
    setNewProductPrice("");
    setNewProductUrl("");
    setIsTagProductDialogOpen(false);
  };

  const handleRemoveProduct = (id: string) => {
    setTaggedProducts((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddTopic = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && topicInput.trim()) {
      e.preventDefault();
      if (!taggedTopics.includes(topicInput.trim())) {
        onTaggedTopicsChange([...taggedTopics, topicInput.trim()]);
      }
      setTopicInput("");
    }
  };

  const handleRemoveTopic = (topic: string) => {
    onTaggedTopicsChange(taggedTopics.filter((t) => t !== topic));
  };

  return (
    <div className="space-y-6 text-left">
      {/* HEADER & AI ACTION BAR */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase px-2.5 py-0.5">
            Pinterest {capability.format}
          </Badge>
          <span className="text-xs text-slate-500 font-medium">
            2:3 Vertical Recommended (1000 × 1500 px)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isGeneratingCopy}
            onClick={onGenerateCopyAI}
            className="h-8 text-xs font-bold gap-1.5 bg-gradient-to-r from-red-600 to-pink-600 hover:opacity-90 text-white shadow-xs"
          >
            {isGeneratingCopy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>Auto-Generate Pin Copy & SEO</span>
          </Button>
        </div>
      </div>

      {/* TWO-COLUMN PINTEREST LAYOUT */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: LARGE PINTEREST MEDIA CONTAINER (MATCHES SCREENSHOT) */}
        <div className="md:col-span-5 space-y-3">
          <div className="relative rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-2 flex flex-col items-center justify-center min-h-[360px] aspect-[2/3] overflow-hidden group shadow-2xs">
            {displayImageUrl ? (
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                {isVideo ? (
                  <VideoPreviewPlayer
                    src={displayImageUrl}
                    className="w-full h-full object-cover rounded-xl"
                    isVertical={true}
                    showAlwaysPlayButton={true}
                  />
                ) : (
                  <img
                    src={displayImageUrl}
                    alt={title || "Pinterest Pin Preview"}
                    className="w-full h-full object-cover rounded-xl"
                  />
                )}

                {/* EDIT/DELETE ACTIONS */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
                  <button
                    type="button"
                    onClick={onOpenUpload}
                    className="p-2 rounded-full bg-black/70 hover:bg-black text-white transition-colors shadow-md"
                    title="Replace Media"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onRemoveMedia}
                    className="p-2 rounded-full bg-black/70 hover:bg-red-600 text-white transition-colors shadow-md"
                    title="Remove Media"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center space-y-3">
                <div className="h-14 w-14 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center mx-auto">
                  <ImageIcon className="h-7 w-7" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-200">Choose a file or drag and drop it here</p>
                  <p className="text-xs text-slate-400 mt-1">We recommend high quality .jpg or .mp4 files under 20MB</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenUpload}
                    className="h-8 text-xs font-bold gap-1 w-full sm:w-auto bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  >
                    <Upload className="h-3.5 w-3.5 text-emerald-500" /> Upload PC
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenStock}
                    className="h-8 text-xs font-bold gap-1 w-full sm:w-auto bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-pink-500" /> Stock Media
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* AI VISUAL PROMPT ENHANCER */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Prompt
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isEnhancingPrompt}
                  onClick={onEnhancePrompt}
                  className="text-[11px] font-semibold text-pink-600 hover:text-pink-700 hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  <span>Enhance Prompt ✨</span>
                </button>
              </div>
            </div>
            <Textarea
              rows={3}
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Describe 2:3 vertical Pin visual style, typography, and aesthetic..."
              className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 font-mono leading-relaxed"
            />
            <Button
              type="button"
              size="sm"
              disabled={isRenderingMedia || !prompt.trim()}
              onClick={onRenderAI}
              className="w-full h-9 text-xs font-bold gap-1.5 bg-red-600 hover:bg-red-700 text-white shadow-xs"
            >
              {isRenderingMedia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span>{isRenderingMedia ? "Generating Pin Visual..." : "Generate Pin Visual"}</span>
            </Button>
          </div>
        </div>

        {/* RIGHT COLUMN: PINTEREST NATIVE FIELDS (MATCHES SCREENSHOT EXACTLY) */}
        <div className="md:col-span-7 space-y-4">
          {/* TITLE */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Title</label>
              <span className="text-[11px] text-slate-400 font-mono">{title.length} / 100</span>
            </div>
            <Input
              value={title}
              maxLength={100}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Tell everyone what your Pin is about"
              className="h-10 text-sm font-semibold rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* DESCRIPTION */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Description</label>
              <span className="text-[11px] text-slate-400 font-mono">{description.length} / 500</span>
            </div>
            <Textarea
              rows={4}
              maxLength={500}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe your Pin"
              className="w-full text-xs sm:text-sm leading-relaxed p-3 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* DESTINATION LINK */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Link</label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                value={destinationUrl}
                onChange={(e) => onDestinationUrlChange(e.target.value)}
                placeholder="Add a link (e.g. https://yourwebsite.com/article)"
                className="h-10 pl-9 text-xs sm:text-sm rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          {/* BOARD SELECTOR */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Board</label>
            <div className="relative">
              <select
                value={board}
                onChange={(e) => onBoardChange(e.target.value)}
                className="w-full h-10 px-3 pr-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 appearance-none focus:ring-2 focus:ring-red-500/20"
              >
                <option value="Smart Robotics & AI">Smart Robotics & AI</option>
                <option value="Tech Inspiration">Tech Inspiration</option>
                <option value="DIY Electronics">DIY Electronics</option>
                <option value="Digital Marketing Strategies">Digital Marketing Strategies</option>
              </select>
              <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* TAGGED TOPICS */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Tagged topics ({taggedTopics.length})
              </label>
              <span className="text-[10px] text-slate-400">Press Enter to add tag</span>
            </div>
            <Input
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={handleAddTopic}
              placeholder="Search for a tag (e.g. Robotics, Artificial Intelligence, Automation)"
              className="h-10 text-xs sm:text-sm rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
            <p className="text-[11px] text-slate-400">Don't worry, people won't see your tags</p>

            {taggedTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {taggedTopics.map((topic, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-full"
                  >
                    <span>{topic}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTopic(topic)}
                      className="hover:text-red-500 ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* TAG PRODUCTS */}
          <div className="pt-1 space-y-2">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">Tag Products</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsTagProductDialogOpen(true)}
              className="h-8 text-xs font-semibold gap-1.5 rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50"
            >
              <ShoppingBag className="h-3.5 w-3.5 text-red-600" />
              <span>Add products</span>
            </Button>

            {taggedProducts.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {taggedProducts.map((prod) => (
                  <div
                    key={prod.id}
                    className="inline-flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-300 px-2.5 py-1 rounded-lg text-xs font-medium"
                  >
                    <ShoppingBag className="h-3 w-3 text-red-600 shrink-0" />
                    <span className="font-bold">{prod.name}</span>
                    {prod.price && <span className="text-[11px] text-red-600 dark:text-red-400 font-mono">({prod.price})</span>}
                    <button
                      type="button"
                      onClick={() => handleRemoveProduct(prod.id)}
                      className="hover:text-red-700 ml-1 text-slate-400 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* TOGGLES: PUBLISH LATER & AI MODIFIED (MATCHES SCREENSHOT) */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            {/* PUBLISH AT A LATER DATE */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Publish at a later date</span>
              <button
                type="button"
                onClick={() => setPublishLater(!publishLater)}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  publishLater ? "bg-red-600" : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    publishLater ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* MARK AS AI-MODIFIED */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Mark as AI-Modified</span>
                  <span className="text-[11px] text-slate-400 block">Content that was made completely or partly with AI</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAiModified(!isAiModified)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    isAiModified ? "bg-red-600" : "bg-slate-200 dark:bg-slate-700"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      isAiModified ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {isAiModified && (
                <div className="pl-6 pt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ai-person"
                    checked={includesAiPerson}
                    onChange={(e) => setIncludesAiPerson(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <label htmlFor="ai-person" className="text-xs text-slate-500 dark:text-slate-400">
                    This Pin includes an AI-generated person
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* MORE OPTIONS (COLLAPSIBLE - MATCHES SCREENSHOT) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <button
              type="button"
              onClick={() => setMoreOptionsOpen(!moreOptionsOpen)}
              className="flex items-center justify-between w-full text-xs font-bold text-slate-800 dark:text-slate-200"
            >
              <span>More options</span>
              {moreOptionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {moreOptionsOpen && (
              <div className="space-y-4 pt-1">
                {/* ALLOW COMMENTS */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-700 dark:text-slate-300">Allow people to comment</span>
                  <button
                    type="button"
                    onClick={() => setAllowComments(!allowComments)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                      allowComments ? "bg-red-600" : "bg-slate-200 dark:bg-slate-700"
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        allowComments ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* SHOW SIMILAR PRODUCTS */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-700 dark:text-slate-300">Show similar products</span>
                    <button
                      type="button"
                      onClick={() => setShowSimilarProducts(!showSimilarProducts)}
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                        showSimilarProducts ? "bg-red-600" : "bg-slate-200 dark:bg-slate-700"
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          showSimilarProducts ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    People can shop products similar to what's shown in this Pin using visual search.
                  </p>
                </div>

                {/* ALT TEXT */}
                <div className="space-y-1 pt-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Alt Text</label>
                  <Textarea
                    rows={2}
                    value={altText}
                    onChange={(e) => onAltTextChange(e.target.value)}
                    placeholder="Describe your Pin's visual details"
                    className="w-full text-xs p-2.5 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  />
                  <p className="text-[11px] text-slate-400">
                    This helps people using screen readers understand what your Pin is about.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* TAG PRODUCTS MODAL */}
      {isTagProductDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-red-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Tag Product to Pin</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTagProductDialogOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Product Title / Name</label>
                <Input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. Smart Robotic Gripper Kit"
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Price (optional)</label>
                  <Input
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    placeholder="e.g. $49.99"
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Product URL</label>
                  <Input
                    value={newProductUrl}
                    onChange={(e) => setNewProductUrl(e.target.value)}
                    placeholder="https://smbrobotic.com/..."
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* QUICK PRESET PICKS */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-400">Quick Pick SMB Robotics Products:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { name: "Smart Robot Arm Kit", price: "$299", url: "https://smbrobotic.com" },
                    { name: "AI Vision Sensor", price: "$149", url: "https://smbrobotic.com" },
                    { name: "Industrial Servo Pack", price: "$450", url: "https://smbrobotic.com" },
                    { name: "STEM Learning Bundle", price: "$199", url: "https://smbrobotic.com" },
                  ].map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setNewProductName(p.name);
                        setNewProductPrice(p.price);
                        setNewProductUrl(p.url);
                      }}
                      className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-700 dark:text-slate-300 hover:text-red-600 transition-colors"
                    >
                      + {p.name} ({p.price})
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTagProductDialogOpen(false)}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!newProductName.trim()}
                onClick={handleAddProduct}
                className="h-8 text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
              >
                Add Tag
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
