import { ZoomIn, ZoomOut, Loader } from 'lucide-react';
import { MouseEvent, WheelEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PdfOutlineItem } from '@/lib/pdf/renderer';

interface MainCanvasProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomByFactor: (factor: number) => void;
  hasDocument: boolean;
  isLoading?: boolean;
  currentPage: number;
  totalPages: number;
  outline: PdfOutlineItem[];
  onJumpToPage: (page: number) => void;
  onHighlightSelection: () => void;
  onAddNoteSelection: () => void;
}

export function MainCanvas({
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onZoomByFactor,
  hasDocument,
  isLoading,
  currentPage,
  totalPages,
  outline,
  onJumpToPage,
  onHighlightSelection,
  onAddNoteSelection,
}: MainCanvasProps) {
  const [tocOpen, setTocOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    onZoomByFactor(event.deltaY < 0 ? 1.08 : 1 / 1.08);
  };

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <main className="flex-1 flex flex-col bg-[#EEF2F7] relative">
      <div className="h-12 border-b border-[#E3E8F0] bg-white/95 backdrop-blur flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onZoomIn}>
            <ZoomIn size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={onZoomOut}>
            <ZoomOut size={16} />
          </Button>
          <span className="text-sm text-gray-600 ml-2">{Math.round(zoomLevel * 100)}%</span>
          {totalPages > 0 && (
            <span className="text-sm text-gray-600 ml-3">
              Page {currentPage} / {totalPages}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onHighlightSelection}>
            Highlight
          </Button>
          <span className="text-xs text-gray-500">Ctrl/Cmd + Wheel to zoom</span>
          {outline.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setTocOpen((v) => !v)}>
              {tocOpen ? 'Hide TOC' : 'Show TOC'}
            </Button>
          )}
        </div>
      </div>

      <div
        id="pdf-scroll-container"
        className="flex-1 overflow-auto p-4"
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        {hasDocument ? (
          <div className="relative">
            <div id="pdf-pages-container" className="pdf-pages-container" />
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70">
                <Loader className="animate-spin" size={48} />
                <p className="text-gray-600">Processing PDF...</p>
              </div>
            )}
          </div>
        ) : isLoading ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <Loader className="animate-spin" size={48} />
            <p className="text-gray-600">Processing PDF...</p>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-400">Upload a PDF to get started</p>
          </div>
        )}
      </div>

      {outline.length > 0 && tocOpen && (
        <aside className="absolute right-0 top-12 bottom-0 w-[300px] bg-white border-l border-[#E8E8E8] shadow-xl z-20 overflow-auto">
          <div className="sticky top-0 bg-white border-b border-[#E8E8E8] px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Table of Contents</h3>
            <button className="text-xs text-gray-500 hover:text-black" onClick={() => setTocOpen(false)}>
              Close
            </button>
          </div>
          <div className="p-2">
            {outline.map((item) => (
              <button
                key={item.id}
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 rounded"
                style={{ paddingLeft: `${8 + item.level * 14}px` }}
                disabled={!item.pageNumber}
                onClick={() => {
                  if (item.pageNumber) {
                    onJumpToPage(item.pageNumber);
                  }
                }}
              >
                <span className="text-gray-800">{item.title}</span>
                {item.pageNumber && <span className="text-xs text-gray-500 ml-2">p.{item.pageNumber}</span>}
              </button>
            ))}
          </div>
        </aside>
      )}

      {contextMenu && (
        <div
          className="fixed z-30 bg-white border border-gray-200 shadow-lg rounded p-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {outline.length > 0 && (
            <button
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded"
              onClick={() => {
                setTocOpen(true);
                setContextMenu(null);
              }}
            >
              Open TOC Sidebar
            </button>
          )}
          <button
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded"
            onClick={() => {
              onHighlightSelection();
              setContextMenu(null);
            }}
          >
            Highlight Selection
          </button>
          <button
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 rounded"
            onClick={() => {
              onAddNoteSelection();
              setContextMenu(null);
            }}
          >
            Add Note from Selection
          </button>
        </div>
      )}
    </main>
  );
}
