// Initialize i18n before React
import '../shared/i18n';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AuthWrapper } from './components/auth/AuthWrapper';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthWrapper>
      <App />
    </AuthWrapper>
  </React.StrictMode>
);
