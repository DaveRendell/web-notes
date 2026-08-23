import { ChevronDown, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useVault } from '../../contexts/VaultContext';
import { getVaultNodeDisplayName } from '../../lib/vaultTree';

const DEFAULT_VISIBLE_NOTES = 5;

export function RecentNotes() {
  const { noteIcons, recentNotes, selectFile, selectedFile, selectedVault } = useVault();
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleNotes = isExpanded ? recentNotes : recentNotes.slice(0, DEFAULT_VISIBLE_NOTES);
  const canExpand = recentNotes.length > DEFAULT_VISIBLE_NOTES;

  useEffect(() => {
    setIsExpanded(false);
  }, [selectedVault?.id]);

  return (
    <section className="recent-notes" aria-labelledby="recent-notes-heading">
      <div className="recent-notes-header">
        <h3 id="recent-notes-heading">Recent notes</h3>
        {canExpand && (
          <button
            className="recent-notes-toggle"
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? 'Show less' : `Show all (${recentNotes.length})`}
            <ChevronDown className={isExpanded ? 'chevron open' : 'chevron'} size={14} />
          </button>
        )}
      </div>

      {visibleNotes.length === 0 ? (
        <p className="recent-notes-empty">Notes you open will appear here.</p>
      ) : (
        <ul className="recent-notes-list">
          {visibleNotes.map((note) => (
            <li key={note.id}>
              <button
                className={selectedFile?.id === note.id ? 'recent-note selected' : 'recent-note'}
                type="button"
                onClick={() => selectFile(note)}
                title={note.path}
              >
                {noteIcons[note.id] ? (
                  <span className="note-emoji" aria-hidden="true">{noteIcons[note.id]}</span>
                ) : (
                  <FileText size={15} />
                )}
                <span>{getVaultNodeDisplayName(note)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
