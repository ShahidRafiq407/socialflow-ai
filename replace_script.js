const fs = require('fs');
const path = 'd:/Marketing companay/marketing-ai-saas/src/app/(dashboard)/dashboard/ai-studio/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const startStr = '                      switch (activePlatformTab) {';
const startIdx = content.indexOf(startStr);
const endStr = '                      })()';
const endIdx = content.indexOf(endStr, startIdx);

const newSwitch = `                      switch (activePlatformTab) {
                        case "instagram":
                          return <InstagramPreview currentFormatName={currentFormatName} displayImageUrl={displayImageUrl} displayImageUrls={displayImageUrls} displayOverlayTexts={displayOverlayTexts} activeSlideIdx={activeSlideIdx} userName={userName} userImage={userImage} userHandle={userHandle} currentCaption={currentCaption} />;
                        case "linkedin":
                          return <LinkedInPreview currentFormatName={currentFormatName} displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} currentCaption={currentCaption} />;
                        case "x":
                          return <XPreview displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} userHandle={userHandle} currentCaption={currentCaption} />;
                        case "tiktok":
                          return <TikTokPreview displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} userHandle={userHandle} currentCaption={currentCaption} />;
                        case "youtube":
                          return <YoutubePreview displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} currentCaption={currentCaption} />;
                        case "facebook":
                          return <FacebookPreview displayImageUrl={displayImageUrl} userName={userName} userImage={userImage} currentCaption={currentCaption} isVertical={isVertical} />;
                        case "pinterest":
                          return <PinterestPreview currentFormatName={currentFormatName} isHtmlSlideFormat={isHtmlSlideFormat} isCurrentSlideLoading={isCurrentSlideLoading} currentHtmlSlide={currentHtmlSlide} displayImageUrl={displayImageUrl} campaignTopic={campaignTopic} userName={userName} userImage={userImage} />;
                        default:
                          return null;
                      }
`;

content = content.substring(0, startIdx) + newSwitch + content.substring(endIdx);

const importSearch = 'import { create } from "zustand";';
const importReplace = `import { create } from "zustand";
import InstagramPreview from "@/components/previews/InstagramPreview";
import LinkedInPreview from "@/components/previews/LinkedInPreview";
import XPreview from "@/components/previews/XPreview";
import TikTokPreview from "@/components/previews/TikTokPreview";
import YoutubePreview from "@/components/previews/YoutubePreview";
import FacebookPreview from "@/components/previews/FacebookPreview";
import PinterestPreview from "@/components/previews/PinterestPreview";`;

content = content.replace(importSearch, importReplace);

fs.writeFileSync(path, content);
console.log("Done");
