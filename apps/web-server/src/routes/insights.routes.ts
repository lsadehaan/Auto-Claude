/**
 * Insights Routes
 *
 * Ultra-thin Express wrappers that use insightsService directly.
 * Following the same pattern as ideation routes - import services and use them.
 *
 * The bundler aliases @electron/insights-service to the Electron codebase,
 * and projectStore is shimmed via tsup, enabling seamless code reuse.
 */

import { Router } from 'express';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { projectService } from '../services/project-service.js';
import { eventBridge } from '../adapters/event-bridge.js';

// Import directly from Electron codebase - bundler handles the aliasing
import { insightsService } from '../../../frontend/src/main/insights-service';
import type { InsightsModelConfig, TaskMetadata } from '../../../frontend/src/shared/types';

const router = Router();

// ============================================================================
// Event Wiring - Forward insightsService events to WebSocket clients
// ============================================================================

// Wire up streaming events
insightsService.on('token', (projectId: string, token: string) => {
  eventBridge.broadcast('insights:token', { projectId, token });
});

insightsService.on('message-complete', (projectId: string, messageId: string, content: string) => {
  eventBridge.broadcast('insights:message-complete', { projectId, messageId, content });
});

insightsService.on('message-error', (projectId: string, error: string) => {
  eventBridge.broadcast('insights:error', { projectId, error });
});

insightsService.on('tool-use', (projectId: string, toolName: string, status: string) => {
  eventBridge.broadcast('insights:tool-use', { projectId, toolName, status });
});

// ============================================================================
// Routes - Ultra-thin wrappers around insightsService methods
// ============================================================================

/**
 * Get insights session for a project
 * GET /insights/projects/:projectId/session
 */
router.get('/projects/:projectId/session', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const session = insightsService.loadSession(projectId, project.path);
  return res.json({ success: true, data: session });
});

/**
 * Send message to insights (streaming response via WebSocket)
 * POST /insights/projects/:projectId/message
 */
router.post('/projects/:projectId/message', async (req, res) => {
  const { projectId } = req.params;
  const { message, modelConfig } = req.body as {
    message: string;
    modelConfig?: InsightsModelConfig;
  };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  // Fire and forget - response comes via WebSocket events
  insightsService.sendMessage(projectId, project.path, message, modelConfig);

  return res.json({ success: true, message: 'Message sent, response will stream via WebSocket' });
});

/**
 * Clear insights session
 * POST /insights/projects/:projectId/clear
 */
router.post('/projects/:projectId/clear', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  insightsService.clearSession(projectId, project.path);
  return res.json({ success: true });
});

/**
 * Create task from insights
 * POST /insights/projects/:projectId/tasks
 */
router.post('/projects/:projectId/tasks', async (req, res) => {
  const { projectId } = req.params;
  const { title, description, metadata } = req.body as {
    title: string;
    description: string;
    metadata?: TaskMetadata;
  };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  if (!project.autoBuildPath) {
    return res.json({ success: false, error: 'Auto Claude not initialized for this project' });
  }

  try {
    // Get specs directory path
    const specsDir = path.join(project.path, project.autoBuildPath, 'specs');

    // Find next available spec number
    let specNumber = 1;
    if (existsSync(specsDir)) {
      const existingDirs = readdirSync(specsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      const existingNumbers = existingDirs
        .map(name => {
          const match = name.match(/^(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

      if (existingNumbers.length > 0) {
        specNumber = Math.max(...existingNumbers) + 1;
      }
    }

    // Create spec ID with zero-padded number and slugified title
    const slugifiedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    const specId = `${String(specNumber).padStart(3, '0')}-${slugifiedTitle}`;

    // Create spec directory
    const specDir = path.join(specsDir, specId);
    mkdirSync(specDir, { recursive: true });

    // Build metadata with source type
    const taskMetadata: TaskMetadata = {
      sourceType: 'insights',
      ...metadata
    };

    // Create initial implementation_plan.json
    const now = new Date().toISOString();
    const implementationPlan = {
      feature: title,
      description: description,
      created_at: now,
      updated_at: now,
      status: 'pending',
      phases: []
    };

    const planPath = path.join(specDir, 'implementation_plan.json');
    writeFileSync(planPath, JSON.stringify(implementationPlan, null, 2));

    // Save task metadata
    const metadataPath = path.join(specDir, 'task_metadata.json');
    writeFileSync(metadataPath, JSON.stringify(taskMetadata, null, 2));

    // Create the task object
    const task = {
      id: specId,
      specId: specId,
      projectId,
      title,
      description,
      status: 'backlog',
      subtasks: [],
      logs: [],
      metadata: taskMetadata,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return res.json({ success: true, data: task });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create task'
    });
  }
});

/**
 * List all sessions
 * GET /insights/projects/:projectId/sessions
 */
router.get('/projects/:projectId/sessions', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const sessions = insightsService.listSessions(project.path);
  return res.json({ success: true, data: sessions });
});

/**
 * Create new session
 * POST /insights/projects/:projectId/sessions
 */
router.post('/projects/:projectId/sessions', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const newSession = insightsService.createNewSession(projectId, project.path);
  return res.json({ success: true, data: newSession });
});

/**
 * Switch to a different session
 * POST /insights/projects/:projectId/sessions/:sessionId/switch
 */
router.post('/projects/:projectId/sessions/:sessionId/switch', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const switched = insightsService.switchSession(projectId, project.path, sessionId);
  return res.json({ success: switched });
});

/**
 * Delete a session
 * DELETE /insights/projects/:projectId/sessions/:sessionId
 */
router.delete('/projects/:projectId/sessions/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const deleted = insightsService.deleteSession(projectId, project.path, sessionId);
  return res.json({ success: deleted });
});

/**
 * Rename a session
 * PUT /insights/projects/:projectId/sessions/:sessionId
 */
router.put('/projects/:projectId/sessions/:sessionId', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const { title } = req.body as { title: string };
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const renamed = insightsService.renameSession(project.path, sessionId, title);
  return res.json({ success: renamed });
});

/**
 * Update session model config
 * PUT /insights/projects/:projectId/sessions/:sessionId/model-config
 */
router.put('/projects/:projectId/sessions/:sessionId/model-config', async (req, res) => {
  const { projectId, sessionId } = req.params;
  const modelConfig = req.body as InsightsModelConfig;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const updated = insightsService.updateSessionModelConfig(project.path, sessionId, modelConfig);
  return res.json({ success: updated });
});

export default router;
