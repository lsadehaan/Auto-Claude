/**
 * File Explorer Routes
 * Provides file system browsing capabilities
 */

import { Router, type Request, type Response } from 'express';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import path from 'path';

const router = Router();

// ============================================================================
// Types
// ============================================================================

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
  extension?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get file extension
 */
function getExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

/**
 * Check if path is safe (no directory traversal)
 */
function isPathSafe(requestedPath: string, basePath?: string): boolean {
  // Normalize the path
  const normalized = path.normalize(requestedPath);

  // Check for directory traversal attempts
  if (normalized.includes('..')) {
    return false;
  }

  // If basePath provided, ensure requested path is within it
  if (basePath) {
    const resolvedBase = path.resolve(basePath);
    const resolvedPath = path.resolve(requestedPath);
    return resolvedPath.startsWith(resolvedBase);
  }

  return true;
}

/**
 * List directory contents
 */
function listDirectory(dirPath: string): FileEntry[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  const stat = statSync(dirPath);
  if (!stat.isDirectory()) {
    return [];
  }

  const entries: FileEntry[] = [];

  try {
    const items = readdirSync(dirPath);

    for (const item of items) {
      // Skip hidden files and common ignore patterns
      if (item.startsWith('.') && item !== '.auto-claude') {
        continue;
      }
      if (['node_modules', '__pycache__', '.git', 'dist', 'build', 'out'].includes(item)) {
        continue;
      }

      const itemPath = path.join(dirPath, item);

      try {
        const itemStat = statSync(itemPath);

        const entry: FileEntry = {
          name: item,
          path: itemPath,
          type: itemStat.isDirectory() ? 'directory' : 'file',
          modifiedAt: itemStat.mtime.toISOString(),
        };

        if (itemStat.isFile()) {
          entry.size = itemStat.size;
          entry.extension = getExtension(item);
        }

        entries.push(entry);
      } catch {
        // Skip files we can't stat (permission issues, etc.)
      }
    }

    // Sort: directories first, then files, both alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

  } catch (error) {
    console.error('[Files] Error listing directory:', error);
  }

  return entries;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /files
 * List directory contents
 */
router.get('/', (req: Request, res: Response) => {
  const dirPath = req.query.path as string;

  if (!dirPath) {
    return res.json({
      success: false,
      error: 'Path is required',
    });
  }

  if (!isPathSafe(dirPath)) {
    return res.json({
      success: false,
      error: 'Invalid path',
    });
  }

  if (!existsSync(dirPath)) {
    return res.json({
      success: false,
      error: 'Path does not exist',
    });
  }

  const entries = listDirectory(dirPath);

  res.json({
    success: true,
    data: entries,
  });
});

/**
 * GET /files/read
 * Read file contents (for small files only)
 */
router.get('/read', (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  const maxSize = parseInt(req.query.maxSize as string) || 1024 * 1024; // 1MB default

  if (!filePath) {
    return res.json({
      success: false,
      error: 'Path is required',
    });
  }

  if (!isPathSafe(filePath)) {
    return res.json({
      success: false,
      error: 'Invalid path',
    });
  }

  if (!existsSync(filePath)) {
    return res.json({
      success: false,
      error: 'File does not exist',
    });
  }

  try {
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      return res.json({
        success: false,
        error: 'Path is a directory',
      });
    }

    if (stat.size > maxSize) {
      return res.json({
        success: false,
        error: `File too large (${stat.size} bytes, max ${maxSize})`,
      });
    }

    const content = readFileSync(filePath, 'utf-8');

    res.json({
      success: true,
      data: {
        path: filePath,
        content,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      },
    });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read file',
    });
  }
});

/**
 * GET /files/stat
 * Get file/directory stats
 */
router.get('/stat', (req: Request, res: Response) => {
  const targetPath = req.query.path as string;

  if (!targetPath) {
    return res.json({
      success: false,
      error: 'Path is required',
    });
  }

  if (!isPathSafe(targetPath)) {
    return res.json({
      success: false,
      error: 'Invalid path',
    });
  }

  if (!existsSync(targetPath)) {
    return res.json({
      success: false,
      error: 'Path does not exist',
    });
  }

  try {
    const stat = statSync(targetPath);

    res.json({
      success: true,
      data: {
        path: targetPath,
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
        accessedAt: stat.atime.toISOString(),
      },
    });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    });
  }
});

/**
 * GET /files/exists
 * Check if path exists
 */
router.get('/exists', (req: Request, res: Response) => {
  const targetPath = req.query.path as string;

  if (!targetPath) {
    return res.json({
      success: false,
      error: 'Path is required',
    });
  }

  res.json({
    success: true,
    data: {
      exists: existsSync(targetPath),
      path: targetPath,
    },
  });
});

export default router;
