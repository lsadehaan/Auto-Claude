/**
 * Terminal Service
 * Manages PTY processes for web-based terminal access
 */

import * as pty from '@lydell/node-pty';
import * as os from 'os';
import { EventEmitter } from 'events';

export interface TerminalSession {
  id: string;
  pty: pty.IPty;
  cwd: string;
  title: string;
  cols: number;
  rows: number;
  outputBuffer: string;
  isClaudeMode: boolean;
  claudeSessionId?: string;
  createdAt: Date;
  projectPath?: string;
}

export interface TerminalCreateOptions {
  id: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  projectPath?: string;
  env?: Record<string, string>;
}

export interface TerminalEvents {
  output: (terminalId: string, data: string) => void;
  exit: (terminalId: string, exitCode: number) => void;
  titleChange: (terminalId: string, title: string) => void;
  error: (terminalId: string, error: string) => void;
}

/**
 * Terminal Service - manages all PTY processes
 */
export class TerminalService extends EventEmitter {
  private terminals = new Map<string, TerminalSession>();
  private maxBufferSize = 100000; // 100KB per terminal

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Create a new terminal session
   */
  create(options: TerminalCreateOptions): { success: boolean; error?: string } {
    const { id, cwd, cols = 80, rows = 24, projectPath, env } = options;

    // Check if terminal already exists
    if (this.terminals.has(id)) {
      return { success: false, error: 'Terminal already exists' };
    }

    try {
      // Determine shell based on platform
      const shell = process.platform === 'win32'
        ? process.env.COMSPEC || 'cmd.exe'
        : process.env.SHELL || '/bin/bash';

      const shellArgs = process.platform === 'win32' ? [] : ['-l'];

      // Spawn PTY process
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: cwd || projectPath || os.homedir(),
        env: {
          ...process.env,
          ...env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

      const session: TerminalSession = {
        id,
        pty: ptyProcess,
        cwd: cwd || projectPath || os.homedir(),
        title: 'Terminal',
        cols,
        rows,
        outputBuffer: '',
        isClaudeMode: false,
        createdAt: new Date(),
        projectPath,
      };

      this.terminals.set(id, session);

      // Handle PTY output
      ptyProcess.onData((data) => {
        // Append to buffer (limit size)
        session.outputBuffer = (session.outputBuffer + data).slice(-this.maxBufferSize);

        // Emit output event
        this.emit('output', id, data);

        // Check for Claude session ID in output
        this.detectClaudeSession(session, data);

        // Check for title changes (terminal escape sequences)
        this.detectTitleChange(session, data);
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode }) => {
        console.log(`[Terminal] ${id} exited with code ${exitCode}`);
        this.emit('exit', id, exitCode);
        this.terminals.delete(id);
      });

      console.log(`[Terminal] Created ${id} with shell ${shell}`);
      return { success: true };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create terminal';
      console.error(`[Terminal] Failed to create ${id}:`, error);
      return { success: false, error: message };
    }
  }

  /**
   * Write data to a terminal
   */
  write(id: string, data: string): boolean {
    const session = this.terminals.get(id);
    if (!session) {
      return false;
    }

    try {
      session.pty.write(data);
      return true;
    } catch (error) {
      console.error(`[Terminal] Write error for ${id}:`, error);
      return false;
    }
  }

  /**
   * Resize a terminal
   */
  resize(id: string, cols: number, rows: number): boolean {
    const session = this.terminals.get(id);
    if (!session) {
      return false;
    }

    try {
      session.pty.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
      return true;
    } catch (error) {
      console.error(`[Terminal] Resize error for ${id}:`, error);
      return false;
    }
  }

  /**
   * Destroy a terminal
   */
  destroy(id: string): boolean {
    const session = this.terminals.get(id);
    if (!session) {
      return false;
    }

    try {
      session.pty.kill();
      this.terminals.delete(id);
      console.log(`[Terminal] Destroyed ${id}`);
      return true;
    } catch (error) {
      console.error(`[Terminal] Destroy error for ${id}:`, error);
      // Force remove from map even if kill fails
      this.terminals.delete(id);
      return true;
    }
  }

  /**
   * Destroy all terminals
   */
  destroyAll(): void {
    for (const id of this.terminals.keys()) {
      this.destroy(id);
    }
  }

  /**
   * Get terminal info
   */
  getInfo(id: string): Omit<TerminalSession, 'pty'> | null {
    const session = this.terminals.get(id);
    if (!session) {
      return null;
    }

    // Return session info without the PTY object
    const { pty: _, ...info } = session;
    return info;
  }

  /**
   * Get all terminal IDs
   */
  getActiveIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /**
   * Get terminal count
   */
  getCount(): number {
    return this.terminals.size;
  }

  /**
   * Check if terminal exists
   */
  exists(id: string): boolean {
    return this.terminals.has(id);
  }

  /**
   * Get output buffer for a terminal
   */
  getOutputBuffer(id: string): string | null {
    const session = this.terminals.get(id);
    return session?.outputBuffer ?? null;
  }

  /**
   * Invoke Claude in a terminal
   */
  invokeClaude(id: string, cwd?: string): boolean {
    const session = this.terminals.get(id);
    if (!session) {
      return false;
    }

    session.isClaudeMode = true;

    // Build claude command
    let command = 'claude';
    if (cwd) {
      command = `cd "${cwd}" && claude`;
    }

    // Send command to terminal
    session.pty.write(command + '\r');

    return true;
  }

  /**
   * Detect Claude session ID in output
   */
  private detectClaudeSession(session: TerminalSession, data: string): void {
    // Look for session ID pattern in Claude output
    const sessionMatch = data.match(/Session ID: ([a-f0-9-]+)/i);
    if (sessionMatch) {
      session.claudeSessionId = sessionMatch[1];
      console.log(`[Terminal] Detected Claude session: ${session.claudeSessionId}`);
    }
  }

  /**
   * Detect terminal title changes from escape sequences
   */
  private detectTitleChange(session: TerminalSession, data: string): void {
    // OSC 0 or OSC 2 title sequences: \x1b]0;title\x07 or \x1b]2;title\x07
    const titleMatch = data.match(/\x1b\][02];([^\x07]+)\x07/);
    if (titleMatch) {
      const newTitle = titleMatch[1];
      if (newTitle !== session.title) {
        session.title = newTitle;
        this.emit('titleChange', session.id, newTitle);
      }
    }
  }
}

// Singleton instance
export const terminalService = new TerminalService();
