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

// Create the appropriate API implementation
let apiInstance: WebAPI | typeof window.electronAPI;

if (isElectron) {
  // Use Electron IPC API
  apiInstance = (window as any).electronAPI;
  console.log('[API] Using Electron IPC API');
} else {
  // Use Web HTTP/WebSocket API
  try {
    apiInstance = createWebAPI();
    console.log('[API] Using Web HTTP/WebSocket API');
    console.log('[API] API instance created:', !!apiInstance);
    console.log('[API] Has getAppVersion:', !!(apiInstance as any).getAppVersion);
    console.log('[API] Has onTaskProgress:', !!(apiInstance as any).onTaskProgress);
  } catch (error) {
    console.error('[API] Failed to create Web API:', error);
    throw error;
  }
}

if (!apiInstance) {
  throw new Error('[API] FATAL: API instance is undefined!');
}

/**
 * Unified API instance with lazy initialization
 * Use this throughout the application instead of window.electronAPI directly
 *
 * IMPORTANT: We use a Proxy to handle race conditions where components
 * might try to access the API before module initialization completes
 */
export const api = new Proxy({} as typeof apiInstance, {
  get(_target, prop) {
    if (!apiInstance) {
      console.error(`[API] Attempted to access '${String(prop)}' before API initialization!`);
      throw new Error(`API not initialized - cannot access ${String(prop)}`);
    }
    return (apiInstance as any)[prop];
  },
  set(_target, prop, value) {
    if (!apiInstance) {
      throw new Error(`API not initialized - cannot set ${String(prop)}`);
    }
    (apiInstance as any)[prop] = value;
    return true;
  }
});

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
