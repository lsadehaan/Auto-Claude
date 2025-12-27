import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Result type matching IPC handler return format
 */
export interface IPCResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Handler function type (mirrors IPC handler signature)
 * Uses 'any' for flexibility since handlers come from various sources
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerFn<T = unknown> = (...args: any[]) => Promise<IPCResult<T>> | IPCResult<T>;

/**
 * Adapts an IPC-style handler to Express middleware.
 *
 * IPC handlers typically receive arguments directly:
 *   ipcMain.handle('channel', async (_, arg1, arg2) => result)
 *
 * This adapter extracts arguments from the request:
 *   - GET: from req.params and req.query
 *   - POST/PUT/DELETE: from req.body
 *
 * @param handler - The handler function to adapt
 * @param argExtractor - Optional custom argument extractor
 */
export function adaptHandler<T = unknown>(
  handler: HandlerFn<T>,
  argExtractor?: (req: Request) => unknown[]
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract arguments from request
      const args = argExtractor
        ? argExtractor(req)
        : extractArgs(req);

      // Call the handler
      const result = await handler(...args);

      // Send response
      if (result && typeof result === 'object' && 'success' in result) {
        res.json(result);
      } else {
        res.json({ success: true, data: result });
      }
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Adapts a fire-and-forget handler (no response expected)
 * Used for handlers that trigger async operations
 */
export function adaptFireAndForget(
  handler: (...args: unknown[]) => void | Promise<void>,
  argExtractor?: (req: Request) => unknown[]
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const args = argExtractor ? argExtractor(req) : extractArgs(req);

      // Fire and forget - don't await
      handler(...args);

      res.status(202).json({ success: true, message: 'Request accepted' });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Default argument extractor
 * - For GET/DELETE: combines params and query
 * - For POST/PUT/PATCH: uses body (as array if already array, otherwise as single arg)
 */
function extractArgs(req: Request): unknown[] {
  if (req.method === 'GET' || req.method === 'DELETE') {
    // Combine params and query
    const args: unknown[] = [];

    // Add route params first (e.g., /tasks/:id)
    if (Object.keys(req.params).length > 0) {
      args.push(req.params.id || req.params);
    }

    // Add query params
    if (Object.keys(req.query).length > 0) {
      args.push(req.query);
    }

    return args;
  }

  // For POST/PUT/PATCH, use body
  if (Array.isArray(req.body)) {
    return req.body;
  }

  return [req.body];
}

/**
 * Common argument extractors for reuse
 */
export const argExtractors = {
  /**
   * Extract just the ID from params
   */
  idOnly: (req: Request): unknown[] => [req.params.id],

  /**
   * Extract ID from params and body
   */
  idAndBody: (req: Request): unknown[] => [req.params.id, req.body],

  /**
   * Extract project ID from query
   */
  projectId: (req: Request): unknown[] => [req.query.projectId as string],

  /**
   * Extract project ID and additional query params
   */
  projectIdWithQuery: (req: Request): unknown[] => {
    const { projectId, ...rest } = req.query;
    return [projectId as string, rest];
  },

  /**
   * Body as single object
   */
  bodyAsObject: (req: Request): unknown[] => [req.body],

  /**
   * No arguments
   */
  none: (): unknown[] => [],
};
