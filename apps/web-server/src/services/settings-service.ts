/**
 * Settings Service
 *
 * Provides settings access for other services.
 * Settings are stored in a JSON file.
 */

import { existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { config } from '../config.js';

interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  colorTheme?: string;
  defaultModel: string;
  agentFramework: string;
  pythonPath?: string;
  autoBuildPath?: string;
  autoUpdateAutoBuild: boolean;
  autoNameTerminals: boolean;
  notifications: {
    taskComplete: boolean;
    taskError: boolean;
    buildProgress: boolean;
  };
  featureModels?: Record<string, string>;
  featureThinking?: Record<string, string>;
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  defaultModel: 'claude-3-5-sonnet',
  agentFramework: 'auto-claude',
  autoUpdateAutoBuild: true,
  autoNameTerminals: true,
  autoBuildPath: config.backendPath,
  notifications: {
    taskComplete: true,
    taskError: true,
    buildProgress: false,
  },
};

class SettingsService {
  private settingsPath: string;

  constructor() {
    const dataDir = config.dataPath || path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.auto-claude'
    );

    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.settingsPath = path.join(dataDir, 'settings.json');
  }

  /**
   * Get all settings
   */
  getSettings(): AppSettings {
    if (!existsSync(this.settingsPath)) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const content = readFileSync(this.settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      return { ...DEFAULT_SETTINGS, ...settings };
    } catch (error) {
      console.error('[SettingsService] Error reading settings:', error);
      return { ...DEFAULT_SETTINGS };
    }
  }

  /**
   * Get a specific setting
   */
  getSetting<T>(key: string): T | undefined {
    const settings = this.getSettings();
    return settings[key] as T | undefined;
  }
}

export const settingsService = new SettingsService();
