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

  // Additional API routes can go here
  // app.get('/api/...', ...)

  // SPA fallback - serve index.html for all routes
  // This must come AFTER static file middleware and API routes
  app.use((req, res) => {
    // Only serve index.html for GET requests (not for API calls)
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/ipc')) {
      res.sendFile('index.web.html', { root: config.frontendDistPath }, (err) => {
        if (err) {
          console.error('[Server] Error serving index.html:', err);
          res.status(500).send('Server error');
        }
      });
    } else {
      res.status(404).send('Not found');
    }
  });

  console.log(`Server running at http://${config.host}:${config.port}`);
  console.log(`IPC endpoint: ws://${config.host}:${config.port}/ipc`);
  console.log(`Serving frontend from: ${config.frontendDistPath}`);
}

main().catch(console.error);
