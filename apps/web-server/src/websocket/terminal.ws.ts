/**
 * Terminal WebSocket Handler
 * Manages WebSocket connections for terminal I/O streaming
 */

import type { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { terminalService } from '../services/terminal-service.js';

interface TerminalClient {
  ws: WebSocket;
  terminalId: string;
}

/**
 * Terminal WebSocket Manager
 * Handles bidirectional communication between browser xterm.js and server PTY
 */
export class TerminalWebSocketManager {
  private clients = new Map<string, TerminalClient>();
  private terminalToClients = new Map<string, Set<string>>();
  private clientIdCounter = 0;

  constructor() {
    // Listen for terminal events from the service
    terminalService.on('output', (terminalId: string, data: string) => {
      this.broadcastToTerminal(terminalId, { type: 'output', data });
    });

    terminalService.on('exit', (terminalId: string, exitCode: number) => {
      this.broadcastToTerminal(terminalId, { type: 'exit', exitCode });
      // Close all WebSocket connections for this terminal
      this.closeTerminalConnections(terminalId);
    });

    terminalService.on('titleChange', (terminalId: string, title: string) => {
      this.broadcastToTerminal(terminalId, { type: 'titleChange', title });
    });
  }

  /**
   * Set up WebSocket handling for terminal connections
   * Terminal WebSocket path: /ws/terminal/:terminalId
   */
  setupWebSocket(wss: WebSocketServer): void {
    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const url = req.url || '';

      // Only handle terminal paths
      if (!url.startsWith('/ws/terminal/')) {
        return;
      }

      // Extract terminal ID from URL
      const terminalId = url.replace('/ws/terminal/', '').split('?')[0];

      if (!terminalId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Terminal ID required' }));
        ws.close();
        return;
      }

      this.handleConnection(ws, terminalId);
    });
  }

  /**
   * Handle a new WebSocket connection for a terminal
   */
  private handleConnection(ws: WebSocket, terminalId: string): void {
    const clientId = `terminal-client-${++this.clientIdCounter}`;

    console.log(`[TerminalWS] Client ${clientId} connected to terminal ${terminalId}`);

    // Store client
    this.clients.set(clientId, { ws, terminalId });

    // Track which clients are connected to which terminal
    if (!this.terminalToClients.has(terminalId)) {
      this.terminalToClients.set(terminalId, new Set());
    }
    this.terminalToClients.get(terminalId)!.add(clientId);

    // Check if terminal exists
    if (!terminalService.exists(terminalId)) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Terminal not found. Create it first via REST API.'
      }));
      ws.close();
      return;
    }

    // Send initial connection success and any buffered output
    const buffer = terminalService.getOutputBuffer(terminalId);
    ws.send(JSON.stringify({
      type: 'connected',
      terminalId,
      buffer: buffer || '',
    }));

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(terminalId, message);
      } catch (e) {
        console.error('[TerminalWS] Invalid message:', e);
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log(`[TerminalWS] Client ${clientId} disconnected`);
      this.clients.delete(clientId);

      const terminalClients = this.terminalToClients.get(terminalId);
      if (terminalClients) {
        terminalClients.delete(clientId);
        if (terminalClients.size === 0) {
          this.terminalToClients.delete(terminalId);
        }
      }
    });

    ws.on('error', (error) => {
      console.error(`[TerminalWS] Client ${clientId} error:`, error);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(terminalId: string, message: {
    type: string;
    data?: string;
    cols?: number;
    rows?: number;
  }): void {
    switch (message.type) {
      case 'input':
        // Send input to terminal
        if (message.data) {
          terminalService.write(terminalId, message.data);
        }
        break;

      case 'resize':
        // Resize terminal
        if (message.cols && message.rows) {
          terminalService.resize(terminalId, message.cols, message.rows);
        }
        break;

      case 'ping':
        // Respond with pong (keep-alive)
        this.broadcastToTerminal(terminalId, { type: 'pong', timestamp: Date.now() });
        break;

      default:
        console.warn(`[TerminalWS] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Broadcast a message to all clients connected to a terminal
   */
  private broadcastToTerminal(terminalId: string, message: object): void {
    const clientIds = this.terminalToClients.get(terminalId);
    if (!clientIds) return;

    const data = JSON.stringify(message);

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === 1) { // WebSocket.OPEN
        client.ws.send(data);
      }
    }
  }

  /**
   * Close all WebSocket connections for a terminal
   */
  private closeTerminalConnections(terminalId: string): void {
    const clientIds = this.terminalToClients.get(terminalId);
    if (!clientIds) return;

    for (const clientId of clientIds) {
      const client = this.clients.get(clientId);
      if (client) {
        client.ws.close();
        this.clients.delete(clientId);
      }
    }

    this.terminalToClients.delete(terminalId);
  }

  /**
   * Get connection statistics
   */
  getStats(): { totalClients: number; terminalsWithClients: number } {
    return {
      totalClients: this.clients.size,
      terminalsWithClients: this.terminalToClients.size,
    };
  }
}

// Singleton instance
export const terminalWebSocket = new TerminalWebSocketManager();
