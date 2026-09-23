import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, type NodeKey } from 'lexical';
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useCalendar } from '../contexts/CalendarContext';
import { formatCalendarEventStart } from '../lib/calendarEventDisplay';
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
      ) : events.length === 0 && errors.length > 0 ? (
        <p className="calendar-widget-message error-text">Events could not be loaded from the selected calendars.</p>
      ) : events.length === 0 ? (
        <p className="calendar-widget-message">No events in this date range.</p>
      ) : (
        <ul className="calendar-event-list">
          {events.map((event) => <CalendarEventRow event={event} key={`${event.calendarId}:${event.id}`} timeZone={config.timezone} />)}
        </ul>
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
  const start = formatCalendarEventStart(event, timeZone);
  return (
    <li>
      <span className="calendar-event-when">{start.date}{start.time ? ` · ${start.time}` : ''}</span>
      <span className="calendar-event-details">
        {event.htmlLink ? (
          <a href={event.htmlLink} target="_blank" rel="noreferrer">{event.summary}</a>
        ) : <strong>{event.summary}</strong>}
      </span>
    </li>
  );
}

function formatRange(config: CalendarWidgetConfig) {
  const format = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${format.format(new Date(`${config.start}T12:00:00Z`))} – ${format.format(new Date(`${config.end}T12:00:00Z`))}`;
}
