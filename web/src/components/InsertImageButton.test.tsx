import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InsertImageButton } from './InsertImageButton';

const images = vi.hoisted(() => ({ online: true, scope: 'note', upload: vi.fn(), images: [] }));
vi.mock('../contexts/ImageContext', () => ({ useImages: () => images }));

function PasteEditor({ insert }: { insert: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return <div ref={ref}><div contentEditable suppressContentEditableWarning data-testid="editor" /><InsertImageButton pasteTarget={ref} onInsert={insert} /></div>;
}
function pasteImage() {
  return fireEvent.paste(screen.getByTestId('editor'), { clipboardData: { files: [new File(['bytes'], 'image.png', { type: 'image/png' })] } });
}

beforeEach(() => {
  images.online = true;
  images.upload.mockReset();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);
describe('image insertion dialog', () => {
  it('uploads a pasted image, shows progress, and inserts its vault path', async () => {
    let finish!: (value: { path: string }) => void;
    images.upload.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const insert = vi.fn();
    render(<PasteEditor insert={insert} />);
    expect(pasteImage()).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('Uploading');
    await act(async () => finish({ path: 'assets/image.png' }));
    expect(insert).toHaveBeenCalledWith('![](/assets/image.png)');
  });
  it('leaves ordinary text paste alone and reports offline image pastes', () => {
    images.online = false;
    render(<PasteEditor insert={vi.fn()} />);
    expect(fireEvent.paste(screen.getByTestId('editor'), { clipboardData: { files: [] } })).toBe(true);
    pasteImage();
    expect(screen.getByRole('alert').textContent).toContain('Reconnect');
    expect(images.upload).not.toHaveBeenCalled();
  });
  it('shows upload failures without inserting broken Markdown', async () => {
    images.upload.mockRejectedValue(new Error('Upload failed'));
    const insert = vi.fn();
    render(<PasteEditor insert={insert} />);
    pasteImage();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Upload failed'));
    expect(insert).not.toHaveBeenCalled();
  });
  it('does not insert into another note after navigation', async () => {
    let finish!: (value: { path: string }) => void;
    images.upload.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const insert = vi.fn();
    const view = render(<PasteEditor insert={insert} />);
    pasteImage();
    view.unmount();
    await act(async () => finish({ path: 'image.png' }));
    expect(insert).not.toHaveBeenCalled();
  });
  it('inserts an escaped external image with alternative text', () => {
    const insert = vi.fn();
    render(<InsertImageButton onInsert={insert} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert image' }));
    fireEvent.change(screen.getByLabelText('External image URL'), { target: { value: 'https://example.com/photo.png' } });
    fireEvent.change(screen.getByLabelText('Description (alternative text)'), { target: { value: 'Photo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert URL' }));
    expect(insert).toHaveBeenCalledWith('![Photo](https://example.com/photo.png)');
  });
  it('rejects unsafe URLs without inserting anything', () => {
    const insert = vi.fn();
    render(<InsertImageButton onInsert={insert} />);
    fireEvent.click(screen.getByRole('button', { name: 'Insert image' }));
    fireEvent.change(screen.getByLabelText('External image URL'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert URL' }));
    expect(screen.getByRole('alert').textContent).toContain('HTTP or HTTPS');
    expect(insert).not.toHaveBeenCalled();
  });
});
