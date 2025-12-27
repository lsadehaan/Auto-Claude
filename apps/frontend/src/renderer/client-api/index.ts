/**
 * Unified API Layer
 *
 * This module exports a unified API that works in both Electron and Web environments.
 * In Electron, it uses IPC via window.electronAPI.
 * In Web, it uses HTTP/WebSocket via the web-api module.
 *
 * Usage:
 *   import { api } from '@/client-api';
 *   const projects = await api.getProjects();
 */

import { createWebAPI, type WebAPI } from './web-api';

// Detect if running in Electron
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

console.log('[API] Initializing API... isElectron:', isElectron);

/**
 * Unified API instance
 * Use this throughout the application instead of window.electronAPI directly
 */
export const api = ((): WebAPI | typeof window.electronAPI => {
  if (isElectron) {
    console.log('[API] Using Electron IPC API');
    return (window as any).electronAPI;
  } else {
    console.log('[API] Creating Web HTTP/WebSocket API');
    const instance = createWebAPI();
    console.log('[API] Web API created:', {
      exists: !!instance,
      hasGetAppVersion: !!(instance as any)?.getAppVersion,
      hasOnTaskProgress: !!(instance as any)?.onTaskProgress,
      type: typeof instance,
      keys: instance ? Object.keys(instance).slice(0, 10) : []
    });
    return instance;
  }
})();

/**
 * Check if running in Electron environment
 */
export function isElectronEnv(): boolean {
  return isElectron;
}

/**
 * Check if running in Web environment
 */
export function isWebEnv(): boolean {
  return !isElectron;
}

/**
 * Boolean constant for web mode (convenient for conditional rendering)
 */
export const isWebMode = !isElectron;

// Re-export types
export type { WebAPI } from './web-api';
export { WebSocketClient } from './websocket-client';
