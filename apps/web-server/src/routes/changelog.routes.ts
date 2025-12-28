/**
 * Changelog Routes
 *
 * Ultra-thin Express wrappers that use changelogService directly.
 * Following the same DRY pattern as ideation and insights routes.
 *
 * The bundler aliases @electron/changelog to the Electron codebase,
 * and projectStore is shimmed via tsup, enabling seamless code reuse.
 */

import { Router } from 'express';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { projectService } from '../services/project-service.js';
import { eventBridge } from '../adapters/event-bridge.js';

// Import from wrapper service (avoids __dirname issues with direct import)
import { changelogService } from '../services/changelog-service.js';
import type {
  Task,
  ChangelogGenerationRequest,
  ChangelogSaveRequest,
  GitHistoryOptions,
  BranchDiffOptions,
  GitCommit
} from '../../../frontend/src/shared/types';

const router = Router();

// Helper to get specs directory
function getSpecsDir(autoBuildPath?: string): string {
  return autoBuildPath ? `${autoBuildPath}/specs` : '.auto-claude/specs';
}

// ============================================================================
// Event Wiring - Forward changelogService events to WebSocket clients
// ============================================================================

changelogService.on('generation-progress', (projectId: string, progress: any) => {
  eventBridge.broadcast('changelog:generation-progress', { projectId, progress });
});

changelogService.on('generation-complete', (projectId: string, result: any) => {
  eventBridge.broadcast('changelog:generation-complete', { projectId, result });
});

changelogService.on('generation-error', (projectId: string, error: string) => {
  eventBridge.broadcast('changelog:generation-error', { projectId, error });
});

changelogService.on('rate-limit', (projectId: string, rateLimitInfo: any) => {
  eventBridge.broadcast('changelog:rate-limit', { projectId, rateLimitInfo });
});

// ============================================================================
// Routes - Ultra-thin wrappers around changelogService methods
// ============================================================================

/**
 * Get completed tasks for changelog
 * GET /changelog/projects/:projectId/tasks
 */
router.get('/projects/:projectId/tasks', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const tasks = projectService.getTasks(projectId);
  const specsBaseDir = getSpecsDir(project.autoBuildPath);
  const doneTasks = changelogService.getCompletedTasks(project.path, tasks, specsBaseDir);

  return res.json({ success: true, data: doneTasks });
});

/**
 * Load task specs for selected tasks
 * POST /changelog/projects/:projectId/specs
 */
router.post('/projects/:projectId/specs', async (req, res) => {
  const { projectId } = req.params;
  const { taskIds } = req.body as { taskIds: string[] };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const tasks = projectService.getTasks(projectId);
  const specsBaseDir = getSpecsDir(project.autoBuildPath);
  const specs = await changelogService.loadTaskSpecs(project.path, taskIds, tasks, specsBaseDir);

  return res.json({ success: true, data: specs });
});

/**
 * Generate changelog (streaming response via WebSocket)
 * POST /changelog/projects/:projectId/generate
 */
router.post('/projects/:projectId/generate', async (req, res) => {
  const { projectId } = req.params;
  const request = req.body as ChangelogGenerationRequest;

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  // Load specs for selected tasks (only in tasks mode)
  let specs: any[] = [];
  if (request.sourceMode === 'tasks' && request.taskIds && request.taskIds.length > 0) {
    const tasks = projectService.getTasks(projectId);
    const specsBaseDir = getSpecsDir(project.autoBuildPath);
    specs = await changelogService.loadTaskSpecs(project.path, request.taskIds, tasks, specsBaseDir);
  }

  // Start generation - response comes via WebSocket events
  changelogService.generateChangelog(projectId, project.path, request, specs);

  return res.json({ success: true, message: 'Generation started, progress will stream via WebSocket' });
});

/**
 * Save changelog
 * POST /changelog/projects/:projectId/save
 */
router.post('/projects/:projectId/save', async (req, res) => {
  const { projectId } = req.params;
  const request = req.body as ChangelogSaveRequest;

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    const result = changelogService.saveChangelog(project.path, request);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save changelog'
    });
  }
});

/**
 * Read existing changelog
 * GET /changelog/projects/:projectId/existing
 */
router.get('/projects/:projectId/existing', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const result = changelogService.readExistingChangelog(project.path);
  return res.json({ success: true, data: result });
});

/**
 * Suggest version from tasks
 * POST /changelog/projects/:projectId/suggest-version
 */
router.post('/projects/:projectId/suggest-version', async (req, res) => {
  const { projectId } = req.params;
  const { taskIds } = req.body as { taskIds: string[] };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    // Get current version from existing changelog
    const existing = changelogService.readExistingChangelog(project.path);
    const currentVersion = existing.lastVersion;

    // Load specs for selected tasks to analyze change types
    const tasks = projectService.getTasks(projectId);
    const specsBaseDir = getSpecsDir(project.autoBuildPath);
    const specs = await changelogService.loadTaskSpecs(project.path, taskIds, tasks, specsBaseDir);

    // Analyze specs and suggest version
    const suggestedVersion = changelogService.suggestVersion(specs, currentVersion);

    // Determine reason for the suggestion
    let reason = 'patch';
    if (currentVersion) {
      const [oldMajor, oldMinor] = currentVersion.split('.').map(Number);
      const [newMajor, newMinor] = suggestedVersion.split('.').map(Number);
      if (newMajor > oldMajor) {
        reason = 'breaking';
      } else if (newMinor > oldMinor) {
        reason = 'feature';
      }
    }

    return res.json({
      success: true,
      data: { version: suggestedVersion, reason }
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to suggest version'
    });
  }
});

/**
 * Suggest version from commits (AI-powered)
 * POST /changelog/projects/:projectId/suggest-version-from-commits
 */
router.post('/projects/:projectId/suggest-version-from-commits', async (req, res) => {
  const { projectId } = req.params;
  const { commits } = req.body as { commits: GitCommit[] };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    // Get current version from existing changelog or git tags
    const existing = changelogService.readExistingChangelog(project.path);
    let currentVersion = existing.lastVersion;

    // If no version in changelog, try to get latest tag
    if (!currentVersion) {
      const tags = changelogService.getTags(project.path);
      if (tags.length > 0) {
        // Extract version from tag name (e.g., "v2.1.0" -> "2.1.0")
        currentVersion = tags[0].name.replace(/^v/, '');
      }
    }

    // Use AI to analyze commits and suggest version
    const result = await changelogService.suggestVersionFromCommits(
      project.path,
      commits,
      currentVersion
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to suggest version from commits'
    });
  }
});

/**
 * Get git branches
 * GET /changelog/projects/:projectId/branches
 */
router.get('/projects/:projectId/branches', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    const branches = changelogService.getBranches(project.path);
    return res.json({ success: true, data: branches });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get branches'
    });
  }
});

/**
 * Get git tags
 * GET /changelog/projects/:projectId/tags
 */
router.get('/projects/:projectId/tags', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    const tags = changelogService.getTags(project.path);
    return res.json({ success: true, data: tags });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tags'
    });
  }
});

/**
 * Get commits preview
 * POST /changelog/projects/:projectId/commits
 */
router.post('/projects/:projectId/commits', async (req, res) => {
  const { projectId } = req.params;
  const { options, mode } = req.body as {
    options: GitHistoryOptions | BranchDiffOptions;
    mode: 'git-history' | 'branch-diff';
  };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    let commits: GitCommit[];

    if (mode === 'git-history') {
      commits = changelogService.getCommits(project.path, options as GitHistoryOptions);
    } else {
      commits = changelogService.getBranchDiffCommits(project.path, options as BranchDiffOptions);
    }

    return res.json({ success: true, data: commits });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get commits preview'
    });
  }
});

/**
 * Save image for changelog
 * POST /changelog/projects/:projectId/images
 */
router.post('/projects/:projectId/images', async (req, res) => {
  const { projectId } = req.params;
  const { imageData, filename } = req.body as { imageData: string; filename: string };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    // Create .github/assets directory if it doesn't exist
    const assetsDir = path.join(project.path, '.github', 'assets');
    if (!existsSync(assetsDir)) {
      mkdirSync(assetsDir, { recursive: true });
    }

    // Save the image (imageData is base64)
    const imageBuffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const imagePath = path.join(assetsDir, filename);
    writeFileSync(imagePath, imageBuffer);

    // Return relative path and URL
    const relativePath = `.github/assets/${filename}`;
    const url = `/.github/assets/${filename}`;

    return res.json({
      success: true,
      data: { relativePath, url }
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save image'
    });
  }
});

/**
 * List saved images
 * GET /changelog/projects/:projectId/images
 */
router.get('/projects/:projectId/images', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  try {
    const assetsDir = path.join(project.path, '.github', 'assets');

    if (!existsSync(assetsDir)) {
      return res.json({ success: true, data: [] });
    }

    const files = readdirSync(assetsDir)
      .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
      .map(f => ({
        filename: f,
        relativePath: `.github/assets/${f}`,
        url: `/.github/assets/${f}`
      }));

    return res.json({ success: true, data: files });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list images'
    });
  }
});

export default router;
