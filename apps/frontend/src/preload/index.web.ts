/**
 * Web-specific preload replacement
 * Instead of using Electron's contextBridge, this directly exports the API
 * for use in the web environment via electron-to-web
 *
 * Note: Because of vite.web.config.ts alias, all 'electron' imports
 * in the API files automatically become 'electron-to-web/renderer'
 */

import { createElectronAPI } from './api';
import { ipcRenderer } from 'electron'; // This becomes electron-to-web/renderer via alias

/**
 * Wait for IPC connection to be ready
 * electron-to-web's ipcRenderer connects via WebSocket which is async
 */
async function waitForIPCConnection(): Promise<void> {
  return new Promise((resolve) => {
    // Check if already connected
    if ((ipcRenderer as any).connected) {
      console.log('[Preload] IPC already connected');
      resolve();
      return;
    }

    console.log('[Preload] Waiting for IPC connection...');

    // Poll for connection (electron-to-web sets 'connected' property)
    const checkInterval = setInterval(() => {
      if ((ipcRenderer as any).connected) {
        console.log('[Preload] IPC connected');
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);

    // Timeout after 10 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      console.warn('[Preload] IPC connection timeout - proceeding anyway');
      resolve();
    }, 10000);
  });
}

/**
 * Initialize the API after connection is ready
 */
async function initializeAPI() {
  // Wait for WebSocket connection
  await waitForIPCConnection();

  // Create the unified API (all API files use 'electron' which is aliased)
  const electronAPI = createElectronAPI();

  // In web environment, expose directly on window
  // (no contextBridge needed since we're not in Electron)
  if (typeof window !== 'undefined') {
    (window as any).electronAPI = electronAPI;
    (window as any).DEBUG = import.meta.env.DEV;
    console.log('[Preload] window.electronAPI initialized');
  }
}

// Start initialization
initializeAPI().catch(err => {
  console.error('[Preload] Failed to initialize API:', err);
});
