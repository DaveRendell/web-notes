import { Search } from 'lucide-react';
import { ChangeEvent, KeyboardEvent, useId, useMemo, useRef, useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { getNoteTitle, searchNotes } from '../lib/noteSearch';
import { VaultNode } from '../types/vault';
import { AnimatedPopover } from './AnimatedPopover';

const MAX_RESULTS = 8;

export function NoteSearch() {
  const { notes, recentNotes, selectFile } = useVault();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimeoutRef = useRef<number | null>(null);
  const listboxId = useId();
  const hasQuery = query.trim().length > 0;
  const results = useMemo(
    () => hasQuery ? searchNotes(notes, query) : recentNotes.slice(0, MAX_RESULTS),
    [hasQuery, notes, query, recentNotes],
  );
  const isOpen = isFocused;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setActiveIndex(0);
  }

  function handleFocus() {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
    }

    setIsFocused(true);
  }

  function handleBlur() {
    blurTimeoutRef.current = window.setTimeout(() => setIsFocused(false), 120);
  }

  function chooseNote(note: VaultNode) {
    selectFile(note);
    setQuery('');
    setIsFocused(false);
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
      setIsFocused(false);
    }
  }

  return (
    <div className="note-search">
      <Search className="note-search-icon" size={16} aria-hidden="true" />
      <input
        id="note-search-input"
        aria-autocomplete="list"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-keyshortcuts="Control+K Meta+K"
        aria-label="Search notes by title"
        onBlur={handleBlur}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder="Search notes"
        role="combobox"
        title="Search notes (Ctrl/Cmd+K)"
        type="search"
        value={query}
      />
      <AnimatedPopover className="note-search-results" id={listboxId} isOpen={isOpen} role="listbox">
        {!hasQuery && results.length > 0 && <div className="note-search-results-label">Recent notes</div>}
        {results.length === 0 ? (
          <div className="note-search-empty">{hasQuery ? 'No matching notes' : 'No recent notes'}</div>
        ) : (
          results.map((note, index) => (
            <button
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'note-search-result active' : 'note-search-result'}
              key={note.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseNote(note)}
              role="option"
              type="button"
            >
              <span>{getNoteTitle(note)}</span>
              <small>{note.path}</small>
            </button>
          ))
        )}
      </AnimatedPopover>
    </div>
  );
}
