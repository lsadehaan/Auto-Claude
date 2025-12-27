/**
 * Context Routes
 *
 * Handles project context and index operations.
 * Migrated from: apps/frontend/src/main/ipc-handlers/context/project-context-handlers.ts
 *
 * Note: Memory/Graphiti operations are part of the Memory migration.
 * This module focuses on core project context (index, file analysis).
 */

import { Router } from 'express';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { projectService } from '../services/project-service.js';
import { config } from '../config.js';

const router = Router();

// Auto-claude paths
const AUTO_BUILD_PATHS = {
  PROJECT_INDEX: '.auto-claude/project_index.json',
  SPECS_DIR: 'specs',
  MEMORY_DIR: 'memory',
};

interface ProjectIndex {
  projectName?: string;
  description?: string;
  techStack?: string[];
  entryPoints?: string[];
  keyFiles?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

interface MemoryEpisode {
  id: string;
  specId: string;
  type: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ProjectContextData {
  projectIndex: ProjectIndex | null;
  memoryStatus: {
    available: boolean;
    reason?: string;
  };
  recentMemories: MemoryEpisode[];
  isLoading: boolean;
}

/**
 * Load project index from file
 */
function loadProjectIndex(projectPath: string): ProjectIndex | null {
  const indexPath = path.join(projectPath, AUTO_BUILD_PATHS.PROJECT_INDEX);
  if (!existsSync(indexPath)) {
    return null;
  }

  try {
    const content = readFileSync(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get specs directory path
 */
function getSpecsDir(autoBuildPath?: string): string {
  return `${autoBuildPath || '.auto-claude'}/${AUTO_BUILD_PATHS.SPECS_DIR}`;
}

/**
 * Load file-based memories from specs directories
 * This is a simple fallback when Graphiti is not available
 */
function loadFileBasedMemories(specsDir: string, limit: number = 20): MemoryEpisode[] {
  const memories: MemoryEpisode[] = [];

  if (!existsSync(specsDir)) {
    return memories;
  }

  try {
    const specDirs = readdirSync(specsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse(); // Most recent first

    for (const specId of specDirs) {
      if (memories.length >= limit) break;

      const memoryDir = path.join(specsDir, specId, AUTO_BUILD_PATHS.MEMORY_DIR);
      if (!existsSync(memoryDir)) continue;

      try {
        const memoryFiles = readdirSync(memoryDir)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .reverse();

        for (const memoryFile of memoryFiles) {
          if (memories.length >= limit) break;

          try {
            const content = readFileSync(path.join(memoryDir, memoryFile), 'utf-8');
            const memory = JSON.parse(content);

            memories.push({
              id: memory.id || `${specId}-${memoryFile}`,
              specId,
              type: memory.type || 'insight',
              content: memory.content || memory.summary || '',
              timestamp: memory.timestamp || memory.created_at || new Date().toISOString(),
              metadata: memory.metadata,
            });
          } catch {
            // Skip invalid memory files
          }
        }
      } catch {
        // Skip inaccessible memory directories
      }
    }
  } catch {
    // Return empty if specs dir is inaccessible
  }

  return memories;
}

/**
 * Find Python command
 */
function findPythonCommand(): string {
  const commands = ['python3', 'python', 'py'];

  for (const cmd of commands) {
    try {
      const { execSync } = require('child_process');
      execSync(`${cmd} --version`, { stdio: 'pipe' });
      return cmd;
    } catch {
      // Try next command
    }
  }

  return 'python';
}

// ============================================
// Context Routes
// ============================================

/**
 * Get project context
 * GET /context/projects/:projectId
 */
router.get('/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    // Load project index
    const projectIndex = loadProjectIndex(project.path);

    // Load recent file-based memories
    const specsBaseDir = getSpecsDir(project.autoBuildPath);
    const specsDir = path.join(project.path, specsBaseDir);
    const recentMemories = loadFileBasedMemories(specsDir, 20);

    // Basic memory status (full Graphiti support is in Memory routes)
    const memoryStatus = {
      available: recentMemories.length > 0,
      reason: recentMemories.length > 0
        ? 'File-based memories available'
        : 'No memories found',
    };

    const contextData: ProjectContextData = {
      projectIndex,
      memoryStatus,
      recentMemories,
      isLoading: false,
    };

    return res.json({ success: true, data: contextData });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load project context',
    });
  }
});

/**
 * Get project index only
 * GET /context/projects/:projectId/index
 */
router.get('/projects/:projectId/index', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const projectIndex = loadProjectIndex(project.path);

  return res.json({
    success: true,
    data: projectIndex,
  });
});

/**
 * Refresh project index by running analyzer
 * POST /context/projects/:projectId/refresh
 */
router.post('/projects/:projectId/refresh', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    // Find analyzer script in backend
    const backendPath = config.backendPath;
    if (!backendPath) {
      return res.json({
        success: false,
        error: 'Backend path not configured',
      });
    }

    const analyzerPath = path.join(backendPath, 'analyzer.py');
    if (!existsSync(analyzerPath)) {
      return res.json({
        success: false,
        error: `Analyzer script not found: ${analyzerPath}`,
      });
    }

    const indexOutputPath = path.join(project.path, AUTO_BUILD_PATHS.PROJECT_INDEX);
    const pythonCmd = findPythonCommand();

    // Run analyzer
    await new Promise<void>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn(pythonCmd, [
        analyzerPath,
        '--project-dir', project.path,
        '--output', indexOutputPath,
      ], {
        cwd: project.path,
        env: { ...process.env },
      });

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number) => {
        if (code === 0) {
          console.log('[Context] Analyzer completed successfully');
          resolve();
        } else {
          console.error('[Context] Analyzer failed:', stderr || stdout);
          reject(new Error(`Analyzer exited with code ${code}: ${stderr || stdout}`));
        }
      });

      proc.on('error', (err) => {
        console.error('[Context] Analyzer spawn error:', err);
        reject(err);
      });
    });

    // Read the new index
    const projectIndex = loadProjectIndex(project.path);
    if (projectIndex) {
      return res.json({ success: true, data: projectIndex });
    }

    return res.json({ success: false, error: 'Failed to generate project index' });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh project index',
    });
  }
});

/**
 * Get recent memories
 * GET /context/projects/:projectId/memories
 */
router.get('/projects/:projectId/memories', async (req, res) => {
  const { projectId } = req.params;
  const { limit } = req.query as { limit?: string };
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    const specsBaseDir = getSpecsDir(project.autoBuildPath);
    const specsDir = path.join(project.path, specsBaseDir);
    const memoryLimit = limit ? parseInt(limit, 10) : 20;
    const memories = loadFileBasedMemories(specsDir, memoryLimit);

    return res.json({ success: true, data: memories });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load memories',
    });
  }
});

export default router;
