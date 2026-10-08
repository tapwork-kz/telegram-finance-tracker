/**
 * Date and Timezone Utilities for Asia/Almaty (UTC+5)
 */

export const DEFAULT_TIMEZONE = 'Asia/Almaty';
export const ALMATY_OFFSET_HOURS = 5;

export interface AlmatyDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Returns year, month, day, hours, minutes, seconds for given date in Asia/Almaty timezone.
 */
export function getAlmatyParts(date: Date = new Date()): AlmatyDateParts {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = parseInt(p.value, 10);
    }
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hours: map.hour % 24,
    minutes: map.minute,
    seconds: map.second
  };
}

/**
 * Formats a Date into Asia/Almaty ISO string representation (e.g. 2026-10-09T23:59:59+05:00)
 */
export function formatAlmatyISO(year: number, month: number, day: number, hours: number, minutes: number, seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}+05:00`;
}

/**
 * Converts ISO string or Date into Date object representing UTC timestamp
 */
export function parseToDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  return new Date(input);
}

/**
 * Format money in KZT: 184520 -> "184 520 ₸"
 */
export function formatMoney(amount: number, currency: string = 'KZT'): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const formatted = Math.round(abs)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  
  const symbol = currency === 'KZT' ? '₸' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'RUB' ? '₽' : currency;
  return `${sign}${formatted} ${symbol}`;
}

/**
 * Format date for display: "01.10–09.10"
 */
export function formatShortDateRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sp = getAlmatyParts(s);
  const ep = getAlmatyParts(e);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(sp.day)}.${pad(sp.month)}–${pad(ep.day)}.${pad(ep.month)}`;
}

/**
 * Month names in Russian
 */
export const MONTH_NAMES_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

export const MONTH_TITLES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];
