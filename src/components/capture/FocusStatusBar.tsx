interface FocusStatusBarProps {
  currentPage: number;
  totalPages: number;
  maxProgress: number; // 0-100
  highlightsCount: number;
  notesCount: number;
  aiResponsesCount: number;
  /** Session duration in seconds */
  sessionDurationSecs: number;
  onExitFocusMode: () => void;
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function FocusStatusBar({
  currentPage,
  totalPages,
  maxProgress,
  highlightsCount,
  notesCount,
  aiResponsesCount,
  sessionDurationSecs,
  onExitFocusMode,
}: FocusStatusBarProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-[var(--color-bg-raised)]/95 backdrop-blur-sm border-t border-[var(--color-bg-subtle)] rounded-none"
      style={{ willChange: 'transform', transform: 'translateZ(0)' }}
    >
      {/* Page info */}
      <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] flex-shrink-0">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="tabular-nums">p.{currentPage}/{totalPages}</span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="flex-1 h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden max-w-32">
          <div
            className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-500"
            style={{ width: `${Math.min(maxProgress, 100)}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-[var(--color-text-secondary)] flex-shrink-0">
          {Math.round(maxProgress)}%
        </span>
      </div>

      {/* Capture counts */}
      <div className="hidden sm:flex items-center gap-3 text-[11px] text-[var(--color-text-muted)] flex-shrink-0">
        {highlightsCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-sm bg-[var(--color-accent)]" />
            {highlightsCount}
          </span>
        )}
        {notesCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-sm bg-[var(--color-ai)]" />
            {notesCount}
          </span>
        )}
        {aiResponsesCount > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-sm bg-[var(--color-success)]" />
            {aiResponsesCount}
          </span>
        )}
      </div>

      {/* Duration */}
      <div className="text-[11px] tabular-nums text-[var(--color-text-muted)] flex-shrink-0">
        ⏱ {formatDuration(sessionDurationSecs)}
      </div>

      {/* Exit button */}
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] transition-colors flex-shrink-0"
        onClick={onExitFocusMode}
        title="退出 Focus Mode"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        退出
      </button>
    </div>
  );
}
