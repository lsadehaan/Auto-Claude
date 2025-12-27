import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from web-server directory
dotenvConfig({ path: join(__dirname, '..', '.env') });

export const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',

  // Authentication
  passwordHash: process.env.AUTO_CLAUDE_PASSWORD_HASH || '',
  sessionSecret: process.env.SESSION_SECRET || 'auto-claude-secret-change-me',
  sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10), // 24 hours

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Paths
  frontendDistPath: process.env.FRONTEND_DIST_PATH || join(__dirname, '../../frontend/dist-web'),
  dataDir: process.env.DATA_DIR || join(__dirname, '../data'),
  dataPath: process.env.DATA_PATH || join(process.env.HOME || process.env.USERPROFILE || '.', '.auto-claude-server'),

  // Projects directory - all Auto-Claude projects live here
  projectsDir: process.env.PROJECTS_DIR || join(process.env.HOME || process.env.USERPROFILE || '.', 'auto-claude-projects'),

  // Python backend
  pythonPath: process.env.PYTHON_PATH || 'python',
  backendPath: process.env.BACKEND_PATH || join(__dirname, '../../backend'),

  // Claude configuration (passed to Python backend)
  claudeOAuthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN || '',

  // Development mode
  isDev: process.env.NODE_ENV !== 'production',
};

// Validate required configuration
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.passwordHash && !config.isDev) {
    errors.push('AUTO_CLAUDE_PASSWORD_HASH is required in production. Run: npm run setup-password');
  }

  if (!config.claudeOAuthToken) {
    errors.push('CLAUDE_CODE_OAUTH_TOKEN is required. Run: claude setup-token');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
