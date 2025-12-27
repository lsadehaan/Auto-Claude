import { useState, useEffect, type ReactNode } from 'react';
import { api, isWebMode } from '../../client-api';
import { LoginPage } from './LoginPage';

interface AuthWrapperProps {
  children: ReactNode;
}

/**
 * Wraps the app with authentication checking for web mode.
 * In Electron mode, children are rendered directly.
 * In web mode, checks auth status and shows login page if needed.
 */
export function AuthWrapper({ children }: AuthWrapperProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(!isWebMode);
  const [isCheckingAuth, setIsCheckingAuth] = useState(isWebMode);

  useEffect(() => {
    if (!isWebMode) return;

    const checkAuth = async () => {
      try {
        const result = await api.checkAuthStatus();
        setIsAuthenticated(result.success && result.data?.authenticated === true);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  // Electron mode - render children directly
  if (!isWebMode) {
    return <>{children}</>;
  }

  // Web mode - checking auth
  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Web mode - not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  // Web mode - authenticated
  return <>{children}</>;
}
