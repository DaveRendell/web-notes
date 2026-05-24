import { Search } from 'lucide-react';
import { ChangeEvent, KeyboardEvent, useId, useMemo, useRef, useState } from 'react';
import { useVault } from '../contexts/VaultContext';
import { VaultNode } from '../types/vault';

const MAX_RESULTS = 8;

export function NoteSearch() {
  const { notes, selectFile } = useVault();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const blurTimeoutRef = useRef<number | null>(null);
  const listboxId = useId();
  const results = useMemo(() => searchNotes(notes, query), [notes, query]);
  const isOpen = isFocused && query.trim().length > 0;

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
        aria-autocomplete="list"
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-label="Search notes by title"
        onBlur={handleBlur}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder="Search notes"
        role="combobox"
        type="search"
        value={query}
      />
      {isOpen && (
        <div className="note-search-results" id={listboxId} role="listbox">
          {results.length === 0 ? (
            <div className="note-search-empty">No matching notes</div>
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
        </div>
      )}
    </div>
  );
}

function searchNotes(notes: VaultNode[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return notes
    .map((note) => ({
      note,
      score: getSearchScore(note, normalizedQuery),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.note.name.localeCompare(b.note.name))
    .slice(0, MAX_RESULTS)
    .map((result) => result.note);
}

function getSearchScore(note: VaultNode, normalizedQuery: string) {
  const title = getNoteTitle(note).toLowerCase();
  const path = note.path.toLowerCase();

  if (title === normalizedQuery) return 100;
  if (title.startsWith(normalizedQuery)) return 80;
  if (title.includes(normalizedQuery)) return 60;
  if (path.includes(normalizedQuery)) return 30;
  return 0;
}

function getNoteTitle(note: VaultNode) {
  return note.name.replace(/\.md$/i, '');
}
