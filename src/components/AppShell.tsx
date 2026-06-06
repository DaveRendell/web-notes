import { LogOut, Moon, RefreshCw, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useVault } from '../contexts/VaultContext';
import { MarkdownViewer } from './MarkdownViewer';
import { NoteSearch } from './NoteSearch';
import { Sidebar } from './Sidebar/Sidebar';
import { VaultPicker } from './VaultPicker';

export function AppShell() {
  const { error: authError, isAuthenticated, signIn, signOut, status } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { clearVault, selectedVault } = useVault();

  if (!isAuthenticated) {
    return (
      <main className="login-screen">
        <section className="login-panel" aria-labelledby="login-title">
          <p className="eyebrow">Obsidian Drive Reader</p>
          <h1 id="login-title">Vault Web Viewer</h1>
          <p className="login-copy">
            Sign in with Google to browse a Drive folder as an Obsidian vault and render markdown files.
          </p>
          <button className="primary-button" type="button" onClick={signIn} disabled={status === 'loading'}>
            {status === 'loading' ? 'Connecting...' : 'Sign in with Google'}
          </button>
          {authError && <p className="error-text">{authError}</p>}
          <button className="icon-text-button login-theme-button" type="button" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </section>
      </main>
    );
  }

  if (!selectedVault) {
    return (
      <main className="picker-screen">
        <TopBar onSignOut={signOut} />
        <VaultPicker />
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-title">
          <p className="eyebrow">Current vault</p>
          <h1>{selectedVault.name}</h1>
        </div>
        <NoteSearch />
        <div className="top-bar-actions">
          <button
            className="icon-button"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
            title={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-text-button" type="button" onClick={clearVault}>
            <RefreshCw size={16} />
            Change vault
          </button>
          <button className="icon-button" type="button" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <Sidebar />
        <MarkdownViewer />
      </div>
    </div>
  );
}

function TopBar({ onSignOut }: { onSignOut: () => void }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Google Drive</p>
        <h1>Choose a vault folder</h1>
      </div>
      <div className="top-bar-actions">
        <button
          className="icon-button"
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
          title={theme === 'dark' ? 'Use light mode' : 'Use dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button className="icon-button" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
