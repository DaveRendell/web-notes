import { FileText, Image, X } from 'lucide-react';
import { useVault } from '../contexts/VaultContext';
import { getVaultNodeDisplayName } from '../lib/vaultTree';
import { Twemoji } from './Twemoji';

export function FileTabs() {
  const { activateFileTab, closeFileTab, noteIcons, openFiles, selectedFile } = useVault();

  if (openFiles.length < 2) return null;

  return (
    <div className="file-tabs" role="tablist" aria-label="Open files">
      {openFiles.map((file) => {
        const active = file.id === selectedFile?.id;
        const emoji = file.type === 'markdown' ? noteIcons[file.id] : null;
        const label = getVaultNodeDisplayName(file);
        return (
          <div className={`file-tab${active ? ' active' : ''}`} key={file.id}>
            <button
              className="file-tab-select"
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => activateFileTab(file.id)}
              onAuxClick={(event) => {
                if (event.button !== 1) return;
                event.preventDefault();
                closeFileTab(file.id);
              }}
              title={file.path}
            >
              {emoji ? <span className="note-emoji"><Twemoji emoji={emoji} hidden /></span>
                : file.type === 'image' ? <Image size={14} /> : <FileText size={14} />}
              <span>{label}</span>
            </button>
            <button
              className="file-tab-close"
              type="button"
              onClick={() => closeFileTab(file.id)}
              aria-label={`Close ${label}`}
              title={`Close ${label}`}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
