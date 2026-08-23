export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  liveUrl?: string;
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

export function normalizePlatformToEnum(plat: string): 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'X' | 'YOUTUBE' | 'TIKTOK' | 'PINTEREST' | null {
  if (!plat) return null;
  const p = String(plat).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (p.includes('instagram') || p.includes('igreel') || p.includes('igstory') || p.includes('igpost')) return 'INSTAGRAM';
  if (p.includes('facebook') || p.includes('fbreel') || p.includes('fbpost') || p.includes('fbpage')) return 'FACEBOOK';
  if (p.includes('tiktok')) return 'TIKTOK';
  if (p.includes('youtube') || p.includes('ytshort') || p.includes('ytvideo')) return 'YOUTUBE';
  if (p.includes('linkedin')) return 'LINKEDIN';
  if (p.includes('pinterest') || p.includes('pin')) return 'PINTEREST';
  if (p.includes('twitter') || p === 'x' || p.startsWith('xtweet') || p.startsWith('xpost')) return 'X';
  return null;
}

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
