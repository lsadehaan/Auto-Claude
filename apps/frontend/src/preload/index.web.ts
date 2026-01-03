/**
 * Web-specific preload replacement
 * Instead of using Electron's contextBridge, this directly exports the API
 * for use in the web environment via electron-to-web
 */

import { createElectronAPI } from './api';

// Create the unified API
const electronAPI = createElectronAPI();

// In web environment, expose directly on window
// (no contextBridge needed since we're not in Electron)
if (typeof window !== 'undefined') {
  (window as any).electronAPI = electronAPI;
  (window as any).DEBUG = import.meta.env.DEV;
}

// Also export for direct imports
export { electronAPI };
