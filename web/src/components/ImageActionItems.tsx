import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import type { VaultNode } from '../types/vault';

export function ImageActionItems({ image, onClose }: { image: VaultNode; onClose: () => void }) {
  const { isOnline, renameImage, deleteImage } = useVault();
  const [busy, setBusy] = useState(false);
  async function run(action: 'rename' | 'delete') {
    if (busy) return;
    if (action === 'delete' && !window.confirm(`Delete ${image.name}? Notes referencing this image will show a missing-image placeholder.`)) return;
    const name = action === 'rename' ? window.prompt('Rename image (existing note references are not updated)', image.name) : null;
    if (action === 'rename' && (!name?.trim() || name.trim() === image.name)) return;
    setBusy(true);
    try {
      if (action === 'rename') await renameImage(image, name!);
      else await deleteImage(image);
      onClose();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Image action failed.');
    } finally { setBusy(false); }
  }
  return <>
    <button role="menuitem" type="button" disabled={!isOnline || busy} onClick={() => void run('rename')}><Pencil size={16} /><span>Rename image</span></button>
    <button role="menuitem" type="button" className="danger" disabled={!isOnline || busy} onClick={() => void run('delete')}><Trash2 size={16} /><span>Delete image</span></button>
  </>;
}
