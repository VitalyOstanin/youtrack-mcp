export function parseDateInput(value: string | number | Date): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Date value must be a finite number");
    }

    return value;
  }

  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid date value: ${value}`);
  }

  return parsed;
}

export function toIsoDateString(value: string | number | Date): string {
  const timestamp = parseDateInput(value);
  const date = new Date(timestamp);

  return date.toISOString().slice(0, 10);
}

export function enumerateDateRange(start: string, end: string): string[] {
  const startTime = parseDateInput(start);
  const endTime = parseDateInput(end);

  if (endTime < startTime) {
    throw new Error("End date cannot be earlier than start date");
  }

  const dates: string[] = [];
  const current = new Date(startTime);

  while (current.getTime() <= endTime) {
    dates.push(toIsoDateString(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

export function isWeekend(dateIso: string): boolean {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const day = date.getUTCDay();

  return day === 0 || day === 6;
}
