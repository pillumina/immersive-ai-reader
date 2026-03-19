import { useState, useMemo } from 'react';
import { Search, Trash2, ExternalLink, X, Download, Edit3, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { simpleMarkdownToHtml } from '@/utils/markdown';

interface Note {
  id: string;
  pageNumber: number;
  content: string;
  selectedText: string;
  createdAt: string;
}

interface NotesManagerProps {
  annotations: Array<{
    id: string;
    page_number: number;
    text: string;
    created_at: string;
  }>;
  onJumpToPage: (page: number) => void;
  onDeleteNote: (annotationId: string) => Promise<void>;
  onUpdateNote: (annotationId: string, newContent: string) => Promise<void>;
  onClose: () => void;
}

const NOTE_PREFIX = '__NOTE__|';

export function NotesManager({
  annotations,
  onJumpToPage,
  onDeleteNote,
  onUpdateNote,
  onClose,
}: NotesManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'page' | 'date'>('date');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Parse notes from annotations
  const notes: Note[] = useMemo(() => {
    return annotations
      .filter((a) => {
        const text = typeof a.text === 'string' ? a.text : '';
        return text.startsWith(NOTE_PREFIX);
      })
      .map((a) => {
        const text = typeof a.text === 'string' ? a.text.slice(NOTE_PREFIX.length) : '';
        const parts = text.split('\n\n');
        const content = parts[0] || '';
        const selectedText = parts.slice(1).join('\n\n');
        return {
          id: a.id,
          pageNumber: Number(a.page_number),
          content,
          selectedText,
          createdAt: a.created_at,
        };
      });
  }, [annotations]);

  // Filter and sort notes
  const filteredNotes = useMemo(() => {
    let result = [...notes];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (note) =>
          note.content.toLowerCase().includes(query) ||
          note.selectedText.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'page') {
        return a.pageNumber - b.pageNumber;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [notes, searchQuery, sortBy]);

  // Export all notes as Markdown
  const handleExport = () => {
    const markdown = filteredNotes
      .map((note, idx) => {
        const date = new Date(note.createdAt).toLocaleDateString();
        return `## ${idx + 1}. Page ${note.pageNumber} (${date})

${note.selectedText ? `> ${note.selectedText}\n` : ''}
${note.content}

---
`;
      })
      .join('\n');

    const blob = new Blob([`# Notes Export\n\nTotal: ${filteredNotes.length} notes\n\n${markdown}`], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-export-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleStartEdit = (note: Note) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await onUpdateNote(editingId, editContent);
      setEditingId(null);
      setEditContent('');
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteNote(id);
    } catch (err) {
      console.error('Failed to delete note:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800">Notes Manager</h2>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-xs text-slate-500 font-medium">
              {filteredNotes.length} notes
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'page' | 'date')}
              className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              <option value="date">Newest first</option>
              <option value="page">By page</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <p className="text-sm font-medium">{searchQuery ? 'No matching notes' : 'No notes yet'}</p>
              <p className="text-xs mt-1">{searchQuery ? 'Try a different search term' : 'Right-click on a page to add notes'}</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  {/* Note Header */}
                  <div className="flex items-center justify-between mb-2">
                    <button
                      onClick={() => onJumpToPage(note.pageNumber)}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                    >
                      <span>Page {note.pageNumber}</span>
                      <ExternalLink size={11} />
                    </button>
                    <span className="text-xs text-slate-400">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Selected Text Quote */}
                  {note.selectedText && (
                    <div className="mb-2 pl-3 border-l-2 border-sky-200">
                      <p className="text-xs text-slate-500 italic line-clamp-2">{note.selectedText}</p>
                    </div>
                  )}

                  {/* Note Content */}
                  {editingId === note.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        rows={3}
                        autoFocus
                      />
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="secondary" onClick={handleCancelEdit}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSaveEdit}>
                          <Check size={13} />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="text-sm text-slate-700 leading-relaxed prose prose-sm prose-slate max-w-none mb-3"
                      dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(note.content) }}
                    />
                  )}

                  {/* Action Buttons */}
                  {editingId !== note.id && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleStartEdit(note)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <Edit3 size={12} />
                        Edit
                      </button>
                      <button
                        onClick={() => onJumpToPage(note.pageNumber)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <ExternalLink size={12} />
                        Jump
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={deletingId === note.id}
                        className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        {deletingId === note.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {filteredNotes.length} of {notes.length} notes
          </span>
          <Button size="sm" variant="secondary" onClick={handleExport} disabled={filteredNotes.length === 0}>
            <Download size={13} />
            Export All
          </Button>
        </div>
      </div>
    </div>
  );
}
