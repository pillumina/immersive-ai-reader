import { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainCanvas } from '@/components/layout/MainCanvas';
import { AIPanel } from '@/components/layout/AIPanel';
import { SettingsModal } from '@/components/features/SettingsModal';
import { Toast } from '@/components/ui/Toast';
import { usePDF } from '@/hooks/usePDF';
import { useAI } from '@/hooks/useAI';
import { useSettings } from '@/hooks/useSettings';
import { useCanvasRendering } from '@/hooks/useCanvasRendering';
import { AIConfig } from '@/types/settings';
import { aiCommands, annotationCommands } from '@/lib/tauri';

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

function App() {
  const {
    currentDocument,
    documents,
    openPDFFile,
    restoreLastDocument,
    selectDocument,
    deleteDocument,
    relinkDocument,
    error: pdfError,
    isLoading: pdfLoading,
  } = usePDF();
  const {
    aiConfig,
    activeProfile,
    profiles,
    loadSettings,
    saveActiveProfile,
    createNewProfile,
    switchProfile,
    deleteProfile,
    renameProfile,
  } = useSettings();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Canvas rendering
  const {
    isRendering,
    renderError,
    totalPages,
    currentPage,
    outline,
    jumpToPage,
    jumpToCitation,
    highlightSelection,
    addNoteForSelection,
    pinNoteToCurrentPage,
  } = useCanvasRendering(
    'pdf-scroll-container',
    'pdf-pages-container',
    currentDocument,
    zoomLevel
  );

  const aiContext = useMemo(() => ({
    currentPage,
    documentTitle: currentDocument?.fileName || '',
  }), [currentPage, currentDocument?.fileName]);

  const getAIContext = useMemo(() => {
    return () => ({
      ...aiContext,
      selectedText: globalThis.getSelection?.()?.toString().trim() || '',
    });
  }, [aiContext]);

  const {
    messages,
    isLoading: aiLoading,
    error: aiError,
    sendMessage,
    retryAssistantMessage,
    stopGeneration,
    loadHistory,
  } = useAI(
    currentDocument?.id || '',
    aiConfig,
    getAIContext
  );

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    restoreLastDocument();
  }, [restoreLastDocument]);

  useEffect(() => {
    if (currentDocument) {
      loadHistory();
    }
  }, [currentDocument, loadHistory]);

  useEffect(() => {
    if (renderError) {
      setToast({ message: renderError, type: 'error' });
    }
  }, [renderError]);

  useEffect(() => {
    if (pdfError) {
      setToast({ message: pdfError, type: 'error' });
    }
  }, [pdfError]);

  useEffect(() => {
    if (aiError) {
      setToast({ message: aiError, type: 'error' });
    }
  }, [aiError]);

  const handleUpload = async () => {
    try {
      setToast({ message: 'Opening PDF file...', type: 'info' });
      await openPDFFile();
      setToast({ message: 'PDF loaded successfully!', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load PDF';
      setToast({ message, type: 'error' });
    }
  };

  const handleSaveSettings = async (nextConfig: AIConfig, profileName?: string) => {
    await saveActiveProfile(nextConfig, profileName);
    setToast({ message: 'AI settings saved', type: 'success' });
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.2, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.2, 0.3));
  const handleZoomByFactor = (factor: number) => {
    setZoomLevel(prev => Math.min(Math.max(prev * factor, 0.3), 3));
  };
  const handleHighlightSelection = async () => {
    try {
      const count = await highlightSelection();
      setToast({ message: `Added ${count} highlight${count > 1 ? 's' : ''}`, type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to highlight selection';
      setToast({ message, type: 'info' });
    }
  };
  const handleAddNoteSelection = async () => {
    const note = window.prompt('Add a note for selected text:');
    if (note === null) return;
    try {
      await addNoteForSelection(note);
      setToast({ message: 'Note added', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add note';
      setToast({ message, type: 'info' });
    }
  };
  const handleSummarize = () => {
    if (!currentDocument) {
      setToast({ message: 'No document loaded', type: 'info' });
      return;
    }
    sendMessage('Please summarize the current document in: 1) key contributions, 2) methodology, 3) limitations, 4) practical takeaways.');
  };
  const handleTranslateSelection = () => {
    const text = globalThis.getSelection?.()?.toString().trim();
    if (!text) {
      setToast({ message: 'Select some text first', type: 'info' });
      return;
    }
    sendMessage(`Translate the following text into Chinese, preserve technical terms in English when needed, and provide concise explanation:\n\n${text}`);
  };
  const handleExportNotes = async () => {
    if (!currentDocument) {
      setToast({ message: 'No document loaded', type: 'info' });
      return;
    }
    try {
      const annotations = await annotationCommands.getByDocument(currentDocument.id);
      const lines = [
        `# Notes Export - ${currentDocument.fileName}`,
        '',
        `Generated at: ${new Date().toISOString()}`,
        '',
      ];
      annotations.forEach((a: any, idx: number) => {
        const rawText = typeof a.text === 'string' ? a.text : '';
        const isNote = rawText.startsWith('__NOTE__|');
        const note = isNote ? rawText.slice('__NOTE__|'.length).split('\n\n')[0] : '';
        const selected = isNote ? rawText.slice('__NOTE__|'.length).split('\n\n').slice(1).join('\n\n') : rawText;
        lines.push(`## ${idx + 1}. Page ${a.page_number}`);
        lines.push(`- Type: ${isNote ? 'note' : a.annotation_type}`);
        lines.push(`- Position: x=${Math.round(a.position_x)}, y=${Math.round(a.position_y)}, w=${Math.round(a.position_width)}, h=${Math.round(a.position_height)}`);
        if (note) lines.push(`- Note: ${note}`);
        if (selected) lines.push(`- Text: ${selected}`);
        lines.push('');
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentDocument.fileName.replace(/\.pdf$/i, '')}-notes.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({ message: 'Notes exported', type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export notes';
      setToast({ message, type: 'error' });
    }
  };
  const handlePinMessageToCanvas = async (messageId: string) => {
    const target = messages.find((m) => m.id === messageId && m.role === 'assistant');
    if (!target?.content?.trim()) {
      setToast({ message: 'No message content to pin', type: 'info' });
      return;
    }
    try {
      await pinNoteToCurrentPage(target.content);
      setToast({ message: `Pinned to page ${currentPage}`, type: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to pin message';
      setToast({ message, type: 'error' });
    }
  };

  return (
    <main className="flex h-screen bg-white">
      <Sidebar
        onUpload={handleUpload}
        onOpenSettings={() => setSettingsOpen(true)}
        documents={documents}
        currentDocumentId={currentDocument?.id}
        onSelectDocument={selectDocument}
        onDeleteDocument={deleteDocument}
        onRelinkDocument={relinkDocument}
      />

      <MainCanvas
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomByFactor={handleZoomByFactor}
        hasDocument={!!currentDocument}
        isLoading={pdfLoading || isRendering}
        currentPage={currentPage}
        totalPages={totalPages}
        outline={outline}
        onJumpToPage={jumpToPage}
        onHighlightSelection={handleHighlightSelection}
        onAddNoteSelection={handleAddNoteSelection}
      />

      <AIPanel
        messages={messages}
        isLoading={aiLoading}
        onSendMessage={sendMessage}
        onRetryMessage={retryAssistantMessage}
        onStopGeneration={stopGeneration}
        onPinToCanvas={handlePinMessageToCanvas}
        onSummarize={handleSummarize}
        onTranslateSelection={handleTranslateSelection}
        onExportNotes={handleExportNotes}
        onJumpToCitation={jumpToCitation}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profiles={profiles}
        activeProfileId={activeProfile?.id || ''}
        onSwitchProfile={switchProfile}
        onCreateProfile={createNewProfile}
        onDeleteProfile={async (profileId) => {
          try {
            await deleteProfile(profileId);
            setToast({ message: 'Profile deleted', type: 'success' });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete profile';
            setToast({ message, type: 'error' });
          }
        }}
        onRenameProfile={renameProfile}
        onSaveActiveProfile={handleSaveSettings}
        onTestConnectivity={async (config) => {
          return await aiCommands.testConnectivity(
            config.provider,
            config.endpoint,
            config.model,
            config.apiKey
          );
        }}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}

export default App;
