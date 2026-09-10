import { MDXEditor, toolbarPlugin, rootEditor$, useCellValue, type MDXEditorMethods } from '@mdxeditor/editor';
import { $getRoot, $isTextNode, type LexicalEditor } from 'lexical';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, useEffect, useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RichInsertImageButton } from './RichInsertImageButton';
import { richEditorEnhancementsPlugin } from './richEditorEnhancements';
import { OPEN_IMAGE_DIALOG_EVENT } from '../lib/slashCommands';

const services = vi.hoisted(() => ({ scope: 'note', online: true, images: [], version: () => '', upload: vi.fn() }));
vi.mock('../contexts/ImageContext', () => ({ useImages: () => services }));
let editor: LexicalEditor;
function Toolbar({ shell }: { shell: React.RefObject<HTMLDivElement | null> }) {
  const root = useCellValue(rootEditor$);
  useEffect(() => { if (root) editor = root; }, [root]);
  return <RichInsertImageButton pasteTarget={shell} disabled={false} />;
}
function Fixture({ methods }: { methods: React.RefObject<MDXEditorMethods | null> }) {
  const shell = useRef<HTMLDivElement>(null);
  return <div ref={shell}><MDXEditor ref={methods} markdown={'First paragraph\n\nSecond paragraph'} plugins={[
    richEditorEnhancementsPlugin({ notes: [], recentNotes: [] }),
    toolbarPlugin({ toolbarContents: () => <Toolbar shell={shell} /> }),
  ]} /></div>;
}
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

async function positionCursor() {
  await act(async () => editor.update(() => {
    const text = $getRoot().getLastDescendant();
    if ($isTextNode(text)) text.select(7, 7);
  }, { discrete: true }));
}
async function displaceCursor() {
  await act(async () => editor.update(() => { $getRoot().selectStart(); }, { discrete: true }));
}
it('inserts from the button at the saved cursor, not the selection after dialog focus', async () => {
  const methods = createRef<MDXEditorMethods>();
  render(<Fixture methods={methods} />);
  await positionCursor();
  fireEvent.click(screen.getByRole('button', { name: 'Insert image' }));
  await displaceCursor();
  fireEvent.change(screen.getByLabelText('External image URL'), { target: { value: 'https://example.com/image.png' } });
  fireEvent.click(screen.getByRole('button', { name: 'Insert URL' }));
  await waitFor(() => expect(methods.current?.getMarkdown()).toContain('Second ![](https://example.com/image.png)paragraph'));
});
it('retains the paste cursor throughout an asynchronous upload', async () => {
  let finish!: (node: { path: string }) => void;
  services.upload.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const methods = createRef<MDXEditorMethods>();
  const { container } = render(<Fixture methods={methods} />);
  await positionCursor();
  fireEvent.paste(container.querySelector('[contenteditable="true"]')!, { clipboardData: { files: [new File(['bytes'], 'image.png', { type: 'image/png' })] } });
  await displaceCursor();
  await act(async () => finish({ path: 'image.png' }));
  await waitFor(() => expect(methods.current?.getMarkdown()).toContain('Second ![](/image.png)paragraph'));
});
it('opens the existing image flow for a slash-command request', async () => {
  const methods = createRef<MDXEditorMethods>();
  const { container } = render(<Fixture methods={methods} />);
  fireEvent(container.firstElementChild!, new CustomEvent(OPEN_IMAGE_DIALOG_EVENT, { bubbles: true }));
  expect((await screen.findByRole('dialog', { name: 'Insert image' })).hasAttribute('open')).toBe(true);
});
