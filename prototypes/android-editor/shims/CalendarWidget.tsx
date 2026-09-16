import type { CalendarWidgetConfig } from '../../../src/lib/calendarWidget';

// Only the widget's Markdown import/export is under test here. Calendar OAuth
// and native event delivery are separate Phase 0 gates.
export function CalendarWidget({ config }: { config: CalendarWidgetConfig }) {
  return <section aria-label="Calendar widget prototype" className="prototype-calendar-widget">
    Calendar widget · {config.start}–{config.end} · {config.calendars.length} calendars (fake host)
  </section>;
}
