import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { AIConfig, AIProfile, AIProvider, ChatInputMode, ThemeOption } from '@/types/settings';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { AI_PROVIDER_PRESETS, getPresetByProvider } from '@/constants/aiProviders';
import { Plus, Trash2, Cpu, MessageSquare, Info, ChevronRight, Check, X, Eye, EyeOff, Palette, BarChart3, FileText } from 'lucide-react';
import { AIConnectivityResult, AiUsageStats, aiUsageCommands, logCommands } from '@/lib/tauri';

type SettingsSection = 'provider' | 'chat' | 'focus' | 'appearance' | 'stats' | 'logs' | 'about';

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
  showFocusResumePrompt: boolean;
  onToggleFocusResumePrompt: (enabled: boolean) => void;
  autoEnterFocusOnDocOpen: boolean;
  onToggleAutoEnterFocusOnDocOpen: (enabled: boolean) => void;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SettingRow({ label, description, id, children }: { label: string; description?: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        {id
          ? <label htmlFor={id} className="setting-row__label">{label}</label>
          : <p className="setting-row__label">{label}</p>
        }
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

export const SettingsModal = memo(function SettingsModal({
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
  showFocusResumePrompt,
  onToggleFocusResumePrompt,
  autoEnterFocusOnDocOpen,
  onToggleAutoEnterFocusOnDocOpen,
}: SettingsModalProps) {
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;

  const [section, setSection] = useState<SettingsSection>('provider');
  // ── Appearance ──
  const activeTheme = currentTheme ?? 'light';

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
  // Track the last profileId we synced from (to avoid resetting user edits)
  const lastSyncedProfileIdRef = useRef<string | null>(null);

  // Reset section when modal opens
  useEffect(() => {
    if (open) setSection('provider');
  }, [open]);

  // Sync form state when profile changes, but only if the profileId actually changed
  // (not just object reference change from parent re-render)
  useEffect(() => {
    if (!open || !activeProfileId) return;
    const profile = profiles.find((p) => p.id === activeProfileId);
    if (!profile) return;

    // Only reset if switching to a different profile
    if (lastSyncedProfileIdRef.current !== activeProfileId) {
      setProfileName(profile.name);
      setProvider(profile.config.provider);
      setEndpoint(profile.config.endpoint);
      setModel(profile.config.model);
      setApiKey(profile.config.apiKey);
      setTestResult(null);
      setTestError(null);
    }
    lastSyncedProfileIdRef.current = activeProfileId;
  }, [open, activeProfileId, profiles]);

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
    { id: 'focus', label: 'Focus Mode', icon: <Eye size={14} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
    { id: 'stats', label: 'Usage Stats', icon: <BarChart3 size={14} /> },
    { id: 'logs', label: 'App Logs', icon: <FileText size={14} /> },
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
                  aria-label="Create new profile"
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
                  <SettingRow label="Profile Name" description="A friendly name for this configuration" id="setting-profile-name">
                    <Input
                      id="setting-profile-name"
                      value={profileName}
                      onChange={(e) => { setProfileName(e.target.value); }}
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
                  <SettingRow label="Endpoint" description="Base URL of the API endpoint" id="setting-endpoint">
                    <Input
                      id="setting-endpoint"
                      value={endpoint}
                      onChange={(e) => { setEndpoint(e.target.value); }}
                      placeholder="https://open.bigmodel.cn/api/paas/v4"
                      className="settings-input"
                    />
                  </SettingRow>
                </div>

                <div className="settings-group">
                  <SettingRow label="Model ID" description="The model identifier to use" id="setting-model">
                    <Input
                      id="setting-model"
                      value={model}
                      onChange={(e) => { setModel(e.target.value); }}
                      placeholder="glm-4-flash"
                      className="settings-input"
                    />
                  </SettingRow>
                </div>

                <div className="settings-group">
                  <SettingRow label="API Key" description="Your secret key — stored securely in the system keychain" id="setting-api-key">
                    <div className="settings-input-password">
                      <Input
                        id="setting-api-key"
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); }}
                        placeholder="••••••••••••••••"
                        className="settings-input"
                      />
                      <button
                        type="button"
                        aria-label={showKey ? 'Hide API key' : 'Show API key'}
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

            {/* ── Focus Mode ── */}
            {section === 'focus' && (
              <div className="settings-section">
                <SectionHeader
                  title="Focus Mode"
                  subtitle="Configure behavior when entering Focus Mode"
                />

                <div className="settings-group">
                  <SettingRow
                    label="Resume Prompt"
                    description="Show prompt to resume from last reading position when reopening a document"
                  >
                    <Toggle
                      checked={showFocusResumePrompt}
                      onChange={onToggleFocusResumePrompt}
                      label="Toggle resume prompt"
                    />
                  </SettingRow>

                  <SettingRow
                    label="Auto-Enter on Open"
                    description="Automatically enter Focus Mode when opening any document"
                  >
                    <Toggle
                      checked={autoEnterFocusOnDocOpen}
                      onChange={onToggleAutoEnterFocusOnDocOpen}
                      label="Toggle auto-enter Focus Mode"
                    />
                  </SettingRow>
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
                      className={`theme-card ${activeTheme === 'light' ? 'theme-card--active' : ''}`}
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
                      {activeTheme === 'light' && (
                        <Check size={12} className="theme-card__check" />
                      )}
                    </button>

                    {/* Sepia */}
                    <button
                      type="button"
                      onClick={() => onChangeTheme('sepia')}
                      className={`theme-card ${activeTheme === 'sepia' ? 'theme-card--active' : ''}`}
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
                      {activeTheme === 'sepia' && (
                        <Check size={12} className="theme-card__check" />
                      )}
                    </button>

                    {/* Dark */}
                    <button
                      type="button"
                      onClick={() => onChangeTheme('dark')}
                      className={`theme-card ${activeTheme === 'dark' ? 'theme-card--active' : ''}`}
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
                      {activeTheme === 'dark' && (
                        <Check size={12} className="theme-card__check" />
                      )}
                    </button>

                    {/* Warm Dark */}
                    <button
                      type="button"
                      onClick={() => onChangeTheme('warm-dark')}
                      className={`theme-card ${activeTheme === 'warm-dark' ? 'theme-card--active' : ''}`}
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
                      {activeTheme === 'warm-dark' && (
                        <Check size={12} className="theme-card__check" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Stats ── */}
            {section === 'stats' && (
              <StatsSection />
            )}

            {/* ── Logs ── */}
            {section === 'logs' && (
              <LogsSection />
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
});

function StatsSection() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    aiUsageCommands.getStats(days)
      .then(setStats)
      .catch((e) => console.error('Failed to load usage stats:', e))
      .finally(() => setLoading(false));
  }, [days]);

  const s = stats;

  return (
    <div className="settings-section">
      <div className="settings-section-header" style={{ marginBottom: '16px' }}>
        <h2 className="settings-section-header__title">AI Usage Stats</h2>
        <p className="settings-section-header__subtitle">Token consumption and performance over time</p>
      </div>

      {/* Time filter */}
      <div className="flex items-center gap-2 mb-5">
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`settings-chip ${days === d ? 'settings-chip--active' : ''}`}
          >
            {d}d
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-text-muted)] animate-spin" />
        </div>
      )}

      {!loading && !s && (
        <div className="text-center py-8 text-[13px] text-[var(--color-text-muted)]">
          No usage data yet. Start chatting with AI to see stats.
        </div>
      )}

      {!loading && s && s.total_requests === 0 && (
        <div className="text-center py-8 text-[13px] text-[var(--color-text-muted)]">
          No API calls in the last {days} days.
        </div>
      )}

      {!loading && s && s.total_requests > 0 && (
        <>
          {/* Summary cards */}
          <div className="stats-grid">
            <div className="stats-card">
              <span className="stats-card__value">{s.total_requests.toLocaleString()}</span>
              <span className="stats-card__label">Requests</span>
            </div>
            <div className="stats-card">
              <span className="stats-card__value">{formatTokens(s.total_tokens)}</span>
              <span className="stats-card__label">Total Tokens</span>
            </div>
            <div className="stats-card">
              <span className="stats-card__value">${s.total_cost_usd.toFixed(4)}</span>
              <span className="stats-card__label">Est. Cost (USD)</span>
            </div>
            <div className="stats-card">
              <span className="stats-card__value">{Math.round(s.avg_latency_ms)}ms</span>
              <span className="stats-card__label">Avg Latency</span>
            </div>
          </div>

          {/* Token breakdown */}
          <div className="stats-breakdown">
            <p className="stats-breakdown__title">Token Breakdown</p>
            <div className="stats-token-bar">
              <div
                className="stats-token-bar__prompt"
                style={{ width: `${s.total_tokens > 0 ? (s.total_prompt_tokens / s.total_tokens) * 100 : 0}%` }}
              />
              <div
                className="stats-token-bar__completion"
                style={{ width: `${s.total_tokens > 0 ? (s.total_completion_tokens / s.total_tokens) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 text-[11px] text-[var(--color-text-secondary)]">
              <span className="flex items-center gap-1">
                <span className="stats-token-bar__dot stats-token-bar__dot--prompt" />
                Prompt: {formatTokens(s.total_prompt_tokens)}
              </span>
              <span className="flex items-center gap-1">
                <span className="stats-token-bar__dot stats-token-bar__dot--completion" />
                Completion: {formatTokens(s.total_completion_tokens)}
              </span>
            </div>
          </div>

          {/* By model */}
          {s.by_model.length > 0 && (
            <div className="stats-breakdown">
              <p className="stats-breakdown__title">By Model</p>
              {s.by_model.map((m) => (
                <div key={m.model} className="stats-row">
                  <span className="stats-row__name" title={m.model}>{m.model}</span>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="text-[var(--color-text-secondary)]">{m.requests} reqs</span>
                    <span className="text-[var(--color-text-muted)]">{formatTokens(m.total_tokens)}</span>
                    <span className="text-[var(--color-text-muted)]">{Math.round(m.avg_latency_ms)}ms avg</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* By provider */}
          {s.by_provider.length > 0 && (
            <div className="stats-breakdown">
              <p className="stats-breakdown__title">By Provider</p>
              {s.by_provider.map((p) => (
                <div key={p.provider} className="stats-row">
                  <span className="stats-row__name">{p.provider}</span>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="text-[var(--color-text-secondary)]">{p.requests} reqs</span>
                    <span className="text-[var(--color-text-muted)]">{formatTokens(p.total_tokens)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function LogsSection() {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [logInfo, setLogInfo] = useState<{ name: string; size: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await logCommands.readLogs(500);
      if (result.files.length > 0) {
        const file = result.files[0];
        setLogs(file.lines);
        setLogInfo({
          name: file.name,
          size: formatFileSize(file.size_bytes),
        });
      } else {
        setLogs([]);
        setLogInfo(null);
      }
    } catch (e) {
      console.error('Failed to load logs:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => { void loadLogs(); }, [loadLogs]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs]);

  const filtered = filter
    ? logs.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : logs;

  const highlightLine = (line: string) => {
    if (!filter) return line;
    const idx = line.toLowerCase().indexOf(filter.toLowerCase());
    if (idx === -1) return line;
    return (
      <>
        {line.slice(0, idx)}
        <mark className="log-highlight">{line.slice(idx, idx + filter.length)}</mark>
        {line.slice(idx + filter.length)}
      </>
    );
  };

  const getLineClass = (line: string): string => {
    if (line.includes('ERROR') || line.includes('error')) return 'log-line log-line--error';
    if (line.includes('WARN') || line.includes('warn')) return 'log-line log-line--warn';
    if (line.includes('INFO') || line.includes('info')) return 'log-line log-line--info';
    if (line.includes('DEBUG') || line.includes('debug')) return 'log-line log-line--debug';
    return 'log-line';
  };

  return (
    <div className="settings-section">
      <div className="settings-section-header" style={{ marginBottom: '16px' }}>
        <h2 className="settings-section-header__title">App Logs</h2>
        <p className="settings-section-header__subtitle">Runtime logs from the Rust backend</p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <label htmlFor="log-filter" className="sr-only">Filter logs</label>
        <input
          type="text"
          id="log-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter logs…"
          className="settings-input settings-input--sm flex-1"
        />
        <button
          type="button"
          onClick={() => { void loadLogs(); }}
          className="settings-btn settings-btn--sm"
        >
          Refresh
        </button>
      </div>

      {/* Log info */}
      {logInfo && (
        <div className="flex items-center gap-3 mb-2 text-[11px] text-[var(--color-text-muted)]">
          <span>{logInfo.name}</span>
          <span>{logInfo.size}</span>
          <span>{filtered.length} / {logs.length} lines</span>
        </div>
      )}

      {/* Log viewer */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-text-muted)] animate-spin" />
        </div>
      )}

      {!loading && logs.length === 0 && (
        <div className="text-center py-8 text-[13px] text-[var(--color-text-muted)]">
          No log files yet. Logs are created when the app starts.
        </div>
      )}

      {!loading && logs.length > 0 && (
        <div
          ref={listRef}
          className="log-viewer"
        >
          {filtered.map((line, i) => (
            <div key={i} className={getLineClass(line)}>
              <span className="log-line__text">{highlightLine(line)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
