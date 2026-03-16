'use client';

import { useState, useCallback } from 'react';
import { AIProvider, Settings } from '@/types/settings';
import { getSettings, saveSettings as saveToStorage } from '@/lib/storage/settings';
import { openDB } from '@/lib/storage/indexeddb';
import { encryptApiKey, decryptApiKey } from '@/lib/utils/crypto';

export function useSettings() {
  const [provider, setProvider] = useState<AIProvider>('zhipu');
  const [apiKey, setApiKey] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const db = await openDB();
      const savedProvider = await getSettings<string>(db, 'provider');
      const savedApiKey = await getSettings<string>(db, 'apiKey');

      if (savedProvider) setProvider(savedProvider as AIProvider);
      if (savedApiKey) setApiKey(decryptApiKey(savedApiKey));
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  const saveSettings = useCallback(async (newProvider: AIProvider, newApiKey: string) => {
    try {
      const db = await openDB();
      await saveToStorage(db, 'provider', newProvider);
      await saveToStorage(db, 'apiKey', encryptApiKey(newApiKey));

      setProvider(newProvider);
      setApiKey(newApiKey);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, []);

  return {
    provider,
    apiKey,
    loadSettings,
    saveSettings,
  };
}
