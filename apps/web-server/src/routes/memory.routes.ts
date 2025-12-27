/**
 * Memory Infrastructure Routes
 * Handles memory system status and configuration
 */

import { Router, type Request, type Response } from 'express';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const router = Router();

// ============================================================================
// Memory Status
// ============================================================================

/**
 * Check if Python backend is available
 */
function checkPythonBackend(): { available: boolean; version?: string; error?: string } {
  try {
    // Try to find Python
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const version = execSync(`${pythonCmd} --version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    return { available: true, version };
  } catch (error) {
    return {
      available: false,
      error: 'Python not found. Install Python 3.10+ to use memory features.',
    };
  }
}

/**
 * Check if backend dependencies are installed
 */
function checkBackendDependencies(backendPath: string): { installed: boolean; error?: string } {
  try {
    // Check if backend directory exists
    if (!existsSync(backendPath)) {
      return {
        installed: false,
        error: `Backend not found at ${backendPath}`,
      };
    }

    // Check for requirements.txt
    const requirementsPath = join(backendPath, 'requirements.txt');
    if (!existsSync(requirementsPath)) {
      return {
        installed: false,
        error: 'Backend requirements.txt not found',
      };
    }

    // Check for virtual environment
    const venvPath = join(backendPath, '.venv');
    const venvExists = existsSync(venvPath);

    return {
      installed: venvExists,
      error: venvExists ? undefined : 'Virtual environment not created. Run: cd apps/backend && uv venv && uv pip install -r requirements.txt',
    };
  } catch (error) {
    return {
      installed: false,
      error: error instanceof Error ? error.message : 'Failed to check backend dependencies',
    };
  }
}

/**
 * Check memory infrastructure status
 * GET /api/memory/status
 */
router.get('/status', (req: Request, res: Response) => {
  const dbPath = req.query.dbPath as string | undefined;

  // Check Python
  const pythonStatus = checkPythonBackend();

  // Check backend path (from env or default)
  const backendPath = process.env.BACKEND_PATH || join(process.cwd(), '..', 'backend');
  const backendStatus = checkBackendDependencies(backendPath);

  // Check if Graphiti is configured
  const graphitiConfigured = !!(
    process.env.GRAPHITI_LLM_PROVIDER ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  );

  // Overall status
  const memoryAvailable = pythonStatus.available && backendStatus.installed;

  const status = {
    available: memoryAvailable,
    python: pythonStatus,
    backend: {
      path: backendPath,
      ...backendStatus,
    },
    graphiti: {
      configured: graphitiConfigured,
      provider: process.env.GRAPHITI_LLM_PROVIDER || null,
    },
    database: {
      path: dbPath || null,
      type: 'ladybug', // LadybugDB embedded database
    },
  };

  res.json({
    success: true,
    data: status,
  });
});

/**
 * List available memory databases
 * GET /api/memory/databases
 */
router.get('/databases', (req: Request, res: Response) => {
  const dbPath = req.query.dbPath as string | undefined;

  // In web mode, we use a server-side database location
  const defaultDbPath = process.env.MEMORY_DB_PATH || join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.auto-claude',
    'memory'
  );

  const databases = [
    {
      id: 'default',
      name: 'Default Memory',
      path: dbPath || defaultDbPath,
      type: 'ladybug',
      isDefault: true,
    },
  ];

  res.json({
    success: true,
    data: databases,
  });
});

/**
 * Test memory connection
 * POST /api/memory/test-connection
 * Body: { provider, apiKey, baseUrl }
 */
router.post('/test-connection', async (req: Request, res: Response) => {
  const { provider, apiKey, baseUrl } = req.body;

  if (!provider) {
    return res.json({
      success: false,
      error: 'Provider is required',
    });
  }

  // For now, just validate that required fields are present
  // Actual connection testing would require Python backend

  const requiredFields: Record<string, string[]> = {
    openai: ['apiKey'],
    anthropic: ['apiKey'],
    ollama: ['baseUrl'],
    'azure-openai': ['apiKey', 'baseUrl'],
    'google-ai': ['apiKey'],
  };

  const required = requiredFields[provider] || [];
  const missing = required.filter(field => !req.body[field]);

  if (missing.length > 0) {
    return res.json({
      success: false,
      error: `Missing required fields: ${missing.join(', ')}`,
    });
  }

  // Mock successful connection for now
  // In production, this would call Python backend to test
  res.json({
    success: true,
    data: {
      connected: true,
      provider,
      message: 'Connection test successful (mocked)',
    },
  });
});

export default router;
