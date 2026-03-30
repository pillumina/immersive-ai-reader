import { createPortal } from 'react-dom';
import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Plus, X, Tag } from 'lucide-react';
import { Tag as TagType, TAG_PRESET_COLORS, PRESET_TAGS, DEFAULT_TAG_COLOR } from '@/types/annotation';
import { tagCommands } from '@/lib/tauri';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface TagChipProps {
  tag: TagType;
  onRemove: (tagId: string) => void;
}

export function TagChip({ tag, onRemove }: TagChipProps) {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopup]);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setShowPopup(true)}
        className="inline-flex cursor-pointer items-center gap-0.5 rounded px-1 text-[9px] font-medium"
        style={{
          height: 16,
          backgroundColor: tag.color + '28',
          border: `1px solid ${tag.color}55`,
          color: tag.color,
          userSelect: 'none',
          whiteSpace: 'nowrap' as const,
        }}
      >
        {tag.name}
      </button>
      {showPopup && (
        <div
          ref={popupRef}
          role="dialog"
          aria-label={`Manage tag: ${tag.name}`}
          className="absolute left-0 top-full z-[9999] z-50 mt-1 min-w-[140px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-raised)] p-2 shadow-[0_4px_16px_rgba(28,25,23,0.12)]"
        >
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-secondary)]">
            <Tag size={10} />
            {tag.name}
          </p>
          <button
            type="button"
            onClick={() => { onRemove(tag.id); setShowPopup(false); }}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)]"
          >
            <X size={12} />
            Remove tag
          </button>
        </div>
      )}
    </span>
  );
}

interface TagManagePopupProps {
  annotationId: string;
  onClose: () => void;
  onTagsChanged: (tags: TagType[]) => void;
}

export const TagManagePopup = memo(function TagManagePopup({ annotationId, onClose, onTagsChanged }: TagManagePopupProps) {
  const [tags, setTags] = useState<TagType[]>([]);
  const [search, setSearch] = useState('');
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [selectedColor, setSelectedColor] = useState(DEFAULT_TAG_COLOR);
  const [newTagName, setNewTagName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus trap: keep Tab navigation within the popup
  useFocusTrap(containerRef, { active: true, onEscape: onClose });

  // Load current tags and all available tags
  useEffect(() => {
    const load = async () => {
      try {
        const [current, all] = await Promise.all([
          tagCommands.getByAnnotation(annotationId),
          tagCommands.getAll(),
        ]);
        setTags(current.map((t) => ({ id: t.id, name: t.name, color: t.color })));
        setAllTags(all.map((t) => ({ id: t.id, name: t.name, color: t.color })));
      } catch (e) {
        console.error('Failed to load tags:', e);
      }
    };
    void load();
  }, [annotationId]);

  // Filter suggestions
  const suggestions = useMemo(() => search.trim()
    ? allTags.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) &&
          !tags.some((tt) => tt.id === t.id)
      )
    : PRESET_TAGS.filter(
        (pt) => !tags.some((tt) => tt.name === pt.name)
      ),
    [search, allTags, tags]
  );

  const handleAddTag = async (name: string, color: string) => {
    if (!name.trim()) return;
    try {
      await tagCommands.addToAnnotation(annotationId, name.trim(), color);
      const updated = await tagCommands.getByAnnotation(annotationId);
      const mapped = updated.map((t) => ({ id: t.id, name: t.name, color: t.color }));
      setTags(mapped);
      onTagsChanged(mapped);
      setSearch('');
      setNewTagName('');
    } catch (e) {
      console.error('Failed to add tag:', e);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId);
    if (!tag) return;
    try {
      await tagCommands.removeFromAnnotation(annotationId, tag.name);
      const updated = tags.filter((t) => t.id !== tagId);
      setTags(updated);
      onTagsChanged(updated);
    } catch (e) {
      console.error('Failed to remove tag:', e);
    }
  };

  const handleCreateNew = () => {
    if (newTagName.trim()) {
      void handleAddTag(newTagName.trim(), selectedColor);
    }
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Popup */}
      <div
        ref={containerRef}
        role="dialog"
        aria-label="Manage card tags"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[10000] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-raised)] p-4 shadow-[0_16px_48px_rgba(28,25,23,0.18)]"
      >
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-text)]">
            <Tag size={14} />
            Card Tags
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="cursor-pointer rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Current tags */}
        {tags.length > 0 && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Applied
            </p>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  aria-label={`Remove tag: ${tag.name}`}
                  onClick={() => void handleRemoveTag(tag.id)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: tag.color + '22',
                    border: `1px solid ${tag.color}55`,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <X size={10} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add tag section */}
        <div className="mb-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Add tag
          </p>
          <input
            value={newTagName || search}
            onChange={(e) => { setNewTagName(e.target.value); setSearch(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNew(); }}
            aria-label="New tag name"
            placeholder="Tag name..."
            className="mb-1.5 box-border w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
          />
          {/* Color palette */}
          <div className="mb-2 flex flex-wrap gap-1">
            {TAG_PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Select color ${color}`}
                aria-pressed={selectedColor === color}
                onClick={() => setSelectedColor(color)}
                className="h-5 w-5 cursor-pointer rounded-full"
                style={{
                  background: color,
                  border: selectedColor === color
                    ? '2px solid var(--color-text)'
                    : '2px solid transparent',
                  outline: selectedColor === color ? '2px solid var(--color-bg-raised)' : 'none',
                  outlineOffset: '-2px',
                  boxShadow: '0 1px 3px rgba(28,25,23,0.2)',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleCreateNew}
            disabled={!newTagName.trim() && !search.trim()}
            className="w-full cursor-pointer rounded-md py-1.5 text-[12px] font-medium transition-colors"
            style={{
              border: 'none',
              background: newTagName.trim()
                ? 'var(--color-accent)'
                : 'var(--color-border)',
              color: newTagName.trim()
                ? 'var(--color-accent-text, #fff)'
                : 'var(--color-text-muted)',
            }}
          >
            Add &ldquo;{newTagName.trim() || search.trim() || '...'}&rdquo;
          </button>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Suggestions
            </p>
            <div className="flex flex-wrap gap-1">
              {suggestions.slice(0, 8).map((t) => (
                <button
                  type="button"
                  key={(t as TagType).id || t.name}
                  aria-label={`Add tag: ${t.name}`}
                  onClick={() => void handleAddTag(t.name, t.color)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]"
                  style={{
                    background: t.color + '18',
                    border: `1px solid ${t.color}44`,
                    color: t.color,
                  }}
                >
                  <Plus size={10} />
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
});
