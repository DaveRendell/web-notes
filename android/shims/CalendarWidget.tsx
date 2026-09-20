import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, type NodeKey } from 'lexical';
import { CalendarDays, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { InsertCalendarButton } from '../../web/src/components/InsertCalendarButton';
import type { CalendarWidgetConfig } from '../../web/src/lib/calendarWidget';
import type { GoogleCalendarEvent } from '../../web/src/lib/googleCalendar';
import { useCalendar } from './CalendarContext';

export function CalendarWidget({ config, nodeKey }: { config: CalendarWidgetConfig; nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const { connect, hasAccess, loadEvents, openExternal } = useCalendar();
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [failures, setFailures] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const configKey = JSON.stringify(config);
  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError('');
    try {
      const result = await loadEvents(config, refresh);
      setEvents(result.events);
      setFailures(result.errors.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Google Calendar events.');
    } finally { setLoading(false); }
  }, [configKey, loadEvents]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setEvents([]); setFailures(0); setError('');
    if (hasAccess) void load();
  }, [configKey, hasAccess, load]);
  const groups = useMemo(() => groupEvents(events, config.timezone), [config.timezone, events]);
  const label = formatRange(config);
  return <section className="calendar-widget" contentEditable={false} aria-label={`Calendar events for ${label}`}>
    <header>
      <span className="calendar-widget-title"><CalendarDays size={18} /><strong>{label}</strong></span>
      <span className="calendar-widget-actions">
        {hasAccess && <button type="button" aria-label="Refresh calendar events" disabled={loading} onClick={() => void load(true)}><RefreshCw className={loading ? 'spin' : ''} size={16} /></button>}
        <InsertCalendarButton actionLabel="Save" initialConfig={config} label="Edit calendar widget" onInsert={(next) => editor.update(() => {
          const node = $getNodeByKey(nodeKey) as { setConfig?: (value: CalendarWidgetConfig) => void } | null;
          node?.setConfig?.(next);
        })} />
      </span>
    </header>
    {!hasAccess ? <div className="calendar-widget-message">
      <p>Connect Google Calendar to display these events.</p>
      <button type="button" disabled={loading} onClick={async () => {
        setLoading(true); setError('');
        try { await connect(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not connect Google Calendar.'); }
        finally { setLoading(false); }
      }}>{loading && <Loader2 className="spin" size={15} />} Connect Google Calendar</button>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div> : loading && events.length === 0 ? <p className="calendar-widget-message" role="status"><Loader2 className="spin" size={16} /> Loading events…</p>
      : error ? <div className="calendar-widget-message error-text" role="alert"><p>{error}</p><button type="button" onClick={() => void load(true)}>Try again</button></div>
        : groups.length === 0 ? <p className="calendar-widget-message">No events in this date range.</p>
          : <div className="calendar-event-groups">{groups.map((group) => <section className="calendar-event-group" key={group.date}>
            <h4>{group.label}</h4><ul>{group.events.map((event) => <li key={`${event.calendarId}:${event.id}`}>
              <span className="calendar-event-time">{eventTime(event, config.timezone)}</span>
              <span className="calendar-event-dot" style={{ backgroundColor: event.calendarColor }} />
              <span className="calendar-event-details">{event.htmlLink
                ? <button className="calendar-event-link" type="button" onClick={() => void openExternal(event.htmlLink!)}>{event.summary}<ExternalLink size={12} /></button>
                : <strong>{event.summary}</strong>}<small>{event.calendarName}{event.location ? ` · ${event.location}` : ''}</small></span>
            </li>)}</ul>
          </section>)}</div>}
    {failures > 0 && <p className="calendar-widget-warning">Could not load {failures === 1 ? 'one calendar' : `${failures} calendars`}.</p>}
  </section>;
}

function eventTime(event: GoogleCalendarEvent, timeZone: string) {
  return event.start.date ? 'All day' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(event.start.dateTime!));
}

function groupEvents(events: GoogleCalendarEvent[], timeZone: string) {
  const groups = new Map<string, GoogleCalendarEvent[]>();
  for (const event of events) {
    const date = event.start.date ?? dateInTimeZone(new Date(event.start.dateTime!), timeZone);
    groups.set(date, [...(groups.get(date) ?? []), event]);
  }
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return [...groups].map(([date, grouped]) => ({ date, label: formatter.format(new Date(`${date}T12:00:00Z`)), events: grouped }));
}

function dateInTimeZone(date: Date, timeZone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatRange(config: CalendarWidgetConfig) {
  const format = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${format.format(new Date(`${config.start}T12:00:00Z`))} – ${format.format(new Date(`${config.end}T12:00:00Z`))}`;
}
