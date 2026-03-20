import { useState } from 'react';
import { FileUp, Settings, Trash2, Link, FileText, Library, Columns, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PDFDocument } from '@/types/document';

interface SidebarProps {
  onUpload: () => void;
  onOpenSettings: () => void;
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

export function Sidebar({
  onUpload,
  onOpenSettings,
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

  const filteredDocs = searchQuery.trim()
    ? documents.filter((d) => d.fileName.toLowerCase().includes(searchQuery.toLowerCase()))
    : documents;

  // Group documents by approximate date for knowledge base feel
  const grouped = filteredDocs.reduce<Record<string, PDFDocument[]>>((acc, doc) => {
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
  }, {});

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Earlier'];
  const sortedGroups = groupOrder.filter((g) => grouped[g]?.length > 0);

  return (
    <aside className="w-[260px] border-r border-[#E8E8E8] bg-white flex flex-col select-none overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[#F0F0F0]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#E42313] flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.4V12h3l3 3-3 3h-3v1a4 4 0 1 1-8 0v-1H3l-3-3 3-3h3V9.4A4 4 0 0 1 12 2z"/>
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-[13px] font-semibold text-[#0D0D0D] leading-tight truncate">Immersive Reader</h1>
            <p className="text-[10px] text-[#7A7A7A] leading-none">Document + AI</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#7A7A7A] hover:bg-[#F5F5F5] hover:text-[#0D0D0D] transition-colors shrink-0"
          title="Settings"
        >
          <Settings size={15} />
        </button>
      </div>

      {/* Action row */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-[#F0F0F0]">
        <Button size="sm" onClick={onUpload} className="flex-1">
          <FileUp size={13} />
          Upload PDF
        </Button>
      </div>

      {/* Tab bar */}
      <div className="px-4 pt-2 pb-0 flex items-center gap-1 border-b border-[#F0F0F0]">
        <button
          type="button"
          onClick={() => setActiveTab('library')}
          className={`flex items-center gap-1.5 px-3 pb-2.5 text-[12px] font-medium border-b-2 transition-colors -mb-px ${
            activeTab === 'library'
              ? 'border-[#E42313] text-[#E42313]'
              : 'border-transparent text-[#7A7A7A] hover:text-[#0D0D0D]'
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
              ? 'border-[#E42313] text-[#E42313]'
              : 'border-transparent text-[#7A7A7A] hover:text-[#0D0D0D]'
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
            <Search size={13} className="absolute left-2.5 text-[#B0B0B0] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents…"
              className="w-full h-7 pl-7 pr-3 text-[12px] bg-[#F8F8F8] border border-[#E8E8E8] rounded-lg placeholder:text-[#B0B0B0] focus:outline-none focus:border-[#E42313] focus:bg-white transition-colors"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'library' && (
          <div className="px-2 py-1">
            {filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="w-12 h-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center mb-3">
                  <FileText size={20} className="text-[#D0D0D0]" />
                </div>
                <p className="text-[12px] text-[#7A7A7A] font-medium">
                  {searchQuery ? 'No results' : 'No documents yet'}
                </p>
                <p className="text-[11px] text-[#B0B0B0] mt-1">
                  {searchQuery ? 'Try a different search' : 'Upload a PDF to get started'}
                </p>
              </div>
            ) : (
              sortedGroups.map((group) => (
                <div key={group} className="mb-3">
                  <p className="text-[10px] font-semibold text-[#B0B0B0] uppercase tracking-wider px-2 mb-1">
                    {group}
                  </p>
                  {(grouped[group] || []).map((doc) => {
                    const isActive = currentDocumentId === doc.id;
                    return (
                      <div
                        key={doc.id}
                        className={`group flex items-center gap-2 rounded-lg px-2 py-2 mb-0.5 cursor-pointer transition-all duration-100 ${
                          isActive
                            ? 'bg-[#FEF2F2]'
                            : 'hover:bg-[#F8F8F8]'
                        }`}
                        onClick={() => onSelectDocument(doc.id)}
                      >
                        <div className={`shrink-0 rounded ${isActive ? 'text-[#E42313]' : 'text-[#B0B0B0] group-hover:text-[#7A7A7A]'} transition-colors`}>
                          <FileText size={13} />
                        </div>
                        <span className={`flex-1 truncate text-[12px] leading-tight ${isActive ? 'font-semibold text-[#E42313]' : 'text-[#0D0D0D] font-medium'}`}>
                          {doc.fileName}
                        </span>
                        {doc.pageCount > 0 && (
                          <span className="text-[10px] text-[#B0B0B0] tabular-nums shrink-0">
                            {doc.pageCount}p
                          </span>
                        )}
                        <div className={`flex items-center gap-0.5 shrink-0 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button
                            className="rounded p-0.5 hover:bg-black/[0.05] transition-colors"
                            title="Relink file"
                            onClick={(e) => { e.stopPropagation(); onRelinkDocument(doc.id); }}
                          >
                            <Link size={11} className="text-[#B0B0B0]" />
                          </button>
                          <button
                            className="rounded p-0.5 hover:bg-rose-50 transition-colors"
                            title="Delete"
                            onClick={(e) => { e.stopPropagation(); onDeleteDocument(doc.id); }}
                          >
                            <Trash2 size={11} className="text-[#B0B0B0] group-hover:text-rose-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'pages' && (
          <div className="px-3 py-3">
            {totalPages === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center mb-3">
                  <Columns size={20} className="text-[#D0D0D0]" />
                </div>
                <p className="text-[12px] text-[#7A7A7A] font-medium">No pages available</p>
                <p className="text-[11px] text-[#B0B0B0] mt-1">Open a document to see pages</p>
              </div>
            ) : (
              <div>
                {/* Page count + loading hint */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[10px] text-[#B0B0B0]">
                    {thumbnailsLoading ? 'Rendering…' : `${totalPages} pages`}
                  </span>
                  {thumbnailsLoading && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#E42313] animate-pulse" />
                      <span className="text-[10px] text-[#E42313]">Loading</span>
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
                            ? 'bg-[#FEF2F2] ring-2 ring-[#E42313]/30'
                            : 'hover:bg-[#F8F8F8]'
                        }`}
                      >
                        {/* Thumbnail image */}
                        <div className="relative w-full rounded-lg overflow-hidden bg-[#F0F0F0] shadow-sm transition-shadow">
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
                              className="w-full bg-[#F0F0F0] animate-pulse"
                              style={{ paddingTop: `${(792 / 612) * 100}%` }} // letter aspect ratio
                            />
                          )}
                          {/* Page number badge */}
                          <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-md tabular-nums leading-none">
                            {page}
                          </div>
                          {/* Active indicator */}
                          {isActive && (
                            <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-[#E42313]" />
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
      <div className="px-4 py-2.5 border-t border-[#F0F0F0]">
        <p className="text-[10px] text-[#B0B0B0]">Immersive Reader · v1.0</p>
      </div>
    </aside>
  );
}
