import { createContext, createElement, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import type { CalendarWidgetConfig } from '../../web/src/lib/calendarWidget';
import type { GoogleCalendarEvent, GoogleCalendarListEntry } from '../../web/src/lib/googleCalendar';

type EventResult = { events: GoogleCalendarEvent[]; errors: Array<{ calendarId: string; message: string; status?: number }> };
export type MobileCalendarServices = {
  connected: boolean;
  connect(): Promise<GoogleCalendarListEntry[]>;
  listCalendars(): Promise<GoogleCalendarListEntry[]>;
  loadEvents(config: CalendarWidgetConfig): Promise<EventResult>;
  openExternal(url: string): Promise<void>;
};

type CalendarContextValue = {
  calendars: GoogleCalendarListEntry[];
  connect(): Promise<GoogleCalendarListEntry[]>;
  hasAccess: boolean;
  listCalendars(refresh?: boolean): Promise<GoogleCalendarListEntry[]>;
  loadEvents(config: CalendarWidgetConfig, refresh?: boolean): Promise<EventResult>;
  openExternal(url: string): Promise<void>;
};

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function MobileCalendarProvider({ children, services }: { children: ReactNode; services: MobileCalendarServices }) {
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const eventCache = useRef(new Map<string, { expiresAt: number; value: Promise<EventResult> }>());
  const connect = useCallback(async () => {
    const result = await services.connect();
    setCalendars(result);
    return result;
  }, [services]);
  const listCalendars = useCallback(async (refresh = false) => {
    if (!refresh && calendars.length) return calendars;
    const result = await services.listCalendars();
    setCalendars(result);
    return result;
  }, [calendars, services]);
  const loadEvents = useCallback((config: CalendarWidgetConfig, refresh = false) => {
    const key = JSON.stringify(config);
    const cached = eventCache.current.get(key);
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.value;
    const value = services.loadEvents(config);
    eventCache.current.set(key, { expiresAt: Date.now() + 5 * 60_000, value });
    value.catch(() => eventCache.current.delete(key));
    return value;
  }, [services]);
  return createElement(CalendarContext.Provider, {
    value: { calendars, connect, hasAccess: services.connected, listCalendars, loadEvents, openExternal: services.openExternal },
  }, children);
}

export function useCalendar() {
  const value = useContext(CalendarContext);
  if (!value) throw new Error('Calendar services are unavailable.');
  return value;
}

export function useOptionalCalendar() { return useContext(CalendarContext); }

