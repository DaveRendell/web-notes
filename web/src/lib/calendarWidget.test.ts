import { describe, expect, it } from 'vitest';
import {
  calendarWidgetComment,
  calendarWidgetInsertion,
  defaultCalendarWidgetConfig,
  parseCalendarWidgetComment,
  validateCalendarWidgetConfig,
} from './calendarWidget';

describe('calendar widget comments', () => {
  const config = {
    start: '2026-09-14',
    end: '2026-09-20',
    timezone: 'Europe/London',
    calendars: ['primary', 'team@example.com'],
  };

  it('serializes and parses a portable standalone HTML comment', () => {
    const comment = calendarWidgetComment(config);
    expect(comment).toBe('<!-- web-notes:calendar {"start":"2026-09-14","end":"2026-09-20","timezone":"Europe/London","calendars":["primary","team@example.com"]} -->');
    expect(parseCalendarWidgetComment(comment)).toEqual(config);
  });

  it('rejects malformed dates, ranges, timezones and empty calendar lists', () => {
    expect(() => validateCalendarWidgetConfig({ ...config, start: '2026-02-30' })).toThrow('valid calendar start');
    expect(() => validateCalendarWidgetConfig({ ...config, end: '2026-09-01' })).toThrow('must not be before');
    expect(() => validateCalendarWidgetConfig({ ...config, timezone: 'Not/AZone' })).toThrow('valid calendar timezone');
    expect(() => validateCalendarWidgetConfig({ ...config, calendars: [] })).toThrow('at least one');
    expect(parseCalendarWidgetComment('<!-- web-notes:calendar {broken} -->')).toBeNull();
  });

  it('defaults to the Monday-to-Sunday week and primary calendar', () => {
    const result = defaultCalendarWidgetConfig(new Date(2026, 8, 16, 12));
    expect(result.start).toBe('2026-09-14');
    expect(result.end).toBe('2026-09-20');
    expect(result.calendars).toEqual(['primary']);
  });

  it('keeps source-mode insertions on a standalone block', () => {
    const result = calendarWidgetInsertion('BeforeAfter', 6, 6, config);
    expect(result.insert).toMatch(/^\n\n<!-- web-notes:calendar .+ -->\n\n$/);
    expect(`BeforeAfter`.slice(0, 6) + result.insert + `BeforeAfter`.slice(6)).toContain('Before\n\n<!-- web-notes:calendar');
  });
});
