import type { CalendarWidgetConfig } from './calendarWidget';

const CALENDAR_API_ROOT = 'https://www.googleapis.com/calendar/v3';

export type GoogleCalendarListEntry = {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole?: 'freeBusyReader' | 'reader' | 'writerWithoutPrivateAccess' | 'writer' | 'owner';
  timeZone?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  calendarId: string;
  calendarName: string;
  calendarColor?: string;
  htmlLink?: string;
  iCalUID?: string;
  location?: string;
  summary: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
};

type CalendarListResponse = {
  items?: Array<GoogleCalendarListEntry & { summaryOverride?: string }>;
  nextPageToken?: string;
};

type EventsResponse = {
  items?: Array<Omit<GoogleCalendarEvent, 'calendarId' | 'calendarName' | 'calendarColor'> & { status?: string }>;
  nextPageToken?: string;
};

export class GoogleCalendarError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'GoogleCalendarError';
  }
}

export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const calendars: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      fields: 'nextPageToken,items(id,summary,summaryOverride,primary,backgroundColor,foregroundColor,accessRole,timeZone)',
      maxResults: '250',
      minAccessRole: 'reader',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await calendarFetch<CalendarListResponse>(`${CALENDAR_API_ROOT}/users/me/calendarList?${params}`, accessToken);
    for (const entry of response.items ?? []) {
      if (!entry?.id || !entry.summary) continue;
      calendars.push({ ...entry, summary: entry.summaryOverride || entry.summary });
    }
    pageToken = response.nextPageToken;
  } while (pageToken);
  return calendars.sort((left, right) => Number(Boolean(right.primary)) - Number(Boolean(left.primary))
    || left.summary.localeCompare(right.summary, undefined, { sensitivity: 'base' }));
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  config: CalendarWidgetConfig,
  calendars: GoogleCalendarListEntry[],
): Promise<{ events: GoogleCalendarEvent[]; errors: Array<{ calendarId: string; message: string; status?: number }> }> {
  const metadata = new Map(calendars.map((calendar) => [calendar.primary ? 'primary' : calendar.id, calendar]));
  const results: Array<{
    events: GoogleCalendarEvent[];
    error: { calendarId: string; message: string; status?: number } | null;
  }> = [];
  for (let index = 0; index < config.calendars.length; index += 4) {
    const batch = await Promise.all(config.calendars.slice(index, index + 4).map(async (calendarId) => {
      const calendar = metadata.get(calendarId) ?? calendars.find((entry) => entry.id === calendarId);
      try {
        return { events: await listOneCalendar(accessToken, calendarId, config, calendar), error: null };
      } catch (error) {
        return {
          events: [],
          error: {
            calendarId,
            message: error instanceof Error ? error.message : 'Could not load this calendar.',
            status: error instanceof GoogleCalendarError ? error.status : undefined,
          },
        };
      }
    }));
    results.push(...batch);
  }
  const events = deduplicateEvents(results.flatMap((result) => result.events));
  events.sort((left, right) => eventStart(left).localeCompare(eventStart(right)) || left.summary.localeCompare(right.summary));
  return { events, errors: results.flatMap((result) => result.error ? [result.error] : []) };
}

async function listOneCalendar(
  accessToken: string,
  calendarId: string,
  config: CalendarWidgetConfig,
  calendar?: GoogleCalendarListEntry,
) {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      fields: 'nextPageToken,items(id,iCalUID,summary,location,htmlLink,status,start(date,dateTime),end(date,dateTime))',
      maxResults: '2500',
      orderBy: 'startTime',
      showDeleted: 'false',
      singleEvents: 'true',
      timeMin: zonedDayBoundary(config.start, config.timezone),
      timeMax: zonedDayBoundary(addDays(config.end, 1), config.timezone),
      timeZone: config.timezone,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await calendarFetch<EventsResponse>(
      `${CALENDAR_API_ROOT}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      accessToken,
    );
    for (const event of response.items ?? []) {
      if (!event?.id || event.status === 'cancelled' || (!event.start?.date && !event.start?.dateTime)) continue;
      events.push({
        ...event,
        calendarId,
        calendarName: calendar?.summary ?? calendarId,
        calendarColor: calendar?.backgroundColor,
        summary: event.summary?.trim() || 'Busy',
      });
    }
    pageToken = response.nextPageToken;
  } while (pageToken);
  return events;
}

function deduplicateEvents(events: GoogleCalendarEvent[]) {
  const unique = new Map<string, GoogleCalendarEvent>();
  for (const event of events) {
    const key = `${event.iCalUID ?? `${event.calendarId}:${event.id}`}|${eventStart(event)}`;
    if (!unique.has(key)) unique.set(key, event);
  }
  return [...unique.values()];
}

function eventStart(event: GoogleCalendarEvent) {
  return event.start.dateTime ?? `${event.start.date}T00:00:00`;
}

function addDays(date: string, amount: number) {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return result.toISOString().slice(0, 10);
}

// Convert a date-only wall-clock boundary in an IANA time zone to an RFC3339
// instant. A second pass handles offset changes close to daylight-saving edges.
export function zonedDayBoundary(date: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const wallClock = Date.UTC(year, month - 1, day);
  let instant = wallClock;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    instant += wallClock - represented;
  }
  return new Date(instant).toISOString();
}

async function calendarFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new GoogleCalendarError(await calendarErrorMessage(response), response.status);
  return response.json() as Promise<T>;
}

async function calendarErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: { message?: string } };
    return body.error?.message?.trim() || `Google Calendar request failed with ${response.status}.`;
  } catch {
    return `Google Calendar request failed with ${response.status}.`;
  }
}
