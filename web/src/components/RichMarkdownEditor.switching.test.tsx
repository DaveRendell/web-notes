import { cleanup, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Model MDXEditor's initial-only markdown prop while keeping its plugins real.
vi.mock('@mdxeditor/editor', async (importOriginal) => {
  const original = await importOriginal<typeof import('@mdxeditor/editor')>();
  const React = await import('react');
  return {
    ...original,
    MDXEditor: React.forwardRef(function InitialOnlyEditor({ markdown }: { markdown: string }, ref) {
      const initial = React.useRef(markdown);
      const element = React.useRef<HTMLDivElement>(null);
      React.useImperativeHandle(ref, () => ({
        setMarkdown(value: string) { element.current!.textContent = value; },
      }), []);
      return <div data-testid="document" ref={element}>{initial.current}</div>;
    }),
  };
});
vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

import RichMarkdownEditor from './RichMarkdownEditor';

afterEach(cleanup);

describe('rich editor content replacement', () => {
  it('replaces the previous document before the parent layout effect (and browser paint)', () => {
    const visibleBeforePaint: string[] = [];
    const onChange = vi.fn();
    function Page({ markdown }: { markdown: string }) {
      useLayoutEffect(() => {
        visibleBeforePaint.push(document.querySelector('[data-testid="document"]')!.textContent!);
      }, [markdown]);
      return <RichMarkdownEditor markdown={markdown} notes={[]} recentNotes={[]}
        onActiveChange={vi.fn()} onActivity={vi.fn()} onChange={onChange}
        onError={vi.fn()} onInitialNormalize={vi.fn()} onSave={vi.fn()} spellCheck={false} />;
    }
    const { rerender } = render(<Page markdown="Previous note" />);
    rerender(<Page markdown="Next note" />);
    rerender(<Page markdown="" />);
    expect(visibleBeforePaint).toEqual(['Previous note', 'Next note', '']);
    expect(onChange).not.toHaveBeenCalled();
  });
});
