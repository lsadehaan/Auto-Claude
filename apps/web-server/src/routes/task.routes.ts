/**
 * Task Routes
 * Handles task execution, spec management, and build operations
 */

import { Router, type Request, type Response } from 'express';
import { agentService } from '../services/agent-service.js';
import { eventBridge } from '../adapters/event-bridge.js';
import { taskLogService } from '../services/task-log-service.js';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const router = Router();

// ============================================================================
// Agent Service Event Wiring
// ============================================================================

// Wire agent events to the event bridge for WebSocket broadcast
agentService.on('log', (taskId: string, log: string) => {
  eventBridge.broadcast('task:log', taskId, log);
});

agentService.on('execution-progress', (taskId: string, progress: any) => {
  eventBridge.broadcast('task:progress', taskId, progress);
});

agentService.on('error', (taskId: string, error: string) => {
  eventBridge.broadcast('task:error', taskId, error);
});

agentService.on('exit', (taskId: string, exitCode: number) => {
  eventBridge.broadcast('task:statusChange', taskId, exitCode === 0 ? 'completed' : 'failed');
});

// Wire task log events to the event bridge for WebSocket broadcast
taskLogService.on('logs-changed', (specId: string, logs: any) => {
  eventBridge.broadcast('task:logsChanged', specId, logs);
});

taskLogService.on('stream-chunk', (specId: string, chunk: any) => {
  eventBridge.broadcast('task:logsStream', specId, chunk);
});

// ============================================================================
// Spec Discovery
// ============================================================================

interface SpecInfo {
  id: string;
  name: string;
  path: string;
  createdAt: Date;
  hasSpec: boolean;
  hasPlan: boolean;
  hasQaReport: boolean;
  status?: string;
}

/**
 * List all specs for a project
 */
function listSpecs(projectPath: string): SpecInfo[] {
  const specsDir = path.join(projectPath, '.auto-claude', 'specs');

  if (!existsSync(specsDir)) {
    return [];
  }

  const specs: SpecInfo[] = [];

  try {
    const entries = readdirSync(specsDir);

    for (const entry of entries) {
      const specPath = path.join(specsDir, entry);
      const stat = statSync(specPath);

      if (!stat.isDirectory()) continue;

      // Parse spec info
      const specInfo: SpecInfo = {
        id: entry,
        name: entry.replace(/^\d+-/, ''), // Remove number prefix
        path: specPath,
        createdAt: stat.birthtime,
        hasSpec: existsSync(path.join(specPath, 'spec.md')),
        hasPlan: existsSync(path.join(specPath, 'implementation_plan.json')),
        hasQaReport: existsSync(path.join(specPath, 'qa_report.md')),
      };

      // Try to read status from implementation plan
      if (specInfo.hasPlan) {
        try {
          const planContent = readFileSync(path.join(specPath, 'implementation_plan.json'), 'utf-8');
          const plan = JSON.parse(planContent);
          specInfo.status = plan.status || 'unknown';
        } catch {
          specInfo.status = 'unknown';
        }
      }

      specs.push(specInfo);
    }

    // Sort by creation date (newest first)
    specs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  } catch (error) {
    console.error('[TaskRoutes] Error listing specs:', error);
  }

  return specs;
}

/**
 * Convert SpecInfo to Task object
 */
function specInfoToTask(specInfo: SpecInfo, projectId: string, projectPath: string): any {
  const task: any = {
    id: specInfo.id,
    specId: specInfo.id,
    projectId,
    title: specInfo.name,
    description: '',
    status: 'backlog',
    subtasks: [],
    logs: [],
    createdAt: specInfo.createdAt,
    updatedAt: specInfo.createdAt,
  };

  // Try to read requirements.json for description and metadata
  try {
    const reqFile = path.join(specInfo.path, 'requirements.json');
    if (existsSync(reqFile)) {
      const requirements = JSON.parse(readFileSync(reqFile, 'utf-8'));
      task.description = requirements.description || requirements.task_description || '';
      task.metadata = requirements.metadata || {};
    }
  } catch {
    // Ignore
  }

  // Try to read spec.md for description if not found
  if (!task.description) {
    try {
      const specFile = path.join(specInfo.path, 'spec.md');
      if (existsSync(specFile)) {
        const specContent = readFileSync(specFile, 'utf-8');
        // Extract first paragraph as description
        const lines = specContent.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        task.description = lines[0] || specInfo.name;
      }
    } catch {
      task.description = specInfo.name;
    }
  }

  // Read implementation plan for subtasks and status
  if (specInfo.hasPlan) {
    try {
      const planFile = path.join(specInfo.path, 'implementation_plan.json');
      const plan = JSON.parse(readFileSync(planFile, 'utf-8'));

      // Extract subtasks from phases
      if (plan.phases && Array.isArray(plan.phases)) {
        task.subtasks = plan.phases.flatMap((phase: any) =>
          (phase.subtasks || []).map((subtask: any) => ({
            id: subtask.id || subtask.description,
            title: subtask.description,
            description: subtask.description,
            status: subtask.status || 'pending',
            files: subtask.files || [],
            verification: subtask.verification,
          }))
        );
      }

      // Determine task status from subtasks
      if (task.subtasks.length > 0) {
        const allCompleted = task.subtasks.every((s: any) => s.status === 'completed');
        const anyInProgress = task.subtasks.some((s: any) => s.status === 'in_progress');
        const anyFailed = task.subtasks.some((s: any) => s.status === 'failed');

        if (allCompleted) {
          task.status = 'human_review';
          task.reviewReason = 'completed';
        } else if (anyFailed) {
          task.status = 'human_review';
          task.reviewReason = 'errors';
        } else if (anyInProgress) {
          task.status = 'in_progress';
        }
      }

      // Use plan status if available
      if (plan.status) {
        task.status = plan.status;
      }

      task.title = plan.feature || plan.title || task.title;
    } catch (error) {
      console.error('[TaskRoutes] Error reading plan:', error);
    }
  }

  // Check if task is actually running (override filesystem status)
  const runningTasks = agentService.getRunningTasks();
  const isRunning = runningTasks.some(taskId => taskId.includes(specInfo.id));
  if (isRunning && task.status !== 'human_review') {
    task.status = 'in_progress';
  }

  return task;
}

/**
 * Read spec details
 */
function getSpecDetails(projectPath: string, specId: string): any {
  const specPath = path.join(projectPath, '.auto-claude', 'specs', specId);

  if (!existsSync(specPath)) {
    return null;
  }

  const details: any = {
    id: specId,
    path: specPath,
  };

  // Read spec.md
  const specFile = path.join(specPath, 'spec.md');
  if (existsSync(specFile)) {
    details.spec = readFileSync(specFile, 'utf-8');
  }

  // Read implementation_plan.json
  const planFile = path.join(specPath, 'implementation_plan.json');
  if (existsSync(planFile)) {
    try {
      details.plan = JSON.parse(readFileSync(planFile, 'utf-8'));
    } catch {
      details.plan = null;
    }
  }

  // Read qa_report.md
  const qaFile = path.join(specPath, 'qa_report.md');
  if (existsSync(qaFile)) {
    details.qaReport = readFileSync(qaFile, 'utf-8');
  }

  // Read requirements.json
  const reqFile = path.join(specPath, 'requirements.json');
  if (existsSync(reqFile)) {
    try {
      details.requirements = JSON.parse(readFileSync(reqFile, 'utf-8'));
    } catch {
      details.requirements = null;
    }
  }

  return details;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /tasks
 * List all tasks/specs for a project
 */
router.get('/', (req: Request, res: Response) => {
  const projectId = req.query.projectId as string;
  const projectPath = req.query.projectPath as string;

  if (!projectPath) {
    return res.json({
      success: false,
      error: 'Project path is required',
    });
  }

  const specs = listSpecs(projectPath);

  // Convert SpecInfo to Task objects
  const tasks = specs.map(spec => specInfoToTask(spec, projectId || '', projectPath));

  // Disable caching to ensure fresh task list
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  res.json({
    success: true,
    data: tasks,
  });
});

/**
 * GET /tasks/:specId
 * Get details of a specific spec
 */
router.get('/:specId', (req: Request, res: Response) => {
  const { specId } = req.params;
  const projectPath = req.query.projectPath as string;

  if (!projectPath) {
    return res.json({
      success: false,
      error: 'Project path is required',
    });
  }

  const details = getSpecDetails(projectPath, specId);

  if (!details) {
    return res.json({
      success: false,
      error: 'Spec not found',
    });
  }

  res.json({
    success: true,
    data: details,
  });
});

/**
 * POST /tasks
 * Create a new spec
 */
router.post('/', async (req: Request, res: Response) => {
  const { projectId, projectPath, title, description, complexity } = req.body;

  if (!projectPath || !description) {
    return res.json({
      success: false,
      error: 'Project path and description are required',
    });
  }

  // Generate task ID
  const taskId = `spec-${Date.now()}`;

  const result = agentService.createSpec(taskId, projectPath, description, {
    complexity,
  });

  if (!result.success) {
    return res.json({
      success: false,
      error: result.error,
    });
  }

  // Return a complete Task object matching the frontend's expectations
  const now = new Date();
  const task = {
    id: taskId,
    specId: taskId,
    projectId: projectId || '',
    title: title || description.substring(0, 100),
    description,
    status: 'backlog',
    subtasks: [],
    logs: [],
    createdAt: now,
    updatedAt: now,
    metadata: {
      sourceType: 'manual',
      complexity,
    },
  };

  res.json({
    success: true,
    data: task,
  });
});

/**
 * PUT /tasks/:specId
 * Update a task
 */
router.put('/:specId', (req: Request, res: Response) => {
  // Stub implementation - would update task metadata
  res.json({
    success: true,
    data: req.body,
  });
});

/**
 * GET /tasks/:specId/review
 * Get task review information
 */
router.get('/:specId/review', (req: Request, res: Response) => {
  // Stub implementation - would return review data
  res.json({
    success: true,
    data: {
      reviewed: false,
      comments: [],
    },
  });
});

/**
 * PUT /tasks/:specId/status
 * Update task status
 */
router.put('/:specId/status', (req: Request, res: Response) => {
  // Stub implementation - status is managed through spec directory files
  res.json({
    success: true,
    data: { status: req.body.status },
  });
});

/**
 * POST /tasks/:specId/archive
 * Archive a task
 */
router.post('/:specId/archive', (req: Request, res: Response) => {
  // Stub implementation - would move spec to archive folder
  res.json({
    success: true,
    data: { archived: true },
  });
});

/**
 * POST /tasks/:specId/unarchive
 * Unarchive a task
 */
router.post('/:specId/unarchive', (req: Request, res: Response) => {
  // Stub implementation - would restore spec from archive
  res.json({
    success: true,
    data: { archived: false },
  });
});

/**
 * POST /tasks/:specId/start
 * Start executing a spec
 */
router.post('/:specId/start', (req: Request, res: Response) => {
  const { specId } = req.params;
  const { projectPath, autoContinue, maxIterations } = req.body;

  console.log('[TaskRoutes] POST /:specId/start called:', { specId, projectPath, autoContinue, maxIterations, body: req.body });

  if (!projectPath) {
    console.log('[TaskRoutes] Missing projectPath');
    return res.json({
      success: false,
      error: 'Project path is required',
    });
  }

  try {
    // Generate task ID
    const taskId = `exec-${specId}-${Date.now()}`;
    console.log('[TaskRoutes] Generated taskId:', taskId);

    const result = agentService.startTask(taskId, projectPath, specId, {
      autoContinue,
      maxIterations,
    });

    console.log('[TaskRoutes] startTask result:', result);

    if (!result.success) {
      console.error('[TaskRoutes] startTask failed:', result.error);
      return res.json({
        success: false,
        error: result.error,
      });
    }

    console.log('[TaskRoutes] Task started successfully:', taskId);
    res.json({
      success: true,
      data: { taskId },
    });
  } catch (error) {
    console.error('[TaskRoutes] Exception in start handler:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /tasks/:specId/stop
 * Stop a running task
 */
router.post('/:specId/stop', (req: Request, res: Response) => {
  const { taskId } = req.body;

  if (!taskId) {
    return res.json({
      success: false,
      error: 'Task ID is required',
    });
  }

  const stopped = agentService.stopTask(taskId);

  res.json({
    success: stopped,
    error: stopped ? undefined : 'Task not found or already stopped',
  });
});

/**
 * GET /tasks/:specId/status
 * Get status of a running task
 * If taskId is provided, checks that specific task
 * If taskId is not provided, checks if ANY task for this spec is running
 */
router.get('/:specId/status', (req: Request, res: Response) => {
  const { specId } = req.params;
  const { taskId } = req.query;

  // If taskId is provided, check that specific task
  if (taskId) {
    const info = agentService.getTaskInfo(taskId as string);

    if (!info) {
      return res.json({
        success: true,
        data: { running: false },
      });
    }

    return res.json({
      success: true,
      data: {
        running: true,
        ...info,
      },
    });
  }

  // If no taskId, check if ANY task for this spec is running
  const runningTasks = agentService.getRunningTasks();
  const isRunning = runningTasks.some(id => id.includes(specId));

  res.json({
    success: true,
    data: { running: isRunning },
  });
});

/**
 * GET /tasks/running
 * List all running tasks
 */
router.get('/running/list', (_req: Request, res: Response) => {
  const runningTasks = agentService.getRunningTasks();

  const tasksInfo = runningTasks.map(taskId => ({
    taskId,
    ...agentService.getTaskInfo(taskId),
  }));

  res.json({
    success: true,
    data: tasksInfo,
  });
});

/**
 * GET /tasks/:specId/logs
 * Get logs for a task
 */
router.get('/:specId/logs', (req: Request, res: Response) => {
  const { specId } = req.params;
  const projectPath = req.query.projectPath as string;

  if (!projectPath) {
    return res.json({
      success: false,
      error: 'Project path is required',
    });
  }

  try {
    const logs = taskLogService.loadLogs(projectPath, specId);

    if (!logs) {
      // Return empty logs structure if no logs exist yet
      return res.json({
        success: true,
        data: {
          spec_id: specId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          phases: {
            planning: { phase: 'planning', status: 'pending', started_at: null, completed_at: null, entries: [] },
            coding: { phase: 'coding', status: 'pending', started_at: null, completed_at: null, entries: [] },
            validation: { phase: 'validation', status: 'pending', started_at: null, completed_at: null, entries: [] },
          },
        },
      });
    }

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('[TaskRoutes] Error loading logs:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load logs',
    });
  }
});

/**
 * POST /tasks/:specId/logs/watch
 * Start watching logs for a task
 */
router.post('/:specId/logs/watch', (req: Request, res: Response) => {
  const { specId } = req.params;
  const { projectPath } = req.body;

  if (!projectPath) {
    return res.json({
      success: false,
      error: 'Project path is required',
    });
  }

  try {
    taskLogService.startWatching(projectPath, specId);
    res.json({
      success: true,
      data: { watching: true },
    });
  } catch (error) {
    console.error('[TaskRoutes] Error starting log watch:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start watching',
    });
  }
});

/**
 * POST /tasks/:specId/logs/unwatch
 * Stop watching logs for a task
 */
router.post('/:specId/logs/unwatch', (req: Request, res: Response) => {
  const { specId } = req.params;

  try {
    taskLogService.stopWatching(specId);
    res.json({
      success: true,
      data: { watching: false },
    });
  } catch (error) {
    console.error('[TaskRoutes] Error stopping log watch:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop watching',
    });
  }
});

/**
 * DELETE /tasks/:specId
 * Delete a task and its spec directory
 */
router.delete('/:specId', async (req: Request, res: Response) => {
  const { specId } = req.params;
  const projectPath = req.query.projectPath as string;

  if (!projectPath) {
    return res.json({
      success: false,
      error: 'Project path is required',
    });
  }

  try {
    // Check if task is currently running
    const runningTasks = agentService.getRunningTasks();
    const isRunning = runningTasks.some(id => id.includes(specId));

    if (isRunning) {
      return res.json({
        success: false,
        error: 'Cannot delete a running task. Stop the task first.',
      });
    }

    // Delete the spec directory
    const specDir = path.join(projectPath, '.auto-claude', 'specs', specId);

    if (existsSync(specDir)) {
      const { rm } = await import('fs/promises');
      await rm(specDir, { recursive: true, force: true });
      console.log(`[TaskRoutes] Deleted spec directory: ${specDir}`);
    }

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('[TaskRoutes] Error deleting task:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete task',
    });
  }
});

/**
 * POST /tasks/:specId/recover
 * Recover a stuck task
 */
router.post('/:specId/recover', (req: Request, res: Response) => {
  const { specId } = req.params;
  const { autoRestart, projectPath } = req.body;

  console.log('[TaskRoutes] POST /:specId/recover called:', { specId, autoRestart, projectPath });

  try {
    // Find running tasks for this spec
    const runningTasks = agentService.getRunningTasks();
    const taskId = runningTasks.find(id => id.includes(specId));

    if (taskId) {
      // Stop the stuck task
      console.log('[TaskRoutes] Stopping stuck task:', taskId);
      agentService.stopTask(taskId);
    }

    // If autoRestart is enabled, start a new task
    if (autoRestart) {
      if (!projectPath) {
        console.error('[TaskRoutes] autoRestart requested but no projectPath provided');
        return res.json({
          success: false,
          error: 'Project path is required for auto-restart',
        });
      }

      // Generate new task ID
      const newTaskId = `exec-${specId}-${Date.now()}`;
      console.log('[TaskRoutes] Auto-restarting task with new ID:', newTaskId);

      const result = agentService.startTask(newTaskId, projectPath, specId, {
        autoContinue: true,
      });

      if (!result.success) {
        console.error('[TaskRoutes] Failed to auto-restart:', result.error);
        return res.json({
          success: false,
          error: result.error,
        });
      }

      console.log('[TaskRoutes] Task auto-restarted successfully');
      return res.json({
        success: true,
        data: {
          recovered: true,
          autoRestarted: true,
          taskId: newTaskId,
        },
      });
    }

    res.json({
      success: true,
      data: {
        recovered: true,
        autoRestart: false,
      },
    });
  } catch (error) {
    console.error('[TaskRoutes] Exception in recover handler:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
