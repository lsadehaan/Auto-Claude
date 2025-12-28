/**
 * Claude Profile Manager Shim for Web Server
 *
 * This is a minimal implementation of ClaudeProfileManager that works
 * in Node.js without Electron. It reads profiles from disk but cannot
 * decrypt encrypted tokens (returns plain text tokens only).
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import type { ClaudeProfile } from '../../../frontend/src/shared/types';

interface ProfileStoreData {
  version: number;
  profiles: ClaudeProfile[];
  activeProfileId: string;
  autoSwitch?: any;
}

/**
 * Web-server compatible ClaudeProfileManager
 * Only implements methods needed by getProfileEnv()
 */
export class ClaudeProfileManager {
  private data: ProfileStoreData | null = null;
  private storePath: string;

  constructor() {
    // Check multiple possible locations for claude-profiles.json
    const possiblePaths = [
      join(homedir(), '.auto-claude', 'claude-profiles.json'),
      join(homedir(), '.config', 'auto-claude', 'claude-profiles.json'),
    ];

    this.storePath = possiblePaths.find(p => existsSync(p)) || possiblePaths[0];
    this.load();
  }

  /**
   * Load profiles from disk
   */
  private load(): void {
    if (existsSync(this.storePath)) {
      try {
        const content = readFileSync(this.storePath, 'utf-8');
        this.data = JSON.parse(content);
      } catch (error) {
        console.error('[ClaudeProfileManager] Failed to load profiles:', error);
      }
    }

    // Create default if no data loaded
    if (!this.data) {
      this.data = {
        version: 3,
        profiles: [{
          id: 'default',
          name: 'Default',
          configDir: '~/.claude',
          isDefault: true,
          description: 'Default Claude configuration',
          createdAt: new Date()
        }],
        activeProfileId: 'default'
      };
    }
  }

  /**
   * Get a specific profile by ID
   */
  getProfile(profileId: string): ClaudeProfile | undefined {
    return this.data?.profiles.find(p => p.id === profileId);
  }

  /**
   * Get the active profile
   */
  getActiveProfile(): ClaudeProfile | undefined {
    if (!this.data) return undefined;

    const active = this.data.profiles.find(p => p.id === this.data!.activeProfileId);
    if (active) return active;

    // Fallback to default
    const defaultProfile = this.data.profiles.find(p => p.isDefault);
    if (defaultProfile) return defaultProfile;

    // Fallback to first profile
    return this.data.profiles[0];
  }

  /**
   * Get the OAuth token for the active profile
   * Note: Cannot decrypt encrypted tokens (enc: prefix) in web-server context
   */
  getActiveProfileToken(): string | undefined {
    const profile = this.getActiveProfile();
    if (!profile?.oauthToken) {
      return undefined;
    }

    // If token is encrypted (enc: prefix), we can't decrypt it without Electron safeStorage
    if (profile.oauthToken.startsWith('enc:')) {
      console.warn('[ClaudeProfileManager] Cannot decrypt encrypted token in web-server context');
      return undefined;
    }

    // Return plain text token
    return profile.oauthToken;
  }

  /**
   * Get the OAuth token for a specific profile
   * Note: Cannot decrypt encrypted tokens (enc: prefix) in web-server context
   */
  getProfileToken(profileId: string): string | undefined {
    const profile = this.getProfile(profileId);
    if (!profile?.oauthToken) {
      return undefined;
    }

    // If token is encrypted, we can't decrypt it without Electron safeStorage
    if (profile.oauthToken.startsWith('enc:')) {
      console.warn('[ClaudeProfileManager] Cannot decrypt encrypted token in web-server context');
      return undefined;
    }

    // Return plain text token
    return profile.oauthToken;
  }
}

// Singleton instance
let profileManager: ClaudeProfileManager | null = null;

/**
 * Get the singleton ClaudeProfileManager instance
 */
export function getClaudeProfileManager(): ClaudeProfileManager {
  if (!profileManager) {
    profileManager = new ClaudeProfileManager();
  }
  return profileManager;
}
