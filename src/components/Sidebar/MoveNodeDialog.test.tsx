import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VaultNode } from '../../types/vault';
import { MoveNodeDialog } from './MoveNodeDialog';

afterEach(cleanup);

describe('MoveNodeDialog', () => {
  it('lists root and folder paths and submits the selected destination', async () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    const destination = folder('destination', 'Projects', 'Archive/Projects');
    render(
      <MoveNodeDialog
        node={note('note', 'Note.md', 'Archive/Note.md')}
        destinations={[null, destination]}
        isMoving={false}
        onCancel={vi.fn()}
        onMove={onMove}
      />,
    );

    expect(screen.getByRole('option', { name: 'Vault root' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'destination' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(destination));
  });

  it('closes with Escape when no move is pending', () => {
    const onCancel = vi.fn();
    render(
      <MoveNodeDialog
        node={note('note', 'Note.md', 'Note.md')}
        destinations={[]}
        isMoving={false}
        onCancel={onCancel}
        onMove={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

function note(id: string, name: string, path: string): VaultNode {
  return { id, mimeType: 'text/markdown', name, path, source: { id, mimeType: 'text/markdown', name }, type: 'markdown' };
}

function folder(id: string, name: string, path: string): VaultNode {
  return {
    children: [],
    id,
    mimeType: 'application/vnd.google-apps.folder',
    name,
    path,
    source: { id, mimeType: 'application/vnd.google-apps.folder', name },
    type: 'folder',
  };
}
