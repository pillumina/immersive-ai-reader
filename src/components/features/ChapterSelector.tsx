import { useState, useEffect, useRef, memo } from 'react';
import { ChapterInfo } from '@/lib/pdf/parser';

interface ChapterSelectorProps {
  chapters: ChapterInfo[];
  currentChapter: ChapterInfo | null;
  totalPages: number;
  onConfirm: (selectedChapters: ChapterInfo[]) => void;
  onCancel: () => void;
}

export const ChapterSelector = memo(function ChapterSelector({
  chapters,
  currentChapter,
  totalPages,
  onConfirm,
  onCancel,
}: ChapterSelectorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
    if (currentChapter) {
      const idx = chapters.findIndex(
        (c) => c.startPage === currentChapter.startPage && c.title === currentChapter.title
      );
      if (idx >= 0) return new Set([idx]);
    }
    return new Set<number>();
  });

  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  const toggleChapter = (idx: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(idx)) {
      newSelected.delete(idx);
    } else {
      newSelected.add(idx);
    }
    setSelectedIds(newSelected);
  };

  const handleConfirm = () => {
    const selected = Array.from(selectedIds).map((idx) => chapters[idx]);
    if (selected.length > 0) {
      onConfirm(selected);
    }
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(chapters.map((_, idx) => idx)));
  };

  const handleSelectCurrentChapter = () => {
    if (currentChapter) {
      const idx = chapters.findIndex(
        (c) => c.startPage === currentChapter.startPage && c.title === currentChapter.title
      );
      if (idx >= 0) {
        setSelectedIds(new Set([idx]));
      }
    }
  };

  const selectedCount = selectedIds.size;
  const hasChapters = chapters.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-[var(--color-bg-raised)] rounded-2xl shadow-2xl border border-[var(--color-border)] w-[min(420px,calc(100vw-32px))] max-h-[70vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-[var(--color-bg-subtle)]">
          <h2 className="text-[15px] font-semibold text-[var(--color-text)]">Summarize Document</h2>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-1">
            {hasChapters
              ? 'Select chapters to summarize'
              : `Select a page range (document has ${totalPages} pages)`}
          </p>
        </div>

        {/* Chapter list */}
        <div className="flex-1 overflow-y-auto p-3">
          {hasChapters ? (
            <div className="space-y-1">
              {chapters.map((chapter, idx) => {
                const isSelected = selectedIds.has(idx);
                const isCurrentChapter =
                  currentChapter &&
                  chapter.startPage === currentChapter.startPage &&
                  chapter.title === currentChapter.title;

                return (
                  <button
                    key={`${chapter.startPage}-${chapter.title}`}
                    type="button"
                    onClick={() => toggleChapter(idx)}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                      isSelected
                        ? 'bg-[var(--color-accent-subtle)] border border-[var(--color-accent-border)]'
                        : 'hover:bg-[var(--color-bg)] border border-transparent'
                    }`}
                    style={{ paddingLeft: `${12 + chapter.level * 16}px` }}
                  >
                    <span
                      className={`shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-[var(--color-accent)] border-[var(--color-accent)]'
                          : 'border-[var(--color-border-subtle)]'
                      }`}
                    >
                      {isSelected && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="1.5,5 4,7.5 8.5,2.5" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className={`text-[13px] leading-snug ${
                          isSelected ? 'text-[var(--color-accent-hover)]' : 'text-[var(--color-text)]'
                        }`}
                      >
                        {chapter.title}
                      </span>
                      <span className="block text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {chapter.startPage === chapter.endPage
                          ? `Page ${chapter.startPage}`
                          : `Pages ${chapter.startPage}–${chapter.endPage}`}
                      </span>
                    </span>
                    {isCurrentChapter && (
                      <span className="shrink-0 text-[10px] font-medium text-[var(--color-accent)] bg-[var(--color-accent-subtle)] px-1.5 py-0.5 rounded">
                        Current
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Fallback: page range selector for documents without TOC */
            <div className="text-center py-8">
              <p className="text-[13px] text-[var(--color-text-secondary)]">No table of contents available</p>
              <p className="text-[12px] text-[var(--color-text-muted)] mt-1">
                This document doesn&apos;t have a navigable outline
              </p>
            </div>
          )}
        </div>

        {/* Quick actions */}
        {hasChapters && (
          <div className="px-5 py-3 border-t border-[var(--color-bg-subtle)] flex gap-2">
            <button
              type="button"
              onClick={handleSelectCurrentChapter}
              className="text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
            >
              Current chapter
            </button>
            <span className="text-[var(--color-border)]">·</span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors"
            >
              Select all
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--color-bg-subtle)] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedCount === 0}
            className="px-5 py-2 text-[13px] font-medium bg-[var(--color-accent)] text-white rounded-xl hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {selectedCount === 0
              ? 'Select chapters'
              : selectedCount === 1
                ? 'Summarize'
                : `Summarize ${selectedCount} chapters`}
          </button>
        </div>
      </div>
    </div>
  );
});
