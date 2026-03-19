import { FileUp, Settings, Trash2, Link } from 'lucide-react';
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
}

export function Sidebar({
  onUpload,
  onOpenSettings,
  documents,
  currentDocumentId,
  onSelectDocument,
  onDeleteDocument,
  onRelinkDocument,
}: SidebarProps) {
  return (
    <aside className="w-[300px] border-r border-[#E3E8F0] bg-[#F8FAFC] flex flex-col">
      <div className="p-6 border-b border-[#E3E8F0]">
        <div className="flex items-center gap-3">
          <img
            src="/app-logo.svg"
            alt="Immersive Reader logo"
            className="h-10 w-10 rounded-2xl ring-1 ring-black/5 shadow-sm"
          />
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Immersive Reader</h1>
        </div>
        <p className="text-xs text-[#6B7280] mt-1">Document + AI workspace</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <Button onClick={onUpload} className="w-full flex items-center gap-2">
          <FileUp size={20} />
          Upload PDF
        </Button>

        <Button variant="secondary" onClick={onOpenSettings} className="w-full flex items-center gap-2">
          <Settings size={20} />
          Settings
        </Button>

        <div className="pt-4">
          <p className="text-xs font-semibold text-[#6B7280] mb-2 uppercase tracking-wide">Recent Documents</p>
          <div className="space-y-1 max-h-[320px] overflow-auto">
            {documents.length === 0 ? (
              <p className="text-xs text-gray-400">No documents yet</p>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`w-full flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border transition-colors ${
                    currentDocumentId === doc.id
                      ? 'border-[#E42313]/40 bg-[#fff1f0] text-[#C62314]'
                      : 'border-transparent hover:bg-white text-gray-700'
                  }`}
                  title={doc.fileName}
                >
                  <button
                    className="flex-1 text-left truncate"
                    onClick={() => onSelectDocument(doc.id)}
                  >
                    {doc.fileName}
                  </button>
                  <button
                    className="p-1 rounded hover:bg-black/5"
                    title="Relink file"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRelinkDocument(doc.id);
                    }}
                  >
                    <Link size={12} />
                  </button>
                  <button
                    className="p-1 rounded hover:bg-black/5"
                    title="Delete document"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDocument(doc.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-[#E3E8F0]">
        <p className="text-xs text-[#8A94A6]">v1.0.0 - MVP</p>
      </div>
    </aside>
  );
}
