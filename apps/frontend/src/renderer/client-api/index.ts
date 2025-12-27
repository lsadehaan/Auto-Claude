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
  apiInstance = createWebAPI();
  console.log('[API] Using Web HTTP/WebSocket API');
}

/**
 * Unified API instance
 * Use this throughout the application instead of window.electronAPI directly
 */
export const api = apiInstance;

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
