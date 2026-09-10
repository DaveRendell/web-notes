import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useImages } from '../contexts/ImageContext';
import { imageMarkdown } from '../lib/vaultImages';
import { OPEN_IMAGE_DIALOG_EVENT } from '../lib/slashCommands';

export function InsertImageButton({ onInsert, onOpen, disabled = false, pasteTarget }: { onInsert: (markdown: string) => void; onOpen?: () => void; disabled?: boolean; pasteTarget?: RefObject<HTMLDivElement | null> }) {
  const services = useImages();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const inserted = useRef(false);
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const scopeRef = useRef(services?.scope);
  scopeRef.current = services?.scope;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function upload(file: File) {
    if (!services || busyRef.current) return;
    if (!services.online) { setError('Reconnect to the internet before uploading an image.'); return; }
    const scope = services.scope;
    busyRef.current = true;
    setBusy(true); setError('');
    try {
      const image = await services.upload(file);
      if (mounted.current && scopeRef.current === scope) insert(imageMarkdown(`/${image.path}`, alt));
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const uploadRef = useRef(upload);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  uploadRef.current = upload;
  useEffect(() => {
    const target = pasteTarget?.current;
    if (!target || disabled) return;
    const paste = (event: ClipboardEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[contenteditable="true"], .cm-content') || dialog.current?.contains(event.target)) return;
      const file = Array.from(event.clipboardData?.items ?? []).find((item) => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
        ?? Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      event.stopPropagation();
      if (busyRef.current) return;
      inserted.current = false;
      onOpenRef.current?.();
      dialog.current?.showModal();
      void uploadRef.current(file);
    };
    target.addEventListener('paste', paste, true);
    return () => target.removeEventListener('paste', paste, true);
  }, [disabled, pasteTarget]);
  useEffect(() => {
    const target = pasteTarget?.current;
    if (!target || disabled) return;
    const open = () => trigger.current?.click();
    target.addEventListener(OPEN_IMAGE_DIALOG_EVENT, open);
    return () => target.removeEventListener(OPEN_IMAGE_DIALOG_EVENT, open);
  }, [disabled, pasteTarget]);
  function insert(markdown: string) {
    inserted.current = true;
    dialog.current?.close();
    onInsert(markdown);
  }
  return <>
    <button ref={trigger} type="button" disabled={disabled} aria-label="Insert image" title="Insert image" onMouseDown={(event) => event.preventDefault()} onClick={() => { onOpen?.(); inserted.current = false; setError(''); dialog.current?.showModal(); }}><ImagePlus size={18} /></button>
    <dialog className="image-dialog" ref={dialog} aria-label="Insert image" onClose={() => { if (!inserted.current) trigger.current?.focus(); }} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <form onSubmit={(event) => {
        event.preventDefault();
        try {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
          insert(imageMarkdown(parsed.href, alt));
        } catch { setError('Enter a valid HTTP or HTTPS image URL.'); }
      }}>
        <h2>Insert image</h2>
        <label>Description (alternative text)<input disabled={busy} value={alt} onChange={(event) => setAlt(event.target.value)} /></label>
        <label>External image URL<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
        <button type="submit" disabled={busy || !url}>Insert URL</button>
        <label>Existing vault image<select value={path} onChange={(event) => setPath(event.target.value)}><option value="">Choose an image</option>{services?.images.map((image) => <option key={image.id} value={image.path}>{image.path}</option>)}</select></label>
        <button type="button" disabled={busy || !path} onClick={() => insert(imageMarkdown(`/${path}`, alt))}>Insert vault image</button>
        <label>Upload to this note’s folder (up to 20 MB)<input type="file" accept="image/*" disabled={busy || !services?.online} onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file || !services) return;
          await upload(file);
        }} /></label>
        {busy && <p role="status">Uploading image…</p>}
        {error && <p role="alert" className="error-text">{error}</p>}
        <button type="button" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
      </form>
    </dialog>
  </>;
}
