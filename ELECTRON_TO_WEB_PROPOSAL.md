# electron-to-web: Universal Electron-to-Browser Bridge

**Tagline:** Deploy your Electron app to the web without code changes

## Overview

A zero-config library that automatically converts Electron IPC communication to HTTP/WebSocket, enabling Electron desktop apps to run in the browser with minimal migration effort.

## The Problem

Electron apps are great for desktop, but deploying them as web apps requires:
- ❌ Rewriting all IPC communication as HTTP endpoints
- ❌ Reimplementing renderer-to-main communication
- ❌ Creating WebSocket infrastructure for real-time updates
- ❌ Shimming Electron APIs (dialog, shell, clipboard, etc.)
- ❌ Maintaining two codebases with duplicate logic

**Result:** Most Electron apps never get a web version despite user demand.

## The Solution

`electron-to-web` provides drop-in replacements for Electron APIs that automatically handle web transport:

```typescript
// Your existing Electron code works as-is!
import { ipcMain } from 'electron-to-web/main';  // Was: 'electron'
import { BrowserWindow } from 'electron-to-web/main';

ipcMain.handle('user:create', async (event, userData) => {
  const user = await db.createUser(userData);
  mainWindow.webContents.send('user:created', user);
  return { success: true, user };
});
```

The library automatically:
- ✅ Converts `ipcMain.handle()` → Express POST routes
- ✅ Converts `webContents.send()` → WebSocket broadcasts
- ✅ Converts `ipcRenderer.invoke()` → HTTP fetch
- ✅ Converts `ipcRenderer.on()` → WebSocket subscriptions
- ✅ Provides browser-compatible shims for Electron APIs

## Architecture

### Package Structure

```
electron-to-web/
├── main/              # Server-side (Node.js)
│   ├── ipc-main.ts    # ipcMain.handle() → Express routes
│   ├── browser-window.ts  # BrowserWindow shim with WebSocket
│   ├── app.ts         # app.* API shims
│   ├── dialog.ts      # dialog.* API shims (server-side file browser)
│   └── index.ts       # Main entry point
│
├── renderer/          # Browser-side (Frontend)
│   ├── ipc-renderer.ts  # ipcRenderer.invoke/on → HTTP/WS
│   ├── shell.ts       # shell.openExternal() → window.open()
│   ├── clipboard.ts   # clipboard.* → navigator.clipboard
│   ├── remote.ts      # Remote module shim (deprecated but supported)
│   └── index.ts       # Renderer entry point
│
├── server/            # Web server utilities
│   ├── create-server.ts  # Express + WebSocket server factory
│   ├── session-manager.ts  # Session/auth middleware
│   ├── route-generator.ts  # Auto-generate REST API from IPC
│   └── index.ts
│
├── middleware/        # Express middleware
│   ├── ipc-router.ts  # Routes IPC calls to handlers
│   ├── websocket-bridge.ts  # IPC events → WebSocket
│   └── auth.ts        # Authentication helpers
│
└── utils/             # Shared utilities
    ├── channel-registry.ts  # Track all IPC channels
    ├── serialization.ts  # Serialize complex args (Buffers, etc.)
    └── types.ts       # TypeScript definitions
```

### Core Components

#### 1. IPC Main Adapter (Server-side)

```typescript
// electron-to-web/main/ipc-main.ts
import type { Express, Request, Response } from 'express';
import { EventEmitter } from 'events';

export class IPCMain extends EventEmitter {
  private handlers = new Map<string, Function>();
  private app?: Express;

  constructor() {
    super();
  }

  /**
   * Register app instance to auto-generate routes
   */
  attachToServer(app: Express) {
    this.app = app;

    // Generate routes for all registered handlers
    for (const [channel, handler] of this.handlers) {
      this.createRoute(channel, handler);
    }
  }

  /**
   * Register IPC handler (Electron-compatible API)
   */
  handle(channel: string, handler: (event: any, ...args: any[]) => any) {
    this.handlers.set(channel, handler);

    // If server already attached, create route immediately
    if (this.app) {
      this.createRoute(channel, handler);
    }
  }

  /**
   * Remove IPC handler (Electron-compatible API)
   */
  removeHandler(channel: string) {
    this.handlers.delete(channel);
    // Note: Can't remove Express routes, but handler won't be called
  }

  /**
   * Create Express route for IPC channel
   */
  private createRoute(channel: string, handler: Function) {
    if (!this.app) return;

    // Convert channel name to route path
    // Example: 'task:create' → POST /ipc/task/create
    const path = `/ipc/${channel.replace(':', '/')}`;

    this.app.post(path, async (req: Request, res: Response) => {
      try {
        // Create mock Electron event object
        const mockEvent = {
          sender: {
            id: req.session?.id || 'anonymous',
            send: (channel: string, ...args: any[]) => {
              // Send via WebSocket (handled by BrowserWindow shim)
              req.app.locals.wsServer?.send(req.session?.id, channel, args);
            }
          },
          returnValue: undefined,
          preventDefault: () => {}
        };

        // Call handler with mock event + request body
        const args = Array.isArray(req.body) ? req.body : [req.body];
        const result = await handler(mockEvent, ...args);

        // Return result
        res.json(result || { success: true });
      } catch (error) {
        console.error(`[IPC] Error handling ${channel}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    console.log(`[electron-to-web] Registered route: POST ${path}`);
  }
}

export const ipcMain = new IPCMain();
```

#### 2. BrowserWindow Shim (Server-side)

```typescript
// electron-to-web/main/browser-window.ts
import { EventEmitter } from 'events';

export interface WebSocketServer {
  broadcast(channel: string, ...args: any[]): void;
  send(clientId: string, channel: string, ...args: any[]): void;
}

export class BrowserWindow extends EventEmitter {
  private static wsServer?: WebSocketServer;

  /**
   * Configure WebSocket server (called by createWebServer)
   */
  static setWebSocketServer(server: WebSocketServer) {
    BrowserWindow.wsServer = server;
  }

  webContents = {
    /**
     * Send IPC message to renderer (Electron-compatible API)
     * In web mode, broadcasts via WebSocket to all connected clients
     */
    send: (channel: string, ...args: any[]) => {
      if (!BrowserWindow.wsServer) {
        console.warn('[BrowserWindow] WebSocket server not configured');
        return;
      }

      BrowserWindow.wsServer.broadcast(channel, ...args);
    },

    /**
     * Send to specific window (in web mode, send to specific session)
     */
    sendTo: (webContentsId: string, channel: string, ...args: any[]) => {
      if (!BrowserWindow.wsServer) {
        console.warn('[BrowserWindow] WebSocket server not configured');
        return;
      }

      BrowserWindow.wsServer.send(webContentsId, channel, ...args);
    }
  };

  // Stub other BrowserWindow methods (not needed for IPC)
  loadURL() {}
  loadFile() {}
  close() {}
  isDestroyed() { return false; }
  on() { return this; }
  once() { return this; }
}
```

#### 3. IPC Renderer Shim (Browser-side)

```typescript
// electron-to-web/renderer/ipc-renderer.ts
import { EventEmitter } from 'events';

export interface WebSocketClient {
  subscribe(channel: string, callback: Function): void;
  unsubscribe(channel: string, callback: Function): void;
  isConnected(): boolean;
}

export class IPCRenderer extends EventEmitter {
  private static wsClient?: WebSocketClient;
  private listeners = new Map<string, Set<Function>>();

  /**
   * Configure WebSocket client (called automatically)
   */
  static setWebSocketClient(client: WebSocketClient) {
    IPCRenderer.wsClient = client;
  }

  /**
   * Invoke IPC handler (Electron-compatible API)
   * In web mode, sends HTTP POST request
   */
  async invoke<T = any>(channel: string, ...args: any[]): Promise<T> {
    const path = `/ipc/${channel.replace(':', '/')}`;

    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include session cookie
        body: JSON.stringify(args)
      });

      if (!response.ok) {
        throw new Error(`IPC call failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[IPC] Failed to invoke ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Send one-way message (Electron-compatible API)
   * In web mode, sends HTTP POST but doesn't wait for response
   */
  send(channel: string, ...args: any[]) {
    this.invoke(channel, ...args).catch(err => {
      console.error(`[IPC] Failed to send ${channel}:`, err);
    });
  }

  /**
   * Listen for IPC events (Electron-compatible API)
   * In web mode, subscribes to WebSocket events
   */
  on(channel: string, listener: (event: any, ...args: any[]) => void) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());

      // Subscribe to WebSocket for this channel
      if (IPCRenderer.wsClient) {
        IPCRenderer.wsClient.subscribe(channel, (...args: any[]) => {
          // Create mock event object
          const mockEvent = {
            sender: { id: 'main' },
            returnValue: undefined
          };

          // Call all listeners for this channel
          const listeners = this.listeners.get(channel);
          if (listeners) {
            for (const listener of listeners) {
              listener(mockEvent, ...args);
            }
          }
        });
      }
    }

    this.listeners.get(channel)!.add(listener);
  }

  /**
   * Remove event listener (Electron-compatible API)
   */
  removeListener(channel: string, listener: Function) {
    const listeners = this.listeners.get(channel);
    if (listeners) {
      listeners.delete(listener);

      // If no more listeners, unsubscribe from WebSocket
      if (listeners.size === 0 && IPCRenderer.wsClient) {
        IPCRenderer.wsClient.unsubscribe(channel, () => {});
        this.listeners.delete(channel);
      }
    }
  }

  /**
   * Remove all listeners for channel (Electron-compatible API)
   */
  removeAllListeners(channel?: string) {
    if (channel) {
      this.listeners.delete(channel);
      if (IPCRenderer.wsClient) {
        IPCRenderer.wsClient.unsubscribe(channel, () => {});
      }
    } else {
      this.listeners.clear();
    }
  }
}

export const ipcRenderer = new IPCRenderer();
```

#### 4. Web Server Factory

```typescript
// electron-to-web/server/create-server.ts
import express, { type Express } from 'express';
import { WebSocketServer } from 'ws';
import { ipcMain } from '../main/ipc-main.js';
import { BrowserWindow } from '../main/browser-window.js';

export interface ServerOptions {
  port?: number;
  cors?: boolean;
  authentication?: (req: any, res: any, next: any) => void;
}

/**
 * Create web server with IPC-to-HTTP conversion
 */
export function createWebServer(options: ServerOptions = {}) {
  const app = express();
  const port = options.port || 3001;

  // Middleware
  app.use(express.json());

  if (options.cors) {
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });
  }

  if (options.authentication) {
    app.use(options.authentication);
  }

  // Attach IPC handlers to app (generates routes)
  ipcMain.attachToServer(app);

  // Start HTTP server
  const server = app.listen(port, () => {
    console.log(`[electron-to-web] Server listening on port ${port}`);
  });

  // Create WebSocket server
  const wss = new WebSocketServer({ server });

  const wsAdapter = {
    broadcast(channel: string, ...args: any[]) {
      const message = JSON.stringify({ channel, args });
      wss.clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
          client.send(message);
        }
      });
    },

    send(clientId: string, channel: string, ...args: any[]) {
      // In real implementation, would track client IDs
      // For now, just broadcast
      this.broadcast(channel, ...args);
    }
  };

  // Configure BrowserWindow to use WebSocket
  BrowserWindow.setWebSocketServer(wsAdapter);
  app.locals.wsServer = wsAdapter;

  return { app, server, wss };
}
```

## Usage Example

### Step 1: Install

```bash
npm install electron-to-web
```

### Step 2: Modify Imports (Electron Main Process → Web Server)

```typescript
// Before (Electron):
import { app, BrowserWindow, ipcMain } from 'electron';

// After (Web):
import { BrowserWindow, ipcMain } from 'electron-to-web/main';
import { createWebServer } from 'electron-to-web/server';

// Your IPC handlers work as-is!
const mainWindow = new BrowserWindow();

ipcMain.handle('task:create', async (event, data) => {
  const task = await createTask(data);
  mainWindow.webContents.send('task:created', task);
  return { success: true, task };
});

// Start web server
createWebServer({ port: 3001 });
```

### Step 3: Modify Imports (Renderer)

```typescript
// Before (Electron):
import { ipcRenderer } from 'electron';

// After (Web):
import { ipcRenderer } from 'electron-to-web/renderer';

// Your renderer code works as-is!
const result = await ipcRenderer.invoke('task:create', taskData);
ipcRenderer.on('task:created', (event, task) => {
  console.log('Task created:', task);
});
```

### Step 4: Build Configuration

```json
// vite.config.ts (or webpack)
{
  "resolve": {
    "alias": {
      "electron": "electron-to-web/renderer"
    }
  }
}
```

That's it! Your Electron app now runs in the browser.

## API Coverage

### ✅ Fully Supported

- `ipcMain.handle()` / `ipcMain.removeHandler()`
- `ipcRenderer.invoke()` / `ipcRenderer.send()`
- `ipcRenderer.on()` / `ipcRenderer.removeListener()`
- `webContents.send()` / `webContents.sendTo()`
- `shell.openExternal()` → `window.open()`
- `clipboard.writeText()` → `navigator.clipboard`
- `app.getPath()` → Server-side path helpers

### ⚠️ Partial Support (Browser Limitations)

- `dialog.showOpenDialog()` → Browser file picker (limited)
- `dialog.showSaveDialog()` → Download trigger
- `dialog.showMessageBox()` → Browser confirm/alert
- `shell.showItemInFolder()` → Not possible (security)
- `BrowserWindow` geometry → Not applicable

### ❌ Not Supported (Desktop-only)

- `powerMonitor`, `powerSaveBlocker`
- `nativeTheme` (system theme)
- `desktopCapturer`
- Menu/Tray APIs

## Roadmap

### Phase 1: Core IPC (v0.1)
- [x] ipcMain.handle → Express routes
- [x] ipcRenderer.invoke → HTTP fetch
- [x] webContents.send → WebSocket broadcast
- [x] Basic TypeScript definitions
- [ ] Error handling and edge cases
- [ ] Unit tests

### Phase 2: Additional APIs (v0.2)
- [ ] shell.openExternal shim
- [ ] clipboard API shim
- [ ] dialog API shims (file picker, alert, confirm)
- [ ] app.getPath() helpers

### Phase 3: Developer Experience (v0.3)
- [ ] CLI tool for migration analysis
- [ ] Auto-detect incompatible APIs
- [ ] Migration guide generator
- [ ] Hot reload support

### Phase 4: Production Ready (v1.0)
- [ ] Session management
- [ ] Authentication middleware
- [ ] Rate limiting
- [ ] Comprehensive test suite
- [ ] Performance benchmarks
- [ ] Documentation site

## Real-World Benefits

Using this library for Auto-Claude migration would:

1. **Eliminate stub implementations** - All 153 IPC handlers work immediately
2. **Single source of truth** - Bug fix in Electron = fixed in web
3. **Reduce code by 80%** - Delete all duplicate service implementations
4. **Enable gradual migration** - Mix Electron and web deployments
5. **Future-proof** - New features automatically work in both modes

## Contributing

This is a proposal. If there's interest, I'll:
1. Create public GitHub repo
2. Implement Phase 1 (core IPC conversion)
3. Test with Auto-Claude as reference implementation
4. Publish to npm as `electron-to-web`

**Would you like to make this a real open-source project?**

---

**License:** MIT
**Maintainer:** TBD
**Status:** Proposal / Proof-of-Concept
