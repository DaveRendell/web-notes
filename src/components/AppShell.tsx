import { LogOut, Moon, PanelLeftClose, PanelLeftOpen, RefreshCw, Sun, Unplug } from 'lucide-react';
import { CSSProperties, KeyboardEvent, PointerEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useVault } from '../contexts/VaultContext';
import { MarkdownViewer } from './MarkdownViewer';
import { NoteSearch } from './NoteSearch';
import { Sidebar } from './Sidebar/Sidebar';
import { VaultPicker } from './VaultPicker';

export function AppShell() {
  const { disconnect, error: authError, isAuthenticated, signIn, signOut, status } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { clearVault, selectedVault } = useVault();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsed);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

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
        <TopBar onDisconnect={disconnect} onSignOut={signOut} />
        <VaultPicker />
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-title">
          <button
            className="icon-button"
            type="button"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            aria-controls="vault-sidebar"
            aria-expanded={!isSidebarCollapsed}
            aria-label={isSidebarCollapsed ? 'Show file sidebar' : 'Hide file sidebar'}
            title={isSidebarCollapsed ? 'Show file sidebar' : 'Hide file sidebar'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
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
          <button
            className="icon-text-button"
            type="button"
            onClick={disconnect}
            aria-label="Disconnect Google Drive"
            title="Disconnect Google Drive and revoke access"
          >
            <Unplug size={18} />
            Disconnect
          </button>
        </div>
      </header>
      <ResizableWorkspace isSidebarCollapsed={isSidebarCollapsed} />
    </div>
  );
}

const SIDEBAR_WIDTH_KEY = 'vault-web-viewer:sidebar-width';
const SIDEBAR_COLLAPSED_KEY = 'vault-web-viewer:sidebar-collapsed';
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 640;
const MIN_VIEWER_WIDTH = 320;
const RESIZE_STEP = 16;

function ResizableWorkspace({ isSidebarCollapsed }: { isSidebarCollapsed: boolean }) {
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ pointerX: number; sidebarWidth: number } | null>(null);
  const workspaceStyle = { '--sidebar-width': `${sidebarWidth}px` } as CSSProperties;

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStartRef.current = { pointerX: event.clientX, sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizing(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragStartRef.current) return;

    const nextWidth = dragStartRef.current.sidebarWidth + event.clientX - dragStartRef.current.pointerX;
    setSidebarWidth(clampSidebarWidth(nextWidth));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    dragStartRef.current = null;
    setIsResizing(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let nextWidth: number | null = null;

    if (event.key === 'ArrowLeft') nextWidth = sidebarWidth - RESIZE_STEP;
    if (event.key === 'ArrowRight') nextWidth = sidebarWidth + RESIZE_STEP;
    if (event.key === 'Home') nextWidth = MIN_SIDEBAR_WIDTH;
    if (event.key === 'End') nextWidth = MAX_SIDEBAR_WIDTH;
    if (nextWidth === null) return;

    event.preventDefault();
    setSidebarWidth(clampSidebarWidth(nextWidth));
  }

  return (
    <div
      className={`workspace${isResizing ? ' resizing' : ''}${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      style={workspaceStyle}
    >
      <Sidebar />
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="Resize file sidebar"
        aria-orientation="vertical"
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuenow={sidebarWidth}
        onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        tabIndex={0}
        title="Drag to resize; double-click to reset"
      />
      <MarkdownViewer />
    </div>
  );
}

function readSidebarWidth() {
  const storedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  return Number.isFinite(storedWidth) && storedWidth > 0
    ? clampSidebarWidth(storedWidth)
    : DEFAULT_SIDEBAR_WIDTH;
}

function readSidebarCollapsed() {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
}

function clampSidebarWidth(width: number) {
  const viewportMaximum = Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - MIN_VIEWER_WIDTH - 6);
  return Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH, viewportMaximum);
}

function TopBar({ onDisconnect, onSignOut }: { onDisconnect: () => void; onSignOut: () => void }) {
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
        <button
          className="icon-text-button"
          type="button"
          onClick={onDisconnect}
          aria-label="Disconnect Google Drive"
          title="Disconnect Google Drive and revoke access"
        >
          <Unplug size={18} />
          Disconnect
        </button>
      </div>
    </header>
  );
}
