/**
 * REGRESSION SUITE — Best-time scheduling window (src/lib/bestPublishTime.ts)
 *
 * CONTRACT: the scheduler only ever suggests TRUE audience-peak windows.
 *   1. TODAY at the peak time when today is a peak day and the slot is still
 *      >= 30 minutes ahead.
 *   2. Otherwise the NEXT day included in spec.days — even when that is a few
 *      days away (e.g. LinkedIn on Sunday -> Tuesday, never Monday).
 *      Low-activity days are NEVER suggested just because they are closer.
 */
import { describe, it, expect } from 'vitest';
import {
  BestTimeSpec,
  getBestTimeSpec,
  getNextBestTime,
  getNextBestTimeFromSpec,
  normalizeAiBestTime,
} from '@/lib/bestPublishTime';

// Tuesday, 1 Sep 2026, 10:00 local
const TUE_10AM = new Date(2026, 8, 1, 10, 0, 0, 0);
// Sunday, 6 Sep 2026, 11:00 local
const SUN_11AM = new Date(2026, 8, 6, 11, 0, 0, 0);

// Calendar-day difference (b - a), ignoring the time of day.
const daysAhead = (a: Date, b: Date) =>
  (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000;

describe('getNextBestTimeFromSpec (true-peak-day contract)', () => {
  const spec: BestTimeSpec = {
    hour: 17,
    minute: 0,
    days: [2, 3, 4], // Tue, Wed, Thu only
    label: '5:00 PM',
    reason: 'test',
  };

  it('uses TODAY when today is a peak day and the slot is still ahead', () => {
    // Tue 10 AM, slot 5 PM -> same day
    const result = getNextBestTimeFromSpec(spec, TUE_10AM);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(8);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(17);
    expect(result.getMinutes()).toBe(0);
  });

  it('skips non-peak days and returns the NEXT TRUE peak day', () => {
    // Sunday, peak days Tue-Thu -> must suggest Tuesday (8 Sep), NOT Monday
    const result = getNextBestTimeFromSpec(spec, SUN_11AM);
    expect(result.getDate()).toBe(8);
    expect(result.getDay()).toBe(2); // Tuesday — a real peak day
    expect(result.getHours()).toBe(17);
    expect(daysAhead(SUN_11AM, result)).toBe(2);
  });

  it('rolls to the next peak day when today\'s slot has already passed', () => {
    // Tue 6 PM — 5 PM slot passed -> Wednesday (next peak day)
    const tueEvening = new Date(2026, 8, 1, 18, 0, 0, 0);
    const result = getNextBestTimeFromSpec(spec, tueEvening);
    expect(result.getDate()).toBe(2); // Wednesday
    expect(result.getDay()).toBe(3);
    expect(result.getHours()).toBe(17);
  });

  it('never suggests a non-peak day, even for narrow AI day lists', () => {
    // AI returned Thursday-only days; on a Sunday the suggestion must be
    // Thursday (10 Sep) — Monday is NOT a peak day and must be skipped.
    const aiSpec: BestTimeSpec = { hour: 9, minute: 0, days: [4], label: '9:00 AM', reason: 'ai' };
    const result = getNextBestTimeFromSpec(aiSpec, SUN_11AM);
    expect(result.getDay()).toBe(4); // Thursday
    expect(result.getDate()).toBe(10);
    expect(result.getHours()).toBe(9);
  });

  it('skips today when the slot is inside the 30-minute lead buffer', () => {
    // Tue 4:45 PM — 5 PM slot is only 15 min away -> Wednesday 5 PM
    const tue445 = new Date(2026, 8, 1, 16, 45, 0, 0);
    const result = getNextBestTimeFromSpec(spec, tue445);
    expect(result.getDate()).toBe(2); // Wednesday
    expect(result.getHours()).toBe(17);
  });

  it('still enforces the 30-minute minimum lead time around midnight', () => {
    const lateNight = new Date(2026, 8, 1, 23, 50, 0, 0); // Tue 11:50 PM
    const midnightSpec: BestTimeSpec = { hour: 0, minute: 0, days: [2, 3], label: '12:00 AM', reason: 'midnight' };
    const result = getNextBestTimeFromSpec(midnightSpec, lateNight);
    // Wed midnight is only 10 min away (inside buffer) -> next peak day slot,
    // and the result must never be in the past or under the 30-minute lead.
    expect(result.getTime()).toBeGreaterThanOrEqual(lateNight.getTime() + 30 * 60 * 1000);
    expect(spec.days.includes(result.getDay()) || midnightSpec.days.includes(result.getDay())).toBe(true);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });
});

describe('getNextBestTime per platform (real peak calendars)', () => {
  it('LinkedIn on Sunday suggests Tuesday, never Monday', () => {
    // LinkedIn peaks Tue-Thu 9 AM
    const result = getNextBestTime('linkedin', SUN_11AM);
    expect(result.getDay()).toBe(2);
    expect(result.getHours()).toBe(9);
  });

  it('YouTube on Sunday suggests TODAY (Sunday is a YouTube peak day)', () => {
    // YouTube peaks Thu-Sun 3 PM
    const result = getNextBestTime('youtube', SUN_11AM);
    expect(result.getDate()).toBe(6); // same day
    expect(result.getHours()).toBe(15);
  });

  it('Instagram on Sunday skips to Tuesday', () => {
    // Instagram peaks Tue-Thu 7 PM
    const result = getNextBestTime('instagram', SUN_11AM);
    expect(result.getDay()).toBe(2);
    expect(result.getHours()).toBe(19);
  });

  it('Facebook on Tuesday with the 5 PM slot ahead suggests today', () => {
    // Facebook peaks Tue-Fri 5 PM
    const result = getNextBestTime('facebook', TUE_10AM);
    expect(result.getDate()).toBe(1); // same day
    expect(result.getHours()).toBe(17);
  });

  it('every platform suggestion lands on one of its peak days', () => {
    const platforms = ['facebook', 'instagram', 'tiktok', 'linkedin', 'x', 'youtube', 'pinterest'];
    for (const platform of platforms) {
      const result = getNextBestTime(platform, SUN_11AM);
      expect(getBestTimeSpec(platform).days).toContain(result.getDay());
      expect(result.getTime()).toBeGreaterThanOrEqual(SUN_11AM.getTime() + 30 * 60 * 1000);
    }
  });
});

describe('normalizeAiBestTime', () => {
  it('clamps garbage AI output into a safe spec', () => {
    const spec = normalizeAiBestTime({ hour: 91, minute: -5, days: [99, -3, 2, 2], reason: '' }, 'instagram');
    expect(spec.hour).toBe(23);
    expect(spec.minute).toBe(0);
    expect(spec.days).toEqual([2]);
    expect(spec.label).toBe('11:00 PM');
    expect(spec.reason).toBe(getBestTimeSpec('instagram').reason);
  });

  it('keeps valid AI output and rebuilds the label', () => {
    const spec = normalizeAiBestTime({ hour: 9, minute: 30, days: [1, 2], reason: 'Monday morning spikes' }, 'facebook');
    expect(spec.hour).toBe(9);
    expect(spec.minute).toBe(30);
    expect(spec.days).toEqual([1, 2]);
    expect(spec.label).toBe('9:30 AM');
    expect(spec.reason).toBe('Monday morning spikes');
  });
});
