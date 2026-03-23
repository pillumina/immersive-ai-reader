import { useState, useMemo } from 'react';
import { Search, Trash2, ExternalLink, Download, Edit3, ChevronDown } from 'lucide-react';
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
}

const NOTE_PREFIX = '__NOTE__|';

export function NotesManager({
  annotations,
  onJumpToPage,
  onDeleteNote,
  onUpdateNote,
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
    } catch {
      // Error is surfaced via toast in App.tsx; nothing extra needed here
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search & Filter Bar */}
      <div className="px-3 py-2.5 border-b border-[#e7e5e4]/60 flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a8a29e]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#e7e5e4] bg-[#fafaf9] text-[12px] text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus:ring-1 focus:ring-[#c2410c]/30 focus:border-[#c2410c]/40 transition-all"
          />
        </div>
        <div className="relative shrink-0">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'page' | 'date')}
            className="appearance-none pl-2.5 pr-6 py-1.5 rounded-lg border border-[#e7e5e4] bg-white text-[11px] text-[#78716c] focus:outline-none focus:ring-1 focus:ring-[#c2410c]/30 cursor-pointer"
          >
            <option value="date">Newest</option>
            <option value="page">By page</option>
          </select>
          <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#a8a29e] pointer-events-none" />
        </div>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[#a8a29e]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <p className="text-[12px] font-medium">{searchQuery ? 'No matching notes' : 'No notes yet'}</p>
            <p className="text-[11px] mt-0.5">{searchQuery ? 'Try a different search' : 'Right-click on a page to add notes'}</p>
          </div>
        ) : (
          <div className="p-2.5 space-y-2">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="group rounded-xl border border-[#e7e5e4]/80 bg-white p-3 hover:border-[#d6d3d1] hover:shadow-sm transition-all"
              >
                {/* Note Header */}
                <div className="flex items-center justify-between mb-1.5">
                  <button
                    onClick={() => onJumpToPage(note.pageNumber)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#fff7ed] text-[11px] font-medium text-[#9a3412] hover:bg-[#fed7aa] transition-colors"
                  >
                    <span>P.{note.pageNumber}</span>
                    <ExternalLink size={10} />
                  </button>
                  <span className="text-[10px] text-[#a8a29e]">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Selected Text Quote */}
                {note.selectedText && (
                  <div className="mb-2 pl-2.5 border-l-2 border-[#fed7aa]">
                    <p className="text-[11px] text-[#78716c] italic leading-snug line-clamp-2">{note.selectedText}</p>
                  </div>
                )}

                {/* Note Content */}
                {editingId === note.id ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#e7e5e4] bg-[#fafaf9] text-[12px] text-[#1c1917] resize-none focus:outline-none focus:ring-1 focus:ring-[#c2410c]/30"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={handleCancelEdit} className="px-2.5 py-1 rounded-md text-[11px] text-[#78716c] hover:bg-[#f5f5f4] transition-colors">Cancel</button>
                      <button onClick={handleSaveEdit} className="px-2.5 py-1 rounded-md text-[11px] font-medium text-white bg-[#c2410c] hover:bg-[#9a3412] transition-colors">Save</button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-[12px] text-[#1c1917] leading-relaxed mb-2"
                    dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(note.content) }}
                  />
                )}

                {/* Action Buttons */}
                {editingId !== note.id && (
                  <div className="flex items-center gap-1 pt-1.5 border-t border-[#f5f5f4]">
                    <button
                      onClick={() => handleStartEdit(note)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] text-[#a8a29e] hover:text-[#78716c] hover:bg-[#f5f5f4] transition-colors"
                    >
                      <Edit3 size={11} />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(note.id)}
                      disabled={deletingId === note.id}
                      className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] text-[#a8a29e] hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={11} />
                      {deletingId === note.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#e7e5e4]/60 flex items-center justify-between">
        <span className="text-[10px] text-[#a8a29e]">
          {filteredNotes.length === notes.length ? `${notes.length} notes` : `${filteredNotes.length} / ${notes.length}`}
        </span>
        <button
          onClick={handleExport}
          disabled={filteredNotes.length === 0}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#78716c] border border-[#e7e5e4] hover:bg-[#f5f5f4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Download size={11} />
          Export
        </button>
      </div>
    </div>
  );
}
