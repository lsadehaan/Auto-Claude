# electron-to-web: JSON-RPC Design

**Version:** 2.0 (JSON-RPC based)
**Transport:** WebSocket only (no HTTP)
**Protocol:** JSON-RPC 2.0 (RFC 4627)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser (React App)                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  import { ipcRenderer } from 'electron-to-web/renderer'│ │
│  │                                                         │ │
│  │  await ipcRenderer.invoke('task:create', data)         │ │
│  │  ipcRenderer.on('task:progress', handler)              │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│                            ▼                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         JSON-RPC Client (WebSocket)                    │ │
│  │  - Send requests with ID (invoke)                      │ │
│  │  - Listen for notifications (on)                       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                    WebSocket (JSON-RPC 2.0)
                            │
┌─────────────────────────────────────────────────────────────┐
│                  Node.js Server (Express + WS)               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         JSON-RPC Server (WebSocket)                    │ │
│  │  - Receive requests, dispatch to handlers              │ │
│  │  - Send notifications to clients                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│                            ▼                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  import { ipcMain } from 'electron-to-web/main'        │ │
│  │  import { BrowserWindow } from 'electron-to-web/main'  │ │
│  │                                                         │ │
│  │  ipcMain.handle('task:create', handler)                │ │
│  │  mainWindow.webContents.send('task:progress', data)    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Implementation

### 1. JSON-RPC Server (Main Process)

```typescript
// electron-to-web/main/ipc-main.ts
import { Server as JSONRPCServer } from 'json-rpc-2.0';
import type { WebSocket } from 'ws';

export class IPCMain {
  private server = new JSONRPCServer();
  private clients = new Map<string, WebSocket>();

  /**
   * Register IPC handler (Electron-compatible API)
   */
  handle(channel: string, handler: (event: any, ...args: any[]) => any) {
    this.server.addMethod(channel, async (params: any[]) => {
      // Create mock Electron event
      const mockEvent = {
        sender: { id: 'renderer' },
        returnValue: undefined
      };

      // Call handler with Electron-style signature
      return await handler(mockEvent, ...params);
    });

    console.log(`[IPC] Registered method: ${channel}`);
  }

  /**
   * Remove IPC handler (Electron-compatible API)
   */
  removeHandler(channel: string) {
    this.server.removeMethod(channel);
  }

  /**
   * Handle incoming WebSocket message
   */
  async handleMessage(ws: WebSocket, message: string) {
    try {
      const response = await this.server.receive(JSON.parse(message));

      if (response) {
        ws.send(JSON.stringify(response));
      }
    } catch (error) {
      console.error('[IPC] Error handling message:', error);
    }
  }

  /**
   * Register WebSocket client
   */
  addClient(clientId: string, ws: WebSocket) {
    this.clients.set(clientId, ws);
  }

  /**
   * Remove WebSocket client
   */
  removeClient(clientId: string) {
    this.clients.delete(clientId);
  }

  /**
   * Get client for sending notifications
   */
  getClient(clientId: string): WebSocket | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Broadcast notification to all clients
   */
  broadcast(channel: string, ...args: any[]) {
    const notification = {
      jsonrpc: '2.0',
      method: channel,
      params: args
    };

    const message = JSON.stringify(notification);

    for (const ws of this.clients.values()) {
      if (ws.readyState === 1) { // OPEN
        ws.send(message);
      }
    }
  }
}

export const ipcMain = new IPCMain();
```

### 2. BrowserWindow Shim (Main Process)

```typescript
// electron-to-web/main/browser-window.ts
import { ipcMain } from './ipc-main.js';

export class BrowserWindow {
  private clientId: string;

  constructor(options?: any) {
    // In web mode, there's typically one "main window"
    this.clientId = 'main';
  }

  webContents = {
    /**
     * Send notification to renderer (Electron-compatible API)
     * Uses JSON-RPC notification (no response expected)
     */
    send: (channel: string, ...args: any[]) => {
      ipcMain.broadcast(channel, ...args);
    },

    /**
     * Send to specific window/client
     */
    sendTo: (webContentsId: string, channel: string, ...args: any[]) => {
      const client = ipcMain.getClient(webContentsId);

      if (!client) {
        console.warn(`[BrowserWindow] Client ${webContentsId} not found`);
        return;
      }

      const notification = {
        jsonrpc: '2.0',
        method: channel,
        params: args
      };

      client.send(JSON.stringify(notification));
    }
  };

  loadURL() {}
  loadFile() {}
  close() {}
  isDestroyed() { return false; }
}
```

### 3. JSON-RPC Client (Renderer Process)

```typescript
// electron-to-web/renderer/ipc-renderer.ts
import { Client as JSONRPCClient } from 'json-rpc-2.0';

export class IPCRenderer {
  private client: JSONRPCClient;
  private ws?: WebSocket;
  private listeners = new Map<string, Set<Function>>();
  private messageQueue: any[] = [];
  private connected = false;
  private requestId = 0;

  constructor() {
    // Create JSON-RPC client
    this.client = new JSONRPCClient((request) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        // Queue requests until connected
        this.messageQueue.push(request);
        return Promise.reject(new Error('WebSocket not connected'));
      }

      return new Promise((resolve, reject) => {
        // Send request over WebSocket
        this.ws!.send(JSON.stringify(request));

        // For notifications (no ID), resolve immediately
        if (!request.id) {
          resolve(undefined);
        }
        // For requests, response will come via onmessage
      });
    });

    this.connect();
  }

  /**
   * Connect to WebSocket server
   */
  private connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ipc`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[IPC] WebSocket connected');
      this.connected = true;

      // Send queued messages
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        this.ws!.send(JSON.stringify(message));
      }
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      // Check if it's a notification (no ID)
      if (!message.id && message.method) {
        this.handleNotification(message.method, message.params || []);
        return;
      }

      // Otherwise, let JSON-RPC client handle response
      this.client.receive(message);
    };

    this.ws.onclose = () => {
      console.log('[IPC] WebSocket disconnected, reconnecting...');
      this.connected = false;

      // Reconnect after delay
      setTimeout(() => this.connect(), 1000);
    };

    this.ws.onerror = (error) => {
      console.error('[IPC] WebSocket error:', error);
    };
  }

  /**
   * Handle incoming notification from server
   */
  private handleNotification(channel: string, params: any[]) {
    const listeners = this.listeners.get(channel);

    if (!listeners) return;

    // Create mock event object
    const mockEvent = {
      sender: { id: 'main' },
      returnValue: undefined
    };

    // Call all listeners
    for (const listener of listeners) {
      listener(mockEvent, ...params);
    }
  }

  /**
   * Invoke IPC handler (Electron-compatible API)
   * Sends JSON-RPC request with ID
   */
  async invoke<T = any>(channel: string, ...args: any[]): Promise<T> {
    try {
      return await this.client.request(channel, args);
    } catch (error) {
      console.error(`[IPC] Failed to invoke ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Send one-way message (Electron-compatible API)
   * Sends JSON-RPC notification (no ID)
   */
  send(channel: string, ...args: any[]) {
    const notification = {
      jsonrpc: '2.0',
      method: channel,
      params: args
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(notification));
    } else {
      this.messageQueue.push(notification);
    }
  }

  /**
   * Listen for IPC events (Electron-compatible API)
   * Listens for JSON-RPC notifications
   */
  on(channel: string, listener: (event: any, ...args: any[]) => void) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
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
    }
  }

  /**
   * Remove all listeners for channel (Electron-compatible API)
   */
  removeAllListeners(channel?: string) {
    if (channel) {
      this.listeners.delete(channel);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

export const ipcRenderer = new IPCRenderer();
```

### 4. Web Server Factory

```typescript
// electron-to-web/server/create-server.ts
import express from 'express';
import { WebSocketServer } from 'ws';
import { ipcMain } from '../main/ipc-main.js';
import type { ServerOptions } from './types.js';

export function createWebServer(options: ServerOptions = {}) {
  const app = express();
  const port = options.port || 3001;

  // Serve static files (frontend build)
  if (options.staticDir) {
    app.use(express.static(options.staticDir));
  }

  // Start HTTP server
  const server = app.listen(port, () => {
    console.log(`[electron-to-web] Server listening on port ${port}`);
  });

  // Create WebSocket server for JSON-RPC
  const wss = new WebSocketServer({
    server,
    path: '/ipc' // WebSocket endpoint: ws://host/ipc
  });

  wss.on('connection', (ws, req) => {
    // Generate client ID (use session ID if available)
    const clientId = req.headers['sec-websocket-key'] || Math.random().toString(36);

    console.log(`[IPC] Client connected: ${clientId}`);
    ipcMain.addClient(clientId, ws);

    ws.on('message', async (data) => {
      await ipcMain.handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      console.log(`[IPC] Client disconnected: ${clientId}`);
      ipcMain.removeClient(clientId);
    });

    ws.on('error', (error) => {
      console.error(`[IPC] WebSocket error for client ${clientId}:`, error);
    });
  });

  return { app, server, wss };
}
```

## Usage Example

### Server (Electron Main → Web Server)

```typescript
// server.ts
import { ipcMain, BrowserWindow } from 'electron-to-web/main';
import { createWebServer } from 'electron-to-web/server';

// Create "window" instance
const mainWindow = new BrowserWindow();

// Register IPC handlers (IDENTICAL to Electron code!)
ipcMain.handle('task:create', async (event, taskData) => {
  const task = await createTask(taskData);

  // Send progress notification
  mainWindow.webContents.send('task:progress', task.id, {
    phase: 'planning',
    progress: 0.1
  });

  return { success: true, task };
});

ipcMain.handle('task:list', async (event, projectId) => {
  const tasks = await listTasks(projectId);
  return { success: true, tasks };
});

// Start web server
createWebServer({
  port: 3001,
  staticDir: './dist-web'
});
```

### Client (Electron Renderer → Browser)

```typescript
// App.tsx
import { ipcRenderer } from 'electron-to-web/renderer';
import { useEffect, useState } from 'react';

function App() {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    // Listen for progress updates
    ipcRenderer.on('task:progress', (event, taskId, progress) => {
      console.log(`Task ${taskId}:`, progress);
    });

    // Load initial tasks
    loadTasks();

    return () => {
      ipcRenderer.removeAllListeners('task:progress');
    };
  }, []);

  async function loadTasks() {
    const result = await ipcRenderer.invoke('task:list', 'project-123');
    if (result.success) {
      setTasks(result.tasks);
    }
  }

  async function createTask() {
    const result = await ipcRenderer.invoke('task:create', {
      title: 'New Task',
      description: 'Test'
    });

    if (result.success) {
      loadTasks(); // Refresh list
    }
  }

  return (
    <div>
      <button onClick={createTask}>Create Task</button>
      <ul>
        {tasks.map(task => (
          <li key={task.id}>{task.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Advantages Over HTTP + WebSocket

### 1. Single Connection
- ❌ **Before:** HTTP for invoke + WebSocket for events = 2 connections
- ✅ **After:** WebSocket only = 1 connection

### 2. Reconnection Logic
- ❌ **Before:** Need to sync HTTP session + WebSocket state
- ✅ **After:** Single WebSocket reconnection handles everything

### 3. Request Batching
```json
// Send multiple requests in one message
[
  {"jsonrpc": "2.0", "id": 1, "method": "task:get", "params": ["task-1"]},
  {"jsonrpc": "2.0", "id": 2, "method": "task:get", "params": ["task-2"]},
  {"jsonrpc": "2.0", "id": 3, "method": "task:get", "params": ["task-3"]}
]
```

### 4. Type Safety
```typescript
// Auto-generate TypeScript types from methods
type IPCMethods = {
  'task:create': (data: TaskData) => Promise<{ success: boolean; task: Task }>;
  'task:list': (projectId: string) => Promise<{ success: boolean; tasks: Task[] }>;
  'task:delete': (taskId: string) => Promise<{ success: boolean }>;
};
```

### 5. Standard Error Codes
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,  // Invalid params
    "message": "Task not found",
    "data": { "taskId": "invalid-123" }
  }
}
```

### 6. Existing Tooling
- **json-rpc-2.0** - Lightweight, TypeScript-first
- **jayson** - Battle-tested, used by Bitcoin Core
- **VSCode JSON-RPC** - Used by Language Server Protocol
- Chrome DevTools can inspect/debug JSON-RPC messages

## Library Comparison

| Feature | HTTP + WS (current) | JSON-RPC + WS |
|---------|---------------------|---------------|
| Transport | 2 (HTTP + WS) | 1 (WS only) |
| Protocol | Custom | Standard (RFC) |
| Batching | No | Yes |
| Error codes | Custom | Standard |
| Tooling | None | VSCode, jayson, etc. |
| TypeScript | Manual | Auto-generate |
| Size | ~5KB | ~3KB (json-rpc-2.0) |

## Implementation Libraries

### Recommended: `json-rpc-2.0`
```bash
npm install json-rpc-2.0
```

**Pros:**
- TypeScript-first
- Tiny (3KB gzipped)
- No dependencies
- Simple API
- Works in browser + Node.js

**Example:**
```typescript
import { Client, Server } from 'json-rpc-2.0';

const server = new Server();
server.addMethod('add', ([a, b]) => a + b);

const client = new Client((request) => {
  // Send via WebSocket
  ws.send(JSON.stringify(request));
});

const result = await client.request('add', [2, 3]); // 5
```

### Alternative: `jayson`
```bash
npm install jayson
```

**Pros:**
- Battle-tested (used by Bitcoin Core)
- Full JSON-RPC 1.0 + 2.0 support
- Multiple transports (HTTP, TCP, WebSocket)

**Cons:**
- Larger bundle size
- More complex API

## Migration Path for Auto-Claude

### Phase 1: Replace Current Web Implementation (1 day)
1. Install `json-rpc-2.0`
2. Replace `web-server/src/routes/*` with JSON-RPC server
3. Replace `renderer/client-api/web-api.ts` with JSON-RPC client
4. Test basic invoke + events

### Phase 2: Create Wrapper Services (1 day)
1. Wrap `AgentManager` from Electron
2. Wrap `ProjectStore` from Electron
3. Wrap `TerminalManager` from Electron
4. Delete duplicate implementations

### Phase 3: Extract to Library (2-3 days)
1. Extract JSON-RPC adapters to `electron-to-web`
2. Add TypeScript definitions
3. Create examples and docs
4. Publish to npm

### Phase 4: Test & Refine (ongoing)
1. Test all 153 IPC handlers
2. Fix edge cases
3. Optimize performance
4. Community feedback

## Benefits for Auto-Claude

1. **Delete 80% of web-server code** - No more route handlers!
2. **All 153 IPC handlers work** - No stubs, no reimplementation
3. **Single source of truth** - Electron code = Web code
4. **Easy upstream merges** - No conflicts in web-specific code
5. **Standard protocol** - Easier debugging with Chrome DevTools

## Open Questions

1. **Authentication** - Where to add auth layer?
   - Option A: WebSocket connection handshake
   - Option B: Per-method auth check

2. **File uploads** - JSON-RPC doesn't handle binary well
   - Option A: Base64 encode in JSON
   - Option B: Separate HTTP endpoint for files

3. **Streaming responses** - How to handle long-running tasks?
   - Option A: Multiple notifications (current approach)
   - Option B: Streaming JSON-RPC extension

## Conclusion

**JSON-RPC is the right choice** because:
- ✅ Standard protocol (not custom)
- ✅ Single transport (WebSocket only)
- ✅ Perfect IPC mapping (invoke = request, send = notification)
- ✅ Existing tooling (VSCode uses it!)
- ✅ Smaller, cleaner implementation

**Recommendation:** Build `electron-to-web` with JSON-RPC from day one. Don't migrate from HTTP+WS to JSON-RPC later - start with the better architecture.

---

**Next Step:** Prototype JSON-RPC adapter and test with Auto-Claude's existing IPC handlers?
