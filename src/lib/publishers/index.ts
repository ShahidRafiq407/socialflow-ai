export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  error?: string;
  platform: string;
}

export type PublisherFunction = (post: any, account: any) => Promise<PublishResult>;

import { publishToFacebook } from './facebook';
import { publishToInstagram } from './instagram';
import { publishToLinkedIn } from './linkedin';
import { publishToX } from './x';
import { publishToYouTube } from './youtube';
import { publishToTikTok } from './tiktok';
import { publishToPinterest } from './pinterest';

export async function publishToPlatformProvider(post: any, account: any): Promise<PublishResult> {
  const platform = account.platform;

  switch (platform) {
    case 'FACEBOOK':
      return publishToFacebook(post, account);
    case 'INSTAGRAM':
      return publishToInstagram(post, account);
    case 'LINKEDIN':
      return publishToLinkedIn(post, account);
    case 'X':
      return publishToX(post, account);
    case 'YOUTUBE':
      return publishToYouTube(post, account);
    case 'TIKTOK':
      return publishToTikTok(post, account);
    case 'PINTEREST':
      return publishToPinterest(post, account);
    default:
      return { success: false, error: `Unsupported platform: ${platform}`, platform };
  }
}
