import { useEffect, useRef, useState, useCallback } from 'react';
import { tagCommands } from '@/lib/tauri/commands';
import type { BackendTag } from '@/lib/tauri/commands';
import { simpleMarkdownToHtml } from '@/utils/markdown';

interface L3NoteEditorProps {
  /** Annotation ID — if provided, edit existing note */
  annotationId?: string;
  /** Quote text to show as reference (from selected highlight) */
  quoteText?: string;
  /** Pre-loaded note content (for editing existing notes) */
  existingNoteText?: string;
  pageNumber?: number;
  /** Called when the editor is closed (saved or cancelled) */
  onClose: () => void;
  /** Called after successful save */
  onSave?: (annotationId: string) => void;
  /** Called to add a new note at selection */
  onAddNote?: (
    content: string,
    position: { x: number; y: number } | undefined,
    targetPageNumber: number | undefined,
    capturedSelectedText?: string
  ) => Promise<unknown>;
}

interface TagInput {
  id?: string;
  name: string;
  color: string;
}

const NOTE_PREFIX = '__NOTE__|';

export function L3NoteEditor({
  annotationId,
  quoteText,
  existingNoteText,
  pageNumber,
  onClose,
  onSave,
  onAddNote,
}: L3NoteEditorProps) {
  const [noteContent, setNoteContent] = useState(existingNoteText ?? '');
  const [tags, setTags] = useState<TagInput[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [suggestions, setSuggestions] = useState<BackendTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load tags for existing annotation
  useEffect(() => {
    if (!annotationId) return;
    let cancelled = false;
    (async () => {
      try {
        const annTags = await tagCommands.getByAnnotation(annotationId);
        if (!cancelled) {
          setTags(annTags.map((t) => ({ id: t.id, name: t.name, color: t.color })));
        }
      } catch {
        // silent
      }
    })();
    return () => { cancelled = true; };
  }, [annotationId]);

  // Load tag suggestions for autocomplete
  useEffect(() => {
    if (!tagInput.trim()) { setSuggestions([]); return; }
    let cancelled = false;
    (async () => {
      const results = await tagCommands.search(tagInput.trim());
      if (!cancelled) setSuggestions(results.filter((t) => !tags.some((g) => g.name === t.name)));
    })();
    return () => { cancelled = true; };
  }, [tagInput, tags]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiscardConfirm) { setShowDiscardConfirm(false); return; }
        if (dirty) { setShowDiscardConfirm(true); return; }
        onClose();
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [dirty, showDiscardConfirm, onClose]);

  // Close on backdrop click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current && !containerRef.current.contains(target)) {
        if (dirty) { setShowDiscardConfirm(true); return; }
        onClose();
      }
    };
    // Delay so opening click doesn't immediately close
    const t = setTimeout(() => globalThis.addEventListener('mousedown', handler), 100);
    return () => {
      clearTimeout(t);
      globalThis.removeEventListener('mousedown', handler);
    };
  }, [dirty, onClose]);

  // Auto-focus textarea
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const trimmed = noteContent.trim();
      if (!trimmed) return;

      if (annotationId) {
        // Update existing annotation text
        const fullText = `${NOTE_PREFIX}${trimmed}${quoteText ? `\n\n${quoteText}` : ''}`;
        await (await import('@/lib/tauri/commands')).annotationCommands.updateText(annotationId, fullText);
        // Update tags
        await tagCommands.setAnnotationTags(
          annotationId,
          tags.map((t) => t.name),
          tags.map((t) => t.color)
        );
        onSave?.(annotationId);
      } else {
        // Create new note via onAddNote callback
        if (onAddNote) {
          await onAddNote(trimmed, undefined, pageNumber, quoteText || undefined);
        }
      }
      onClose();
    } catch (err) {
      console.error('[L3NoteEditor] Save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [annotationId, noteContent, quoteText, tags, pageNumber, onAddNote, onSave, onClose, saving]);

  const handleTagAdd = useCallback((name: string, color = '#6366f1') => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.name === trimmed)) return;
    setTags((prev) => [...prev, { name: trimmed, color }]);
    setTagInput('');
    setSuggestions([]);
    setDirty(true);
  }, [tags]);

  const handleTagRemove = useCallback((name: string) => {
    setTags((prev) => prev.filter((t) => t.name !== name));
    setDirty(true);
  }, []);

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-[10vh] bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={containerRef}
        className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-[0_16px_64px_rgba(0,0,0,0.2),0_4px_16px_rgba(0,0,0,0.1)] border border-[#e7e5e4]/60 flex flex-col overflow-hidden animate-in slide-in-from-top-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#f5f5f4]">
          <div className="flex items-center gap-2 text-xs text-[#a8a29e]">
            {pageNumber && (
              <>
                <span>第 {pageNumber} 页</span>
                <span>·</span>
              </>
            )}
            <span>{annotationId ? '编辑笔记' : '新建笔记'}</span>
          </div>
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-[#a8a29e] hover:bg-[#f5f5f4] hover:text-[#78716c] transition-colors"
            onClick={() => {
              if (dirty) { setShowDiscardConfirm(true); return; }
              onClose();
            }}
            title="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Quote block */}
          {quoteText && (
            <div className="rounded-xl bg-[#f5f5f4] border-l-4 border-blue-300 px-4 py-3">
              <div className="text-[11px] font-medium text-[#a8a29e] uppercase tracking-wider mb-1.5">引用原文</div>
              <p className="text-[13px] text-[#57534e] italic leading-relaxed line-clamp-4">{quoteText}</p>
            </div>
          )}

          {/* Tags input */}
          <div>
            <div className="text-[11px] font-medium text-[#a8a29e] uppercase tracking-wider mb-2">标签</div>
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#e7e5e4] px-3 py-2 bg-white min-h-[40px]">
              {tags.map((tag) => (
                <span
                  key={tag.name}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                  <button
                    type="button"
                    className="ml-0.5 leading-none hover:opacity-70 transition-opacity"
                    onClick={() => handleTagRemove(tag.name)}
                  >
                    ×
                  </button>
                </span>
              ))}
              <div className="relative flex-1 min-w-[120px]">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleTagAdd(tagInput);
                    }
                    if (e.key === 'Escape') { setTagInput(''); setSuggestions([]); }
                  }}
                  placeholder="添加标签（回车确认）"
                  className="w-full text-[13px] text-[#1c1917] placeholder:text-[#d6d3d1] outline-none bg-transparent"
                />
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-xl border border-[#e7e5e4] shadow-lg z-10 py-1">
                    {suggestions.slice(0, 5).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-[13px] text-[#1c1917] hover:bg-[#f5f5f4] flex items-center gap-2"
                        onClick={() => handleTagAdd(s.name, s.color)}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Note content */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium text-[#a8a29e] uppercase tracking-wider">笔记</div>
              <button
                type="button"
                className="text-[11px] text-[#a8a29e] hover:text-blue-500 transition-colors"
                onClick={() => setShowPreview((p) => !p)}
              >
                {showPreview ? '编辑' : '预览'}
              </button>
            </div>
            {showPreview ? (
              <div
                className="min-h-[160px] rounded-xl border border-[#e7e5e4] px-4 py-3 text-[13px] text-[#1c1917] leading-relaxed prose prose-sm prose-stone"
                dangerouslySetInnerHTML={{
                  __html: simpleMarkdownToHtml(noteContent) || '<p class="text-[#d6d3d1]">无内容</p>',
                }}
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={noteContent}
                onChange={(e) => { setNoteContent(e.target.value); setDirty(true); }}
                placeholder="写下你的笔记... 支持 Markdown：`**加粗**`、`code`、> 引用"
                className="min-h-[160px] rounded-xl border border-[#e7e5e4] px-4 py-3 text-[13px] text-[#1c1917] placeholder:text-[#d6d3d1] leading-relaxed resize-none outline-none focus:border-blue-400 transition-colors"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#f5f5f4]">
          {annotationId && (
            <button
              type="button"
              className="text-xs text-red-400 hover:text-red-600 transition-colors"
              onClick={async () => {
                try {
                  const { annotationCommands: ac } = await import('@/lib/tauri/commands');
                  await ac.delete(annotationId);
                  onSave?.(annotationId);
                  onClose();
                } catch { /* ignore */ }
              }}
            >
              删除笔记
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-[13px] font-medium text-[#78716c] hover:bg-[#f5f5f4] transition-colors"
              onClick={() => {
                if (dirty) { setShowDiscardConfirm(true); return; }
                onClose();
              }}
            >
              关闭
            </button>
            <button
              type="button"
              className="px-5 py-2 rounded-xl text-[13px] font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              onClick={handleSave}
              disabled={saving || !noteContent.trim()}
            >
              {saving ? '保存中…' : '保存笔记'}
            </button>
          </div>
        </div>

        {/* Discard confirmation overlay */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-2xl z-10">
            <div className="text-center p-6">
              <p className="text-sm font-medium text-[#1c1917] mb-4">有未保存的内容，确定放弃？</p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-[13px] font-medium text-[#78716c] hover:bg-[#f5f5f4] transition-colors"
                  onClick={() => setShowDiscardConfirm(false)}
                >
                  继续编辑
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-[13px] font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
                  onClick={onClose}
                >
                  放弃
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
