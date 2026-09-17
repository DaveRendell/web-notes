import { afterEach, describe, expect, it, vi } from 'vitest';
import { listGoogleCalendarEvents, listGoogleCalendars, zonedDayBoundary } from './googleCalendar';

afterEach(() => vi.unstubAllGlobals());

describe('Google Calendar API', () => {
  it('lists readable calendars with primary first and user-facing names', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [
      { id: 'team', summary: 'Team', summaryOverride: 'Work', accessRole: 'reader', backgroundColor: '#123456' },
      { id: 'me', summary: 'Me', primary: true, accessRole: 'owner' },
    ] }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);

    await expect(listGoogleCalendars('token')).resolves.toEqual([
      expect.objectContaining({ id: 'me', primary: true }),
      expect.objectContaining({ id: 'team', summary: 'Work' }),
    ]);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/calendar/v3/users/me/calendarList');
    expect(url.searchParams.get('minAccessRole')).toBe('reader');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('merges calendars, expands recurring events, and reports partial failures', async () => {
    const fetch = vi.fn(async (input: string) => {
      if (input.includes(encodeURIComponent('missing@example.com'))) {
        return new Response(JSON.stringify({ error: { message: 'Calendar not found' } }), { status: 404 });
      }
      return new Response(JSON.stringify({ items: [{
        id: 'event-1', iCalUID: 'shared-event', summary: 'Planning', htmlLink: 'https://calendar.google.com/event?eid=1',
        start: { dateTime: '2026-09-16T10:00:00Z' }, end: { dateTime: '2026-09-16T11:00:00Z' },
      }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    const result = await listGoogleCalendarEvents('token', {
      start: '2026-09-14', end: '2026-09-20', timezone: 'Europe/London', calendars: ['primary', 'missing@example.com'],
    }, [{ id: 'me', summary: 'Personal', primary: true }]);

    expect(result.events).toEqual([expect.objectContaining({ calendarName: 'Personal', summary: 'Planning' })]);
    expect(result.errors).toEqual([{ calendarId: 'missing@example.com', message: 'Calendar not found', status: 404 }]);
    const eventUrl = new URL(fetch.mock.calls[0][0]);
    expect(eventUrl.searchParams.get('singleEvents')).toBe('true');
    expect(eventUrl.searchParams.get('orderBy')).toBe('startTime');
    expect(eventUrl.searchParams.get('timeMin')).toBe('2026-09-13T23:00:00.000Z');
    expect(eventUrl.searchParams.get('timeMax')).toBe('2026-09-20T23:00:00.000Z');
  });

  it('converts date boundaries using the offset at each daylight-saving boundary', () => {
    expect(zonedDayBoundary('2026-03-29', 'Europe/London')).toBe('2026-03-29T00:00:00.000Z');
    expect(zonedDayBoundary('2026-03-30', 'Europe/London')).toBe('2026-03-29T23:00:00.000Z');
  });
});
