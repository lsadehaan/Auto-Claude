/**
 * Web-specific renderer entry point
 * Initializes electron-to-web IPC before starting React app
 */

// Initialize preload API (sets up window.electronAPI via electron-to-web)
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
console.log('[Web] Connecting to IPC endpoint:', `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ipc`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
