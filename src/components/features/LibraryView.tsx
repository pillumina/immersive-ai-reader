import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, MoreHorizontal, Clock, FolderOpen, X, Pencil, ChevronDown, Check, Settings } from 'lucide-react';
import { PDFDocument } from '@/types/document';
import type { Library as LibraryType } from '@/types/document';
import { tagCommands } from '@/lib/tauri';
import { Logo } from '@/components/ui/Logo';

type ViewMode = 'list' | 'grid';

// ─── Left panel: Library list ────────────────────────────────────────────────

interface LibraryListProps {
  libraries: LibraryType[];
  recentDocuments: PDFDocument[];
  selectedLibraryId: string | null;
  onSelectLibrary: (id: string | null) => void;
  onCreateLibrary: (name: string) => void;
  onDeleteLibrary: (id: string) => void;
  onRenameLibrary: (id: string, name: string) => void;
  onOpenDocument: (doc: PDFDocument) => void;
  onClearRecent: () => void;
  onOpenSettings: () => void;
}

function LibraryList({
  libraries,
  recentDocuments,
  selectedLibraryId,
  onSelectLibrary,
  onCreateLibrary,
  onDeleteLibrary,
  onRenameLibrary,
  onOpenDocument,
  onClearRecent,
  onOpenSettings,
}: LibraryListProps) {
  const [contextMenu, setContextMenu] = useState<{ lib: LibraryType; x: number; y: number } | null>(null);
  const [newLibName, setNewLibName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [renamingLibId, setRenamingLibId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const newLibRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const renameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up pending timers on unmount.
  useEffect(() => {
    return () => {
      if (renameTimerRef.current) clearTimeout(renameTimerRef.current);
      if (tagBlurTimerRef.current) clearTimeout(tagBlurTimerRef.current);
    };
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    globalThis.addEventListener('click', handler);
    return () => globalThis.removeEventListener('click', handler);
  }, [contextMenu]);

  // Focus rename input when activated
  useEffect(() => {
    if (!renamingLibId) return;
    setRenameValue(libraries.find((l) => l.id === renamingLibId)?.name ?? '');
    if (renameTimerRef.current) clearTimeout(renameTimerRef.current);
    renameTimerRef.current = setTimeout(() => renameRef.current?.select(), 50);
    return () => {
      if (renameTimerRef.current) {
        clearTimeout(renameTimerRef.current);
        renameTimerRef.current = null;
      }
    };
  }, [renamingLibId, libraries]);

  const handleRenameSubmit = (libId: string) => {
    if (renameValue.trim()) {
      onRenameLibrary(libId, renameValue.trim());
    }
    setRenamingLibId(null);
    setRenameValue('');
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newLibName.trim()) {
      onCreateLibrary(newLibName.trim());
      setNewLibName('');
      setIsCreating(false);
    }
  };

  return (
    <div className="library-list-panel">
      {/* Panel header with branding */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[#f5f5f4]">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#c2410c] flex items-center justify-center shrink-0">
            <Logo size={16} variant="dark" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[13px] font-semibold text-[#1c1917] leading-tight truncate">Immersive Reader</h1>
            <p className="text-[10px] text-[#78716c] leading-none">Document + AI</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#78716c] hover:bg-[#f5f5f4] hover:text-[#1c1917] transition-colors"
            title="Settings"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* Recent section */}
      {recentDocuments.length > 0 && (
        <div className="library-section">
          <div className="library-section__header">
            <span className="library-section__title">
              <Clock size={11} />
              Recent
            </span>
            <button type="button" onClick={onClearRecent} className="library-section__clear" title="Clear recent">
              <X size={10} />
            </button>
          </div>
          {recentDocuments.slice(0, 8).map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => onOpenDocument(doc)}
              className="library-item library-item--recent"
            >
              <span className="library-item__name">{doc.fileName}</span>
              <span className="library-item__meta">{doc.pageCount}p</span>
            </button>
          ))}
        </div>
      )}

      {/* Libraries section */}
      <div className="library-section">
        <div className="library-section__header">
          <span className="library-section__title">
            <FolderOpen size={11} />
            My Libraries
          </span>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="library-section__add"
            title="New library"
          >
            <Plus size={12} />
          </button>
        </div>

        {/* All Documents */}
        <button
          type="button"
          onClick={() => onSelectLibrary(null)}
          className={`library-item ${selectedLibraryId === null ? 'library-item--active' : ''}`}
        >
          <span className="library-item__dot" style={{ background: '#78716c' }} />
          <span className="library-item__name">All Documents</span>
        </button>

        {libraries.map((lib) =>
          renamingLibId === lib.id ? (
            <form
              key={lib.id}
              className="library-create-form"
              onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(lib.id); }}
            >
              <input
                ref={renameRef}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => { setRenamingLibId(null); setRenameValue(''); }}
                onKeyDown={(e) => { if (e.key === 'Escape') { setRenamingLibId(null); setRenameValue(''); } }}
                className="library-create-input"
              />
            </form>
          ) : (
            <div key={lib.id} className="library-item-wrapper">
              <button
                type="button"
                key={lib.id}
                onClick={() => onSelectLibrary(lib.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ lib, x: e.clientX, y: e.clientY });
                }}
                className={`library-item ${selectedLibraryId === lib.id ? 'library-item--active' : ''}`}
              >
                <span className="library-item__dot" style={{ background: lib.color }} />
                <span className="library-item__name">{lib.name}</span>
                <button
                  type="button"
                  className="library-item__menu-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu({ lib, x: e.clientX, y: e.clientY });
                  }}
                >
                  <MoreHorizontal size={11} />
                </button>
              </button>
            </div>
          )
        )}

        {/* Create new library */}
        {isCreating ? (
          <form onSubmit={handleCreateSubmit} className="library-create-form">
            <input
              ref={newLibRef}
              autoFocus
              value={newLibName}
              onChange={(e) => setNewLibName(e.target.value)}
              onBlur={() => { if (!newLibName.trim()) setIsCreating(false); }}
              placeholder="Library name…"
              className="library-create-input"
            />
          </form>
        ) : null}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="ctx-menu"
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="ctx-menu-item"
            onClick={() => {
              setRenamingLibId(contextMenu.lib.id);
              setContextMenu(null);
            }}
          >
            <Pencil size={12} />
            Rename
          </button>
          <div className="ctx-menu-divider" />
          <button
            type="button"
            className="ctx-menu-item ctx-menu-item--danger"
            onClick={() => {
              onDeleteLibrary(contextMenu.lib.id);
              setContextMenu(null);
            }}
          >
            <Trash2 size={12} />
            Delete library
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Middle panel: Document list ─────────────────────────────────────────────

interface DocumentListProps {
  documents: PDFDocument[];
  selectedLibraryId: string | null;
  libraries: LibraryType[];
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onSelectDocument: (doc: PDFDocument) => void;
  onDeleteDocument: (id: string) => void;
  onOpenDocument: (doc: PDFDocument) => void;
  onUpload: () => void;
  onMoveDocument: (docId: string, targetLibraryId: string | null) => void;
}

function DocumentList({
  documents,
  selectedLibraryId,
  libraries,
  viewMode,
  onChangeViewMode,
  onSelectDocument,
  onDeleteDocument,
  onOpenDocument,
  onUpload,
  onMoveDocument,
}: DocumentListProps) {
  const [contextMenu, setContextMenu] = useState<{ doc: PDFDocument; x: number; y: number } | null>(null);
  const selectedLib = libraries.find((l) => l.id === selectedLibraryId);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    globalThis.addEventListener('click', handler);
    return () => globalThis.removeEventListener('click', handler);
  }, [contextMenu]);

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (documents.length === 0) {
    return (
      <div className="doc-list-panel doc-list-panel--empty">
        <div className="doc-list-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e7e5e4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p className="doc-list-empty__title">
            {selectedLib ? `${selectedLib.name} is empty` : 'No documents yet'}
          </p>
          <p className="doc-list-empty__sub">
            {selectedLib ? 'Add PDFs to this library' : 'Upload PDFs to get started'}
          </p>
          <button type="button" onClick={onUpload} className="doc-list-empty__upload">
            <Plus size={13} />
            Upload PDF
          </button>
        </div>
      </div>
    );
  }

  const headerColor = selectedLib?.color ?? '#78716c';

  return (
    <div className="doc-list-panel">
      {/* Header */}
      <div className="doc-list-header">
        <div className="doc-list-header__left">
          {selectedLib && (
            <span className="doc-list-header__dot" style={{ background: selectedLib.color }} />
          )}
          <span className="doc-list-header__title">
            {selectedLib ? selectedLib.name : 'All Documents'}
          </span>
          <span className="doc-list-header__count">{documents.length} items</span>
        </div>
        <div className="doc-list-header__actions">
          <button
            type="button"
            onClick={onUpload}
            className="doc-list-upload-btn"
          >
            <Plus size={12} />
            Add PDF
          </button>
          <div className="view-mode-toggle">
            <button
              type="button"
              onClick={() => onChangeViewMode('list')}
              className={`view-mode-btn ${viewMode === 'list' ? 'view-mode-btn--active' : ''}`}
              title="List view"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
            <button
              type="button"
              onClick={() => onChangeViewMode('grid')}
              className={`view-mode-btn ${viewMode === 'grid' ? 'view-mode-btn--active' : ''}`}
              title="Grid view"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Document list */}
      <div className={`doc-list-content ${viewMode === 'grid' ? 'doc-list-content--grid' : ''}`}>
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="doc-card"
            onClick={() => onSelectDocument(doc)}
            onDoubleClick={() => onOpenDocument(doc)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ doc, x: e.clientX, y: e.clientY });
            }}
          >
            {viewMode === 'list' ? (
              <>
                <div className="doc-card__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={headerColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div className="doc-card__info">
                  <p className="doc-card__name">{doc.fileName}</p>
                  <p className="doc-card__meta">
                    {doc.pageCount} pages · {formatDate(doc.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  className="doc-card__open-btn"
                  onClick={(e) => { e.stopPropagation(); onOpenDocument(doc); }}
                  title="Open document"
                >
                  Open →
                </button>
              </>
            ) : (
              <>
                {/* Grid card */}
                <div className="doc-card-grid__preview" style={{ borderColor: `${headerColor}22` }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={headerColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <p className="doc-card-grid__name">{doc.fileName}</p>
                <p className="doc-card-grid__meta">{doc.pageCount}p · {formatDate(doc.updatedAt)}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="ctx-menu"
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="ctx-menu-item"
            onClick={() => { onOpenDocument(contextMenu.doc); setContextMenu(null); }}
          >
            Open
          </button>
          <div className="ctx-menu-divider" />
          <p className="ctx-menu-label">Move to…</p>
          <button
            type="button"
            className="ctx-menu-item"
            onClick={() => { onMoveDocument(contextMenu.doc.id, null); setContextMenu(null); }}
          >
            All Documents
          </button>
          {libraries
            .filter((l) => l.id !== selectedLibraryId)
            .map((lib) => (
              <button
                key={lib.id}
                type="button"
                className="ctx-menu-item"
                onClick={() => { onMoveDocument(contextMenu.doc.id, lib.id); setContextMenu(null); }}
              >
                <span className="ctx-menu-dot" style={{ background: lib.color }} />
                {lib.name}
              </button>
            ))}
          <div className="ctx-menu-divider" />
          <button
            type="button"
            className="ctx-menu-item ctx-menu-item--danger"
            onClick={() => { onDeleteDocument(contextMenu.doc.id); setContextMenu(null); }}
          >
            <Trash2 size={12} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Right panel: Document detail ────────────────────────────────────────────

interface DocumentDetailProps {
  document: PDFDocument | null;
  tags: string[];
  allTags: string[];
  onAddTag: (docId: string, tag: string) => void;
  onRemoveTag: (docId: string, tag: string) => void;
  onOpenDocument: (doc: PDFDocument) => void;
  onMoveDocument: (docId: string, libraryId: string | null) => void;
  libraries: LibraryType[];
}

function DocumentDetail({
  document,
  tags,
  allTags,
  onAddTag,
  onRemoveTag,
  onOpenDocument,
  onMoveDocument,
  libraries,
}: DocumentDetailProps) {
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const tagBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTagInput = (value: string) => {
    setTagInput(value);
    if (value.trim()) {
      const matches = allTags.filter(
        (t) => t.toLowerCase().includes(value.toLowerCase()) && !tags.includes(t)
      );
      setTagSuggestions(matches.slice(0, 6));
      setShowSuggestions(matches.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    globalThis.document.addEventListener('mousedown', handler);
    return () => globalThis.document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  // Clean up pending timer on unmount.
  useEffect(() => {
    return () => {
      if (tagBlurTimerRef.current) clearTimeout(tagBlurTimerRef.current);
    };
  }, []);

  const handleAddTag = (tagName: string) => {
    if (document && tagName.trim() && !tags.includes(tagName.trim())) {
      onAddTag(document.id, tagName.trim());
    }
    setTagInput('');
    setShowSuggestions(false);
  };

  if (!document) {
    return (
      <div className="doc-detail-panel doc-detail-panel--empty">
        <div className="doc-detail-empty">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#e7e5e4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p>Select a document</p>
        </div>
      </div>
    );
  }

  const currentLib = libraries.find((l) => l.id === document.libraryId);

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="doc-detail-panel">
      {/* File icon */}
      <div className="doc-detail__icon-wrap">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>

      {/* File name */}
      <h2 className="doc-detail__filename">{document.fileName}</h2>

      {/* Metadata */}
      <div className="doc-detail__meta">
        <div className="doc-detail__meta-row">
          <span className="doc-detail__meta-label">Pages</span>
          <span className="doc-detail__meta-value">{document.pageCount}</span>
        </div>
        <div className="doc-detail__meta-row">
          <span className="doc-detail__meta-label">Created</span>
          <span className="doc-detail__meta-value">{formatDate(document.createdAt)}</span>
        </div>
        <div className="doc-detail__meta-row">
          <span className="doc-detail__meta-label">Modified</span>
          <span className="doc-detail__meta-value">{formatDate(document.updatedAt)}</span>
        </div>
        <div className="doc-detail__meta-row">
          <span className="doc-detail__meta-label">Library</span>
          <span className="doc-detail__meta-value">
            {currentLib ? (
              <span className="doc-detail__lib-badge" style={{ background: `${currentLib.color}18`, color: currentLib.color }}>
                <span className="doc-detail__lib-dot" style={{ background: currentLib.color }} />
                {currentLib.name}
              </span>
            ) : (
              <span className="doc-detail__meta-value--muted">Uncategorized</span>
            )}
          </span>
        </div>
      </div>

      {/* Tags */}
      <div className="doc-detail__section">
        <p className="doc-detail__section-label">Tags</p>
        <div className="doc-detail__tags">
          {tags.map((tag) => (
            <span key={tag} className="doc-detail__tag">
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(document.id, tag)}
                className="doc-detail__tag-remove"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
        <div className="doc-detail__tag-input-wrap">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => handleTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAddTag(tagInput); }
              if (e.key === 'Escape') { setTagInput(''); setShowSuggestions(false); }
            }}
            onBlur={() => {
              if (tagBlurTimerRef.current) clearTimeout(tagBlurTimerRef.current);
              tagBlurTimerRef.current = setTimeout(() => setShowSuggestions(false), 150);
            }}
            placeholder="Add tag…"
            className="doc-detail__tag-input"
          />
          {showSuggestions && (
            <div className="doc-detail__tag-suggestions">
              {tagSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="doc-detail__tag-suggestion"
                  onMouseDown={() => handleAddTag(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="doc-detail__actions">
        <button
          type="button"
          onClick={() => onOpenDocument(document)}
          className="doc-detail__open-btn"
        >
          Open Document
        </button>
        {/* Library picker */}
        <div className="doc-detail__section">
          <p className="doc-detail__section-label">Library</p>
          <div className="lib-picker" ref={pickerRef}>
            <button
              type="button"
              className="lib-picker__trigger"
              onClick={() => setShowPicker((v) => !v)}
            >
              {currentLib ? (
                <>
                  <span className="lib-picker__dot" style={{ background: currentLib.color }} />
                  <span className="lib-picker__name">{currentLib.name}</span>
                </>
              ) : (
                <>
                  <span className="lib-picker__dot lib-picker__dot--none" />
                  <span className="lib-picker__name lib-picker__name--none">None</span>
                </>
              )}
              <ChevronDown size={12} className={`lib-picker__chevron ${showPicker ? 'lib-picker__chevron--open' : ''}`} />
            </button>
            {showPicker && (
              <div className="lib-picker__dropdown">
                <button
                  type="button"
                  className={`lib-picker__option ${!document.libraryId ? 'lib-picker__option--active' : ''}`}
                  onClick={() => { onMoveDocument(document.id, null); setShowPicker(false); }}
                >
                  <span className="lib-picker__dot lib-picker__dot--none" />
                  <span className="lib-picker__option-name">None</span>
                  {!document.libraryId && <Check size={11} className="lib-picker__check" />}
                </button>
                {libraries.map((lib) => (
                  <button
                    key={lib.id}
                    type="button"
                    className={`lib-picker__option ${document.libraryId === lib.id ? 'lib-picker__option--active' : ''}`}
                    onClick={() => { onMoveDocument(document.id, lib.id); setShowPicker(false); }}
                  >
                    <span className="lib-picker__dot" style={{ background: lib.color }} />
                    <span className="lib-picker__option-name">{lib.name}</span>
                    {document.libraryId === lib.id && <Check size={11} className="lib-picker__check" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main LibraryView component ──────────────────────────────────────────────

interface LibraryViewProps {
  documents: PDFDocument[];
  libraries: LibraryType[];
  allTags: string[];
  recentDocuments: PDFDocument[];
  selectedLibraryId: string | null;
  selectedDocumentId: string | null;
  onSelectLibrary: (id: string | null) => void;
  onSelectDocument: (id: string) => void;
  onCreateLibrary: (name: string) => void;
  onDeleteLibrary: (id: string) => void;
  onRenameLibrary: (id: string, name: string) => void;
  onDeleteDocument: (id: string) => void;
  onUpdateDocumentLibrary: (docId: string, libraryId: string | null) => void;
  onOpenDocument: (doc: PDFDocument) => void;
  onUpload: () => void;
  onClearRecent: () => void;
  onOpenSettings: () => void;
}

export function LibraryView({
  documents,
  libraries,
  allTags,
  recentDocuments,
  selectedLibraryId,
  selectedDocumentId,
  onSelectLibrary,
  onSelectDocument,
  onCreateLibrary,
  onDeleteLibrary,
  onRenameLibrary,
  onDeleteDocument,
  onUpdateDocumentLibrary,
  onOpenDocument,
  onUpload,
  onClearRecent,
  onOpenSettings,
}: LibraryViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [docTags, setDocTags] = useState<Record<string, string[]>>({});

  // Load tags for selected document
  useEffect(() => {
    if (!selectedDocumentId) return;
    (async () => {
      try {
        const tags = await tagCommands.getByDocument(selectedDocumentId);
        setDocTags((prev) => ({ ...prev, [selectedDocumentId]: tags.map((t) => t.name) }));
      } catch {
        // ignore
      }
    })();
  }, [selectedDocumentId]);

  const displayedDocs = selectedLibraryId
    ? documents.filter((d) => d.libraryId === selectedLibraryId)
    : documents;

  const selectedDoc = documents.find((d) => d.id === selectedDocumentId) ?? null;
  const selectedDocTags = selectedDocumentId ? (docTags[selectedDocumentId] ?? []) : [];

  return (
    <div className="library-view">
      {/* Left: library list */}
      <LibraryList
        libraries={libraries}
        recentDocuments={recentDocuments}
        selectedLibraryId={selectedLibraryId}
        onSelectLibrary={onSelectLibrary}
        onCreateLibrary={onCreateLibrary}
        onDeleteLibrary={onDeleteLibrary}
        onRenameLibrary={onRenameLibrary}
        onOpenDocument={onOpenDocument}
        onClearRecent={onClearRecent}
        onOpenSettings={onOpenSettings}
      />

      {/* Center: document list */}
      <DocumentList
        documents={displayedDocs}
        selectedLibraryId={selectedLibraryId}
        libraries={libraries}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        onSelectDocument={(doc) => onSelectDocument(doc.id)}
        onDeleteDocument={onDeleteDocument}
        onOpenDocument={onOpenDocument}
        onUpload={onUpload}
        onMoveDocument={onUpdateDocumentLibrary}
      />

      {/* Right: document detail */}
      <DocumentDetail
        document={selectedDoc}
        tags={selectedDocTags}
        allTags={allTags}
        onAddTag={async (docId, tag) => {
          await tagCommands.addToDocument(docId, tag);
          setDocTags((prev) => ({
            ...prev,
            [docId]: [...(prev[docId] ?? []), tag],
          }));
        }}
        onRemoveTag={async (docId, tag) => {
          await tagCommands.removeFromDocument(docId, tag);
          setDocTags((prev) => ({
            ...prev,
            [docId]: (prev[docId] ?? []).filter((t) => t !== tag),
          }));
        }}
        onOpenDocument={onOpenDocument}
        onMoveDocument={(docId, libId) => onUpdateDocumentLibrary(docId, libId)}
        libraries={libraries}
      />
    </div>
  );
}
