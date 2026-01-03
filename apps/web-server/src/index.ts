/**
 * Auto-Claude Web Server
 * Minimal implementation using electron-to-web
 */

import { createWebServer } from 'electron-to-web/server';
import { BrowserWindow, TRUSTED_SECURITY_CONFIG } from 'electron-to-web/main';
import { config, isDev } from './config.js';

// Import web-specific Electron IPC setup from frontend
// Uses ipc-setup.web.ts which excludes Electron-only handlers (electron-updater)
// The 'electron' imports in these files will be aliased to 'electron-to-web/main'
import { setupIpcHandlers } from '../../frontend/src/main/ipc-setup.web';
import { AgentManager } from '../../frontend/src/main/agent';
import { TerminalManager } from '../../frontend/src/main/terminal-manager';
import { PythonEnvManager } from '../../frontend/src/main/python-env-manager';

async function main() {
  // Create a BrowserWindow shim for web context
  const mainWindow = new BrowserWindow();
  const getMainWindow = () => mainWindow;

  // Initialize managers (these are the same classes used in Electron)
  const agentManager = new AgentManager();
  const terminalManager = new TerminalManager();
  const pythonEnvManager = new PythonEnvManager();

  // Setup IPC handlers using the existing Electron handlers
  // This works because 'electron' imports are aliased to 'electron-to-web/main'
  setupIpcHandlers(agentManager, terminalManager, getMainWindow, pythonEnvManager);

  // Create web server with electron-to-web
  const { app, server } = await createWebServer({
    port: config.port,
    staticDir: config.frontendDistPath,
    cors: isDev,
    security: TRUSTED_SECURITY_CONFIG,
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  console.log(`Server running at http://${config.host}:${config.port}`);
  console.log(`IPC endpoint: ws://${config.host}:${config.port}/ipc`);
}

main().catch(console.error);
