/**
 * WebSocket Setup
 * Configures all WebSocket handlers
 */

import type { WebSocketServer } from 'ws';
import { eventBridge } from '../adapters/event-bridge.js';
import { terminalWebSocket } from './terminal.ws.js';
import { registerShellEventHandler } from '../electron-shim/electron.js';

/**
 * Set up all WebSocket handlers
 */
export function setupWebSocket(wss: WebSocketServer): void {
  // Event bridge for general events (task progress, etc.)
  eventBridge.setupWebSocket(wss, '/ws/events');

  // Terminal WebSocket for PTY I/O
  terminalWebSocket.setupWebSocket(wss);

  // Register shell event handler to broadcast to frontend
  // When Electron code calls shell.openExternal(url), the frontend receives
  // a 'shell:openExternal' event and can call window.open(url)
  registerShellEventHandler((event, payload) => {
    if (event === 'openExternal' && payload.url) {
      eventBridge.broadcast('shell:openExternal', { url: payload.url });
    } else if (event === 'openPath' && payload.path) {
      eventBridge.broadcast('shell:openPath', { path: payload.path });
    }
  });

  console.log('[WebSocket] All handlers configured');
}

export { eventBridge } from '../adapters/event-bridge.js';
export { terminalWebSocket } from './terminal.ws.js';
