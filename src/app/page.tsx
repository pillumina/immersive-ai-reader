'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MainCanvas } from '@/components/layout/MainCanvas';
import { AIPanel } from '@/components/layout/AIPanel';
import { SettingsModal } from '@/components/features/SettingsModal';
import { usePDF } from '@/hooks/usePDF';
import { useAI } from '@/hooks/useAI';
import { useSettings } from '@/hooks/useSettings';
import { AIProvider } from '@/types/settings';

export default function Home() {
  const { currentDocument, uploadPDF, isLoading: pdfLoading } = usePDF();
  const { provider, apiKey, saveSettings, loadSettings } = useSettings();
  const { messages, isLoading: aiLoading, sendMessage, loadHistory } = useAI(
    currentDocument?.id || '',
    provider,
    apiKey
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (currentDocument) {
      loadHistory();
    }
  }, [currentDocument, loadHistory]);

  const handleUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          await uploadPDF(file);
        } catch (error) {
          console.error('Upload failed:', error);
        }
      }
    };
    input.click();
  };

  const handleSaveSettings = (newProvider: AIProvider, newApiKey: string) => {
    saveSettings(newProvider, newApiKey);
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 1.2, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 1.2, 0.3));

  return (
    <main className="flex h-screen bg-white">
      <Sidebar onUpload={handleUpload} onOpenSettings={() => setSettingsOpen(true)} />

      <MainCanvas
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        hasDocument={!!currentDocument}
      />

      <AIPanel
        messages={messages}
        isLoading={aiLoading}
        onSendMessage={sendMessage}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
        initialProvider={provider}
        initialApiKey={apiKey}
      />
    </main>
  );
}
