import { memo } from 'react';
export type CaptureType = 'note' | 'highlight' | 'ai-response';

interface BaseCaptureItem {
  id: string;
  type: CaptureType;
  pageNumber: number;
  capturedAt: string; // ISO date string
  /** Raw text content for preview */
  preview: string;
  /** Tags for notes */
  tags?: Array<{ name: string; color: string }>;
  /** Citation pages for AI responses */
  citations?: number[];
}

export interface NoteCaptureItem extends BaseCaptureItem {
  type: 'note';
  noteContent: string;
}

export interface HighlightCaptureItem extends BaseCaptureItem {
  type: 'highlight';
  highlightText: string;
  color?: string;
}

export interface AICaptureItem extends BaseCaptureItem {
  type: 'ai-response';
  aiContent: string;
  /** Message ID for pinning/unpinning */
  messageId?: string;
}

export type CaptureItem = NoteCaptureItem | HighlightCaptureItem | AICaptureItem;

interface CaptureItemProps {
  item: CaptureItem;
  /** Called when user clicks to jump to this capture's location in PDF */
  onJumpTo: (pageNumber: number) => void;
  /** Called when user clicks to edit (notes) */
  onEdit?: (item: CaptureItem) => void;
  onDelete?: (id: string) => void;
}

const TYPE_CONFIG: Record<CaptureType, { icon: string; label: string; color: string }> = {
  note: { icon: '📝', label: '笔记', color: '#6366f1' },
  highlight: { icon: '🔵', label: '高亮', color: '#3b82f6' },
  'ai-response': { icon: '🤖', label: 'AI 回复', color: '#10b981' },
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

export const CaptureItemComponent = memo(function CaptureItemComponent({
  item,
  onJumpTo,
  onEdit,
  onDelete,
}: CaptureItemProps) {
  const config = TYPE_CONFIG[item.type];
  const preview = item.preview || '';

  return (
    <div className="group relative rounded-xl border border-[var(--color-bg-subtle)] bg-[var(--color-bg-raised)] px-3 py-2.5 transition-all duration-100 hover:border-[var(--color-border)] hover:shadow-sm">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm leading-none flex-shrink-0">{config.icon}</span>
          <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">{config.label}</span>
          <span className="text-[10px] text-[var(--color-text-muted)]">p{item.pageNumber}</span>
          <span className="text-[10px] text-[var(--color-text-muted)]">{formatTime(item.capturedAt)}</span>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="flex items-center justify-center w-6 h-6 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] transition-colors"
            onClick={() => onJumpTo(item.pageNumber)}
            title="跳转到"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="5 9 2 12 5 15" />
              <polyline points="19 9 22 12 19 15" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          </button>
          {item.type === 'note' && onEdit && (
            <button
              type="button"
              className="flex items-center justify-center w-6 h-6 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)] transition-colors"
              onClick={() => onEdit(item)}
              title="编辑"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="flex items-center justify-center w-6 h-6 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-danger-subtle)] hover:text-[var(--color-danger)] transition-colors"
              onClick={() => onDelete(item.id)}
              title="删除"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content preview */}
      <p className="mt-1.5 text-[12px] text-[var(--color-text-secondary)] leading-relaxed line-clamp-2">
        {item.type === 'highlight' ? (
          <span className="italic text-[var(--color-text-secondary)]">「{preview}」</span>
        ) : (
          preview
        )}
      </p>

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag.name}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {item.tags.length > 3 && (
            <span className="text-[10px] text-[var(--color-text-muted)]">+{item.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Citations for AI responses */}
      {item.type === 'ai-response' && item.citations && item.citations.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {item.citations.map((p) => (
            <button
              key={p}
              type="button"
              className="text-[10px] text-[var(--color-accent)] hover:underline"
              onClick={() => onJumpTo(p)}
            >
              [ref:p{p}]
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
