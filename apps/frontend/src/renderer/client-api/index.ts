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

// Generate unique ID for this module instance
const moduleId = `api-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Detect if running in Electron
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

console.log(`[API:${moduleId}] Module loaded at:`, new Error().stack);
console.log(`[API:${moduleId}] Initializing API... isElectron:`, isElectron);

/**
 * Unified API instance
 * Use this throughout the application instead of window.electronAPI directly
 */
export const api = ((): WebAPI | typeof window.electronAPI => {
  if (isElectron) {
    console.log(`[API:${moduleId}] Using Electron IPC API`);
    return (window as any).electronAPI;
  } else {
    console.log(`[API:${moduleId}] Creating Web HTTP/WebSocket API`);
    const instance = createWebAPI();

    // Store module ID on the instance for tracking
    (instance as any).__moduleId = moduleId;

    console.log(`[API:${moduleId}] Web API created:`, {
      exists: !!instance,
      hasGetAppVersion: !!(instance as any)?.getAppVersion,
      hasOnTaskProgress: !!(instance as any)?.onTaskProgress,
      type: typeof instance,
      moduleId: (instance as any).__moduleId,
      keys: instance ? Object.keys(instance).slice(0, 10) : []
    });

    // Make instance globally accessible for debugging
    (window as any).__claudeAPI = instance;
    (window as any).__claudeAPIModuleId = moduleId;

    console.log(`[API:${moduleId}] Stored in window.__claudeAPI for debugging`);

    return instance;
  }
})();

console.log(`[API:${moduleId}] Export completed. api =`, {
  type: typeof api,
  isUndefined: api === undefined,
  hasGetAppVersion: !!(api as any)?.getAppVersion,
  moduleId: (api as any).__moduleId
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
