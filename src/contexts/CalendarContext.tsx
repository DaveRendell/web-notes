import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { CALENDAR_SCOPES } from '../hooks/useGoogleAuth';
import {
  listGoogleCalendarEvents,
  listGoogleCalendars,
  type GoogleCalendarEvent,
  type GoogleCalendarListEntry,
} from '../lib/googleCalendar';
import type { CalendarWidgetConfig } from '../lib/calendarWidget';

const EVENT_CACHE_MS = 5 * 60 * 1000;

type EventResult = {
  events: GoogleCalendarEvent[];
  errors: Array<{ calendarId: string; message: string; status?: number }>;
};

type CalendarContextValue = {
  calendars: GoogleCalendarListEntry[];
  connect: () => Promise<GoogleCalendarListEntry[]>;
  hasAccess: boolean;
  listCalendars: (refresh?: boolean) => Promise<GoogleCalendarListEntry[]>;
  loadEvents: (config: CalendarWidgetConfig, refresh?: boolean) => Promise<EventResult>;
};

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { accessToken, accountId, ensureAccessToken, hasCalendarAccess, invalidateAccessToken, requestCalendarAccess } = useAuth();
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const calendarsRef = useRef(calendars);
  const listPromiseRef = useRef<Promise<GoogleCalendarListEntry[]> | null>(null);
  const eventCacheRef = useRef(new Map<string, { expiresAt: number; promise: Promise<EventResult> }>());
  calendarsRef.current = calendars;

  useEffect(() => {
    setCalendars([]);
    listPromiseRef.current = null;
    eventCacheRef.current.clear();
  }, [accountId]);

  const fetchCalendars = useCallback(async (token: string) => {
    const result = await listGoogleCalendars(token);
    setCalendars(result);
    return result;
  }, []);

  const connect = useCallback(async () => {
    const token = await requestCalendarAccess();
    return fetchCalendars(token);
  }, [fetchCalendars, requestCalendarAccess]);

  const listCalendars = useCallback(async (refresh = false) => {
    if (!hasCalendarAccess || !accessToken) throw new Error('Connect Google Calendar to choose calendars.');
    if (!refresh && calendarsRef.current.length) return calendarsRef.current;
    if (!refresh && listPromiseRef.current) return listPromiseRef.current;
    const promise = ensureAccessToken(CALENDAR_SCOPES).then(fetchCalendars).finally(() => {
      if (listPromiseRef.current === promise) listPromiseRef.current = null;
    });
    listPromiseRef.current = promise;
    return promise;
  }, [accessToken, ensureAccessToken, fetchCalendars, hasCalendarAccess]);

  const loadEvents = useCallback(async (config: CalendarWidgetConfig, refresh = false) => {
    if (!hasCalendarAccess || !accessToken) throw new Error('Connect Google Calendar to display events.');
    const key = JSON.stringify([accountId, config]);
    const cached = eventCacheRef.current.get(key);
    if (!refresh && cached && cached.expiresAt > Date.now()) return cached.promise;
    const promise = (async () => {
      // Do not initiate OAuth from automatic widget loading. A 401 is presented
      // as an explicit reconnect action inside the widget instead.
      const availableCalendars = calendarsRef.current.length
        ? calendarsRef.current
        : await fetchCalendars(accessToken);
      const result = await listGoogleCalendarEvents(accessToken, config, availableCalendars);
      if (result.errors.some(({ status }) => status === 401)) invalidateAccessToken();
      return result;
    })();
    eventCacheRef.current.set(key, { expiresAt: Date.now() + EVENT_CACHE_MS, promise });
    try {
      return await promise;
    } catch (error) {
      eventCacheRef.current.delete(key);
      if (error && typeof error === 'object' && 'status' in error && error.status === 401) invalidateAccessToken();
      throw error;
    }
  }, [accessToken, accountId, fetchCalendars, hasCalendarAccess, invalidateAccessToken]);

  return (
    <CalendarContext.Provider value={{ calendars, connect, hasAccess: hasCalendarAccess, listCalendars, loadEvents }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (!context) throw new Error('useCalendar must be used inside CalendarProvider.');
  return context;
}

export function useOptionalCalendar() {
  return useContext(CalendarContext);
}
