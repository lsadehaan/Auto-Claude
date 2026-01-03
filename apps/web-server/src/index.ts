/**
 * Auto-Claude Web Server
 * Minimal implementation using electron-to-web
 */

import { createWebServer, TRUSTED_SECURITY_CONFIG } from 'electron-to-web/server';
import { config, isDev } from './config.js';

async function main() {
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
}

main().catch(console.error);
