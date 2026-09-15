import { CalendarDays, Loader2, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOptionalCalendar } from '../contexts/CalendarContext';
import { defaultCalendarWidgetConfig, validateCalendarWidgetConfig, type CalendarWidgetConfig } from '../lib/calendarWidget';
import { OPEN_CALENDAR_DIALOG_EVENT } from '../lib/slashCommands';
import { AppModal } from './AppModal';

export function InsertCalendarButton({
  actionLabel = 'Insert',
  disabled = false,
  initialConfig,
  label = 'Insert calendar',
  onInsert,
  onOpen,
  pasteTarget,
}: {
  actionLabel?: string;
  disabled?: boolean;
  initialConfig?: CalendarWidgetConfig;
  label?: string;
  onInsert: (config: CalendarWidgetConfig) => void;
  onOpen?: () => void;
  pasteTarget?: React.RefObject<HTMLDivElement | null>;
}) {
  const calendarServices = useOptionalCalendar();
  const hasAccess = calendarServices?.hasAccess ?? false;
  const trigger = useRef<HTMLButtonElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(() => initialConfig ?? defaultCalendarWidgetConfig());
  const [manualId, setManualId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = useMemo(() => (calendarServices?.calendars ?? []).map((calendar) => ({
    ...calendar,
    value: calendar.primary ? 'primary' : calendar.id,
  })), [calendarServices?.calendars]);
  const allDiscoveredSelected = options.length > 0 && options.every(({ value }) => config.calendars.includes(value));
  const someDiscoveredSelected = options.some(({ value }) => config.calendars.includes(value));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someDiscoveredSelected && !allDiscoveredSelected;
  }, [allDiscoveredSelected, someDiscoveredSelected]);

  useEffect(() => {
    const target = pasteTarget?.current;
    if (!target || disabled) return;
    const show = () => trigger.current?.click();
    target.addEventListener(OPEN_CALENDAR_DIALOG_EVENT, show);
    return () => target.removeEventListener(OPEN_CALENDAR_DIALOG_EVENT, show);
  }, [disabled, pasteTarget]);

  async function loadCalendarOptions(connectFirst = false) {
    setBusy(true); setError('');
    try {
      if (!calendarServices) throw new Error('Google Calendar is unavailable.');
      const next = connectFirst ? await calendarServices.connect() : await calendarServices.listCalendars();
      if (config.calendars.length === 1 && config.calendars[0] === 'primary' && !next.some((calendar) => calendar.primary)) {
        setConfig((current) => ({ ...current, calendars: next[0] ? [next[0].id] : current.calendars }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load calendars.');
    } finally {
      setBusy(false);
    }
  }

  function toggleCalendar(id: string) {
    setConfig((current) => ({
      ...current,
      calendars: current.calendars.includes(id)
        ? current.calendars.filter((value) => value !== id)
        : [...current.calendars, id],
    }));
  }

  function toggleAllCalendars() {
    const discoveredIds = new Set(options.map(({ value }) => value));
    setConfig((current) => ({
      ...current,
      calendars: allDiscoveredSelected
        ? current.calendars.filter((id) => !discoveredIds.has(id))
        : [...new Set([...current.calendars, ...discoveredIds])],
    }));
  }

  function insert() {
    try {
      const validated = validateCalendarWidgetConfig(config);
      onInsert(validated);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check the calendar settings.');
    }
  }

  return <>
    <button className="rich-toolbar-action" ref={trigger} type="button" disabled={disabled} aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} onClick={() => {
      onOpen?.();
      setConfig(initialConfig ?? defaultCalendarWidgetConfig());
      setError('');
      setOpen(true);
      if (hasAccess) void loadCalendarOptions();
    }}><CalendarDays size={18} /></button>
    <AppModal className="calendar-dialog" isOpen={open} onClose={() => !busy && setOpen(false)} title={label}>
      <div className="calendar-dialog-fields">
        <div className="calendar-date-fields">
          <label>Start date<input type="date" value={config.start} onChange={(event) => setConfig((current) => ({ ...current, start: event.target.value }))} /></label>
          <label>End date<input type="date" value={config.end} onChange={(event) => setConfig((current) => ({ ...current, end: event.target.value }))} /></label>
        </div>
        <label>Timezone<input value={config.timezone} onChange={(event) => setConfig((current) => ({ ...current, timezone: event.target.value }))} /></label>
        {!hasAccess ? (
          <div className="calendar-connect-panel">
            <p>Connect Google Calendar to choose primary, secondary, or shared calendars.</p>
            <button type="button" disabled={busy} onClick={() => void loadCalendarOptions(true)}>
              {busy && <Loader2 className="spin" size={16} />} Connect Google Calendar
            </button>
          </div>
        ) : (
          <fieldset className="calendar-options">
            <legend>Calendars</legend>
            {busy && options.length === 0 && <p role="status"><Loader2 className="spin" size={16} /> Loading calendars…</p>}
            {options.length > 0 && (
              <label className="calendar-select-all">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allDiscoveredSelected}
                  onChange={toggleAllCalendars}
                />
                <span aria-hidden="true" />
                <span>Select all</span>
              </label>
            )}
            {options.map((calendar) => (
              <label key={calendar.id}>
                <input type="checkbox" checked={config.calendars.includes(calendar.value)} onChange={() => toggleCalendar(calendar.value)} />
                <span className="calendar-option-dot" style={{ backgroundColor: calendar.backgroundColor }} />
                <span>{calendar.summary}{calendar.primary ? ' (Primary)' : ''}</span>
              </label>
            ))}
            {config.calendars.filter((id) => !options.some((option) => option.value === id)).map((id) => (
              <div className="calendar-manual-entry" key={id}><span>{id}</span><button type="button" aria-label={`Remove ${id}`} onClick={() => toggleCalendar(id)}><X size={14} /></button></div>
            ))}
            <div className="calendar-manual-add">
              <input value={manualId} onChange={(event) => setManualId(event.target.value)} placeholder="Shared calendar ID" />
              <button type="button" disabled={!manualId.trim()} onClick={() => {
                const id = manualId.trim();
                if (id && !config.calendars.includes(id)) toggleCalendar(id);
                setManualId('');
              }}><Plus size={15} /> Add ID</button>
            </div>
          </fieldset>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="app-modal-actions">
          <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          <button className="primary-button" type="button" onClick={insert} disabled={busy || config.calendars.length === 0}>{actionLabel}</button>
        </div>
      </div>
    </AppModal>
  </>;
}
