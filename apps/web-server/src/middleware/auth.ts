import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';

const AUTH_COOKIE_NAME = 'auto_claude_session';

// In-memory session store (for single-instance deployment)
// For multi-instance, consider using Redis
const sessions = new Map<string, { createdAt: Date; lastAccess: Date }>();

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (now - session.lastAccess.getTime() > config.sessionMaxAge) {
      sessions.delete(sessionId);
    }
  }
}, 60000); // Clean every minute

/**
 * Authentication middleware
 * Checks for valid session cookie, skips for login/public routes
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for these paths
  const publicPaths = ['/api/auth/login', '/api/auth/status', '/api/health'];
  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  // In development mode, allow access without auth if no password is set
  if (config.isDev && !config.passwordHash) {
    return next();
  }

  const sessionId = req.cookies[AUTH_COOKIE_NAME];

  if (!sessionId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    res.clearCookie(AUTH_COOKIE_NAME);
    res.status(401).json({ success: false, error: 'Invalid or expired session' });
    return;
  }

  // Check if session has expired
  if (Date.now() - session.lastAccess.getTime() > config.sessionMaxAge) {
    sessions.delete(sessionId);
    res.clearCookie(AUTH_COOKIE_NAME);
    res.status(401).json({ success: false, error: 'Session expired' });
    return;
  }

  // Update last access time
  session.lastAccess = new Date();

  next();
}

/**
 * Validate password and create session
 */
export async function login(password: string): Promise<string | null> {
  if (!config.passwordHash) {
    // In dev mode without password, allow any login
    if (config.isDev) {
      const sessionId = uuidv4();
      sessions.set(sessionId, { createdAt: new Date(), lastAccess: new Date() });
      return sessionId;
    }
    throw new Error('Password not configured. Run: npm run setup-password');
  }

  const isValid = await bcrypt.compare(password, config.passwordHash);

  if (!isValid) {
    return null;
  }

  const sessionId = uuidv4();
  sessions.set(sessionId, { createdAt: new Date(), lastAccess: new Date() });

  return sessionId;
}

/**
 * Destroy a session
 */
export function logout(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Check if a session is valid
 */
export function isValidSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  if (Date.now() - session.lastAccess.getTime() > config.sessionMaxAge) {
    sessions.delete(sessionId);
    return false;
  }

  return true;
}

/**
 * Get session cookie name (for use in routes)
 */
export function getAuthCookieName(): string {
  return AUTH_COOKIE_NAME;
}

/**
 * Get session count (for monitoring)
 */
export function getSessionCount(): number {
  return sessions.size;
}
