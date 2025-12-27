import { EventEmitter } from 'events';
import type { WebSocket, WebSocketServer } from 'ws';

/**
 * Client connection with subscription info
 */
interface EventClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  projectId?: string;
}

/**
 * Event bridge that connects EventEmitter-based services to WebSocket clients.
 *
 * Services emit events using standard EventEmitter:
 *   eventBridge.emit('task:progress', taskId, data)
 *
 * Clients subscribe via WebSocket:
 *   { type: 'subscribe', channel: 'task:progress', projectId: 'xxx' }
 */
export class EventBridge extends EventEmitter {
  private clients = new Map<string, EventClient>();
  private clientIdCounter = 0;

  constructor() {
    super();
    // Increase max listeners since many services may emit events
    this.setMaxListeners(100);
  }

  /**
   * Initialize WebSocket handling for an existing WebSocketServer
   */
  setupWebSocket(wss: WebSocketServer, path = '/ws/events'): void {
    wss.on('connection', (ws, req) => {
      // Only handle connections to the events path
      if (req.url !== path && !req.url?.startsWith(path + '?')) {
        return;
      }

      const clientId = `client-${++this.clientIdCounter}`;
      const client: EventClient = {
        id: clientId,
        ws,
        subscriptions: new Set(),
      };

      this.clients.set(clientId, client);
      console.log(`[EventBridge] Client connected: ${clientId}`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClientMessage(clientId, message);
        } catch (e) {
          console.error('[EventBridge] Invalid message:', e);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[EventBridge] Client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        console.error(`[EventBridge] Client ${clientId} error:`, error);
        this.clients.delete(clientId);
      });

      // Send welcome message
      this.sendTo(clientId, 'connected', { clientId });
    });
  }

  /**
   * Handle incoming client messages
   */
  private handleClientMessage(clientId: string, message: {
    type: string;
    channel?: string;
    channels?: string[];
    projectId?: string;
  }): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        if (message.channel) {
          client.subscriptions.add(message.channel);
        }
        if (message.channels) {
          message.channels.forEach(ch => client.subscriptions.add(ch));
        }
        if (message.projectId) {
          client.projectId = message.projectId;
        }
        console.log(`[EventBridge] ${clientId} subscribed to:`, message.channel || message.channels);
        break;

      case 'unsubscribe':
        if (message.channel) {
          client.subscriptions.delete(message.channel);
        }
        if (message.channels) {
          message.channels.forEach(ch => client.subscriptions.delete(ch));
        }
        break;

      case 'setProject':
        client.projectId = message.projectId;
        break;

      case 'ping':
        this.sendTo(clientId, 'pong', { timestamp: Date.now() });
        break;
    }
  }

  /**
   * Send a message to a specific client
   */
  private sendTo(clientId: string, channel: string, data: unknown): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === 1) { // WebSocket.OPEN
      client.ws.send(JSON.stringify({ channel, data, timestamp: Date.now() }));
    }
  }

  /**
   * Broadcast an event to all subscribed clients
   */
  broadcast(channel: string, ...args: unknown[]): void {
    const message = JSON.stringify({
      channel,
      data: args.length === 1 ? args[0] : args,
      timestamp: Date.now(),
    });

    for (const client of this.clients.values()) {
      if (client.subscriptions.has(channel) && client.ws.readyState === 1) {
        client.ws.send(message);
      }
    }
  }

  /**
   * Broadcast an event only to clients subscribed to a specific project
   */
  broadcastToProject(projectId: string, channel: string, ...args: unknown[]): void {
    const message = JSON.stringify({
      channel,
      data: args.length === 1 ? args[0] : args,
      timestamp: Date.now(),
    });

    for (const client of this.clients.values()) {
      if (
        client.projectId === projectId &&
        client.subscriptions.has(channel) &&
        client.ws.readyState === 1
      ) {
        client.ws.send(message);
      }
    }
  }

  /**
   * Get the number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get subscription stats
   */
  getStats(): { clients: number; subscriptions: Record<string, number> } {
    const subscriptions: Record<string, number> = {};

    for (const client of this.clients.values()) {
      for (const channel of client.subscriptions) {
        subscriptions[channel] = (subscriptions[channel] || 0) + 1;
      }
    }

    return {
      clients: this.clients.size,
      subscriptions,
    };
  }
}

// Singleton instance
export const eventBridge = new EventBridge();
