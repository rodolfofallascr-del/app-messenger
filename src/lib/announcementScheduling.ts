import { AnnouncementRecord } from '../types/chat';

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parseTimeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.length < 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function partsForTimezone(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { weekday, hour, minute };
}

function isWithinWindow(day: number, minutes: number, windowStart: number, windowEnd: number, daysOfWeek: number[]) {
  const normalizedDays = new Set(daysOfWeek.filter((d) => typeof d === 'number' && d >= 0 && d <= 6));
  if (normalizedDays.size === 0) return false;

  // Normal range (e.g. 07:00 -> 11:00)
  if (windowStart <= windowEnd) {
    if (!normalizedDays.has(day)) return false;
    return minutes >= windowStart && minutes < windowEnd;
  }

  // Overnight range (e.g. 22:00 -> 02:00). Active if:
  // - Today is in days and minutes >= start
  // - Yesterday is in days and minutes < end
  const previousDay = (day + 6) % 7;
  if (normalizedDays.has(day) && minutes >= windowStart) return true;
  if (normalizedDays.has(previousDay) && minutes < windowEnd) return true;
  return false;
}

export function isAnnouncementActiveNow(record: AnnouncementRecord, now: Date, defaultTimezone = 'America/Costa_Rica') {
  if (!record.active) return false;

  const nowMs = now.getTime();
  const startsAt = record.starts_at ? new Date(record.starts_at).getTime() : Number.NaN;
  if (Number.isFinite(startsAt) && nowMs < startsAt) {
    return false;
  }

  if (record.ends_at) {
    const endsAt = new Date(record.ends_at).getTime();
    if (Number.isFinite(endsAt) && nowMs >= endsAt) {
      return false;
    }
  }

  if (!record.is_recurring) {
    return true;
  }

  const daysOfWeek = record.days_of_week ?? [];
  const windowStart = parseTimeToMinutes(record.start_time);
  const windowEnd = parseTimeToMinutes(record.end_time);
  if (windowStart === null || windowEnd === null || daysOfWeek.length === 0) {
    return false;
  }

  const timeZone = record.timezone || defaultTimezone;
  const { weekday, hour, minute } = partsForTimezone(now, timeZone);
  const dayIndex = WEEKDAY_INDEX[weekday] ?? now.getDay();
  const minutes = hour * 60 + minute;
  return isWithinWindow(dayIndex, minutes, windowStart, windowEnd, daysOfWeek);
}

export function normalizeRecurringTimeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;
  const hour = parts[0].padStart(2, '0').slice(-2);
  const minute = parts[1].padStart(2, '0').slice(-2);
  return `${hour}:${minute}`;
}

// Supabase "time" columns accept HH:MM:SS. Keep seconds at 00 for clarity.
export function toSqlTimeLiteral(value: string) {
  const normalized = normalizeRecurringTimeInput(value);
  if (!normalized) return '';
  return normalized.length === 5 ? `${normalized}:00` : normalized;
}
