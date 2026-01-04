/**
 * Web-specific renderer entry point
 * Initializes electron-to-web IPC before starting React app
 *
 * The preload API is initialized in index.web.ts which waits for
 * the WebSocket connection before setting window.electronAPI
 */

// Initialize preload API (sets up window.electronAPI via electron-to-web)
// This happens async and waits for WebSocket connection
import '../preload/index.web';

// Initialize browser mock before anything else (no-op in Electron)
import './lib/browser-mock';

// Initialize i18n before React
import '../shared/i18n';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

// Log connection info
const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ipc`;
console.log('[Web] Connecting to IPC endpoint:', wsUrl);

// Show loading screen while preload initializes
const root = document.getElementById('root')!;
root.innerHTML = `
  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Inter, system-ui, sans-serif;">
    <div style="text-align: center;">
      <div style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Auto Claude</div>
      <div style="color: #666; margin-bottom: 24px;">Connecting to server...</div>
      <div style="width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
    </div>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </div>
`;

// Wait for window.electronAPI to be ready (set by preload after connection)
function waitForAPI(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).electronAPI) {
      console.log('[Web] API already initialized');
      resolve();
      return;
    }

    const checkAPI = setInterval(() => {
      if ((window as any).electronAPI) {
        console.log('[Web] API initialized, starting React app');
        clearInterval(checkAPI);
        resolve();
      }
    }, 100);

    // Timeout after 15 seconds (preload has 10s timeout)
    setTimeout(() => {
      clearInterval(checkAPI);
      console.error('[Web] API initialization timeout');
      resolve(); // Proceed anyway
    }, 15000);
  });
}

// Wait for API, then render app
waitForAPI().then(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
