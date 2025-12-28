/**
 * Electron Module Shim
 *
 * Provides implementations of Electron APIs used by handler code.
 * This allows Electron handler code to be imported in the web server
 * without throwing errors on Electron-specific imports.
 */

import os from 'os';
import { config } from '../config.js';

/**
 * Shell event handler type
 * The web server registers a handler that broadcasts shell events to connected clients
 */
type ShellEventHandler = (
  event: 'openExternal' | 'openPath',
  payload: { url?: string; path?: string }
) => void;

let shellEventHandler: ShellEventHandler | null = null;

/**
 * Register a handler for shell events
 * Called by the web server to wire up WebSocket broadcasting
 */
export function registerShellEventHandler(handler: ShellEventHandler): void {
  shellEventHandler = handler;
}

/**
 * Shim for Electron's 'app' object
 */
export const app = {
  /**
   * Get application paths
   * Maps Electron paths to web-server equivalents
   */
  getPath(name: string): string {
    switch (name) {
      case 'userData':
        return config.dataPath;
      case 'home':
        return os.homedir();
      case 'appData':
        return config.dataPath;
      case 'temp':
        return os.tmpdir();
      default:
        return config.dataPath;
    }
  },

  /**
   * Get the app's installation path
   */
  getAppPath(): string {
    return config.backendPath || process.cwd();
  },

  /**
   * Get app name
   */
  getName(): string {
    return 'auto-claude-web-server';
  },

  /**
   * Get app version
   */
  getVersion(): string {
    return '1.0.0';
  },

  /**
   * Check if app is packaged (always false for web server)
   */
  isPackaged: false,
};

/**
 * Shim for Electron's 'shell' object
 *
 * Instead of silently no-op'ing, we emit events that the frontend can handle.
 * The frontend will receive these via WebSocket and can:
 * - Call window.open() to open URLs in a new tab
 * - Show a notification with the URL for the user to click
 */
export const shell = {
  /**
   * Open a URL in the user's default browser
   * In web context: Emits event for frontend to handle via window.open()
   */
  openExternal(url: string): Promise<void> {
    console.log(`[Electron Shim] shell.openExternal: ${url}`);

    if (shellEventHandler) {
      shellEventHandler('openExternal', { url });
    } else {
      console.warn(
        `[Electron Shim] No shell event handler registered. URL not delivered: ${url}`
      );
    }

    return Promise.resolve();
  },

  /**
   * Open a file/folder in the system file manager
   * In web context: Emits event (frontend may show path to user)
   */
  openPath(filePath: string): Promise<string> {
    console.log(`[Electron Shim] shell.openPath: ${filePath}`);

    if (shellEventHandler) {
      shellEventHandler('openPath', { path: filePath });
    } else {
      console.warn(
        `[Electron Shim] No shell event handler registered. Path not delivered: ${filePath}`
      );
    }

    return Promise.resolve('');
  },

  /**
   * Show a file in the system file manager (highlight it)
   * In web context: Emits event (frontend may show path to user)
   */
  showItemInFolder(fullPath: string): void {
    console.log(`[Electron Shim] shell.showItemInFolder: ${fullPath}`);

    if (shellEventHandler) {
      shellEventHandler('openPath', { path: fullPath });
    }
  },
};

/**
 * Shim for Electron's 'safeStorage' object
 * In web server context, we don't have access to OS keychain,
 * so we return false for isEncryptionAvailable and provide no-op implementations
 */
export const safeStorage = {
  /**
   * Check if encryption is available
   * Always false in web server context
   */
  isEncryptionAvailable(): boolean {
    return false;
  },

  /**
   * Encrypt a string (no-op in web server - returns empty buffer)
   */
  encryptString(_plainText: string): Buffer {
    console.warn('[Electron Shim] safeStorage.encryptString called - encryption not available in web server');
    return Buffer.from('');
  },

  /**
   * Decrypt a buffer (no-op in web server - returns empty string)
   */
  decryptString(_encrypted: Buffer): string {
    console.warn('[Electron Shim] safeStorage.decryptString called - encryption not available in web server');
    return '';
  },
};

/**
 * Shim for Electron's 'ipcMain' object
 * In web server, we use Express routes instead of IPC
 */
export const ipcMain = {
  handle(_channel: string, _handler: (...args: unknown[]) => unknown): void {
    // No-op - web server uses Express routes instead
  },

  on(_channel: string, _handler: (...args: unknown[]) => void): void {
    // No-op - web server uses Express routes instead
  },

  removeHandler(_channel: string): void {
    // No-op
  },

  removeAllListeners(_channel?: string): void {
    // No-op
  },
};

/**
 * Type shim for BrowserWindow (not actually used in web server)
 */
export type BrowserWindow = {
  webContents: {
    send: (channel: string, ...args: unknown[]) => void;
  };
};

/**
 * Type shim for IpcMainInvokeEvent
 */
export type IpcMainInvokeEvent = {
  sender: unknown;
  frameId: number;
  processId: number;
};

/**
 * Type shim for IpcMainEvent
 */
export type IpcMainEvent = {
  sender: unknown;
  frameId: number;
  processId: number;
  reply: (channel: string, ...args: unknown[]) => void;
};

// Default export for ESM compatibility
export default {
  app,
  shell,
  ipcMain,
  safeStorage,
};
