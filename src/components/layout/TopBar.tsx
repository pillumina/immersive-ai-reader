import { X, Library } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { memo } from 'react';

export interface AppTab {
  id: string; // 'library' | `doc-${docId}`
  label: string;
  type: 'library' | 'document';
  documentId?: string;
}

interface TopBarProps {
  tabs: AppTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export const TopBar = memo(function TopBar({ tabs, activeTabId, onSelectTab, onCloseTab, onToggleSidebar, sidebarOpen }: TopBarProps) {
  return (
    <header className="topbar">
      {/* Left: sidebar toggle + app logo */}
      <div className="topbar__left">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="topbar__sidebar-toggle"
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>
          </svg>
        </button>

        {/* App logo */}
        <div className="topbar__logo">
          <Logo size={20} />
        </div>

        {/* Tabs */}
        <div className="topbar__tabs">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isLibrary = tab.type === 'library';
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`topbar__tab ${isActive ? 'topbar__tab--active' : ''} ${isLibrary ? 'topbar__tab--library' : ''}`}
              >
                {isLibrary ? (
                  <Library size={13} className="topbar__tab-icon" />
                ) : null}
                <span className="topbar__tab-label">{tab.label}</span>
                {!isLibrary && (
                  <button
                    type="button"
                    className="topbar__tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    title="Close tab"
                  >
                    <X size={11} />
                  </button>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: version / future actions */}
      <div className="topbar__right">
        <span className="topbar__version">v1.0</span>
      </div>
    </header>
  );
});
