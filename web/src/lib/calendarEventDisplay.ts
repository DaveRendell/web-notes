import type { GoogleCalendarEvent } from './googleCalendar';

export function formatCalendarEventStart(
  event: Pick<GoogleCalendarEvent, 'start'>,
  timeZone: string,
  locale?: string,
) {
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: event.start.date ? 'UTC' : timeZone,
  });

  if (event.start.date) {
    return {
      date: dateFormatter.format(new Date(`${event.start.date}T12:00:00Z`)),
      time: null,
    };
  }

  const start = new Date(event.start.dateTime!);
  return {
    date: dateFormatter.format(start),
    time: new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(start),
  };
}
