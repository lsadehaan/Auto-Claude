/**
 * Settings Routes
 * Handles application settings persistence
 */

import { Router, type Request, type Response } from 'express';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { config } from '../config.js';
import { sshKeyService } from '../services/ssh-key-service.js';
import { gitConfigService } from '../services/git-config-service.js';

const router = Router();

// ============================================================================
// Settings Storage
// ============================================================================

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
  globalClaudeOAuthToken?: string;
  globalOpenAIApiKey?: string;
  globalAnthropicApiKey?: string;
  globalGoogleApiKey?: string;
  globalGroqApiKey?: string;
  globalOpenRouterApiKey?: string;
  graphitiLlmProvider?: string;
  ollamaBaseUrl?: string;
  onboardingCompleted?: boolean;
  selectedAgentProfile?: string;
  customPhaseModels?: Record<string, string>;
  customPhaseThinking?: Record<string, string>;
  featureModels?: Record<string, string>;
  featureThinking?: Record<string, string>;
  changelogFormat?: string;
  changelogAudience?: string;
  changelogEmojiLevel?: string;
  terminalFontSize?: number;
  developerMode?: boolean;
  viewMode?: 'tabs' | 'split';
  sidebarCollapsed?: boolean;
  rightPanelCollapsed?: boolean;
  specCreationAutoMode?: boolean;
  specCreationShowComplexity?: boolean;
  defaultComplexity?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  [key: string]: unknown;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  defaultModel: 'claude-3-5-sonnet',
  agentFramework: 'auto-claude',
  autoUpdateAutoBuild: true,
  autoNameTerminals: true,
  autoBuildPath: config.backendPath, // In web mode, use the server's backend path
  notifications: {
    taskComplete: true,
    taskError: true,
    buildProgress: false,
  },
  onboardingCompleted: false, // Show onboarding for new users
};

/**
 * Get the settings file path
 */
function getSettingsPath(): string {
  // Use config data path or default to user home
  const dataDir = config.dataPath || path.join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.auto-claude'
  );

  // Ensure directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  return path.join(dataDir, 'settings.json');
}

/**
 * Read settings from file
 */
function readSettings(): AppSettings {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content);
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error('[Settings] Error reading settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Write settings to file
 */
function writeSettings(settings: AppSettings): boolean {
  const settingsPath = getSettingsPath();

  try {
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('[Settings] Error writing settings:', error);
    return false;
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /settings
 * Get all settings
 */
router.get('/', (_req: Request, res: Response) => {
  const settings = readSettings();

  res.json({
    success: true,
    data: settings,
  });
});

/**
 * POST /settings
 * Update settings (partial update)
 */
router.post('/', (req: Request, res: Response) => {
  const updates = req.body;

  if (!updates || typeof updates !== 'object') {
    return res.json({
      success: false,
      error: 'Invalid settings data',
    });
  }

  // Read current settings
  const current = readSettings();

  // Merge with updates (shallow merge for top level, deep merge for nested)
  const merged: AppSettings = { ...current };

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) {
      // Allow explicit null/undefined to delete keys
      delete merged[key];
    } else if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof merged[key] === 'object' &&
      !Array.isArray(merged[key])
    ) {
      // Deep merge for objects
      merged[key] = { ...(merged[key] as object), ...value };
    } else {
      merged[key] = value;
    }
  }

  // Write updated settings
  const success = writeSettings(merged);

  if (success) {
    res.json({
      success: true,
      data: merged,
    });
  } else {
    res.json({
      success: false,
      error: 'Failed to save settings',
    });
  }
});

/**
 * PUT /settings
 * Replace all settings
 */
router.put('/', (req: Request, res: Response) => {
  const settings = req.body;

  if (!settings || typeof settings !== 'object') {
    return res.json({
      success: false,
      error: 'Invalid settings data',
    });
  }

  // Merge with defaults to ensure required fields
  const merged = { ...DEFAULT_SETTINGS, ...settings };

  const success = writeSettings(merged);

  if (success) {
    res.json({
      success: true,
      data: merged,
    });
  } else {
    res.json({
      success: false,
      error: 'Failed to save settings',
    });
  }
});

/**
 * DELETE /settings
 * Reset to defaults
 */
router.delete('/', (_req: Request, res: Response) => {
  const success = writeSettings({ ...DEFAULT_SETTINGS });

  if (success) {
    res.json({
      success: true,
      data: DEFAULT_SETTINGS,
    });
  } else {
    res.json({
      success: false,
      error: 'Failed to reset settings',
    });
  }
});


/**
 * GET /settings/tabs
 * Get project tab state
 */
router.get('/tabs', (_req: Request, res: Response) => {
  const settings = readSettings();
  const tabState = settings.projectTabs || {
    openProjectIds: [],
    activeProjectId: null,
    tabOrder: []
  };

  res.json({
    success: true,
    data: tabState,
  });
});

/**
 * PUT /settings/tabs
 * Save project tab state
 */
router.put('/tabs', (req: Request, res: Response) => {
  const tabState = req.body;

  if (!tabState || typeof tabState !== 'object') {
    return res.json({
      success: false,
      error: 'Invalid tab state data',
    });
  }

  // Read current settings
  const settings = readSettings();

  // Update tab state
  settings.projectTabs = tabState;

  // Save settings
  const success = writeSettings(settings);

  if (success) {
    res.json({
      success: true,
      data: tabState,
    });
  } else {
    res.json({
      success: false,
      error: 'Failed to save tab state',
    });
  }
});

// ============================================================================
// SSH Key Management
// ============================================================================

/**
 * GET /settings/ssh/key
 * Get SSH key info (public key, fingerprint)
 */
router.get('/ssh/key', (_req: Request, res: Response) => {
  try {
    const keyInfo = sshKeyService.getKeyInfo();

    if (!keyInfo) {
      return res.json({
        success: true,
        data: { hasKey: false },
      });
    }

    res.json({
      success: true,
      data: {
        hasKey: true,
        publicKey: keyInfo.publicKey,
        fingerprint: keyInfo.fingerprint,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get SSH key info',
    });
  }
});

/**
 * POST /settings/ssh/generate
 * Generate a new SSH key pair
 * Body: { email, force? }
 */
router.post('/ssh/generate', (req: Request, res: Response) => {
  try {
    const { email, force } = req.body;

    if (!email) {
      return res.json({
        success: false,
        error: 'Email is required',
      });
    }

    const keyInfo = sshKeyService.generateKeyPair(email, force || false);

    res.json({
      success: true,
      data: {
        publicKey: keyInfo.publicKey,
        fingerprint: keyInfo.fingerprint,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate SSH key',
    });
  }
});

/**
 * POST /settings/ssh/test-github
 * Test SSH connection to GitHub
 */
router.post('/ssh/test-github', async (_req: Request, res: Response) => {
  try {
    const result = await sshKeyService.testGitHubConnection();
    res.json({
      success: result.success,
      data: { message: result.message },
    });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test SSH connection',
    });
  }
});

// ============================================================================
// Git Configuration
// ============================================================================

/**
 * GET /settings/git/config
 * Get global git configuration
 */
router.get('/git/config', (_req: Request, res: Response) => {
  try {
    const config = gitConfigService.getGlobalConfig();
    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get git config',
    });
  }
});

/**
 * POST /settings/git/config
 * Set global git configuration
 * Body: { userName, userEmail }
 */
router.post('/git/config', (req: Request, res: Response) => {
  try {
    const { userName, userEmail } = req.body;

    if (!userName || !userEmail) {
      return res.json({
        success: false,
        error: 'userName and userEmail are required',
      });
    }

    gitConfigService.setGlobalConfig({ userName, userEmail });

    // Also store in settings for backward compatibility
    const settings = readSettings();
    settings.gitUserName = userName;
    settings.gitUserEmail = userEmail;
    writeSettings(settings);

    res.json({
      success: true,
      data: { userName, userEmail },
    });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save git config',
    });
  }
});


export default router;
