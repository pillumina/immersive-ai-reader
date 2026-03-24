import { createPortal } from 'react-dom';
import { useState, useEffect, useRef } from 'react';
import { Plus, X, Tag } from 'lucide-react';
import { Tag as TagType, TAG_PRESET_COLORS, PRESET_TAGS, DEFAULT_TAG_COLOR } from '@/types/annotation';
import { tagCommands } from '@/lib/tauri';

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
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onClick={() => setShowPopup(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          height: '16px',
          padding: '0 4px',
          borderRadius: '4px',
          backgroundColor: tag.color + '28',
          border: `1px solid ${tag.color}55`,
          color: tag.color,
          fontSize: '9px',
          fontWeight: 500,
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap' as const,
        }}
      >
        {tag.name}
      </span>
      {showPopup && (
        <div
          ref={popupRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: '0',
            zIndex: 9999,
            background: '#fff',
            border: '1px solid #e7e5e4',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '8px',
            minWidth: '140px',
          }}
        >
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>
            <Tag size={10} style={{ display: 'inline', marginRight: '4px' }} />
            {tag.name}
          </div>
          <div
            onClick={() => { onRemove(tag.id); setShowPopup(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 6px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#ef4444',
              background: '#fef2f2',
              border: '1px solid #fecaca',
            }}
          >
            <X size={12} />
            Remove tag
          </div>
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

export function TagManagePopup({ annotationId, onClose, onTagsChanged }: TagManagePopupProps) {
  const [tags, setTags] = useState<TagType[]>([]);
  const [search, setSearch] = useState('');
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [selectedColor, setSelectedColor] = useState(DEFAULT_TAG_COLOR);
  const [newTagName, setNewTagName] = useState('');

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
  const suggestions = search.trim()
    ? allTags.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) &&
          !tags.some((tt) => tt.id === t.id)
      )
    : PRESET_TAGS.filter(
        (pt) => !tags.some((tt) => tt.name === pt.name)
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

  // Position: center of screen
  const style: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 10000,
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.25)',
          zIndex: 9999,
        }}
      />
      {/* Popup */}
      <div style={style}>
        <div
          style={{
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
            padding: '16px',
            width: '260px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#1c1917' }}>
              <Tag size={14} />
              Card Tags
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Current tags */}
          {tags.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Applied
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '4px' }}>
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    onClick={() => void handleRemoveTag(tag.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      backgroundColor: tag.color + '22',
                      border: `1px solid ${tag.color}55`,
                      color: tag.color,
                      fontSize: '11px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                    title="Click to remove"
                  >
                    {tag.name}
                    <X size={10} />
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Add tag section */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Add tag
            </div>
            <input
              value={newTagName || search}
              onChange={(e) => { setNewTagName(e.target.value); setSearch(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNew(); }}
              placeholder="Tag name..."
              style={{
                width: '100%',
                padding: '6px 8px',
                border: '1px solid #e7e5e4',
                borderRadius: '6px',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '6px',
              }}
            />
            {/* Color palette */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' as const }}>
              {TAG_PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: color,
                    border: selectedColor === color ? '2px solid #1c1917' : '2px solid transparent',
                    cursor: 'pointer',
                    padding: 0,
                    outline: selectedColor === color ? '2px solid #fff' : 'none',
                    outlineOffset: '-2px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleCreateNew}
              disabled={!newTagName.trim() && !search.trim()}
              style={{
                width: '100%',
                padding: '6px',
                borderRadius: '6px',
                border: 'none',
                background: newTagName.trim() ? '#0d9488' : '#e7e5e4',
                color: newTagName.trim() ? '#fff' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 500,
                cursor: newTagName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Add &ldquo;{newTagName.trim() || search.trim() || '...'}&rdquo;
            </button>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Suggestions
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '4px' }}>
                {suggestions.slice(0, 8).map((t) => (
                  <button
                    key={(t as TagType).id || t.name}
                    onClick={() => void handleAddTag(t.name, t.color)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      background: t.color + '18',
                      border: `1px solid ${t.color}44`,
                      color: t.color,
                      fontSize: '11px',
                      cursor: 'pointer',
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
      </div>
    </>,
    document.body
  );
}
