/**
 * Task Routes
 * Handles task execution, spec management, and build operations
 */

import { Router, type Request, type Response } from 'express';
import { agentService } from '../services/agent-service.js';
import { eventBridge } from '../adapters/event-bridge.js';
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
 * POST /tasks/:specId/start
 * Start executing a spec
 */
router.post('/:specId/start', (req: Request, res: Response) => {
  const { specId } = req.params;
  const { projectPath, autoContinue, maxIterations } = req.body;

  if (!projectPath) {
    return res.json({
      success: false,
      error: 'Project path is required',
    });
  }

  // Generate task ID
  const taskId = `exec-${specId}-${Date.now()}`;

  const result = agentService.startTask(taskId, projectPath, specId, {
    autoContinue,
    maxIterations,
  });

  if (!result.success) {
    return res.json({
      success: false,
      error: result.error,
    });
  }

  res.json({
    success: true,
    data: { taskId },
  });
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
 */
router.get('/:specId/status', (req: Request, res: Response) => {
  const { taskId } = req.query;

  if (!taskId) {
    return res.json({
      success: false,
      error: 'Task ID is required',
    });
  }

  const info = agentService.getTaskInfo(taskId as string);

  if (!info) {
    return res.json({
      success: true,
      data: { running: false },
    });
  }

  res.json({
    success: true,
    data: {
      running: true,
      ...info,
    },
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

export default router;
