import {
  getAlmatyParts,
  formatAlmatyISO,
  MONTH_NAMES_RU,
  MONTH_TITLES_RU
} from '../utils/dates';
import { DecadePeriod, PeriodType } from '../types';

export class DecadePeriodService {
  /**
   * Returns the last day of a given month in a specific year.
   */
  public static getDaysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  /**
   * Computes the decade periods for a given year and month (1-12).
   */
  public static getDecadesForMonth(year: number, month: number, userId: string = 'default'): DecadePeriod[] {
    const pad = (n: number) => String(n).padStart(2, '0');
    const daysInMonth = this.getDaysInMonth(year, month);

    // Decade 1: 1st -> 9th 23:59:59
    const d1Start = formatAlmatyISO(year, month, 1, 0, 0, 0);
    const d1End = formatAlmatyISO(year, month, 9, 23, 59, 59);

    // Decade 2: 10th -> 19th 23:59:59
    const d2Start = formatAlmatyISO(year, month, 10, 0, 0, 0);
    const d2End = formatAlmatyISO(year, month, 19, 23, 59, 59);

    // Decade 3: 20th -> last day of month 23:59:59
    const d3Start = formatAlmatyISO(year, month, 20, 0, 0, 0);
    const d3End = formatAlmatyISO(year, month, daysInMonth, 23, 59, 59);

    const mTitle = MONTH_NAMES_RU[month - 1];

    return [
      {
        id: `${year}-${pad(month)}-decade-1`,
        userId,
        periodStart: d1Start,
        periodEnd: d1End,
        periodType: 'decade_1',
        status: 'waiting',
        year,
        month,
        decadeIndex: 1,
        label: `01–09 ${mTitle}`,
        createdAt: new Date().toISOString()
      },
      {
        id: `${year}-${pad(month)}-decade-2`,
        userId,
        periodStart: d2Start,
        periodEnd: d2End,
        periodType: 'decade_2',
        status: 'waiting',
        year,
        month,
        decadeIndex: 2,
        label: `10–19 ${mTitle}`,
        createdAt: new Date().toISOString()
      },
      {
        id: `${year}-${pad(month)}-decade-3`,
        userId,
        periodStart: d3Start,
        periodEnd: d3End,
        periodType: 'decade_3',
        status: 'waiting',
        year,
        month,
        decadeIndex: 3,
        label: `20–${daysInMonth} ${mTitle}`,
        createdAt: new Date().toISOString()
      }
    ];
  }

  /**
   * Determine which decade is being active or requested on a specific date.
   * Logic:
   *  - On 10th of current month: Request Decade 1 (1–9 of current month)
   *  - On 20th of current month: Request Decade 2 (10–19 of current month)
   *  - On 1st of current month: Request Decade 3 of PREVIOUS month (20–last day of prev month)
   *  - Otherwise (days 2–9): currently in Decade 1
   *  - days 11–19: currently in Decade 2
   *  - days 21–end: currently in Decade 3
   */
  public static getCurrentOrPromptDecade(date: Date = new Date(), userId: string = 'default'): {
    activeDecade: DecadePeriod;
    isPromptDay: boolean;
    promptMessage?: string;
  } {
    const parts = getAlmatyParts(date);
    const { year, month, day } = parts;

    if (day === 10) {
      const decades = this.getDecadesForMonth(year, month, userId);
      return {
        activeDecade: decades[0],
        isPromptDay: true,
        promptMessage: `📊 Финансовый отчёт\nСегодня необходимо загрузить банковские выписки за:\n1–9 число (${MONTH_NAMES_RU[month - 1]}).`
      };
    }

    if (day === 20) {
      const decades = this.getDecadesForMonth(year, month, userId);
      return {
        activeDecade: decades[1],
        isPromptDay: true,
        promptMessage: `📊 Финансовый отчёт\nНеобходимо загрузить выписки за:\n10–19 число (${MONTH_NAMES_RU[month - 1]}).`
      };
    }

    if (day === 1) {
      // 1st of month: report on Decade 3 of previous month!
      let prevYear = year;
      let prevMonth = month - 1;
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      const prevDecades = this.getDecadesForMonth(prevYear, prevMonth, userId);
      const prevLastDay = this.getDaysInMonth(prevYear, prevMonth);
      return {
        activeDecade: prevDecades[2],
        isPromptDay: true,
        promptMessage: `📊 Финансовый отчёт\nНеобходимо загрузить выписки за:\n20–${prevLastDay} число (${MONTH_NAMES_RU[prevMonth - 1]}).`
      };
    }

    // Normal ongoing days:
    const decades = this.getDecadesForMonth(year, month, userId);
    if (day >= 2 && day <= 9) {
      return { activeDecade: decades[0], isPromptDay: false };
    } else if (day >= 11 && day <= 19) {
      return { activeDecade: decades[1], isPromptDay: false };
    } else {
      // day >= 21
      return { activeDecade: decades[2], isPromptDay: false };
    }
  }

  /**
   * Find matching decade for a given date in Asia/Almaty
   */
  public static findDecadeForDate(operationDate: Date | string, userId: string = 'default'): DecadePeriod {
    const dateObj = typeof operationDate === 'string' ? new Date(operationDate) : operationDate;
    const parts = getAlmatyParts(dateObj);
    const decades = this.getDecadesForMonth(parts.year, parts.month, userId);

    if (parts.day <= 9) return decades[0];
    if (parts.day <= 19) return decades[1];
    return decades[2];
  }
}
