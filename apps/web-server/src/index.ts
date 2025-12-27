import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

import { config, validateConfig } from './config.js';
import { corsMiddleware } from './middleware/cors.js';
import { authMiddleware, login, logout, getAuthCookieName, isValidSession } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { setupRoutes } from './routes/index.js';
import { setupWebSocket } from './websocket/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate configuration
const validation = validateConfig();
if (!validation.valid) {
  console.error('Configuration errors:');
  validation.errors.forEach(e => console.error(`  - ${e}`));
  if (!config.isDev) {
    process.exit(1);
  }
  console.warn('Continuing in development mode with warnings...');
}

// Create Express app
const app = express();
const server = createServer(app);

// WebSocket server - handles all /ws/* paths using noServer mode
const wss = new WebSocketServer({ noServer: true });

// Manually handle WebSocket upgrades for /ws/* paths
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url || '';
  if (pathname.startsWith('/ws')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(corsMiddleware);

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Version endpoint (no auth required)
app.get('/api/version', async (_req, res) => {
  try {
    const { execSync } = await import('child_process');
    const commit = execSync('git rev-parse --short HEAD', {
      cwd: join(__dirname, '../../..'),
      encoding: 'utf-8'
    }).trim();
    res.json({ success: true, data: { commit } });
  } catch (error) {
    res.json({ success: true, data: { commit: 'unknown' } });
  }
});

// Favicon handler (prevent 404 spam in logs)
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end(); // No Content
});

// Auth routes (before auth middleware)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      res.status(400).json({ success: false, error: 'Password is required' });
      return;
    }

    const sessionId = await login(password);

    if (!sessionId) {
      res.status(401).json({ success: false, error: 'Invalid password' });
      return;
    }

    res.cookie(getAuthCookieName(), sessionId, {
      httpOnly: true,
      secure: !config.isDev,
      sameSite: 'lax',
      maxAge: config.sessionMaxAge,
    });

    res.json({ success: true, data: { message: 'Login successful' } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.cookies[getAuthCookieName()];
  if (sessionId) {
    logout(sessionId);
  }
  res.clearCookie(getAuthCookieName());
  res.json({ success: true, data: { message: 'Logged out' } });
});

app.get('/api/auth/status', (req, res) => {
  const sessionId = req.cookies[getAuthCookieName()];
  const authenticated = sessionId ? isValidSession(sessionId) : false;

  // In dev mode without password, always authenticated
  const devNoAuth = config.isDev && !config.passwordHash;

  res.json({
    success: true,
    data: {
      authenticated: authenticated || devNoAuth,
      requiresPassword: !!config.passwordHash,
    },
  });
});

// Apply auth middleware for all API routes below
app.use('/api', authMiddleware);

// API routes
app.use('/api', setupRoutes());

// Set up all WebSocket handlers (events, terminal)
setupWebSocket(wss);

// Serve static React SPA (if built)
const staticPath = config.frontendDistPath;
if (existsSync(staticPath)) {
  // Serve static files with proper cache control
  app.use(express.static(staticPath, {
    setHeaders: (res, path) => {
      // Cache hashed assets forever (they have content hashes in filenames)
      if (path.match(/\.(js|css)$/) && path.match(/-[a-zA-Z0-9]{8}\./)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // Never cache HTML and other files
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    // Always revalidate index.html
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(join(staticPath, 'index.html'));
  });
} else {
  console.log(`[Info] Frontend not built at ${staticPath}. Run 'npm run web:build' to build.`);
}

// 404 handler for API routes
app.use('/api', notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
server.listen(config.port, config.host, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  Auto-Claude Web Server');
  console.log('='.repeat(60));
  console.log(`  URL:  http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  console.log(`  Mode: ${config.isDev ? 'Development' : 'Production'}`);
  console.log(`  Auth: ${config.passwordHash ? 'Enabled' : 'Disabled (dev mode)'}`);
  console.log('='.repeat(60));
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down...');
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down...');
  server.close(() => {
    console.log('[Server] Closed');
    process.exit(0);
  });
});
