import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NoteImage } from './NoteImage';

afterEach(cleanup);
describe('NoteImage', () => {
  it('loads external images and gracefully handles broken links', () => {
    render(<NoteImage source="https://example.com/photo.png" alt="A photo" />);
    const image = screen.getByRole('img');
    expect(image.getAttribute('src')).toBe('https://example.com/photo.png');
    expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    fireEvent.error(image);
    expect(screen.getByText('Image unavailable')).toBeTruthy();
  });
  it('never puts unsafe source schemes in an img element', () => {
    const { container } = render(<NoteImage source="javascript:alert(1)" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Image unavailable')).toBeTruthy();
  });
});
