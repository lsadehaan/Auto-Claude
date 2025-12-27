/**
 * WebSocket Client for Web API
 * Manages connections to the web server for real-time events and terminal I/O
 */

type EventCallback = (...args: unknown[]) => void;

interface PendingTerminal {
  resolve: (ws: WebSocket) => void;
  reject: (error: Error) => void;
}

/**
 * WebSocket client for event subscriptions and terminal connections
 */
export class WebSocketClient {
  private eventsWs: WebSocket | null = null;
  private terminalSockets = new Map<string, WebSocket>();
  private pendingTerminals = new Map<string, PendingTerminal>();
  private listeners = new Map<string, Set<EventCallback>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;

  constructor(private baseUrl: string) {
    this.connect();
  }

  /**
   * Connect to the events WebSocket
   */
  private connect(): void {
    if (this.isConnecting || (this.eventsWs && this.eventsWs.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;

    try {
      this.eventsWs = new WebSocket(`${this.baseUrl}/ws/events`);

      this.eventsWs.onopen = () => {
        console.log('[WebSocketClient] Connected to events');
        this.isConnecting = false;

        // Resubscribe to all channels
        for (const channel of this.listeners.keys()) {
          this.eventsWs?.send(JSON.stringify({ type: 'subscribe', channel }));
        }
      };

      this.eventsWs.onmessage = (event) => {
        try {
          const { channel, data } = JSON.parse(event.data);
          this.emit(channel, data);
        } catch (e) {
          console.error('[WebSocketClient] Parse error:', e);
        }
      };

      this.eventsWs.onclose = () => {
        console.log('[WebSocketClient] Disconnected from events');
        this.isConnecting = false;
        this.eventsWs = null;

        // Reconnect after delay
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      this.eventsWs.onerror = (error) => {
        console.error('[WebSocketClient] Events error:', error);
        this.isConnecting = false;
      };

    } catch (error) {
      console.error('[WebSocketClient] Connection error:', error);
      this.isConnecting = false;

      // Retry connection
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
  }

  /**
   * Subscribe to an event channel
   */
  subscribe(channel: string, callback: EventCallback): () => void {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());

      // Tell server we want this channel
      if (this.eventsWs?.readyState === WebSocket.OPEN) {
        this.eventsWs.send(JSON.stringify({ type: 'subscribe', channel }));
      }
    }

    this.listeners.get(channel)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(channel);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(channel);
          if (this.eventsWs?.readyState === WebSocket.OPEN) {
            this.eventsWs.send(JSON.stringify({ type: 'unsubscribe', channel }));
          }
        }
      }
    };
  }

  /**
   * Set project context for project-specific events
   */
  setProject(projectId: string): void {
    if (this.eventsWs?.readyState === WebSocket.OPEN) {
      this.eventsWs.send(JSON.stringify({ type: 'setProject', projectId }));
    }
  }

  /**
   * Emit an event to local listeners
   */
  private emit(channel: string, data: unknown): void {
    const callbacks = this.listeners.get(channel);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          if (Array.isArray(data)) {
            callback(...data);
          } else {
            callback(data);
          }
        } catch (e) {
          console.error(`[WebSocketClient] Callback error for ${channel}:`, e);
        }
      }
    }
  }

  // =========================================================================
  // Terminal WebSocket Methods
  // =========================================================================

  /**
   * Connect to a terminal's WebSocket
   */
  connectTerminal(terminalId: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      // Check if already connected
      const existing = this.terminalSockets.get(terminalId);
      if (existing && existing.readyState === WebSocket.OPEN) {
        resolve(existing);
        return;
      }

      // Store pending connection
      this.pendingTerminals.set(terminalId, { resolve, reject });

      try {
        const ws = new WebSocket(`${this.baseUrl}/ws/terminal/${terminalId}`);

        ws.onopen = () => {
          console.log(`[WebSocketClient] Terminal ${terminalId} connected`);
          this.terminalSockets.set(terminalId, ws);

          const pending = this.pendingTerminals.get(terminalId);
          if (pending) {
            pending.resolve(ws);
            this.pendingTerminals.delete(terminalId);
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);

            switch (message.type) {
              case 'output':
                this.emit('terminal:output', [terminalId, message.data]);
                break;
              case 'exit':
                this.emit('terminal:exit', [terminalId, message.exitCode]);
                break;
              case 'titleChange':
                this.emit('terminal:titleChange', [terminalId, message.title]);
                break;
              case 'connected':
                // Send buffered output if any
                if (message.buffer) {
                  this.emit('terminal:output', [terminalId, message.buffer]);
                }
                break;
              case 'error':
                console.error(`[WebSocketClient] Terminal ${terminalId} error:`, message.message);
                break;
            }
          } catch (e) {
            console.error('[WebSocketClient] Terminal message parse error:', e);
          }
        };

        ws.onclose = () => {
          console.log(`[WebSocketClient] Terminal ${terminalId} disconnected`);
          this.terminalSockets.delete(terminalId);
          this.emit('terminal:exit', [terminalId, -1]);
        };

        ws.onerror = (error) => {
          console.error(`[WebSocketClient] Terminal ${terminalId} error:`, error);

          const pending = this.pendingTerminals.get(terminalId);
          if (pending) {
            pending.reject(new Error('WebSocket connection failed'));
            this.pendingTerminals.delete(terminalId);
          }
        };

      } catch (error) {
        const pending = this.pendingTerminals.get(terminalId);
        if (pending) {
          pending.reject(error as Error);
          this.pendingTerminals.delete(terminalId);
        }
      }
    });
  }

  /**
   * Send input to a terminal
   */
  sendTerminalInput(terminalId: string, data: string): void {
    const ws = this.terminalSockets.get(terminalId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  /**
   * Resize a terminal
   */
  resizeTerminal(terminalId: string, cols: number, rows: number): void {
    const ws = this.terminalSockets.get(terminalId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  /**
   * Disconnect from a terminal
   */
  disconnectTerminal(terminalId: string): void {
    const ws = this.terminalSockets.get(terminalId);
    if (ws) {
      ws.close();
      this.terminalSockets.delete(terminalId);
    }
  }

  /**
   * Disconnect all terminals
   */
  disconnectAllTerminals(): void {
    for (const [terminalId, ws] of this.terminalSockets) {
      ws.close();
      this.terminalSockets.delete(terminalId);
    }
  }

  /**
   * Check if connected to events WebSocket
   */
  isConnected(): boolean {
    return this.eventsWs?.readyState === WebSocket.OPEN;
  }

  /**
   * Close all connections
   */
  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventsWs) {
      this.eventsWs.close();
      this.eventsWs = null;
    }

    this.disconnectAllTerminals();
    this.listeners.clear();
  }
}
