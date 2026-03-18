import { useEffect, useState } from 'react';
import { AIConfig, AIProfile, AIProvider } from '@/types/settings';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AI_PROVIDER_PRESETS, defaultAIConfig, getPresetByProvider } from '@/constants/aiProviders';
import { Plus, Trash2 } from 'lucide-react';
import { AIConnectivityResult } from '@/lib/tauri';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  profiles: AIProfile[];
  activeProfileId: string;
  onSwitchProfile: (profileId: string) => void;
  onCreateProfile: (name: string, provider: AIProvider) => Promise<AIProfile>;
  onDeleteProfile: (profileId: string) => Promise<void>;
  onRenameProfile: (profileId: string, name: string) => void;
  onSaveActiveProfile: (config: AIConfig, name?: string) => Promise<void>;
  onTestConnectivity: (config: AIConfig) => Promise<AIConnectivityResult>;
}

export function SettingsModal({
  open,
  onClose,
  profiles,
  activeProfileId,
  onSwitchProfile,
  onCreateProfile,
  onDeleteProfile,
  onRenameProfile,
  onSaveActiveProfile,
  onTestConnectivity,
}: SettingsModalProps) {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;
  const activeConfig = activeProfile?.config || defaultAIConfig('zhipu');

  const [profileName, setProfileName] = useState(activeProfile?.name || 'Default');
  const [provider, setProvider] = useState<AIProvider>(activeConfig.provider);
  const [endpoint, setEndpoint] = useState(activeConfig.endpoint);
  const [model, setModel] = useState(activeConfig.model);
  const [apiKey, setApiKey] = useState(activeConfig.apiKey);
  const [newProfileName, setNewProfileName] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<AIConnectivityResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !activeProfile) return;
    setProfileName(activeProfile.name);
    setProvider(activeProfile.config.provider);
    setEndpoint(activeProfile.config.endpoint);
    setModel(activeProfile.config.model);
    setApiKey(activeProfile.config.apiKey);
    setTestResult(null);
    setTestError(null);
  }, [open, activeProfileId, activeProfile]);

  const handleSave = async () => {
    await onSaveActiveProfile({
      provider,
      endpoint: endpoint.trim(),
      model: model.trim(),
      apiKey: apiKey.trim(),
    }, profileName.trim() || activeProfile?.name || 'Profile');
    onClose();
  };

  const applyPreset = (nextProvider: AIProvider) => {
    setProvider(nextProvider);
    const preset = getPresetByProvider(nextProvider);
    setEndpoint(preset.defaultEndpoint);
    setModel(preset.defaultModel);
  };

  const handleCreateProfile = async () => {
    const created = await onCreateProfile(
      newProfileName.trim() || `Profile ${profiles.length + 1}`,
      provider
    );
    onSwitchProfile(created.id);
    setNewProfileName('');
  };

  const canDelete = profiles.length > 1 && !!activeProfile;

  const handleTestConnectivity = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await onTestConnectivity({
        provider,
        endpoint: endpoint.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
      });
      setTestResult(result);
    } catch (error) {
      console.error('Connectivity test failed (raw):', error);
      const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : (error && typeof error === 'object' && 'message' in error)
            ? String((error as { message?: unknown }).message ?? 'Connectivity test failed')
            : 'Connectivity test failed';
      setTestError(message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Manage profiles and configure endpoint/model/token</DialogDescription>

        <div className="space-y-4 max-h-[75vh] overflow-auto pr-1">
          <div>
            <label className="block text-sm font-medium mb-2">Profiles</label>
            <div className="space-y-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    profile.id === activeProfileId
                      ? 'border-[#E42313]/40 bg-[#fff1f0] text-[#C62314]'
                      : 'border-[#D9DEE8] hover:bg-gray-50 text-[#1F2937]'
                  }`}
                  onClick={() => onSwitchProfile(profile.id)}
                >
                  {profile.name}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="New profile name"
              />
              <Button variant="secondary" size="sm" onClick={() => { void handleCreateProfile(); }}>
                <Plus size={14} />
                Add
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Profile Name</label>
            <Input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              onBlur={() => {
                if (activeProfile) {
                  onRenameProfile(activeProfile.id, profileName);
                }
              }}
              placeholder="Profile name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">AI Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {AI_PROVIDER_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant={provider === preset.id ? 'primary' : 'secondary'}
                  onClick={() => applyPreset(preset.id)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Endpoint</label>
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://.../chat/completions"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Model</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. glm-4 / gpt-4o-mini"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Token / API Key</label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${provider} token`}
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

          <div className="rounded-xl border border-[#E3E8F0] bg-[#F8FAFC] p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-[#111827]">Connectivity Test</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { void handleTestConnectivity(); }}
                disabled={isTesting || !endpoint.trim() || !model.trim() || !apiKey.trim()}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>
            {testResult && (
              <div className={`mt-2 text-xs ${
                testResult.ok ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                <p>Status: {testResult.ok ? 'OK' : 'Failed'} ({testResult.status_code})</p>
                <p>Latency: {testResult.latency_ms}ms</p>
                <p className="mt-1 break-words">{testResult.message}</p>
              </div>
            )}
            {testError && (
              <p className="mt-2 text-xs text-rose-700 break-words">{testError}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                if (!activeProfile || !canDelete) return;
                void onDeleteProfile(activeProfile.id);
              }}
              disabled={!canDelete}
            >
              <Trash2 size={14} />
              Delete
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => { void handleSave(); }}
              disabled={!endpoint.trim() || !model.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
