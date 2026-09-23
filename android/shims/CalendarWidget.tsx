import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getNodeByKey, type NodeKey } from 'lexical';
import { CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { InsertCalendarButton } from '../../web/src/components/InsertCalendarButton';
import { formatCalendarEventStart } from '../../web/src/lib/calendarEventDisplay';
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
        : events.length === 0 ? <p className="calendar-widget-message">No events in this date range.</p>
          : <ul className="calendar-event-list">{events.map((event) => {
            const start = formatCalendarEventStart(event, config.timezone);
            return <li key={`${event.calendarId}:${event.id}`}>
              <span className="calendar-event-when">{start.date}{start.time ? ` · ${start.time}` : ''}</span>
              <span className="calendar-event-details">{event.htmlLink
                ? <button className="calendar-event-link" type="button" onClick={() => void openExternal(event.htmlLink!)}>{event.summary}</button>
                : <strong>{event.summary}</strong>}</span>
            </li>;
          })}</ul>}
    {failures > 0 && <p className="calendar-widget-warning">Could not load {failures === 1 ? 'one calendar' : `${failures} calendars`}.</p>}
  </section>;
}

function formatRange(config: CalendarWidgetConfig) {
  const format = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${format.format(new Date(`${config.start}T12:00:00Z`))} – ${format.format(new Date(`${config.end}T12:00:00Z`))}`;
}
