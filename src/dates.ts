/** 日付の区切りは日本時間(UTC+9、サマータイムなし)で扱う */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `now` の日本時間での前日を YYYY-MM-DD で返す */
export function previousDateJst(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS - DAY_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 形式かつ実在する日付かを確認する */
export function isValidDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** 日本時間の date 1日分を [since, until) の範囲で返す */
export function dayRangeJst(date: string): { since: Date; until: Date } {
  const since = new Date(`${date}T00:00:00+09:00`);
  return { since, until: new Date(since.getTime() + DAY_MS) };
}
