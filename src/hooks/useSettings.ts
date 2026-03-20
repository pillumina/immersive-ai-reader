import { useState, useCallback, useMemo } from 'react';
import { z } from 'zod';
import { AIConfig, AIProfile, AIProvider, UISettings } from '@/types/settings';
import { aiCommands } from '@/lib/tauri';
import { defaultAIConfig, getPresetByProvider } from '@/constants/aiProviders';

const SETTINGS_PROFILES_KEY = 'ai_settings_profiles_v1';

// Zod schemas for settings validation
const UISettingsSchema = z.object({
  showChatPerfHints: z.boolean(),
  chatInputModeDefault: z.enum(['auto', 'chat', 'doc']),
  rememberRoutePreferenceAcrossSessions: z.boolean(),
  theme: z.enum(['light', 'dark', 'warm-dark']).optional(),
});

const StoredProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  config: z.object({
    provider: z.string(),
    endpoint: z.string(),
    model: z.string(),
  }),
});

const StoredSettingsSchema = z.object({
  activeProfileId: z.string(),
  profiles: z.array(StoredProfileSchema),
  ui: UISettingsSchema.optional(),
});

type StoredProfile = z.infer<typeof StoredProfileSchema>;
type StoredSettings = z.infer<typeof StoredSettingsSchema>;

const DEFAULT_UI_SETTINGS: UISettings = {
  showChatPerfHints: true,
  chatInputModeDefault: 'auto',
  rememberRoutePreferenceAcrossSessions: true,
  theme: 'light',
};

/**
 * Safely parse settings from localStorage with Zod validation
 */
function safeParseSettings(raw: string | null): StoredSettings | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const result = StoredSettingsSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.warn('[Settings] Invalid settings format, using defaults:', result.error.flatten());
    return null;
  } catch (e) {
    console.warn('[Settings] Failed to parse settings, using defaults:', e);
    return null;
  }
}

/**
 * Safely parse UI settings with Zod validation
 */
function safeParseUISettings(raw: unknown): UISettings {
  const result = UISettingsSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  console.warn('[Settings] Invalid UI settings, using defaults:', result.error.flatten());
  return DEFAULT_UI_SETTINGS;
}

function buildKeychainAccount(profileId: string): string {
  return `ai-profile:${profileId}`;
}

function profileToStored(profile: AIProfile): StoredProfile {
  return {
    id: profile.id,
    name: profile.name,
    config: {
      provider: profile.config.provider,
      endpoint: profile.config.endpoint,
      model: profile.config.model,
    },
  };
}

function makeProfileName(provider: AIProvider, index = 1): string {
  const base = getPresetByProvider(provider).label;
  return `${base} ${index}`;
}

function createProfile(config: AIConfig, name: string): AIProfile {
  return {
    id: globalThis.crypto?.randomUUID?.() || `profile-${Date.now()}`,
    name,
    config,
  };
}

export function useSettings() {
  const [profiles, setProfiles] = useState<AIProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('');
  const [uiSettings, setUiSettings] = useState<UISettings>(DEFAULT_UI_SETTINGS);

  const persist = useCallback(
    (
      nextProfiles: AIProfile[],
      nextActiveProfileId: string,
      nextUiSettings: UISettings = uiSettings
    ) => {
    const payload: StoredSettings = {
      activeProfileId: nextActiveProfileId,
      profiles: nextProfiles.map(profileToStored),
      ui: nextUiSettings,
    };
    localStorage.setItem(SETTINGS_PROFILES_KEY, JSON.stringify(payload));
  }, [uiSettings]);

  const loadSettings = useCallback(async () => {
    try {
      let loadedProfiles: AIProfile[] = [];
      let loadedActiveProfileId = '';
      let loadedUiSettings: UISettings = DEFAULT_UI_SETTINGS;

      const savedProfilesRaw = localStorage.getItem(SETTINGS_PROFILES_KEY);
      const parsedSettings = safeParseSettings(savedProfilesRaw);

      if (parsedSettings) {
        loadedProfiles = parsedSettings.profiles.map((p) => ({
          id: p.id,
          name: p.name,
          config: {
            provider: p.config.provider as AIProvider,
            endpoint: p.config.endpoint,
            model: p.config.model,
            apiKey: '',
          },
        }));
        loadedActiveProfileId = parsedSettings.activeProfileId;
        loadedUiSettings = parsedSettings.ui
          ? safeParseUISettings(parsedSettings.ui)
          : DEFAULT_UI_SETTINGS;
      } else {
        // Backward compatibility: migrate old single setting into one profile.
        let migrated = defaultAIConfig('zhipu');
        const oldProvider = localStorage.getItem('provider');
        if (oldProvider) {
          const provider = oldProvider as AIConfig['provider'];
          const preset = getPresetByProvider(provider);
          migrated = {
            provider,
            endpoint: preset.defaultEndpoint,
            model: preset.defaultModel,
            apiKey: '',
          };
        }
        const profile = createProfile(migrated, makeProfileName(migrated.provider));
        loadedProfiles = [profile];
        loadedActiveProfileId = profile.id;
      }

      if (loadedProfiles.length === 0) {
        const fallback = createProfile(defaultAIConfig('zhipu'), 'Zhipu 1');
        loadedProfiles = [fallback];
        loadedActiveProfileId = fallback.id;
      }

      if (!loadedProfiles.some((p) => p.id === loadedActiveProfileId)) {
        loadedActiveProfileId = loadedProfiles[0].id;
      }

      const hydratedProfiles = await Promise.all(
        loadedProfiles.map(async (profile) => {
          let apiKey = '';
          try {
            apiKey = await aiCommands.getApiKey(buildKeychainAccount(profile.id));
          } catch {
            try {
              apiKey = await aiCommands.getApiKey(
                `provider:${profile.config.provider}|endpoint:${profile.config.endpoint}|model:${profile.config.model}`
              );
            } catch {
              try {
                apiKey = await aiCommands.getApiKey(profile.config.provider);
              } catch {
                // no-op
              }
            }
          }
          return {
            ...profile,
            config: { ...profile.config, apiKey },
          } satisfies AIProfile;
        })
      );

      setProfiles(hydratedProfiles);
      setActiveProfileId(loadedActiveProfileId);
      setUiSettings(loadedUiSettings);
      persist(hydratedProfiles, loadedActiveProfileId, loadedUiSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, [persist]);

  const saveProfile = useCallback(async (profileId: string, config: AIConfig, name?: string) => {
    const sanitized: AIConfig = {
      provider: config.provider,
      endpoint: config.endpoint.trim(),
      model: config.model.trim(),
      apiKey: config.apiKey.trim(),
    };

    const existing = profiles.find((p) => p.id === profileId);
    const nextProfile: AIProfile = {
      id: profileId,
      name: name?.trim() || existing?.name || makeProfileName(sanitized.provider),
      config: sanitized,
    };

    const replaced = profiles.some((p) => p.id === profileId);
    const nextProfiles = replaced
      ? profiles.map((p) => (p.id === profileId ? nextProfile : p))
      : [...profiles, nextProfile];

    await aiCommands.saveApiKey(buildKeychainAccount(profileId), sanitized.apiKey);
    const nextActive = activeProfileId || profileId;
    setProfiles(nextProfiles);
    if (!activeProfileId) {
      setActiveProfileId(profileId);
    }
    persist(nextProfiles, nextActive, uiSettings);
  }, [profiles, activeProfileId, persist, uiSettings]);

  const saveActiveProfile = useCallback(async (config: AIConfig, name?: string) => {
    if (!activeProfileId) {
      throw new Error('No active profile');
    }
    await saveProfile(activeProfileId, config, name);
  }, [activeProfileId, saveProfile]);

  const createNewProfile = useCallback(async (name: string, provider: AIProvider = 'zhipu') => {
    const profile = createProfile(
      defaultAIConfig(provider),
      name.trim() || makeProfileName(provider, profiles.length + 1)
    );
    const nextProfiles = [...profiles, profile];
    setProfiles(nextProfiles);
    setActiveProfileId(profile.id);
    await aiCommands.saveApiKey(buildKeychainAccount(profile.id), '');
    persist(nextProfiles, profile.id, uiSettings);
    return profile;
  }, [profiles, persist, uiSettings]);

  const switchProfile = useCallback((profileId: string) => {
    if (!profiles.some((p) => p.id === profileId)) return;
    setActiveProfileId(profileId);
    persist(profiles, profileId, uiSettings);
  }, [profiles, persist, uiSettings]);

  const deleteProfile = useCallback(async (profileId: string) => {
    if (profiles.length <= 1) {
      throw new Error('At least one profile is required');
    }
    const nextProfiles = profiles.filter((p) => p.id !== profileId);
    const nextActive = profileId === activeProfileId ? nextProfiles[0].id : activeProfileId;
    try {
      await aiCommands.deleteApiKey(buildKeychainAccount(profileId));
    } catch {
      // no-op
    }
    setProfiles(nextProfiles);
    setActiveProfileId(nextActive);
    persist(nextProfiles, nextActive, uiSettings);
  }, [profiles, activeProfileId, persist, uiSettings]);

  const renameProfile = useCallback((profileId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextProfiles = profiles.map((p) => (
      p.id === profileId ? { ...p, name: trimmed } : p
    ));
    setProfiles(nextProfiles);
    persist(nextProfiles, activeProfileId || nextProfiles[0]?.id || '', uiSettings);
  }, [profiles, activeProfileId, persist, uiSettings]);

  const updateUiSettings = useCallback((next: Partial<UISettings>) => {
    const merged: UISettings = {
      ...DEFAULT_UI_SETTINGS,
      ...uiSettings,
      ...next,
    };
    setUiSettings(merged);
    persist(profiles, activeProfileId || profiles[0]?.id || '', merged);
  }, [uiSettings, persist, profiles, activeProfileId]);

  const aiConfig = useMemo(() => {
    const active = profiles.find((p) => p.id === activeProfileId);
    return active?.config || defaultAIConfig('zhipu');
  }, [profiles, activeProfileId]);

  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || null;
  }, [profiles, activeProfileId]);

  return {
    aiConfig,
    activeProfile,
    profiles,
    uiSettings,
    updateUiSettings,
    loadSettings,
    saveActiveProfile,
    saveProfile,
    createNewProfile,
    switchProfile,
    deleteProfile,
    renameProfile,
  };
}
