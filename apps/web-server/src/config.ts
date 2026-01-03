/**
 * Server Configuration
 * Loads settings from environment variables
 */

import { config as loadEnv } from 'dotenv';
import { join } from 'path';

loadEnv();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Projects directory for Auto-Claude
  projectsDir: process.env.PROJECTS_DIR || join(process.cwd(), 'projects'),

  // Frontend dist path (where built React app lives)
  frontendDistPath: join(process.cwd(), '../frontend/dist-web'),

  // Python backend path
  backendPath: join(process.cwd(), '../backend'),

  // Claude API token
  claudeToken: process.env.CLAUDE_CODE_OAUTH_TOKEN,
};

// Computed properties
export const isDev = config.nodeEnv === 'development';
