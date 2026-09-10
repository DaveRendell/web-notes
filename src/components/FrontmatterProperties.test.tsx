import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontmatterProperties } from './FrontmatterProperties';

afterEach(cleanup);

describe('FrontmatterProperties', () => {
  it('keeps the note header compact and presents properties in a modal', () => {
    const close = vi.fn();
    render(
      <FrontmatterProperties
        actions={<button type="button">Actions</button>}
        error={null}
        isPropertiesOpen
        onCloseProperties={close}
        properties={[{ key: 'source', value: 'https://example.com/reference' }]}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Note properties' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'https://example.com/reference' });
    expect(link.getAttribute('href')).toBe('https://example.com/reference');
    expect(link.getAttribute('target')).toBe('_blank');

    fireEvent.click(screen.getByRole('button', { name: 'Close properties' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('renders Markdown-style property links as one clickable label', () => {
    render(
      <FrontmatterProperties
        actions={null}
        error={null}
        isPropertiesOpen
        onCloseProperties={() => undefined}
        properties={[{ key: 'source', value: '[Original note](https://example.com/note)' }]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Original note' }).getAttribute('href')).toBe('https://example.com/note');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
