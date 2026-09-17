import type { Root, Text } from 'mdast';
import type { Position } from 'unist';

export type CalendarWidgetConfig = {
  start: string;
  end: string;
  timezone: string;
  calendars: string[];
};

export type CalendarWidgetMdastNode = {
  type: 'calendarWidget';
  config: CalendarWidgetConfig;
  data?: Text['data'];
  position?: Position;
};

declare module 'mdast' {
  interface RootContentMap {
    calendarWidget: CalendarWidgetMdastNode;
  }
}

const CALENDAR_COMMENT_PREFIX = '<!-- web-notes:calendar ';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function calendarWidgetComment(config: CalendarWidgetConfig) {
  const normalized = validateCalendarWidgetConfig(config);
  return `${CALENDAR_COMMENT_PREFIX}${JSON.stringify(normalized)} -->`;
}

export function calendarWidgetInsertion(document: string, from: number, to: number, config: CalendarWidgetConfig) {
  const comment = calendarWidgetComment(config);
  const before = document.slice(0, from);
  const after = document.slice(to);
  const prefix = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = after.length === 0 || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  return { insert: `${prefix}${comment}${suffix}`, cursor: from + prefix.length + comment.length };
}

export function parseCalendarWidgetComment(value: string): CalendarWidgetConfig | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith(CALENDAR_COMMENT_PREFIX) || !trimmed.endsWith('-->')) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(CALENDAR_COMMENT_PREFIX.length, -3).trim()) as unknown;
    return validateCalendarWidgetConfig(parsed);
  } catch {
    return null;
  }
}

export function isCalendarWidgetComment(value: string) {
  return value.trim().startsWith('<!-- web-notes:calendar');
}

export function transformCalendarWidgetComments(tree: Root): Root {
  for (let index = 0; index < tree.children.length; index += 1) {
    const node = tree.children[index] as { type?: string; value?: unknown };
    if (node?.type !== 'html' || typeof node.value !== 'string') continue;
    const config = parseCalendarWidgetComment(node.value);
    if (config) tree.children[index] = { type: 'calendarWidget', config };
  }
  return tree;
}

export function validateCalendarWidgetConfig(value: unknown): CalendarWidgetConfig {
  if (!value || typeof value !== 'object') throw new Error('Calendar widget settings must be an object.');
  const config = value as Partial<CalendarWidgetConfig>;
  if (!isDate(config.start)) throw new Error('Choose a valid calendar start date.');
  if (!isDate(config.end)) throw new Error('Choose a valid calendar end date.');
  if (config.end < config.start) throw new Error('The calendar end date must not be before its start date.');
  if (typeof config.timezone !== 'string' || !isTimeZone(config.timezone)) {
    throw new Error('Choose a valid calendar timezone.');
  }
  if (!Array.isArray(config.calendars) || config.calendars.length === 0) {
    throw new Error('Choose at least one calendar.');
  }
  const calendars = [...new Set(config.calendars.map((calendar) => {
    if (typeof calendar !== 'string' || !calendar.trim() || calendar.includes('--') || /[\r\n]/.test(calendar)) {
      throw new Error('Calendar IDs must be non-empty and cannot contain line breaks.');
    }
    return calendar.trim();
  }))];
  return { start: config.start, end: config.end, timezone: config.timezone, calendars };
}

export function defaultCalendarWidgetConfig(date = new Date()): CalendarWidgetConfig {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return {
    start: localDateString(monday),
    end: localDateString(sunday),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    calendars: ['primary'],
  };
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
