// Applies per-exchange calendars; crypto remains available 24/7 by default.
import type { Market } from '../../../src/lib/types';
import { config } from '../config';

export interface SessionEvaluation {
  allowed: boolean;
  scoreMultiplier: number;
  reason: string;
}

function minuteOfDay(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function evaluateMarketSession(
  market: Market,
  timestamp = Date.now(),
  calendars: typeof config.marketSessionCalendar = config.marketSessionCalendar,
): SessionEvaluation {
  if (market.marketType === 'crypto') return { allowed: true, scoreMultiplier: 1, reason: 'Crypto session filter is off; markets trade 24/7.' };

  const calendar = calendars[market.exchange] ?? calendars[market.marketType];
  if (!calendar) return { allowed: false, scoreMultiplier: 0, reason: 'No market-hours calendar is configured; entries are blocked for this market.' };
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: calendar.timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday ?? '');
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  if (calendar.holidays.includes(localDate)) return { allowed: false, scoreMultiplier: 0, reason: `Market is closed for the configured holiday ${localDate}.` };
  if (!calendar.weekdays.includes(weekday)) return { allowed: false, scoreMultiplier: 0, reason: 'Market is closed on this calendar day.' };

  const now = Number(parts.hour) * 60 + Number(parts.minute);
  const open = minuteOfDay(calendar.open);
  const close = minuteOfDay(calendar.close);
  const inSession = close > open ? now >= open && now < close : now >= open || now < close;
  if (!inSession) return { allowed: false, scoreMultiplier: 0, reason: 'Outside the configured market session.' };
  const minutesAfterOpen = (now - open + 1_440) % 1_440;
  const minutesBeforeClose = (close - now + 1_440) % 1_440;
  if (minutesAfterOpen < calendar.openAuctionBlackoutMinutes) return { allowed: false, scoreMultiplier: 0, reason: 'Opening auction blackout is active.' };
  if (minutesBeforeClose <= calendar.closeAuctionBlackoutMinutes) return { allowed: false, scoreMultiplier: 0, reason: 'Closing auction blackout is active.' };
  return { allowed: true, scoreMultiplier: calendar.scoreMultiplier, reason: 'Inside the configured market session.' };
}
