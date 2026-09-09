import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteImage } from './NoteImage';
import { useImages } from '../contexts/ImageContext';

vi.mock('../contexts/ImageContext', () => ({ useImages: vi.fn(() => null) }));
const load = vi.fn();
const services = { images: [], scope: 'account:vault:note', online: true, load, version: () => 'image:version', upload: vi.fn() };

beforeEach(() => {
  vi.mocked(useImages).mockReturnValue(null);
  load.mockReset();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('NoteImage', () => {
  it('loads external images and gracefully handles broken links', () => {
    render(<NoteImage source="https://example.com/photo.png" alt="A photo" />);
    const image = screen.getByRole('img');
    expect(image.getAttribute('src')).toBe('https://example.com/photo.png');
    expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    fireEvent.error(image);
    expect(screen.getByText('Image unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading A photo' }));
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://example.com/photo.png');
  });
  it('never puts unsafe source schemes in an img element', () => {
    const { container } = render(<NoteImage source="javascript:alert(1)" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Image unavailable')).toBeTruthy();
  });
  it('offers retry after a vault download failure without displaying remote error details', async () => {
    vi.mocked(useImages).mockReturnValue(services);
    load.mockRejectedValueOnce(new Error('sensitive remote response')).mockResolvedValueOnce(new Blob(['image']));
    render(<NoteImage source="/photo.png" alt="Photo" />);
    expect(screen.getByRole('status').textContent).toBe('Loading image…');
    fireEvent.click(await screen.findByRole('button', { name: 'Retry loading Photo' }));
    expect(await screen.findByRole('img')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('sensitive remote response')).toBeNull();
  });
  it('does not authenticate or download offline, and retries when connectivity returns', async () => {
    vi.mocked(useImages).mockReturnValue({ ...services, online: false });
    load.mockResolvedValue(new Blob(['image']));
    const { rerender } = render(<NoteImage source="/photo.png" alt="Photo" />);
    expect(screen.getByText('Image unavailable offline')).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
    vi.mocked(useImages).mockReturnValue(services);
    rerender(<NoteImage source="/photo.png" alt="Photo" />);
    await screen.findByRole('img');
    expect(load).toHaveBeenCalledOnce();
  });
  it('revokes object URLs and ignores old downloads after navigation', async () => {
    vi.mocked(useImages).mockReturnValue(services);
    let finish!: (blob: Blob) => void;
    load.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finish = resolve; })).mockResolvedValue(new Blob(['new']));
    const { rerender, unmount } = render(<NoteImage source="/old.png" alt="Old" />);
    rerender(<NoteImage source="/new.png" alt="New" />);
    await screen.findByRole('img');
    await act(async () => finish(new Blob(['old'])));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
  it('does not download again when unrelated provider state changes', async () => {
    vi.mocked(useImages).mockReturnValue(services);
    load.mockResolvedValue(new Blob(['image']));
    const { rerender } = render(<NoteImage source="/photo.png" alt="Photo" />);
    await screen.findByRole('img');
    vi.mocked(useImages).mockReturnValue({ ...services, load: vi.fn() });
    rerender(<NoteImage source="/photo.png" alt="Photo" />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });
});
