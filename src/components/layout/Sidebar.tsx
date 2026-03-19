import { FileUp, Settings, Trash2, Link, FileText } from 'lucide-react';
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
    <aside className="w-[280px] border-r border-[#E3E8F0] bg-gradient-to-b from-[#FAFBFD] to-[#F4F6FA] flex flex-col select-none">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[#E3E8F0]/70">
        <div className="flex items-center gap-2.5">
          <img
            src="/app-logo.svg"
            alt="Immersive Reader"
            className="h-9 w-9 rounded-xl ring-1 ring-black/[0.04] shadow-sm"
          />
          <div>
            <h1 className="text-lg font-bold text-[#111827] leading-tight tracking-tight">Immersive Reader</h1>
            <p className="text-[10px] text-[#94A3B8] leading-none mt-0.5">Document + AI workspace</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pt-4 pb-2 space-y-1.5">
        <Button onClick={onUpload} className="w-full">
          <FileUp size={16} />
          Upload PDF
        </Button>
        <Button variant="secondary" onClick={onOpenSettings} className="w-full">
          <Settings size={16} />
          Settings
        </Button>
      </div>

      {/* Document list */}
      <div className="flex-1 px-4 pt-3 pb-2 overflow-hidden flex flex-col">
        <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-2 px-1">
          Documents
          {documents.length > 0 && (
            <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#E5EAF3] px-1 text-[9px] font-bold text-[#64748B] not-italic normal-case tracking-normal">
              {documents.length}
            </span>
          )}
        </p>
        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-0.5">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText size={28} className="text-[#D1D5DB] mb-2" />
              <p className="text-xs text-[#94A3B8]">No documents yet</p>
              <p className="text-[10px] text-[#CBD5E1] mt-0.5">Upload a PDF to get started</p>
            </div>
          ) : (
            documents.map((doc) => {
              const isActive = currentDocumentId === doc.id;
              return (
                <div
                  key={doc.id}
                  className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-[#FEF2F2] text-[#C62314] shadow-sm ring-1 ring-[#E42313]/10'
                      : 'text-[#475569] hover:bg-white hover:shadow-sm'
                  }`}
                  onClick={() => onSelectDocument(doc.id)}
                >
                  <FileText size={14} className={`shrink-0 ${isActive ? 'text-[#E42313]' : 'text-[#94A3B8] group-hover:text-[#64748B]'} transition-colors`} />
                  <span className="flex-1 truncate font-medium">{doc.fileName}</span>
                  <div className={`flex items-center gap-0.5 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button
                      className="rounded p-1 hover:bg-black/[0.04] transition-colors"
                      title="Relink file"
                      onClick={(e) => { e.stopPropagation(); onRelinkDocument(doc.id); }}
                    >
                      <Link size={11} />
                    </button>
                    <button
                      className="rounded p-1 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); onDeleteDocument(doc.id); }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#E3E8F0]/50">
        <p className="text-[10px] text-[#C1C7D0]">v1.0.0 — MVP</p>
      </div>
    </aside>
  );
}
