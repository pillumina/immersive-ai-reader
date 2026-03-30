import { useState, useMemo, memo } from 'react';
import { Settings, Trash2, Link, FileText, Library, Columns, Search } from 'lucide-react';
import { PDFDocument } from '@/types/document';
import { Logo } from '@/components/ui/Logo';

interface SidebarProps {
  onUpload: () => void;
  onOpenSettings: () => void;
  onToggleSidebar?: () => void;
  documents: PDFDocument[];
  currentDocumentId?: string;
  onSelectDocument: (id: string) => void;
  onDeleteDocument: (id: string) => void;
  onRelinkDocument: (id: string) => void;
  // Page thumbnails
  totalPages?: number;
  currentPage?: number;
  onJumpToPage?: (page: number) => void;
  thumbnails?: Map<number, string>;
  thumbnailsLoading?: boolean;
}

type TabId = 'library' | 'pages';

export const Sidebar = memo(function Sidebar({
  onUpload,
  onOpenSettings,
  onToggleSidebar,
  documents,
  currentDocumentId,
  onSelectDocument,
  onDeleteDocument,
  onRelinkDocument,
  totalPages = 0,
  currentPage = 1,
  onJumpToPage,
  thumbnails,
  thumbnailsLoading,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId>('library');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDocs = useMemo(() =>
    searchQuery.trim()
      ? documents.filter((d) => d.fileName.toLowerCase().includes(searchQuery.toLowerCase()))
      : documents,
    [searchQuery, documents]
  );

  // Group documents by approximate date for knowledge base feel
  const grouped = useMemo(() => filteredDocs.reduce<Record<string, PDFDocument[]>>((acc, doc) => {
    const date = new Date(doc.updatedAt || doc.createdAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    let label: string;
    if (diffDays === 0) label = 'Today';
    else if (diffDays === 1) label = 'Yesterday';
    else if (diffDays < 7) label = 'This Week';
    else if (diffDays < 30) label = 'This Month';
    else label = 'Earlier';
    if (!acc[label]) acc[label] = [];
    acc[label].push(doc);
    return acc;
  }, {}), [filteredDocs]);

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Earlier'];
  const sortedGroups = useMemo(() =>
    groupOrder.filter((g) => grouped[g]?.length > 0),
    [grouped]
  );

  return (
    <aside className="w-[260px] border-r border-[var(--color-border)] bg-[var(--color-bg-raised)] flex flex-col select-none overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[var(--color-bg-subtle)]">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)] flex items-center justify-center shrink-0">
            <Logo size={16} variant="dark" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[13px] font-semibold text-[var(--color-text)] leading-tight truncate">Immersive Reader</h1>
            <p className="text-[10px] text-[var(--color-text-secondary)] leading-none">Document + AI</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Hide sidebar"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition-colors"
              title="Hide sidebar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition-colors"
            title="Settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-4 pt-2 pb-0 flex items-center gap-1 border-b border-[var(--color-bg-subtle)]">
        <button
          type="button"
          onClick={() => setActiveTab('library')}
          className={`flex items-center gap-1.5 px-3 pb-2.5 text-[12px] font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'library'
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }`}
        >
          <Library size={13} />
          Library
          {documents.length > 0 && (
            <span className="ml-0.5 text-[10px] opacity-60">{documents.length}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pages')}
          className={`flex items-center gap-1.5 px-3 pb-2.5 text-[12px] font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'pages'
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
          }`}
        >
          <Columns size={13} />
          Pages
        </button>
      </div>

      {/* Search */}
      {activeTab === 'library' && (
        <div className="px-4 pt-3 pb-2">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 text-[var(--color-text-muted)] pointer-events-none" />
            <input
              type="text"
              aria-label="Search documents"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full h-7 pl-7 pr-3 text-[12px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-bg-raised)] transition-colors"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'library' && (
          <div className="px-2 py-1">
            {filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                {/* Illustration */}
                <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-hover)] flex items-center justify-center mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="12" x2="12" y2="18"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </div>
                {searchQuery ? (
                  <>
                    <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">No results found</p>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-relaxed">
                      No documents match &ldquo;{searchQuery}&rdquo;
                    </p>
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="mt-3 text-[11px] text-[var(--color-accent)] font-medium hover:underline"
                    >
                      Clear search
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-semibold text-[var(--color-text-secondary)]">Your library is empty</p>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-relaxed max-w-[180px]">
                      Upload a PDF to start reading and annotating with AI assistance
                    </p>
                    <button
                      type="button"
                      onClick={onUpload}
                      className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white text-[12px] font-semibold hover:bg-[var(--color-accent-hover)] transition-colors shadow-sm"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      Upload PDF
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Library header stats */}
                <div className="px-2 py-2 flex items-center justify-between">
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={onUpload}
                    className="text-[11px] text-[var(--color-accent)] font-medium hover:text-[var(--color-accent-hover)] transition-colors"
                  >
                    + Add
                  </button>
                </div>

                {sortedGroups.map((group) => (
                  <div key={group} className="mb-3">
                    <p className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-2 mb-1">
                      {group}
                    </p>
                    {(grouped[group] || []).map((doc) => {
                      const isActive = currentDocumentId === doc.id;
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          aria-label={`Open ${doc.fileName}`}
                          key={doc.id}
                          className={`group w-full flex items-center gap-2 rounded-lg px-2 py-2 mb-0.5 transition-all duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-1 cursor-pointer ${
                            isActive
                              ? 'bg-[var(--color-danger-subtle)]'
                              : 'hover:bg-[var(--color-bg)]'
                          }`}
                          onClick={() => onSelectDocument(doc.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDocument(doc.id); } }}
                        >
                        <div className={`shrink-0 rounded ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]'} transition-colors`}>
                          <FileText size={13} />
                        </div>
                        <span className={`flex-1 truncate text-[12px] leading-tight ${isActive ? 'font-semibold text-[var(--color-accent)]' : 'text-[var(--color-text)] font-medium'}`}>
                          {doc.fileName}
                        </span>
                        {doc.pageCount > 0 && (
                          <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums shrink-0">
                            {doc.pageCount}p
                          </span>
                        )}
                        <div className={`flex items-center gap-0.5 shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button
                            aria-label="Relink file"
                            className="rounded p-0.5 hover:bg-black/[0.05] transition-colors"
                            title="Relink file"
                            onClick={(e) => { e.stopPropagation(); onRelinkDocument(doc.id); }}
                          >
                            <Link size={11} className="text-[var(--color-text-muted)]" />
                          </button>
                          <button
                            aria-label="Delete document"
                            className="rounded p-0.5 hover:bg-[var(--color-danger-subtle)] transition-colors"
                            title="Delete"
                            onClick={(e) => { e.stopPropagation(); onDeleteDocument(doc.id); }}
                          >
                            <Trash2 size={11} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-danger)]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
            )}
          </div>
        )}

        {activeTab === 'pages' && (
          <div className="px-3 py-3">
            {totalPages === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-hover)] flex items-center justify-center mb-3">
                  <Columns size={20} className="text-[var(--color-text-muted)]" />
                </div>
                <p className="text-[12px] text-[var(--color-text-secondary)] font-medium">No pages available</p>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Open a document to see pages</p>
              </div>
            ) : (
              <div>
                {/* Page count + loading hint */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {thumbnailsLoading ? 'Rendering…' : `${totalPages} pages`}
                  </span>
                  {thumbnailsLoading && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
                      <span className="text-[10px] text-[var(--color-accent)]">Loading</span>
                    </div>
                  )}
                </div>

                {/* Thumbnail grid — 2 columns */}
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    const isActive = currentPage === page;
                    const thumb = thumbnails?.get(page);

                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => onJumpToPage?.(page)}
                        className={`group flex flex-col items-center rounded-xl transition-all duration-100 p-1.5 pb-2 ${
                          isActive
                            ? 'bg-[var(--color-danger-subtle)] ring-2 ring-[var(--color-accent)]/30'
                            : 'hover:bg-[var(--color-bg)]'
                        }`}
                      >
                        {/* Thumbnail image */}
                        <div className="relative w-full rounded-lg overflow-hidden bg-[var(--color-bg-hover)] shadow-sm transition-shadow">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={`Page ${page}`}
                              className="w-full h-auto object-contain block"
                              style={{ display: 'block' }}
                            />
                          ) : (
                            /* Skeleton placeholder */
                            <div
                              className="w-full bg-[var(--color-bg-hover)] animate-pulse"
                              style={{ paddingTop: `${(792 / 612) * 100}%` }} // letter aspect ratio
                            />
                          )}
                          {/* Page number badge */}
                          <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums leading-none">
                            {page}
                          </div>
                          {/* Active indicator */}
                          {isActive && (
                            <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-[var(--color-bg-subtle)]">
        <p className="text-[10px] text-[var(--color-text-muted)]">Immersive Reader · v1.0</p>
      </div>
    </aside>
  );
});
