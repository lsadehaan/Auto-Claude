import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import projectRoutes from './project.routes.js';
import terminalRoutes from './terminal.routes.js';
import taskRoutes from './task.routes.js';
import settingsRoutes from './settings.routes.js';
import filesRoutes from './files.routes.js';
import claudeRoutes from './claude.routes.js';
import githubRoutes from './github.routes.js';
import linearRoutes from './linear.routes.js';
import roadmapRoutes from './roadmap.routes.js';
import ideationRoutes from './ideation.routes.js';
import contextRoutes from './context.routes.js';
import memoryRoutes from './memory.routes.js';
import ollamaRoutes from './ollama.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get app version from package.json
 */
function getAppVersion(): string {
  try {
    // Try web-server package.json first
    const webServerPkg = join(__dirname, '../../package.json');
    if (existsSync(webServerPkg)) {
      const pkg = JSON.parse(readFileSync(webServerPkg, 'utf-8'));
      return pkg.version || '1.0.0';
    }
    // Fallback to root package.json
    const rootPkg = join(__dirname, '../../../../package.json');
    if (existsSync(rootPkg)) {
      const pkg = JSON.parse(readFileSync(rootPkg, 'utf-8'));
      return pkg.version || '1.0.0';
    }
  } catch {
    // Ignore errors
  }
  return '1.0.0';
}

/**
 * Set up all API routes
 */
export function setupRoutes(): Router {
  const router = Router();

  // Version endpoint
  router.get('/version', (_req, res) => {
    res.json({
      success: true,
      data: getAppVersion(),
    });
  });

  // Project routes
  router.use('/projects', projectRoutes);

  // Terminal routes
  router.use('/terminals', terminalRoutes);

  // Task routes
  router.use('/tasks', taskRoutes);

  // Settings routes
  router.use('/settings', settingsRoutes);

  // File explorer routes
  router.use('/files', filesRoutes);

  // Claude profile routes
  router.use('/claude', claudeRoutes);

  // Roadmap routes
  router.use('/roadmap', roadmapRoutes);

  // Ideation routes
  router.use('/ideation', ideationRoutes);

  // Insights routes (placeholder - needs Claude integration)
  router.use('/insights', (_req, res) => {
    res.json({ success: false, error: 'Insights requires Claude integration' });
  });

  // GitHub routes
  router.use('/github', githubRoutes);

  // Linear routes
  router.use('/linear', linearRoutes);

  // Changelog routes (placeholder)
  router.use('/changelog', (_req, res) => {
    res.json({ success: false, error: 'Changelog generation not yet implemented' });
  });

  // Context routes
  router.use('/context', contextRoutes);

  // Memory routes
  router.use('/memory', memoryRoutes);

  // Ollama routes
  router.use('/ollama', ollamaRoutes);

  return router;
}
