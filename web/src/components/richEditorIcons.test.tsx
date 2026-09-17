import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { richEditorIcon } from './richEditorIcons';

describe('richEditorIcon', () => {
  it('renders comfortably sized Lucide toolbar icons', () => {
    const markup = renderToStaticMarkup(richEditorIcon('format_bold'));

    expect(markup).toContain('lucide-bold');
    expect(markup).toContain('width="18"');
    expect(markup).toContain('height="18"');
  });

  it('provides Lucide icons for list and link controls', () => {
    expect(renderToStaticMarkup(richEditorIcon('format_list_checked'))).toContain('lucide-list-todo');
    expect(renderToStaticMarkup(richEditorIcon('link'))).toContain('lucide-link');
  });
});
