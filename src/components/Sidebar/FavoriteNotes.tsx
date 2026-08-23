import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { ChevronRight, FileText, GripVertical, StarOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useVault } from '../../contexts/VaultContext';
import { getVaultNodeDisplayName } from '../../lib/vaultTree';
import type { VaultNode } from '../../types/vault';

const FAVORITE_DRAG_TYPE = 'favorite-note';
const FAVORITE_DROP_TYPE = 'favorite-destination';

export function FavoriteNotes() {
  const {
    favoriteNotes,
    noteIcons,
    reorderFavorite,
    selectFile,
    selectedFile,
    selectedVault,
    toggleFavorite,
  } = useVault();
  const [isOpen, setIsOpen] = useState(true);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ noteId: string; placement: 'before' | 'after' } | null>(null);

  useEffect(() => {
    setIsOpen(true);
  }, [selectedVault?.id]);

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => getFavoriteNoteId(source.data) !== null,
        onDragStart: ({ source }) => setDraggedNoteId(getFavoriteNoteId(source.data)),
        onDropTargetChange: ({ location }) => {
          setDropTarget(getFavoriteDropTarget(location.current.dropTargets[0]?.data));
        },
        onDrop: ({ source, location }) => {
          const noteId = getFavoriteNoteId(source.data);
          const target = getFavoriteDropTarget(location.current.dropTargets[0]?.data);
          setDraggedNoteId(null);
          setDropTarget(null);
          if (noteId && target) reorderFavorite(noteId, target.noteId, target.placement);
        },
      }),
    [reorderFavorite],
  );

  return (
    <section className="favorite-notes" aria-labelledby="favorite-notes-heading">
      <button
        className="favorite-notes-header"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <ChevronRight className={isOpen ? 'chevron open' : 'chevron'} size={14} />
        <span id="favorite-notes-heading">Favourites</span>
        {favoriteNotes.length > 0 && <span className="favorite-count">{favoriteNotes.length}</span>}
      </button>

      {isOpen && (favoriteNotes.length === 0 ? (
        <p className="favorite-notes-empty">Favourite notes will appear here.</p>
      ) : (
        <ul className="favorite-notes-list">
          {favoriteNotes.map((note) => (
            <FavoriteNote
              key={note.id}
              note={note}
              emoji={noteIcons[note.id]}
              isSelected={selectedFile?.id === note.id}
              isDragging={draggedNoteId === note.id}
              dropPlacement={dropTarget?.noteId === note.id ? dropTarget.placement : null}
              onOpen={() => selectFile(note)}
              onRemove={() => toggleFavorite(note.id)}
            />
          ))}
        </ul>
      ))}
    </section>
  );
}

type FavoriteNoteProps = {
  note: VaultNode;
  emoji: string | null | undefined;
  isSelected: boolean;
  isDragging: boolean;
  dropPlacement: 'before' | 'after' | null;
  onOpen: () => void;
  onRemove: () => void;
};

function FavoriteNote({ note, emoji, isSelected, isDragging, dropPlacement, onOpen, onRemove }: FavoriteNoteProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = rowRef.current;
    const dragHandle = handleRef.current;
    if (!element || !dragHandle) return;

    const cleanupDraggable = draggable({
      element,
      dragHandle,
      getInitialData: () => ({ type: FAVORITE_DRAG_TYPE, noteId: note.id }),
    });
    const cleanupDropTarget = dropTargetForElements({
      element,
      canDrop: ({ source }) => getFavoriteNoteId(source.data) !== note.id,
      getData: ({ input }) => ({
        type: FAVORITE_DROP_TYPE,
        noteId: note.id,
        placement: input.clientY < element.getBoundingClientRect().top + element.offsetHeight / 2
          ? 'before'
          : 'after',
      }),
    });

    return () => {
      cleanupDraggable();
      cleanupDropTarget();
    };
  }, [note.id]);

  return (
    <li
      ref={rowRef}
      className={`favorite-note-row${isDragging ? ' dragging' : ''}${dropPlacement ? ` drop-${dropPlacement}` : ''}`}
    >
      <button ref={handleRef} className="favorite-drag-handle" type="button" aria-label={`Reorder ${getVaultNodeDisplayName(note)}`}>
        <GripVertical size={14} />
      </button>
      <button
        className={isSelected ? 'favorite-note selected' : 'favorite-note'}
        type="button"
        onClick={onOpen}
        title={note.path}
      >
        {emoji ? <span className="note-emoji" aria-hidden="true">{emoji}</span> : <FileText size={15} />}
        <span>{getVaultNodeDisplayName(note)}</span>
      </button>
      <button className="favorite-remove" type="button" onClick={onRemove} aria-label={`Remove ${getVaultNodeDisplayName(note)} from favourites`}>
        <StarOff size={14} />
      </button>
    </li>
  );
}

function getFavoriteNoteId(data: Record<string | symbol, unknown>) {
  return data.type === FAVORITE_DRAG_TYPE && typeof data.noteId === 'string' ? data.noteId : null;
}

function getFavoriteDropTarget(
  data: Record<string | symbol, unknown> | undefined,
): { noteId: string; placement: 'before' | 'after' } | null {
  if (
    data?.type !== FAVORITE_DROP_TYPE
    || typeof data.noteId !== 'string'
    || (data.placement !== 'before' && data.placement !== 'after')
  ) return null;

  return { noteId: data.noteId, placement: data.placement as 'before' | 'after' };
}
