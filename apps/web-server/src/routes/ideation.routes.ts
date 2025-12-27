/**
 * Ideation Routes
 *
 * Ultra-thin Express wrappers that import Electron handlers directly.
 * The bundler (tsup) aliases projectStore to our shim, enabling DI.
 *
 * This is the ideal pattern:
 * - Electron handlers contain all business logic
 * - Routes are just HTTP → handler → response adapters
 * - When Electron code changes, routes automatically get updates
 */

import { Router } from 'express';
import { projectService } from '../services/project-service.js';
import { agentService } from '../services/agent-service.js';
import { eventBridge } from '../adapters/event-bridge.js';

// Import handler functions directly from Electron codebase
// The bundler aliases projectStore to our shim, so these work seamlessly
import {
  getIdeationSession,
  updateIdeaStatus,
  dismissIdea,
  dismissAllIdeas,
  archiveIdea,
  deleteIdea,
  deleteMultipleIdeas,
} from '@electron/ipc-handlers/ideation';

const router = Router();

// ============================================================================
// Routes - Ultra-thin wrappers around Electron handlers
// ============================================================================

/**
 * Get ideation session for a project
 * GET /ideation/projects/:projectId
 */
router.get('/projects/:projectId', async (req, res) => {
  // Handler expects (event, projectId) - we pass null for event
  const result = await getIdeationSession(null as any, req.params.projectId);
  res.json(result);
});

/**
 * Update an idea's status
 * PUT /ideation/projects/:projectId/ideas/:ideaId/status
 */
router.put('/projects/:projectId/ideas/:ideaId/status', async (req, res) => {
  const result = await updateIdeaStatus(
    null as any,
    req.params.projectId,
    req.params.ideaId,
    req.body.status
  );
  res.json(result);
});

/**
 * Dismiss an idea
 * POST /ideation/projects/:projectId/ideas/:ideaId/dismiss
 */
router.post('/projects/:projectId/ideas/:ideaId/dismiss', async (req, res) => {
  const result = await dismissIdea(null as any, req.params.projectId, req.params.ideaId);
  res.json(result);
});

/**
 * Dismiss all ideas
 * POST /ideation/projects/:projectId/dismiss-all
 */
router.post('/projects/:projectId/dismiss-all', async (req, res) => {
  const result = await dismissAllIdeas(null as any, req.params.projectId);
  res.json(result);
});

/**
 * Archive an idea
 * POST /ideation/projects/:projectId/ideas/:ideaId/archive
 */
router.post('/projects/:projectId/ideas/:ideaId/archive', async (req, res) => {
  const result = await archiveIdea(null as any, req.params.projectId, req.params.ideaId);
  res.json(result);
});

/**
 * Delete an idea
 * DELETE /ideation/projects/:projectId/ideas/:ideaId
 */
router.delete('/projects/:projectId/ideas/:ideaId', async (req, res) => {
  const result = await deleteIdea(null as any, req.params.projectId, req.params.ideaId);
  res.json(result);
});

/**
 * Delete multiple ideas
 * POST /ideation/projects/:projectId/delete-multiple
 */
router.post('/projects/:projectId/delete-multiple', async (req, res) => {
  const result = await deleteMultipleIdeas(null as any, req.params.projectId, req.body.ideaIds);
  res.json(result);
});

/**
 * Start ideation generation
 * POST /ideation/projects/:projectId/generate
 *
 * Note: Generation uses agentService which needs special handling
 * since it's not part of the Electron handlers we can import directly
 */
router.post('/projects/:projectId/generate', async (req, res) => {
  const { projectId } = req.params;
  const config = req.body;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    agentService.startIdeationGeneration(projectId, project.path, config);
    return res.json({ success: true });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start ideation',
    });
  }
});

/**
 * Stop ideation generation
 * POST /ideation/projects/:projectId/stop
 */
router.post('/projects/:projectId/stop', async (req, res) => {
  try {
    const stopped = agentService.stopIdeation(req.params.projectId);
    return res.json({ success: true, data: { stopped } });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop ideation',
    });
  }
});

/**
 * Get ideation status
 * GET /ideation/projects/:projectId/status
 */
router.get('/projects/:projectId/status', async (req, res) => {
  try {
    const isRunning = agentService.isIdeationRunning(req.params.projectId);
    return res.json({ success: true, data: { isRunning } });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get ideation status',
    });
  }
});

// ============================================================================
// Event Wiring
// ============================================================================

agentService.on('ideation-progress', (projectId: string, status: unknown) => {
  eventBridge.broadcast('ideation:progress', { projectId, status });
});

agentService.on('ideation-complete', (projectId: string, session: unknown) => {
  eventBridge.broadcast('ideation:complete', { projectId, session });
});

agentService.on('ideation-error', (projectId: string, error: string) => {
  eventBridge.broadcast('ideation:error', { projectId, error });
});

agentService.on('ideation-log', (projectId: string, log: string) => {
  eventBridge.broadcast('ideation:log', { projectId, log });
});

export default router;
