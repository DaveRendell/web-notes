import { MDXEditor, type MDXEditorMethods } from '@mdxeditor/editor';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { areMarkdownBodiesSemanticallyEquivalent, checkRichMarkdownCompatibility } from '../lib/markdownEnvelope';
import { richBlockBackgroundPlugin } from './richBlockBackground';
import { richCalendarPlugin } from './richCalendar';

vi.mock('./CalendarWidget', () => ({ CalendarWidget: () => <div data-testid="calendar-widget" /> }));
afterEach(cleanup);

describe('rich calendar blocks', () => {
  const source = '<!-- web-notes:calendar {"start":"2026-09-14","end":"2026-09-20","timezone":"Europe/London","calendars":["primary","team@example.com"]} -->';

  it('is compatible with rich mode and round-trips without changing semantics', async () => {
    const note = `Before\n\n${source}\n\nAfter`;
    expect(checkRichMarkdownCompatibility(note).compatible).toBe(true);
    const ref = createRef<MDXEditorMethods>();
    const { getByTestId } = render(<MDXEditor ref={ref} markdown={note} plugins={[richBlockBackgroundPlugin(), richCalendarPlugin()]} />);
    await waitFor(() => expect(getByTestId('calendar-widget')).not.toBeNull());
    expect(areMarkdownBodiesSemanticallyEquivalent(note, ref.current!.getMarkdown())).toBe(true);
  });

  it('rejects invalid widget comments instead of silently normalizing them', () => {
    const result = checkRichMarkdownCompatibility('<!-- web-notes:calendar {broken} -->');
    expect(result.compatible).toBe(false);
    if (!result.compatible) expect(result.reason).toContain('invalid calendar widget');
  });
});
