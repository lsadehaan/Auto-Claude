// Log version and build info immediately
const buildInfo = {
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent,
};

console.log('='.repeat(80));
console.log('AUTO-CLAUDE WEB CLIENT');
console.log('='.repeat(80));
console.log('Build Info:', buildInfo);
console.log('Git Commit:', (import.meta as any).env?.VITE_GIT_COMMIT || 'unknown');
console.log('='.repeat(80));

// Initialize i18n before React
import '../shared/i18n';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
