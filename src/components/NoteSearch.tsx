import { Search, X } from 'lucide-react';
import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { getNoteTitle, searchNotes } from '../lib/noteSearch';
import { VaultNode } from '../types/vault';
import { AppModal } from './AppModal';

const MAX_RESULTS = 8;

export function NoteSearch() {
  const { notes, recentNotes, selectFile } = useVault();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = query.trim().length > 0;
  const results = useMemo(
    () => hasQuery ? searchNotes(notes, query) : recentNotes.slice(0, MAX_RESULTS),
    [hasQuery, notes, query, recentNotes],
  );

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setActiveIndex(0);
  }

  function openSearch() {
    setActiveIndex(0);
    setIsOpen(true);
  }

  useEffect(() => {
    function handleOpenSearch() {
      setActiveIndex(0);
      setIsOpen(true);
    }
    window.addEventListener('web-notes:open-search', handleOpenSearch);
    return () => window.removeEventListener('web-notes:open-search', handleOpenSearch);
  }, []);

  function chooseNote(note: VaultNode) {
    selectFile(note);
    setQuery('');
    setIsOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      chooseNote(results[activeIndex]);
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }

  return (
    <>
      <button
        className="icon-button"
        id="note-search-trigger"
        type="button"
        onClick={openSearch}
        aria-keyshortcuts="Control+K Meta+K"
        aria-label="Find notes"
        title="Find notes (Ctrl/Cmd+K)"
      >
        <Search size={16} aria-hidden="true" />
      </button>
      <AppModal className="note-search-modal" isOpen={isOpen} onClose={() => setIsOpen(false)} title="Find notes">
        <div className="note-search-input-row">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            id="note-search-input"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-keyshortcuts="Control+K Meta+K"
            aria-label="Find notes by title"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a note name or path…"
            role="combobox"
            type="search"
            value={query}
          />
          <button className="icon-button" type="button" onClick={() => setIsOpen(false)} aria-label="Close search">
            <X size={18} />
          </button>
        </div>
        <div className="note-search-results" role="listbox">
          {!hasQuery && results.length > 0 && <div className="note-search-results-label">Recent notes</div>}
          {results.length === 0 ? (
            <div className="note-search-empty">{hasQuery ? 'No matching notes' : 'No recent notes'}</div>
          ) : (
            results.map((note, index) => (
              <button
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'note-search-result active' : 'note-search-result'}
                key={note.id}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseNote(note)}
                role="option"
                type="button"
              >
                <span>{getNoteTitle(note)}</span>
                <small>{note.path}</small>
              </button>
            ))
          )}
        </div>
      </AppModal>
    </>
  );
}
