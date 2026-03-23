import { useEffect, useState } from 'react';
import { AIConfig, AIProfile, AIProvider, ChatInputMode, ThemeOption } from '@/types/settings';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { AI_PROVIDER_PRESETS, getPresetByProvider } from '@/constants/aiProviders';
import { Plus, Trash2, Cpu, MessageSquare, Info, ChevronRight, Check, X, Eye, EyeOff, Palette } from 'lucide-react';
import { AIConnectivityResult } from '@/lib/tauri';

type SettingsSection = 'provider' | 'chat' | 'appearance' | 'about';

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
  showChatPerfHints: boolean;
  onToggleChatPerfHints: (enabled: boolean) => void;
  chatInputModeDefault: ChatInputMode;
  onChangeChatInputModeDefault: (mode: ChatInputMode) => void;
  routePreferenceStats: { chat: number; doc: number; total: number };
  routePreferenceScopeLabel: string;
  routePreferenceScopeDetail?: string;
  onClearRoutePreferenceMemory: () => void;
  rememberRoutePreferenceAcrossSessions: boolean;
  onToggleRememberRoutePreferenceAcrossSessions: (enabled: boolean) => void;
  currentTheme?: ThemeOption;
  onChangeTheme: (theme: ThemeOption) => void;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <p className="setting-row__label">{label}</p>
        {description && <p className="setting-row__desc">{description}</p>}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`toggle ${checked ? 'toggle--on' : ''}`}
    >
      <span className="toggle__thumb" />
    </button>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="settings-section-header">
      <h2 className="settings-section-header__title">{title}</h2>
      {subtitle && <p className="settings-section-header__subtitle">{subtitle}</p>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

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
  showChatPerfHints,
  onToggleChatPerfHints,
  chatInputModeDefault,
  onChangeChatInputModeDefault,
  routePreferenceStats,
  routePreferenceScopeLabel,
  routePreferenceScopeDetail,
  onClearRoutePreferenceMemory,
  rememberRoutePreferenceAcrossSessions,
  onToggleRememberRoutePreferenceAcrossSessions,
  currentTheme,
  onChangeTheme,
}: SettingsModalProps) {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;

  const [section, setSection] = useState<SettingsSection>('provider');

  const [profileName, setProfileName] = useState('Default');
  const [provider, setProvider] = useState<AIProvider>('zhipu');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [newProfileName, setNewProfileName] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<AIConnectivityResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Reset section when modal opens
  useEffect(() => {
    if (open) setSection('provider');
  }, [open]);

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

  const handleTestConnectivity = async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const result = await onTestConnectivity({ provider, endpoint: endpoint.trim(), model: model.trim(), apiKey: apiKey.trim() });
      setTestResult(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestError(msg);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    await onSaveActiveProfile(
      { provider, endpoint: endpoint.trim(), model: model.trim(), apiKey: apiKey.trim() },
      profileName.trim() || activeProfile?.name || 'Profile'
    );
    onClose();
  };

  const handleClose = () => {
    setTestResult(null);
    setTestError(null);
    onClose();
  };

  const canDelete = profiles.length > 1 && !!activeProfile;
  const canSave = endpoint.trim() && model.trim();

  const navItems: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { id: 'provider', label: 'AI Provider', icon: <Cpu size={14} /> },
    { id: 'chat', label: 'Chat & Routing', icon: <MessageSquare size={14} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
    { id: 'about', label: 'About', icon: <Info size={14} /> },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="settings-modal" title="Settings" description="Configure your AI reader experience: provider, chat behavior, and appearance">
        {/* Header */}
        <div className="settings-header">
          <div>
            <h1 className="settings-header__title">Settings</h1>
            <p className="settings-header__subtitle">Configure your AI reader experience</p>
          </div>
          <button type="button" onClick={handleClose} className="settings-close-btn" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="settings-body">
          {/* Left nav */}
          <nav className="settings-nav">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`settings-nav__item ${section === item.id ? 'settings-nav__item--active' : ''}`}
              >
                <span className="settings-nav__icon">{item.icon}</span>
                <span className="settings-nav__label">{item.label}</span>
                {section === item.id && <ChevronRight size={12} className="settings-nav__arrow" />}
              </button>
            ))}

            {/* Profile selector at bottom */}
            <div className="settings-nav__divider" />
            <p className="settings-nav__section-label">Active Profile</p>
            <div className="settings-nav__profiles">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => onSwitchProfile(profile.id)}
                  className={`settings-nav__profile ${profile.id === activeProfileId ? 'settings-nav__profile--active' : ''}`}
                >
                  <span className="settings-nav__profile-dot" />
                  <span className="settings-nav__profile-name">{profile.name}</span>
                  {profile.id === activeProfileId && (
                    <Check size={10} className="settings-nav__profile-check" />
                  )}
                </button>
              ))}
              <div className="settings-nav__add-profile">
                <Input
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="New profile…"
                  className="settings-nav__input"
                />
                <button
                  type="button"
                  onClick={() => { void handleCreateProfile(); }}
                  className="settings-nav__add-btn"
                  title="Create profile"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </nav>

          {/* Right content */}
          <div className="settings-content">

            {/* ── AI Provider ── */}
            {section === 'provider' && (
              <div className="settings-section">
                <SectionHeader
                  title="AI Provider"
                  subtitle={`Configure the AI model used for chat and document analysis`}
                />

                <div className="settings-group">
                  <SettingRow label="Profile Name" description="A friendly name for this configuration">
                    <Input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      onBlur={() => { if (activeProfile) onRenameProfile(activeProfile.id, profileName); }}
                      className="settings-input settings-input--sm"
                    />
                  </SettingRow>
                </div>

                <div className="settings-group">
                  <p className="settings-group__label">Provider</p>
                  <div className="provider-grid">
                    {AI_PROVIDER_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset.id)}
                        className={`provider-card ${provider === preset.id ? 'provider-card--active' : ''}`}
                      >
                        <span className="provider-card__name">{preset.label}</span>
                        <span className="provider-card__model">{preset.defaultModel}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-group">
                  <SettingRow label="Endpoint" description="Base URL of the API endpoint">
                    <Input
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="https://open.bigmodel.cn/api/paas/v4"
                      className="settings-input"
                    />
                  </SettingRow>
                </div>

                <div className="settings-group">
                  <SettingRow label="Model ID" description="The model identifier to use">
                    <Input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="glm-4-flash"
                      className="settings-input"
                    />
                  </SettingRow>
                </div>

                <div className="settings-group">
                  <SettingRow label="API Key" description="Your secret key — stored securely in the system keychain">
                    <div className="settings-input-password">
                      <Input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="settings-input"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="settings-input-password__toggle"
                        title={showKey ? 'Hide key' : 'Show key'}
                      >
                        {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </SettingRow>
                </div>

                {/* Connectivity test */}
                <div className="settings-test-card">
                  <div className="settings-test-card__header">
                    <span className="settings-test-card__title">Connection Status</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { void handleTestConnectivity(); }}
                      disabled={isTesting || !endpoint.trim() || !model.trim() || !apiKey.trim()}
                    >
                      {isTesting ? 'Testing…' : 'Test Connection'}
                    </Button>
                  </div>
                  {testResult && (
                    <div className={`settings-test-card__result ${testResult.ok ? 'settings-test-card__result--ok' : 'settings-test-card__result--fail'}`}>
                      <div className="settings-test-card__result-row">
                        <span className="settings-test-card__result-dot" />
                        <span className="settings-test-card__result-status">
                          {testResult.ok ? 'Connected' : 'Connection failed'}
                        </span>
                        {testResult.latency_ms !== undefined && (
                          <span className="settings-test-card__result-latency">{testResult.latency_ms}ms</span>
                        )}
                      </div>
                      {testResult.message && (
                        <p className="settings-test-card__result-msg">{testResult.message}</p>
                      )}
                    </div>
                  )}
                  {testError && (
                    <div className="settings-test-card__result settings-test-card__result--fail">
                      <div className="settings-test-card__result-row">
                        <span className="settings-test-card__result-dot" />
                        <span className="settings-test-card__result-status">Failed</span>
                      </div>
                      <p className="settings-test-card__result-msg">{testError}</p>
                    </div>
                  )}
                  {!testResult && !testError && (
                    <p className="settings-test-card__hint">Click &ldquo;Test Connection&rdquo; to verify your configuration.</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Chat & Routing ── */}
            {section === 'chat' && (
              <div className="settings-section">
                <SectionHeader
                  title="Chat & Routing"
                  subtitle="Control how AI responses are generated and displayed"
                />

                <div className="settings-group">
                  <SettingRow
                    label="Performance Hints"
                    description="Show token count, time-to-first-token, and latency on each chat message"
                  >
                    <Toggle
                      checked={showChatPerfHints}
                      onChange={onToggleChatPerfHints}
                      label="Toggle performance hints"
                    />
                  </SettingRow>
                </div>

                <div className="settings-group">
                  <SettingRow label="Default Input Mode" description="The routing mode pre-selected when you open the chat panel">
                    <div className="routing-chips">
                      {(['auto', 'chat', 'doc'] as ChatInputMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => onChangeChatInputModeDefault(mode)}
                          className={`routing-chip ${chatInputModeDefault === mode ? 'routing-chip--active' : ''}`}
                        >
                          {mode === 'auto' ? 'Auto' : mode === 'chat' ? 'Chat' : 'Doc Q&A'}
                        </button>
                      ))}
                    </div>
                  </SettingRow>
                </div>

                <div className="settings-group">
                  <p className="settings-group__label">Routing Preference Memory</p>
                  <div className="settings-memory-card">
                    <div className="settings-memory-card__stats">
                      <div className="settings-memory-stat">
                        <span className="settings-memory-stat__value">{routePreferenceStats.total}</span>
                        <span className="settings-memory-stat__label">Total</span>
                      </div>
                      <div className="settings-memory-stat">
                        <span className="settings-memory-stat__value">{routePreferenceStats.chat}</span>
                        <span className="settings-memory-stat__label">Chat</span>
                      </div>
                      <div className="settings-memory-stat">
                        <span className="settings-memory-stat__value">{routePreferenceStats.doc}</span>
                        <span className="settings-memory-stat__label">Doc</span>
                      </div>
                    </div>
                    <div className="settings-memory-card__scope">
                      <span className="settings-memory-card__scope-label">Active scope:</span>
                      <span className="settings-memory-card__scope-value">{routePreferenceScopeLabel}</span>
                      {routePreferenceScopeDetail && (
                        <span className="settings-memory-card__scope-doc">{routePreferenceScopeDetail}</span>
                      )}
                    </div>
                    <div className="settings-memory-card__footer">
                      <SettingRow label="Remember across sessions" description="Persist routing preference per document between app restarts">
                        <Toggle
                          checked={rememberRoutePreferenceAcrossSessions}
                          onChange={onToggleRememberRoutePreferenceAcrossSessions}
                          label="Toggle cross-session memory"
                        />
                      </SettingRow>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onClearRoutePreferenceMemory}
                        disabled={routePreferenceStats.total === 0}
                        className="settings-memory-card__clear"
                      >
                        Clear Memory
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Appearance ── */}
            {section === 'appearance' && (
              <div className="settings-section">
                <SectionHeader
                  title="Appearance"
                  subtitle="Customize the look and feel of the app"
                />

                <div className="settings-group">
                  <p className="settings-group__label">Color Theme</p>
                  <div className="theme-grid">

                    {/* Warm Light */}
                    <button
                      type="button"
                      onClick={() => onChangeTheme('light')}
                      className={`theme-card ${(currentTheme ?? 'light') === 'light' ? 'theme-card--active' : ''}`}
                    >
                      <div className="theme-card__preview theme-card__preview--light">
                        <div className="theme-card__bar" style={{ background: '#ffffff', border: '1px solid #e7e5e4' }}>
                          <div className="theme-card__dot" style={{ background: '#c2410c' }} />
                          <div className="theme-card__line" style={{ background: '#e7e5e4', width: '60%' }} />
                        </div>
                        <div className="theme-card__bar" style={{ background: '#fafaf9', border: '1px solid #e7e5e4' }}>
                          <div className="theme-card__dot" style={{ background: '#0d9488' }} />
                          <div className="theme-card__line" style={{ background: '#e7e5e4', width: '45%' }} />
                        </div>
                      </div>
                      <div className="theme-card__text">
                        <span className="theme-card__label">Warm Light</span>
                        <span className="theme-card__desc">Default · All-day reading</span>
                      </div>
                      {(currentTheme ?? 'light') === 'light' && (
                        <Check size={12} className="theme-card__check" />
                      )}
                    </button>

                    {/* Sepia */}
                    <button
                      type="button"
                      onClick={() => onChangeTheme('sepia')}
                      className={`theme-card ${currentTheme === 'sepia' ? 'theme-card--active' : ''}`}
                    >
                      <div className="theme-card__preview theme-card__preview--sepia">
                        <div className="theme-card__bar" style={{ background: '#fdfaf4', border: '1px solid #d4c5b2' }}>
                          <div className="theme-card__dot" style={{ background: '#b45309' }} />
                          <div className="theme-card__line" style={{ background: '#d4c5b2', width: '60%' }} />
                        </div>
                        <div className="theme-card__bar" style={{ background: '#f0ebe0', border: '1px solid #d4c5b2' }}>
                          <div className="theme-card__dot" style={{ background: '#0f766e' }} />
                          <div className="theme-card__line" style={{ background: '#d4c5b2', width: '45%' }} />
                        </div>
                      </div>
                      <div className="theme-card__text">
                        <span className="theme-card__label">Sepia</span>
                        <span className="theme-card__desc">Paper feel · Long reading</span>
                      </div>
                      {currentTheme === 'sepia' && (
                        <Check size={12} className="theme-card__check" />
                      )}
                    </button>

                    {/* Dark */}
                    <button
                      type="button"
                      onClick={() => onChangeTheme('dark')}
                      className={`theme-card ${currentTheme === 'dark' ? 'theme-card--active' : ''}`}
                    >
                      <div className="theme-card__preview theme-card__preview--dark">
                        <div className="theme-card__bar" style={{ background: '#232326', border: '1px solid #3f3f46' }}>
                          <div className="theme-card__dot" style={{ background: '#ea580c' }} />
                          <div className="theme-card__line" style={{ background: '#3f3f46', width: '60%' }} />
                        </div>
                        <div className="theme-card__bar" style={{ background: '#18181b', border: '1px solid #3f3f46' }}>
                          <div className="theme-card__dot" style={{ background: '#2dd4bf' }} />
                          <div className="theme-card__line" style={{ background: '#3f3f46', width: '45%' }} />
                        </div>
                      </div>
                      <div className="theme-card__text">
                        <span className="theme-card__label">Midnight</span>
                        <span className="theme-card__desc">Night mode · Low light</span>
                      </div>
                      {currentTheme === 'dark' && (
                        <Check size={12} className="theme-card__check" />
                      )}
                    </button>

                    {/* Warm Dark */}
                    <button
                      type="button"
                      onClick={() => onChangeTheme('warm-dark')}
                      className={`theme-card ${currentTheme === 'warm-dark' ? 'theme-card--active' : ''}`}
                    >
                      <div className="theme-card__preview theme-card__preview--warm-dark">
                        <div className="theme-card__bar" style={{ background: '#272220', border: '1px solid #3d3835' }}>
                          <div className="theme-card__dot" style={{ background: '#ea580c' }} />
                          <div className="theme-card__line" style={{ background: '#3d3835', width: '60%' }} />
                        </div>
                        <div className="theme-card__bar" style={{ background: '#1c1917', border: '1px solid #3d3835' }}>
                          <div className="theme-card__dot" style={{ background: '#2dd4bf' }} />
                          <div className="theme-card__line" style={{ background: '#3d3835', width: '45%' }} />
                        </div>
                      </div>
                      <div className="theme-card__text">
                        <span className="theme-card__label">Warm Night</span>
                        <span className="theme-card__desc">Evening · Easy on eyes</span>
                      </div>
                      {currentTheme === 'warm-dark' && (
                        <Check size={12} className="theme-card__check" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── About ── */}
            {section === 'about' && (
              <div className="settings-section">
                <SectionHeader
                  title="About"
                  subtitle="Immersive AI Reader — your intelligent PDF companion"
                />
                <div className="settings-about-card">
                  <div className="settings-about-card__logo">
                    <Logo size={32} />
                  </div>
                  <div className="settings-about-card__info">
                    <p className="settings-about-card__name">Immersive Reader</p>
                    <p className="settings-about-card__version">Version 1.0.0</p>
                    <p className="settings-about-card__desc">
                      A premium AI-powered PDF reader that combines deep document understanding with intelligent conversation. Built with Tauri, React, and PDF.js.
                    </p>
                  </div>
                  <div className="settings-about-card__features">
                    {[
                      'Real-time AI chat with document context',
                      'Semantic search and citation tracking',
                      'Canvas-based annotations and notes',
                      'Multi-provider AI support (Zhipu, OpenAI compatible)',
                    ].map((f) => (
                      <div key={f} className="settings-about-card__feature">
                        <Check size={11} className="settings-about-card__feature-check" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <div className="settings-footer__left">
            {canDelete && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { if (activeProfile) void onDeleteProfile(activeProfile.id); }}
                className="settings-footer__delete"
              >
                <Trash2 size={13} />
                Delete Profile
              </Button>
            )}
          </div>
          <div className="settings-footer__right">
            <Button variant="secondary" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => { void handleSave(); }} disabled={!canSave}>
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
