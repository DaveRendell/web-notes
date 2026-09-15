import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, type NodeKey } from 'lexical';
import { CalendarDays, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCalendar } from '../contexts/CalendarContext';
import type { CalendarWidgetConfig } from '../lib/calendarWidget';
import { GoogleCalendarError, type GoogleCalendarEvent } from '../lib/googleCalendar';
import { InsertCalendarButton } from './InsertCalendarButton';

export function CalendarWidget({ config, nodeKey }: { config: CalendarWidgetConfig; nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const { connect, hasAccess, loadEvents } = useCalendar();
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [errors, setErrors] = useState<Array<{ calendarId: string; message: string; status?: number }>>([]);
  const [error, setError] = useState('');
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [loading, setLoading] = useState(false);
  const configKey = JSON.stringify(config);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    setNeedsReconnect(false);
    try {
      const result = await loadEvents(config, refresh);
      setEvents(result.events);
      setErrors(result.errors);
      if (result.errors.some(({ status }) => status === 401)) {
        setNeedsReconnect(true);
        setError('Google Calendar access expired. Reconnect to continue.');
      }
    } catch (cause) {
      setNeedsReconnect(cause instanceof GoogleCalendarError && cause.status === 401);
      setError(cause instanceof Error ? cause.message : 'Could not load Google Calendar events.');
    } finally {
      setLoading(false);
    }
  }, [configKey, loadEvents]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setEvents([]);
    setErrors([]);
    setError('');
    setNeedsReconnect(false);
    if (hasAccess) void load();
  }, [configKey, hasAccess, load]);

  const groups = useMemo(() => groupEvents(events, config.timezone), [config.timezone, events]);
  const rangeLabel = formatRange(config);

  return (
    <section className="calendar-widget" contentEditable={false} aria-label={`Calendar events for ${rangeLabel}`}>
      <header>
        <span className="calendar-widget-title"><CalendarDays size={18} /><strong>{rangeLabel}</strong></span>
        <span className="calendar-widget-actions">
          {hasAccess && (
            <button type="button" aria-label="Refresh calendar events" title="Refresh calendar events" disabled={loading} onClick={() => void load(true)}>
              <RefreshCw className={loading ? 'spin' : ''} size={16} />
            </button>
          )}
          <InsertCalendarButton
            actionLabel="Save"
            initialConfig={config}
            label="Edit calendar widget"
            onInsert={(nextConfig) => editor.update(() => {
              const node = $getNodeByKey(nodeKey) as { setConfig?: (value: CalendarWidgetConfig) => void } | null;
              node?.setConfig?.(nextConfig);
            })}
          />
        </span>
      </header>
      {!hasAccess ? (
        <div className="calendar-widget-message">
          <p>Connect Google Calendar to display these events.</p>
          <button type="button" disabled={loading} onClick={async () => {
            setLoading(true); setError('');
            try { await connect(); }
            catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect Google Calendar.'); }
            finally { setLoading(false); }
          }}>{loading && <Loader2 className="spin" size={15} />} Connect Google Calendar</button>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      ) : loading && events.length === 0 ? (
        <p className="calendar-widget-message" role="status"><Loader2 className="spin" size={16} /> Loading events…</p>
      ) : error ? (
        <div className="calendar-widget-message error-text" role="alert"><p>{error}</p><button type="button" onClick={async () => {
          if (!needsReconnect) { void load(true); return; }
          setLoading(true); setError('');
          try { await connect(); }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reconnect Google Calendar.'); }
          finally { setLoading(false); }
        }}>{needsReconnect ? 'Reconnect Calendar' : 'Try again'}</button></div>
      ) : groups.length === 0 && errors.length > 0 ? (
        <p className="calendar-widget-message error-text">Events could not be loaded from the selected calendars.</p>
      ) : groups.length === 0 ? (
        <p className="calendar-widget-message">No events in this date range.</p>
      ) : (
        <div className="calendar-event-groups">
          {groups.map((group) => (
            <section key={group.date} className="calendar-event-group">
              <h4>{group.label}</h4>
              <ul>
                {group.events.map((event) => <CalendarEventRow event={event} key={`${event.calendarId}:${event.id}`} timeZone={config.timezone} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
      {errors.length > 0 && (
        <p className="calendar-widget-warning" role="status">
          Could not load {errors.length === 1 ? 'one calendar' : `${errors.length} calendars`}.
        </p>
      )}
    </section>
  );
}

function CalendarEventRow({ event, timeZone }: { event: GoogleCalendarEvent; timeZone: string }) {
  const time = event.start.date ? 'All day' : new Intl.DateTimeFormat(undefined, {
    hour: 'numeric', minute: '2-digit', timeZone,
  }).format(new Date(event.start.dateTime!));
  return (
    <li>
      <span className="calendar-event-time">{time}</span>
      <span className="calendar-event-dot" style={{ backgroundColor: event.calendarColor }} aria-hidden="true" />
      <span className="calendar-event-details">
        {event.htmlLink ? (
          <a href={event.htmlLink} target="_blank" rel="noreferrer">{event.summary}<ExternalLink size={12} /></a>
        ) : <strong>{event.summary}</strong>}
        <small>{event.calendarName}{event.location ? ` · ${event.location}` : ''}</small>
      </span>
    </li>
  );
}

function groupEvents(events: GoogleCalendarEvent[], timeZone: string) {
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const groups = new Map<string, GoogleCalendarEvent[]>();
  for (const event of events) {
    const date = event.start.date ?? dateInTimeZone(new Date(event.start.dateTime!), timeZone);
    groups.set(date, [...(groups.get(date) ?? []), event]);
  }
  return [...groups].map(([date, groupedEvents]) => ({
    date,
    label: formatter.format(new Date(`${date}T12:00:00Z`)),
    events: groupedEvents,
  }));
}

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatRange(config: CalendarWidgetConfig) {
  const format = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${format.format(new Date(`${config.start}T12:00:00Z`))} – ${format.format(new Date(`${config.end}T12:00:00Z`))}`;
}
