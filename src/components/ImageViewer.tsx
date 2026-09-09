import { useVault } from '../contexts/VaultContext';
import { NoteImage } from './NoteImage';
import { EllipsisVertical, Image } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AnimatedPopover } from './AnimatedPopover';
import { ImageActionItems } from './ImageActionItems';
import { formatImageSize } from '../lib/vaultImages';

export function ImageViewer() {
  const { selectedFile } = useVault();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const pointer = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
      if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener('pointerdown', pointer);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key); };
  }, [open]);
  if (!selectedFile) return null;
  return <main className="viewer image-viewer">
    <header className="image-viewer-header">
      <Image size={20} aria-hidden="true" />
      <span className="image-viewer-name" title={selectedFile.path}>{selectedFile.name}</span>
      <span className="image-viewer-details"><span>{selectedFile.mimeType.startsWith('image/') ? selectedFile.mimeType.slice(6).replace('svg+xml', 'svg').toUpperCase() : selectedFile.name.split('.').at(-1)?.toUpperCase()}</span><span>{formatImageSize(selectedFile.source.size)}</span></span>
      <div className="note-actions-menu" ref={menu}>
        <button className="icon-button" ref={trigger} type="button" aria-label="Image actions" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}><EllipsisVertical size={18} /></button>
        <AnimatedPopover className="header-menu-popover" role="menu" isOpen={open}><ImageActionItems image={selectedFile} onClose={() => { setOpen(false); trigger.current?.focus(); }} /></AnimatedPopover>
      </div>
    </header>
    <div className="image-viewer-content"><NoteImage source={`/${selectedFile.path.split('/').map(encodeURIComponent).join('/')}`} alt={selectedFile.name} /></div>
  </main>;
}
