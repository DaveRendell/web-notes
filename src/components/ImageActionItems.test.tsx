import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ImageActionItems } from './ImageActionItems';
import { createVaultNode } from '../lib/vaultTree';

const actions = vi.hoisted(() => ({ isOnline: true, renameImage: vi.fn(), deleteImage: vi.fn() }));
vi.mock('../contexts/VaultContext', () => ({ useVault: () => actions }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); actions.isOnline = true; });
const image = createVaultNode({ id: 'image', name: 'photo.png', mimeType: 'image/png' }, '');
it('shares rename and confirmed delete actions', async () => {
  vi.spyOn(window, 'prompt').mockReturnValue('new.png');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const close = vi.fn();
  render(<ImageActionItems image={image} onClose={close} />);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Rename image' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(actions.renameImage).toHaveBeenCalledWith(image, 'new.png');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete image' }));
  await waitFor(() => expect(actions.deleteImage).toHaveBeenCalledWith(image));
});
it('does not delete if the user cancels', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<ImageActionItems image={image} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete image' }));
  expect(actions.deleteImage).not.toHaveBeenCalled();
});
it('disables both actions offline', () => {
  actions.isOnline = false;
  render(<ImageActionItems image={image} onClose={vi.fn()} />);
  expect(screen.getAllByRole('menuitem').every((item) => (item as HTMLButtonElement).disabled)).toBe(true);
});
