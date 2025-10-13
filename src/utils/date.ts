import { DateTime, Settings } from "luxon";

let currentTimezone = "Europe/Moscow";

export function initializeTimezone(timezone: string): void {
  currentTimezone = timezone;
  Settings.defaultZone = timezone;
}

export function getTimezone(): string {
  return currentTimezone;
}

export function parseDateInput(value: string | number | Date): number {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toMillis();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Date value must be a finite number");
    }

    return value;
  }

  const parsed = DateTime.fromISO(value, { zone: currentTimezone });

  if (!parsed.isValid) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return parsed.toMillis();
}

export function toIsoDateString(value: string | number | Date): string {
  const timestamp = parseDateInput(value);

  return DateTime.fromMillis(timestamp).toFormat("yyyy-MM-dd");
}

export function enumerateDateRange(start: string | number | Date, end: string | number | Date): string[] {
  const startTime = DateTime.fromMillis(parseDateInput(start)).startOf("day");
  const endTime = DateTime.fromMillis(parseDateInput(end)).startOf("day");

  if (endTime < startTime) {
    throw new Error("End date cannot be earlier than start date");
  }

  const dates: string[] = [];

  for (let current = startTime; current <= endTime; current = current.plus({ days: 1 })) {
    dates.push(current.toFormat("yyyy-MM-dd"));
  }

  return dates;
}

export function isWeekend(dateIso: string): boolean {
  const date = DateTime.fromISO(dateIso);

  return date.weekday === 6 || date.weekday === 7;
}

export function isHoliday(date: string | number | Date, holidays: Array<string | number | Date> = []): boolean {
  const target = toIsoDateString(date);

  return holidays.some((holiday) => toIsoDateString(holiday) === target);
}

export function filterWorkingDays(
  dates: Array<string | Date | number>,
  excludeWeekends = true,
  excludeHolidays = true,
  holidays: Array<string | Date | number> = [],
): string[] {
  return dates
    .map((value) => toIsoDateString(value))
    .filter((dateIso) => {
      if (excludeWeekends && isWeekend(dateIso)) {
        return false;
      }

      if (excludeHolidays && isHoliday(dateIso, holidays)) {
        return false;
      }

      return true;
    });
}

export function getDayBounds(value: string | number | Date): { start: number; end: number } {
  const date = DateTime.fromMillis(parseDateInput(value));
  const start = date.startOf("day");
  const end = date.endOf("day");

  return { start: start.toMillis(), end: end.toMillis() };
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function calculateTotalMinutes(items: Array<{ duration: { minutes?: number } }>): number {
  return items.reduce((total, item) => total + (item.duration.minutes ?? 0), 0);
}

export function groupWorkItemsByDate<T extends { date: number }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const dateIso = toIsoDateString(item.date);
    const bucket = map.get(dateIso) ?? [];

    bucket.push(item);
    map.set(dateIso, bucket);
  }

  return map;
}

export function validateDateRange(start: string | number | Date, end: string | number | Date): void {
  const startTime = DateTime.fromMillis(parseDateInput(start));
  const endTime = DateTime.fromMillis(parseDateInput(end));

  if (endTime < startTime) {
    throw new Error("Start date must be before or equal to end date");
  }
}

export function isWorkingDay(value: string | number | Date): boolean {
  return !isWeekend(toIsoDateString(value));
}

export function dateToUnixMs(value: string | Date, timezone = currentTimezone): number {
  const source = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(value);
  const zoned = source.setZone(timezone);
  const normalized = zoned.set({ hour: 12, minute: 0, second: 0, millisecond: 0 });

  return normalized.toMillis();
}

export function unixMsToDate(timestamp: number): Date {
  return DateTime.fromMillis(timestamp).toJSDate();
}

export function formatDate(value: string | number | Date): string {
  return toIsoDateString(value);
}

export function formatDateInTimezone(value: string | number | Date, timezone: string): string {
  const timestamp = parseDateInput(value);
  const formatted = DateTime.fromMillis(timestamp).setZone(timezone).toFormat("yyyy-MM-dd");

  return formatted;
}

export function generateDateRange(start: string | number | Date, end: string | number | Date): Date[] {
  const startDate = DateTime.fromMillis(parseDateInput(start)).startOf("day");
  const endDate = DateTime.fromMillis(parseDateInput(end)).startOf("day");

  if (endDate < startDate) {
    throw new Error("End date cannot be earlier than start date");
  }

  const dates: Date[] = [];

  for (let current = startDate; current <= endDate; current = current.plus({ days: 1 })) {
    dates.push(current.toJSDate());
  }

  return dates;
}

export function filterWorkingDates(
  dates: Date[],
  excludeWeekends = true,
  excludeHolidays = true,
  holidays: Date[] = [],
): Date[] {
  return dates.filter((date) => {
    if (excludeWeekends && !isWorkingDay(date)) {
      return false;
    }

    if (excludeHolidays && holidays.some((holiday) => formatDate(holiday) === formatDate(date))) {
      return false;
    }

    return true;
  });
}

export function isSameDay(left: string | number | Date, right: string | number | Date): boolean {
  return formatDate(left) === formatDate(right);
}

export function getCurrentTimestamp(): number {
  return DateTime.now().toMillis();
}

export function getCurrentDate(timezone = currentTimezone): Date {
  return DateTime.now().setZone(timezone).toJSDate();
}
