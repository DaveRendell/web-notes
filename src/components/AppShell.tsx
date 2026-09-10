import { LogOut, Moon, PanelLeftClose, RefreshCw, Settings, Sun, Unplug } from 'lucide-react';
import { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useVault } from '../contexts/VaultContext';
import { readMigratedStorage, safeLocalStorage as localStorage } from '../lib/browserStorage';
import { AnimatedPopover } from './AnimatedPopover';
import { MarkdownViewer } from './MarkdownViewer';
import { ImageViewer } from './ImageViewer';
import { NoteSearch } from './NoteSearch';
import { Sidebar } from './Sidebar/Sidebar';
import { VaultPicker } from './VaultPicker';

export function AppShell() {
  const { disconnect, error: authError, isAuthenticated, signIn, signOut, status } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { clearVault, createNote, isOnline, selectedVault } = useVault();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsed);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 760);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const { selectedFile } = useVault();
  const sidebarCollapsed = isMobile ? !mobileSidebarOpen : isSidebarCollapsed;

  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 760px)');
    if (!media) return;
    const update = () => { setIsMobile(media.matches); setMobileSidebarOpen(false); };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => { setMobileSidebarOpen(false); }, [selectedFile?.id, selectedVault?.id]);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="Show file sidebar"]')?.focus();
    });
  }, []);

  const openSidebar = useCallback(() => {
    if (isMobile) {
      setMobileSidebarOpen(true);
      return;
    }
    setIsSidebarCollapsed(false);
    window.requestAnimationFrame(() => sidebarToggleRef.current?.focus());
  }, [isMobile]);

  const hideSidebar = useCallback(() => {
    if (isMobile) {
      closeMobileSidebar();
      return;
    }
    setIsSidebarCollapsed(true);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('[aria-label="Show file sidebar"]')?.focus();
    });
  }, [closeMobileSidebar, isMobile]);

  useEffect(() => {
    if (!isMobile || !mobileSidebarOpen) return;
    document.querySelector<HTMLElement>('#vault-sidebar button')?.focus();
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        closeMobileSidebar();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [closeMobileSidebar, isMobile, mobileSidebarOpen]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (!isAuthenticated || !selectedVault) return;

    function handleShortcut(event: globalThis.KeyboardEvent) {
      const hasPrimaryModifier = event.ctrlKey || event.metaKey;

      if (hasPrimaryModifier && !event.altKey && !event.shiftKey && event.code === 'KeyK') {
        event.preventDefault();
        window.dispatchEvent(new Event('web-notes:open-search'));
        document.querySelector<HTMLButtonElement>('#note-search-trigger')?.click();
        return;
      }

      if (
        !hasPrimaryModifier
        || !event.altKey
        || event.shiftKey
        || event.code !== 'KeyN'
        || isEditableShortcutTarget(event.target)
      ) return;

      event.preventDefault();
      if (!isOnline) {
        window.alert('Reconnect to the internet before creating a note.');
        return;
      }

      const name = window.prompt('New note name');
      if (!name?.trim()) return;

      void createNote(null, name).catch((requestError) => {
        window.alert(requestError instanceof Error ? requestError.message : 'Failed to create note.');
      });
    }

    document.addEventListener('keydown', handleShortcut, true);
    return () => document.removeEventListener('keydown', handleShortcut, true);
  }, [createNote, isAuthenticated, isOnline, selectedVault]);

  if (!isAuthenticated) {
    return (
      <main className="login-screen">
        <section className="login-panel" aria-labelledby="login-title">
          <p className="eyebrow">Google Drive Markdown</p>
          <h1 id="login-title">Web Notes</h1>
          <p className="login-copy">
            Sign in with Google to browse and edit Markdown notes stored in a Drive folder.
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
      <ResizableWorkspace
        controls={(
          <>
            <button
              className="icon-button"
              ref={sidebarToggleRef}
              type="button"
              onClick={hideSidebar}
              aria-controls="vault-sidebar"
              aria-expanded="true"
              aria-label="Hide file sidebar"
              title="Hide file sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
            <NoteSearch />
            <HeaderActionsMenu onChangeVault={clearVault} onDisconnect={disconnect} onSignOut={signOut} />
          </>
        )}
        isSidebarCollapsed={sidebarCollapsed}
        mobileSidebarOpen={isMobile && mobileSidebarOpen}
        onCloseSidebar={closeMobileSidebar}
        onOpenSidebar={openSidebar}
      />
    </div>
  );
}

const SIDEBAR_WIDTH_KEY = 'web-notes:sidebar-width';
const LEGACY_SIDEBAR_WIDTH_KEY = 'vault-web-viewer:sidebar-width';
const SIDEBAR_COLLAPSED_KEY = 'web-notes:sidebar-collapsed';
const LEGACY_SIDEBAR_COLLAPSED_KEY = 'vault-web-viewer:sidebar-collapsed';
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 640;
const MIN_VIEWER_WIDTH = 320;
const RESIZE_STEP = 16;

function ResizableWorkspace({ controls, isSidebarCollapsed, mobileSidebarOpen, onCloseSidebar, onOpenSidebar }: {
  controls: ReactNode;
  isSidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  onCloseSidebar: () => void;
  onOpenSidebar: () => void;
}) {
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
      <div className="sidebar-container" inert={isSidebarCollapsed} onClick={(event) => {
        const target = event.target as HTMLElement;
        if (mobileSidebarOpen && target.closest('.favorite-note, .tree-item:not([aria-expanded])')) onCloseSidebar();
      }}>
        <Sidebar controls={controls} />
      </div>
      {mobileSidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="Close file sidebar" onClick={onCloseSidebar} />}
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
      <div className="workspace-viewer" inert={mobileSidebarOpen}>
        <SelectedFileViewer onOpenSidebar={isSidebarCollapsed ? onOpenSidebar : undefined} />
      </div>
    </div>
  );
}

function SelectedFileViewer({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const { selectedFile } = useVault();
  return selectedFile?.type === 'image'
    ? <ImageViewer onOpenSidebar={onOpenSidebar} />
    : <MarkdownViewer onOpenSidebar={onOpenSidebar} />;
}

function readSidebarWidth() {
  const storedWidth = Number(readMigratedStorage(localStorage, SIDEBAR_WIDTH_KEY, LEGACY_SIDEBAR_WIDTH_KEY));
  return Number.isFinite(storedWidth) && storedWidth > 0
    ? Math.min(Math.max(storedWidth, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH)
    : DEFAULT_SIDEBAR_WIDTH;
}

function readSidebarCollapsed() {
  return readMigratedStorage(localStorage, SIDEBAR_COLLAPSED_KEY, LEGACY_SIDEBAR_COLLAPSED_KEY) === 'true';
}

function clampSidebarWidth(width: number) {
  const viewportMaximum = Math.max(MIN_SIDEBAR_WIDTH, window.innerWidth - MIN_VIEWER_WIDTH - 6);
  return Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH, viewportMaximum);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function TopBar({ onDisconnect, onSignOut }: { onDisconnect: () => void; onSignOut: () => void }) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">Google Drive</p>
        <h1>Choose a vault folder</h1>
      </div>
      <HeaderActionsMenu onDisconnect={onDisconnect} onSignOut={onSignOut} />
    </header>
  );
}

type HeaderActionsMenuProps = {
  onChangeVault?: () => void;
  onDisconnect: () => void;
  onSignOut: () => void;
};

export function HeaderActionsMenu({ onChangeVault, onDisconnect, onSignOut }: HeaderActionsMenuProps) {
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const getMenuItems = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    getMenuItems()[0]?.focus();

    function handlePointerDown(event: globalThis.PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const menuItems = getMenuItems();
      const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      let nextIndex: number | null = null;
      if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % menuItems.length;
      if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = menuItems.length - 1;
      if (nextIndex === null || menuItems.length === 0) return;

      event.preventDefault();
      menuItems[nextIndex]?.focus();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function runAction(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div
      className="top-bar-actions header-actions-menu"
      ref={menuRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        className="icon-button"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Open options menu"
        title="Options"
      >
        <Settings size={18} />
      </button>
      <AnimatedPopover className="header-menu-popover" isOpen={isOpen} onEscape={() => setIsOpen(false)} role="menu">
        <button type="button" role="menuitem" onClick={() => runAction(toggleTheme)}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        {onChangeVault && (
          <button type="button" role="menuitem" onClick={() => runAction(onChangeVault)}>
            <RefreshCw size={16} />
            <span>Change vault</span>
          </button>
        )}
        <button type="button" role="menuitem" onClick={() => runAction(onSignOut)}>
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
        <button className="danger" type="button" role="menuitem" onClick={() => runAction(onDisconnect)}>
          <Unplug size={16} />
          <span>Disconnect Google Drive</span>
        </button>
      </AnimatedPopover>
    </div>
  );
}
