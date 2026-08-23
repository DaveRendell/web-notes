import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { VaultNode } from '../../types/vault';

const ROOT_VALUE = '__vault_root__';

type MoveNodeDialogProps = {
  destinations: Array<VaultNode | null>;
  isMoving: boolean;
  node: VaultNode;
  onCancel: () => void;
  onMove: (destination: VaultNode | null) => Promise<void>;
};

export function MoveNodeDialog({ destinations, isMoving, node, onCancel, onMove }: MoveNodeDialogProps) {
  const [destinationId, setDestinationId] = useState(() => getDestinationValue(destinations[0]));
  const selectRef = useRef<HTMLSelectElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const destination = useMemo(
    () => destinations.find((item) => getDestinationValue(item) === destinationId),
    [destinationId, destinations],
  );

  useEffect(() => {
    (selectRef.current ?? cancelRef.current)?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !isMoving) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable: HTMLElement[] = [];
    for (const element of [selectRef.current, cancelRef.current, moveRef.current]) {
      if (element && !element.hasAttribute('disabled')) focusable.push(element);
    }
    if (focusable.length === 0) return;

    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusable.length) % focusable.length
      : (currentIndex + 1) % focusable.length;
    event.preventDefault();
    focusable[nextIndex].focus();
  }

  return (
    <div className="move-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !isMoving && onCancel()}>
      <section
        className="move-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-dialog-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="move-dialog-title">Move {node.name}</h2>
        {destinations.length > 0 ? (
          <label>
            Destination
            <select
              ref={selectRef}
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
              disabled={isMoving}
            >
              {destinations.map((item) => (
                <option key={getDestinationValue(item)} value={getDestinationValue(item)}>
                  {item ? item.path : 'Vault root'}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>There are no other valid destinations.</p>
        )}
        <div className="move-dialog-actions">
          <button ref={cancelRef} className="icon-text-button" type="button" onClick={onCancel} disabled={isMoving}>
            Cancel
          </button>
          <button
            ref={moveRef}
            className="primary-button compact"
            type="button"
            disabled={isMoving || destination === undefined}
            onClick={() => destination !== undefined && void onMove(destination)}
          >
            {isMoving ? 'Moving…' : 'Move'}
          </button>
        </div>
      </section>
    </div>
  );
}

function getDestinationValue(destination: VaultNode | null | undefined) {
  return destination ? destination.id : ROOT_VALUE;
}
