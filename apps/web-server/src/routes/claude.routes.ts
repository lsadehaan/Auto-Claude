/**
 * Claude Profile Routes
 * Manages Claude authentication profiles for the web server
 */

import { Router } from 'express';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const router = Router();

// Profile storage location
const PROFILES_DIR = join(homedir(), '.auto-claude');
const PROFILES_FILE = join(PROFILES_DIR, 'claude-profiles.json');

interface ClaudeProfile {
  id: string;
  name: string;
  configDir?: string;
  oauthToken?: string;
  email?: string;
  isDefault: boolean;
  createdAt: string;
}

interface ProfilesData {
  profiles: ClaudeProfile[];
  activeProfileId: string | null;
}

// Ensure profiles directory exists
function ensureProfilesDir(): void {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

// Load profiles from disk
function loadProfiles(): ProfilesData {
  ensureProfilesDir();

  if (!existsSync(PROFILES_FILE)) {
    // Create default profile
    const defaultProfile: ClaudeProfile = {
      id: 'default',
      name: 'Default',
      configDir: join(homedir(), '.claude'),
      isDefault: true,
      createdAt: new Date().toISOString(),
    };

    // Check if default Claude config has a token
    const defaultConfigPath = join(homedir(), '.claude', 'config.json');
    if (existsSync(defaultConfigPath)) {
      try {
        const config = JSON.parse(readFileSync(defaultConfigPath, 'utf-8'));
        if (config.oauth_token) {
          defaultProfile.oauthToken = config.oauth_token;
        }
      } catch {
        // Ignore parse errors
      }
    }

    const data: ProfilesData = {
      profiles: [defaultProfile],
      activeProfileId: 'default',
    };

    saveProfiles(data);
    return data;
  }

  try {
    return JSON.parse(readFileSync(PROFILES_FILE, 'utf-8'));
  } catch {
    return { profiles: [], activeProfileId: null };
  }
}

// Save profiles to disk
function saveProfiles(data: ProfilesData): void {
  ensureProfilesDir();
  writeFileSync(PROFILES_FILE, JSON.stringify(data, null, 2));
}

// GET /api/claude/profiles - List all profiles
router.get('/profiles', (req, res) => {
  try {
    const data = loadProfiles();
    res.json({ success: true, data });
  } catch (error) {
    res.json({ success: false, error: 'Failed to load profiles' });
  }
});

// POST /api/claude/profiles - Create a new profile
router.post('/profiles', (req, res) => {
  try {
    const profile = req.body as ClaudeProfile;
    const data = loadProfiles();

    // Add the new profile
    data.profiles.push({
      ...profile,
      createdAt: new Date().toISOString(),
    });

    saveProfiles(data);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.json({ success: false, error: 'Failed to create profile' });
  }
});

// DELETE /api/claude/profiles/:id - Delete a profile
router.delete('/profiles/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = loadProfiles();

    // Don't allow deleting default profile
    const profile = data.profiles.find(p => p.id === id);
    if (profile?.isDefault) {
      return res.json({ success: false, error: 'Cannot delete default profile' });
    }

    data.profiles = data.profiles.filter(p => p.id !== id);

    // Update active profile if needed
    if (data.activeProfileId === id) {
      data.activeProfileId = data.profiles[0]?.id || null;
    }

    saveProfiles(data);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: 'Failed to delete profile' });
  }
});

// PUT /api/claude/profiles/:id/rename - Rename a profile
router.put('/profiles/:id/rename', (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const data = loadProfiles();

    const profile = data.profiles.find(p => p.id === id);
    if (!profile) {
      return res.json({ success: false, error: 'Profile not found' });
    }

    profile.name = name;
    saveProfiles(data);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.json({ success: false, error: 'Failed to rename profile' });
  }
});

// POST /api/claude/profiles/:id/activate - Set active profile
router.post('/profiles/:id/activate', (req, res) => {
  try {
    const { id } = req.params;
    const data = loadProfiles();

    const profile = data.profiles.find(p => p.id === id);
    if (!profile) {
      return res.json({ success: false, error: 'Profile not found' });
    }

    data.activeProfileId = id;
    saveProfiles(data);
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: 'Failed to activate profile' });
  }
});

// POST /api/claude/profiles/:id/token - Set token for a profile
router.post('/profiles/:id/token', (req, res) => {
  try {
    const { id } = req.params;
    const { token, email } = req.body;
    const data = loadProfiles();

    const profile = data.profiles.find(p => p.id === id);
    if (!profile) {
      return res.json({ success: false, error: 'Profile not found' });
    }

    profile.oauthToken = token;
    if (email) {
      profile.email = email;
    }

    saveProfiles(data);

    // Also update the backend .env file with the token
    updateBackendToken(token);

    res.json({ success: true, data: profile });
  } catch (error) {
    res.json({ success: false, error: 'Failed to set token' });
  }
});

// Helper to update backend .env with the token
function updateBackendToken(token: string): void {
  try {
    const backendEnvPath = join(process.cwd(), '..', 'backend', '.env');

    if (existsSync(backendEnvPath)) {
      let content = readFileSync(backendEnvPath, 'utf-8');

      if (content.includes('CLAUDE_CODE_OAUTH_TOKEN=')) {
        content = content.replace(
          /CLAUDE_CODE_OAUTH_TOKEN=.*/,
          `CLAUDE_CODE_OAUTH_TOKEN=${token}`
        );
      } else {
        content += `\nCLAUDE_CODE_OAUTH_TOKEN=${token}\n`;
      }

      writeFileSync(backendEnvPath, content);
    }
  } catch (error) {
    console.error('Failed to update backend .env:', error);
  }
}

export default router;
