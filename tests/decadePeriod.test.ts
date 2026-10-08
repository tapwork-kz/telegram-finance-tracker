import { describe, it, expect } from 'vitest';
import { DecadePeriodService } from '../src/periods/decadePeriodService';
import { getAlmatyParts } from '../src/utils/dates';

describe('DecadePeriodService boundary tests', () => {
  it('calculates exact 3 decades for October 2026', () => {
    const decades = DecadePeriodService.getDecadesForMonth(2026, 10, 'user1');
    expect(decades).toHaveLength(3);

    // Decade 1: 01.10.2026 00:00:00 to 09.10.2026 23:59:59
    expect(decades[0].periodStart).toBe('2026-10-01T00:00:00+05:00');
    expect(decades[0].periodEnd).toBe('2026-10-09T23:59:59+05:00');

    // Decade 2: 10.10.2026 00:00:00 to 19.10.2026 23:59:59
    expect(decades[1].periodStart).toBe('2026-10-10T00:00:00+05:00');
    expect(decades[1].periodEnd).toBe('2026-10-19T23:59:59+05:00');

    // Decade 3: 20.10.2026 00:00:00 to 31.10.2026 23:59:59
    expect(decades[2].periodStart).toBe('2026-10-20T00:00:00+05:00');
    expect(decades[2].periodEnd).toBe('2026-10-31T23:59:59+05:00');
  });

  it('triggers prompt for Decade 1 on October 10th', () => {
    // 2026-10-10 10:00:00 Asia/Almaty (UTC+5 is 05:00:00 UTC)
    const promptDay = new Date(Date.UTC(2026, 9, 10, 5, 0, 0));
    const result = DecadePeriodService.getCurrentOrPromptDecade(promptDay, 'user1');
    expect(result.isPromptDay).toBe(true);
    expect(result.activeDecade.periodType).toBe('decade_1');
    expect(result.activeDecade.periodStart).toBe('2026-10-01T00:00:00+05:00');
    expect(result.activeDecade.periodEnd).toBe('2026-10-09T23:59:59+05:00');
  });

  it('triggers prompt for Decade 2 on October 20th', () => {
    const promptDay = new Date(Date.UTC(2026, 9, 20, 5, 0, 0));
    const result = DecadePeriodService.getCurrentOrPromptDecade(promptDay, 'user1');
    expect(result.isPromptDay).toBe(true);
    expect(result.activeDecade.periodType).toBe('decade_2');
    expect(result.activeDecade.periodStart).toBe('2026-10-10T00:00:00+05:00');
    expect(result.activeDecade.periodEnd).toBe('2026-10-19T23:59:59+05:00');
  });

  it('triggers prompt for Decade 3 on November 1st (for previous month)', () => {
    const promptDay = new Date(Date.UTC(2026, 10, 1, 5, 0, 0));
    const result = DecadePeriodService.getCurrentOrPromptDecade(promptDay, 'user1');
    expect(result.isPromptDay).toBe(true);
    expect(result.activeDecade.periodType).toBe('decade_3');
    expect(result.activeDecade.periodStart).toBe('2026-10-20T00:00:00+05:00');
    expect(result.activeDecade.periodEnd).toBe('2026-10-31T23:59:59+05:00');
  });

  it('correctly maps boundary operations: 09.10 23:59:59 vs 10.10 00:00:00', () => {
    const boundaryDecade1End = new Date('2026-10-09T23:59:59+05:00');
    const boundaryDecade2Start = new Date('2026-10-10T00:00:00+05:00');

    const d1 = DecadePeriodService.findDecadeForDate(boundaryDecade1End);
    const d2 = DecadePeriodService.findDecadeForDate(boundaryDecade2Start);

    expect(d1.periodType).toBe('decade_1');
    expect(d2.periodType).toBe('decade_2');
    expect(d1.id).not.toBe(d2.id);
  });
});
