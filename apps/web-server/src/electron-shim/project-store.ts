/**
 * Project Store Shim
 *
 * Provides a projectStore-compatible interface that wraps our web-server's projectService.
 * This allows Electron IPC handler logic to work with our web server infrastructure.
 *
 * The shim translates between:
 * - Electron's projectStore API (what handlers expect)
 * - Web-server's projectService API (what we have)
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { projectService, type Project } from '../services/project-service.js';

// Task-related types (from Electron's shared types)
interface Task {
  id: string;
  specId: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  reviewReason?: string;
  subtasks: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
  }>;
  location: 'main' | 'worktree';
  specsPath: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ImplementationPlan {
  feature?: string;
  title?: string;
  description?: string;
  status?: string;
  phases?: Array<{
    subtasks?: Array<{ id: string; description: string; status: string }>;
    chunks?: Array<{ id: string; description: string; status: string }>;
  }>;
  created_at?: string;
  updated_at?: string;
}

/**
 * Load tasks from a specs directory
 */
function loadTasksFromSpecsDir(
  specsDir: string,
  projectId: string,
  location: 'main' | 'worktree'
): Task[] {
  const tasks: Task[] = [];

  if (!existsSync(specsDir)) {
    return tasks;
  }

  try {
    const entries = readdirSync(specsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.gitkeep') continue;

      try {
        const specPath = path.join(specsDir, entry.name);
        const planPath = path.join(specPath, 'implementation_plan.json');
        const specFilePath = path.join(specPath, 'spec.md');

        // Try to read implementation plan
        let plan: ImplementationPlan | null = null;
        if (existsSync(planPath)) {
          try {
            plan = JSON.parse(readFileSync(planPath, 'utf-8'));
          } catch {
            // Ignore parse errors
          }
        }

        // Try to read spec file for description
        let description = '';
        if (existsSync(specFilePath)) {
          try {
            const content = readFileSync(specFilePath, 'utf-8');
            const overviewMatch = content.match(/## Overview\s*\n+([^\n#]+)/);
            if (overviewMatch) {
              description = overviewMatch[1].trim();
            }
          } catch {
            // Ignore read errors
          }
        }

        if (!description && plan?.description) {
          description = plan.description;
        }

        // Extract subtasks from plan
        const subtasks = plan?.phases?.flatMap((phase) => {
          const items = phase.subtasks || phase.chunks || [];
          return items.map((subtask) => ({
            id: subtask.id,
            title: subtask.description,
            description: subtask.description,
            status: subtask.status,
          }));
        }) || [];

        // Determine title
        let title = plan?.feature || plan?.title || entry.name;

        tasks.push({
          id: entry.name,
          specId: entry.name,
          projectId,
          title,
          description,
          status: plan?.status || 'backlog',
          subtasks,
          location,
          specsPath: specPath,
          createdAt: new Date(plan?.created_at || Date.now()),
          updatedAt: new Date(plan?.updated_at || Date.now()),
        });
      } catch (error) {
        console.error(`[ProjectStore Shim] Error loading spec ${entry.name}:`, error);
      }
    }
  } catch (error) {
    console.error('[ProjectStore Shim] Error reading specs directory:', error);
  }

  return tasks;
}

/**
 * Shim that provides Electron projectStore-compatible interface
 */
export const projectStore = {
  /**
   * Get a project by ID
   */
  getProject(projectId: string): Project | undefined {
    const project = projectService.getProject(projectId);
    return project || undefined;
  },

  /**
   * Get all projects
   */
  getProjects(): Project[] {
    return projectService.listProjects();
  },

  /**
   * Get tasks for a project by scanning specs directory
   */
  getTasks(projectId: string): Task[] {
    const project = projectService.getProject(projectId);
    if (!project) {
      return [];
    }

    const allTasks: Task[] = [];
    const autoBuildPath = project.autoBuildPath || '.auto-claude';
    const specsDir = path.join(project.path, autoBuildPath, 'specs');

    // Load from main project
    const mainTasks = loadTasksFromSpecsDir(specsDir, projectId, 'main');
    allTasks.push(...mainTasks);

    // Load from worktrees
    const worktreesDir = path.join(project.path, '.worktrees');
    if (existsSync(worktreesDir)) {
      try {
        const worktrees = readdirSync(worktreesDir, { withFileTypes: true });
        for (const worktree of worktrees) {
          if (!worktree.isDirectory()) continue;
          const worktreeSpecsDir = path.join(worktreesDir, worktree.name, autoBuildPath, 'specs');
          if (existsSync(worktreeSpecsDir)) {
            const worktreeTasks = loadTasksFromSpecsDir(worktreeSpecsDir, projectId, 'worktree');
            allTasks.push(...worktreeTasks);
          }
        }
      } catch {
        // Ignore worktree errors
      }
    }

    // Deduplicate (prefer worktree version)
    const taskMap = new Map<string, Task>();
    for (const task of allTasks) {
      const existing = taskMap.get(task.id);
      if (!existing || task.location === 'worktree') {
        taskMap.set(task.id, task);
      }
    }

    return Array.from(taskMap.values());
  },

  /**
   * Add a new project
   */
  addProject(projectPath: string, name?: string): Project {
    return projectService.addProject(projectPath, name);
  },

  /**
   * Remove a project
   */
  removeProject(projectId: string): boolean {
    return projectService.removeProject(projectId);
  },

  /**
   * Update project's autoBuildPath
   */
  updateAutoBuildPath(projectId: string, autoBuildPath: string): Project | undefined {
    return projectService.updateProject(projectId, { autoBuildPath });
  },

  /**
   * Archive tasks by writing archivedAt to their metadata
   */
  archiveTasks(projectId: string, taskIds: string[], version?: string): boolean {
    const project = projectService.getProject(projectId);
    if (!project) return false;

    const autoBuildPath = project.autoBuildPath || '.auto-claude';
    const specsDir = path.join(project.path, autoBuildPath, 'specs');
    const archivedAt = new Date().toISOString();

    for (const taskId of taskIds) {
      const metadataPath = path.join(specsDir, taskId, 'task_metadata.json');
      try {
        let metadata: Record<string, unknown> = {};
        if (existsSync(metadataPath)) {
          metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
        }
        metadata.archivedAt = archivedAt;
        if (version) {
          metadata.archivedInVersion = version;
        }
        writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      } catch {
        // Continue with other tasks
      }
    }

    return true;
  },

  /**
   * Unarchive tasks by removing archivedAt from their metadata
   */
  unarchiveTasks(projectId: string, taskIds: string[]): boolean {
    const project = projectService.getProject(projectId);
    if (!project) return false;

    const autoBuildPath = project.autoBuildPath || '.auto-claude';
    const specsDir = path.join(project.path, autoBuildPath, 'specs');

    for (const taskId of taskIds) {
      const metadataPath = path.join(specsDir, taskId, 'task_metadata.json');
      try {
        if (existsSync(metadataPath)) {
          const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
          delete metadata.archivedAt;
          delete metadata.archivedInVersion;
          writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        }
      } catch {
        // Continue with other tasks
      }
    }

    return true;
  },
};

// Re-export Project type for convenience
export type { Project };
