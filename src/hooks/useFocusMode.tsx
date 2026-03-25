import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { focusCommands, FocusSession } from '@/lib/tauri/commands';

export interface FocusModeState {
  isActive: boolean;
  currentSessionId: string | null;
  currentDocumentId: string | null;
  resumeSession: FocusSession | null;
  /** Whether to show the resume session prompt */
  resumePromptVisible: boolean;
  miniAIWindowOpen: boolean;
  captureDrawerOpen: boolean;
  maxProgress: number;
  highlightsCount: number;
  notesCount: number;
  aiResponsesCount: number;
  summaryTriggered: boolean;
  /** Whether 80% summary prompt has been shown (to avoid showing twice) */
  summary80Shown: boolean;
  /** Whether 80% summary prompt is currently visible */
  summary80Visible: boolean;
}

interface FocusModeContextValue {
  state: FocusModeState;
  enterFocusMode: (documentId: string, currentPage: number, showResumePrompt?: boolean) => Promise<void>;
  exitFocusMode: (lastPage: number, maxScrollTop: number) => Promise<void>;
  updateProgress: (lastPage: number, maxScrollTop: number, maxPercentage: number) => void;
  updateCaptureCounts: (highlights: number, notes: number, aiResponses: number) => void;
  triggerSummary: () => void;
  toggleMiniAI: () => void;
  toggleCaptureDrawer: () => void;
  loadResumeSession: (documentId: string) => Promise<FocusSession | null>;
  dismissResumePrompt: () => void;
  dismissSummary80: () => void;
  acknowledgeSummary80: () => void;
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null);

export function FocusModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FocusModeState>({
    isActive: false,
    currentSessionId: null,
    currentDocumentId: null,
    resumeSession: null,
    resumePromptVisible: false,
    miniAIWindowOpen: false,
    captureDrawerOpen: false,
    maxProgress: 0,
    highlightsCount: 0,
    notesCount: 0,
    aiResponsesCount: 0,
    summaryTriggered: false,
    summary80Shown: false,
    summary80Visible: false,
  });

  const enterTimeRef = useRef<Date | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgressRef = useRef<{ lastPage: number; maxScrollTop: number; maxPercentage: number } | null>(null);

  const enterFocusMode = useCallback(async (documentId: string, currentPage: number, showResumePrompt = true) => {
    const sessionId = crypto.randomUUID();
    const enteredAt = new Date().toISOString();
    enterTimeRef.current = new Date();

    // Check for existing session to show resume prompt
    let existingSession: FocusSession | null = null;
    try {
      existingSession = await focusCommands.getLast(documentId);
    } catch {
      // ignore — proceed without resume
    }

    try {
      const session = await focusCommands.create(documentId, sessionId, enteredAt, currentPage);
      setState({
        isActive: true,
        currentSessionId: session.session_id,
        currentDocumentId: documentId,
        resumeSession: existingSession,
        resumePromptVisible: showResumePrompt && existingSession !== null,
        miniAIWindowOpen: false,
        captureDrawerOpen: false,
        maxProgress: existingSession?.max_read_percentage ?? 0,
        highlightsCount: existingSession?.highlights_count ?? 0,
        notesCount: existingSession?.notes_count ?? 0,
        aiResponsesCount: existingSession?.ai_responses_count ?? 0,
        summaryTriggered: false,
        summary80Shown: false,
        summary80Visible: false,
      });
    } catch (err) {
      console.error('[FocusMode] Failed to create session:', err);
      // Still enter locally even if DB fails
      setState((prev) => ({
        ...prev,
        isActive: true,
        currentSessionId: sessionId,
        currentDocumentId: documentId,
        resumeSession: existingSession,
        resumePromptVisible: showResumePrompt && existingSession !== null,
        maxProgress: existingSession?.max_read_percentage ?? 0,
        highlightsCount: existingSession?.highlights_count ?? 0,
        notesCount: existingSession?.notes_count ?? 0,
        aiResponsesCount: existingSession?.ai_responses_count ?? 0,
        summary80Shown: false,
        summary80Visible: false,
      }));
    }
  }, []);

  const exitFocusMode = useCallback(
    async (lastPage: number, maxScrollTop: number) => {
      const sessionId = state.currentSessionId;
      if (!sessionId) return;

      const exitedAt = new Date().toISOString();
      let durationMinutes: number | undefined;
      if (enterTimeRef.current) {
        durationMinutes = Math.round((Date.now() - enterTimeRef.current.getTime()) / 60000);
      }

      setState((prev) => ({ ...prev, isActive: false, currentSessionId: null }));
      enterTimeRef.current = null;

      // Cancel any pending debounced save
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      // Flush pending progress + exit time
      if (pendingProgressRef.current) {
        const p = pendingProgressRef.current;
        pendingProgressRef.current = null;
        try {
          await focusCommands.update(sessionId, {
            exited_at: exitedAt,
            duration_minutes: durationMinutes,
            last_page: p.lastPage,
            max_scroll_top: p.maxScrollTop,
            max_read_percentage: p.maxPercentage,
          });
        } catch (err) {
          console.error('[FocusMode] Failed to update session on exit:', err);
        }
      } else {
        try {
          await focusCommands.update(sessionId, {
            exited_at: exitedAt,
            duration_minutes: durationMinutes,
            last_page: lastPage,
            max_scroll_top: maxScrollTop,
          });
        } catch (err) {
          console.error('[FocusMode] Failed to update session on exit:', err);
        }
      }
    },
    [state.currentSessionId]
  );

  const updateProgress = useCallback(
    (lastPage: number, maxScrollTop: number, maxPercentage: number) => {
      pendingProgressRef.current = { lastPage, maxScrollTop, maxPercentage };

      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      progressTimerRef.current = setTimeout(async () => {
        const p = pendingProgressRef.current;
        if (!p || !state.currentSessionId) return;
        pendingProgressRef.current = null;
        progressTimerRef.current = null;

        try {
          await focusCommands.update(state.currentSessionId, {
            last_page: p.lastPage,
            max_scroll_top: p.maxScrollTop,
            max_read_percentage: p.maxPercentage,
          });
          setState((prev) => ({ ...prev, maxProgress: p.maxPercentage }));
        } catch (err) {
          console.error('[FocusMode] Failed to update progress:', err);
        }
      }, 1000);
    },
    [state.currentSessionId]
  );

  const updateCaptureCounts = useCallback(
    (highlights: number, notes: number, aiResponses: number) => {
      setState((prev) => ({
        ...prev,
        highlightsCount: highlights,
        notesCount: notes,
        aiResponsesCount: aiResponses,
      }));
      if (!state.currentSessionId) return;

      focusCommands
        .update(state.currentSessionId, {
          highlights_count: highlights,
          notes_count: notes,
          ai_responses_count: aiResponses,
        })
        .catch((err) => console.error('[FocusMode] Failed to update capture counts:', err));
    },
    [state.currentSessionId]
  );

  const triggerSummary = useCallback(() => {
    setState((prev) => ({ ...prev, summaryTriggered: true }));
    if (!state.currentSessionId) return;

    focusCommands
      .update(state.currentSessionId, { summary_triggered: true, summary_action: 'prompted' })
      .catch((err) => console.error('[FocusMode] Failed to update summary trigger:', err));
  }, [state.currentSessionId]);

  const toggleMiniAI = useCallback(() => {
    setState((prev) => ({ ...prev, miniAIWindowOpen: !prev.miniAIWindowOpen }));
  }, []);

  const toggleCaptureDrawer = useCallback(() => {
    setState((prev) => ({ ...prev, captureDrawerOpen: !prev.captureDrawerOpen }));
  }, []);

  const dismissResumePrompt = useCallback(() => {
    setState((prev) => ({ ...prev, resumePromptVisible: false }));
  }, []);

  const dismissSummary80 = useCallback(() => {
    setState((prev) => ({ ...prev, summary80Visible: false }));
  }, []);

  const acknowledgeSummary80 = useCallback(() => {
    setState((prev) => ({ ...prev, summary80Visible: false, summary80Shown: true }));
  }, []);

  const loadResumeSession = useCallback(async (documentId: string): Promise<FocusSession | null> => {
    try {
      const session = await focusCommands.getLast(documentId);
      setState((prev) => ({ ...prev, resumeSession: session ?? null, resumePromptVisible: session !== null }));
      return session;
    } catch (err) {
      console.error('[FocusMode] Failed to load resume session:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, []);

  return (
    <FocusModeContext.Provider
      value={{
        state,
        enterFocusMode,
        exitFocusMode,
        updateProgress,
        updateCaptureCounts,
        triggerSummary,
        toggleMiniAI,
        toggleCaptureDrawer,
        loadResumeSession,
        dismissResumePrompt,
        dismissSummary80,
        acknowledgeSummary80,
      }}
    >
      {children}
    </FocusModeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFocusMode(): FocusModeContextValue {
  const ctx = useContext(FocusModeContext);
  if (!ctx) throw new Error('useFocusMode must be used within FocusModeProvider');
  return ctx;
}
