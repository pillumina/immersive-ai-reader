'use client';

import { useState } from 'react';
import { AIProvider } from '@/types/settings';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (provider: AIProvider, apiKey: string) => void;
  initialProvider?: AIProvider;
  initialApiKey?: string;
}

export function SettingsModal({
  open,
  onClose,
  onSave,
  initialProvider = 'zhipu',
  initialApiKey = '',
}: SettingsModalProps) {
  const [provider, setProvider] = useState<AIProvider>(initialProvider);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [showKey, setShowKey] = useState(false);

  const handleSave = () => {
    onSave(provider, apiKey);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Configure your AI provider and API key</DialogDescription>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">AI Provider</label>
            <div className="flex gap-2">
              <Button
                variant={provider === 'zhipu' ? 'primary' : 'secondary'}
                onClick={() => setProvider('zhipu')}
              >
                Zhipu GLM-4
              </Button>
              <Button
                variant={provider === 'minimax' ? 'primary' : 'secondary'}
                onClick={() => setProvider('minimax')}
              >
                Minimax
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">API Key</label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${provider} API key`}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
