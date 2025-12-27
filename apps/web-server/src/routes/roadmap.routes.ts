/**
 * Roadmap Routes
 *
 * Handles roadmap generation and management.
 * Migrated from: apps/frontend/src/main/ipc-handlers/roadmap-handlers.ts
 */

import { Router } from 'express';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import { projectService } from '../services/project-service.js';
import { agentService } from '../services/agent-service.js';
import { settingsService } from '../services/settings-service.js';
import { eventBridge } from '../websocket/event-bridge.js';

const router = Router();

// Auto-claude paths
const AUTO_BUILD_PATHS = {
  ROADMAP_DIR: '.auto-claude/roadmap',
  ROADMAP_FILE: 'roadmap.json',
  COMPETITOR_ANALYSIS: 'competitor_analysis.json',
  IMPLEMENTATION_PLAN: 'implementation_plan.json',
  REQUIREMENTS: 'requirements.json',
};

// Default feature model/thinking settings
const DEFAULT_FEATURE_MODELS = {
  roadmap: 'claude-opus-4-5-20251101',
};

const DEFAULT_FEATURE_THINKING = {
  roadmap: 'medium',
};

/**
 * Get feature settings for roadmap
 */
function getFeatureSettings(): { model?: string; thinkingLevel?: string } {
  try {
    const settings = settingsService.getSettings();
    const featureModels = settings?.featureModels || DEFAULT_FEATURE_MODELS;
    const featureThinking = settings?.featureThinking || DEFAULT_FEATURE_THINKING;

    return {
      model: featureModels.roadmap || DEFAULT_FEATURE_MODELS.roadmap,
      thinkingLevel: featureThinking.roadmap || DEFAULT_FEATURE_THINKING.roadmap,
    };
  } catch {
    return {
      model: DEFAULT_FEATURE_MODELS.roadmap,
      thinkingLevel: DEFAULT_FEATURE_THINKING.roadmap,
    };
  }
}

/**
 * Transform snake_case roadmap to camelCase for frontend
 */
function transformRoadmap(rawRoadmap: Record<string, unknown>, projectId: string, projectName: string): Record<string, unknown> {
  return {
    id: rawRoadmap.id || `roadmap-${Date.now()}`,
    projectId,
    projectName: rawRoadmap.project_name || projectName,
    version: rawRoadmap.version || '1.0',
    vision: rawRoadmap.vision || '',
    targetAudience: {
      primary: (rawRoadmap.target_audience as Record<string, unknown>)?.primary || '',
      secondary: (rawRoadmap.target_audience as Record<string, unknown>)?.secondary || [],
    },
    phases: ((rawRoadmap.phases as Array<Record<string, unknown>>) || []).map((phase) => ({
      id: phase.id,
      name: phase.name,
      description: phase.description,
      order: phase.order,
      status: phase.status || 'planned',
      features: phase.features || [],
      milestones: ((phase.milestones as Array<Record<string, unknown>>) || []).map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        features: m.features || [],
        status: m.status || 'planned',
        targetDate: m.target_date ? new Date(m.target_date as string) : undefined,
      })),
    })),
    features: ((rawRoadmap.features as Array<Record<string, unknown>>) || []).map((feature) => ({
      id: feature.id,
      title: feature.title,
      description: feature.description,
      rationale: feature.rationale || '',
      priority: feature.priority || 'should',
      complexity: feature.complexity || 'medium',
      impact: feature.impact || 'medium',
      phaseId: feature.phase_id,
      dependencies: feature.dependencies || [],
      status: feature.status || 'under_review',
      acceptanceCriteria: feature.acceptance_criteria || [],
      userStories: feature.user_stories || [],
      linkedSpecId: feature.linked_spec_id,
      competitorInsightIds: (feature.competitor_insight_ids as string[]) || undefined,
    })),
    status: rawRoadmap.status || 'draft',
    createdAt: (rawRoadmap.metadata as Record<string, unknown>)?.created_at
      ? new Date((rawRoadmap.metadata as Record<string, unknown>).created_at as string)
      : new Date(),
    updatedAt: (rawRoadmap.metadata as Record<string, unknown>)?.updated_at
      ? new Date((rawRoadmap.metadata as Record<string, unknown>).updated_at as string)
      : new Date(),
  };
}

/**
 * Transform snake_case competitor analysis to camelCase
 */
function transformCompetitorAnalysis(rawCompetitor: Record<string, unknown>): Record<string, unknown> {
  return {
    projectContext: {
      projectName: (rawCompetitor.project_context as Record<string, unknown>)?.project_name || '',
      projectType: (rawCompetitor.project_context as Record<string, unknown>)?.project_type || '',
      targetAudience: (rawCompetitor.project_context as Record<string, unknown>)?.target_audience || '',
    },
    competitors: ((rawCompetitor.competitors as Array<Record<string, unknown>>) || []).map((c) => ({
      id: c.id,
      name: c.name,
      url: c.url,
      description: c.description,
      relevance: c.relevance || 'medium',
      painPoints: ((c.pain_points as Array<Record<string, unknown>>) || []).map((p) => ({
        id: p.id,
        description: p.description,
        source: p.source,
        severity: p.severity || 'medium',
        frequency: p.frequency || '',
        opportunity: p.opportunity || '',
      })),
      strengths: (c.strengths as string[]) || [],
      marketPosition: (c.market_position as string) || '',
    })),
    marketGaps: ((rawCompetitor.market_gaps as Array<Record<string, unknown>>) || []).map((g) => ({
      id: g.id,
      description: g.description,
      affectedCompetitors: (g.affected_competitors as string[]) || [],
      opportunitySize: g.opportunity_size || 'medium',
      suggestedFeature: (g.suggested_feature as string) || '',
    })),
    insightsSummary: {
      topPainPoints: (rawCompetitor.insights_summary as Record<string, unknown>)?.top_pain_points || [],
      differentiatorOpportunities: (rawCompetitor.insights_summary as Record<string, unknown>)?.differentiator_opportunities || [],
      marketTrends: (rawCompetitor.insights_summary as Record<string, unknown>)?.market_trends || [],
    },
    researchMetadata: {
      searchQueriesUsed: (rawCompetitor.research_metadata as Record<string, unknown>)?.search_queries_used || [],
      sourcesConsulted: (rawCompetitor.research_metadata as Record<string, unknown>)?.sources_consulted || [],
      limitations: (rawCompetitor.research_metadata as Record<string, unknown>)?.limitations || [],
    },
    createdAt: (rawCompetitor.metadata as Record<string, unknown>)?.created_at
      ? new Date((rawCompetitor.metadata as Record<string, unknown>).created_at as string)
      : new Date(),
  };
}

// ============================================
// Roadmap Routes
// ============================================

/**
 * Get roadmap for a project
 * GET /roadmap/projects/:projectId
 */
router.get('/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const roadmapPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.ROADMAP_DIR,
    AUTO_BUILD_PATHS.ROADMAP_FILE
  );

  if (!existsSync(roadmapPath)) {
    return res.json({ success: true, data: null });
  }

  try {
    const content = readFileSync(roadmapPath, 'utf-8');
    const rawRoadmap = JSON.parse(content);

    // Load competitor analysis if available
    const competitorAnalysisPath = path.join(
      project.path,
      AUTO_BUILD_PATHS.ROADMAP_DIR,
      AUTO_BUILD_PATHS.COMPETITOR_ANALYSIS
    );

    let competitorAnalysis: Record<string, unknown> | undefined;
    if (existsSync(competitorAnalysisPath)) {
      try {
        const competitorContent = readFileSync(competitorAnalysisPath, 'utf-8');
        const rawCompetitor = JSON.parse(competitorContent);
        competitorAnalysis = transformCompetitorAnalysis(rawCompetitor);
      } catch {
        // Ignore competitor analysis parsing errors - it's optional
      }
    }

    const roadmap = transformRoadmap(rawRoadmap, projectId, project.name);
    if (competitorAnalysis) {
      roadmap.competitorAnalysis = competitorAnalysis;
    }

    return res.json({ success: true, data: roadmap });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read roadmap',
    });
  }
});

/**
 * Get roadmap generation status
 * GET /roadmap/projects/:projectId/status
 */
router.get('/projects/:projectId/status', async (req, res) => {
  const { projectId } = req.params;
  const isRunning = agentService.isRoadmapRunning(projectId);

  return res.json({
    success: true,
    data: { isRunning },
  });
});

/**
 * Start roadmap generation
 * POST /roadmap/projects/:projectId/generate
 */
router.post('/projects/:projectId/generate', async (req, res) => {
  const { projectId } = req.params;
  const { enableCompetitorAnalysis, refreshCompetitorAnalysis } = req.body as {
    enableCompetitorAnalysis?: boolean;
    refreshCompetitorAnalysis?: boolean;
  };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const featureSettings = getFeatureSettings();
  const config = {
    model: featureSettings.model,
    thinkingLevel: featureSettings.thinkingLevel,
  };

  const result = agentService.startRoadmapGeneration(
    projectId,
    project.path,
    false, // not a refresh
    enableCompetitorAnalysis ?? false,
    refreshCompetitorAnalysis ?? false,
    config
  );

  if (!result.success) {
    return res.json(result);
  }

  // Broadcast initial progress
  eventBridge.broadcast('roadmap:progress', {
    projectId,
    status: {
      phase: 'analyzing',
      progress: 10,
      message: 'Analyzing project structure...',
    },
  });

  return res.json({ success: true });
});

/**
 * Refresh roadmap
 * POST /roadmap/projects/:projectId/refresh
 */
router.post('/projects/:projectId/refresh', async (req, res) => {
  const { projectId } = req.params;
  const { enableCompetitorAnalysis, refreshCompetitorAnalysis } = req.body as {
    enableCompetitorAnalysis?: boolean;
    refreshCompetitorAnalysis?: boolean;
  };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const featureSettings = getFeatureSettings();
  const config = {
    model: featureSettings.model,
    thinkingLevel: featureSettings.thinkingLevel,
  };

  const result = agentService.startRoadmapGeneration(
    projectId,
    project.path,
    true, // this is a refresh
    enableCompetitorAnalysis ?? false,
    refreshCompetitorAnalysis ?? false,
    config
  );

  if (!result.success) {
    return res.json(result);
  }

  // Broadcast initial progress
  eventBridge.broadcast('roadmap:progress', {
    projectId,
    status: {
      phase: 'analyzing',
      progress: 10,
      message: 'Refreshing roadmap...',
    },
  });

  return res.json({ success: true });
});

/**
 * Stop roadmap generation
 * POST /roadmap/projects/:projectId/stop
 */
router.post('/projects/:projectId/stop', async (req, res) => {
  const { projectId } = req.params;

  const wasStopped = agentService.stopRoadmap(projectId);

  if (wasStopped) {
    eventBridge.broadcast('roadmap:stopped', { projectId });
  }

  return res.json({ success: wasStopped });
});

/**
 * Save roadmap (full state persistence for drag-and-drop)
 * PUT /roadmap/projects/:projectId
 */
router.put('/projects/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const roadmapData = req.body as Record<string, unknown>;

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const roadmapPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.ROADMAP_DIR,
    AUTO_BUILD_PATHS.ROADMAP_FILE
  );

  if (!existsSync(roadmapPath)) {
    return res.json({ success: false, error: 'Roadmap not found' });
  }

  try {
    const content = readFileSync(roadmapPath, 'utf-8');
    const existingRoadmap = JSON.parse(content);

    // Transform camelCase features back to snake_case for JSON file
    const features = roadmapData.features as Array<Record<string, unknown>>;
    existingRoadmap.features = features.map((feature) => ({
      id: feature.id,
      title: feature.title,
      description: feature.description,
      rationale: feature.rationale || '',
      priority: feature.priority,
      complexity: feature.complexity,
      impact: feature.impact,
      phase_id: feature.phaseId,
      dependencies: feature.dependencies || [],
      status: feature.status,
      acceptance_criteria: feature.acceptanceCriteria || [],
      user_stories: feature.userStories || [],
      linked_spec_id: feature.linkedSpecId,
      competitor_insight_ids: feature.competitorInsightIds,
    }));

    // Update metadata timestamp
    existingRoadmap.metadata = existingRoadmap.metadata || {};
    existingRoadmap.metadata.updated_at = new Date().toISOString();

    writeFileSync(roadmapPath, JSON.stringify(existingRoadmap, null, 2));

    return res.json({ success: true });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save roadmap',
    });
  }
});

/**
 * Update feature status
 * PUT /roadmap/projects/:projectId/features/:featureId
 */
router.put('/projects/:projectId/features/:featureId', async (req, res) => {
  const { projectId, featureId } = req.params;
  const { status } = req.body as { status: string };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const roadmapPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.ROADMAP_DIR,
    AUTO_BUILD_PATHS.ROADMAP_FILE
  );

  if (!existsSync(roadmapPath)) {
    return res.json({ success: false, error: 'Roadmap not found' });
  }

  try {
    const content = readFileSync(roadmapPath, 'utf-8');
    const roadmap = JSON.parse(content);

    // Find and update the feature
    const feature = roadmap.features?.find((f: { id: string }) => f.id === featureId);
    if (!feature) {
      return res.json({ success: false, error: 'Feature not found' });
    }

    feature.status = status;
    roadmap.metadata = roadmap.metadata || {};
    roadmap.metadata.updated_at = new Date().toISOString();

    writeFileSync(roadmapPath, JSON.stringify(roadmap, null, 2));

    return res.json({ success: true });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update feature',
    });
  }
});

/**
 * Convert feature to spec/task
 * POST /roadmap/projects/:projectId/features/:featureId/convert
 */
router.post('/projects/:projectId/features/:featureId/convert', async (req, res) => {
  const { projectId, featureId } = req.params;

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const roadmapPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.ROADMAP_DIR,
    AUTO_BUILD_PATHS.ROADMAP_FILE
  );

  if (!existsSync(roadmapPath)) {
    return res.json({ success: false, error: 'Roadmap not found' });
  }

  try {
    const content = readFileSync(roadmapPath, 'utf-8');
    const roadmap = JSON.parse(content);

    // Find the feature
    const feature = roadmap.features?.find((f: { id: string }) => f.id === featureId);
    if (!feature) {
      return res.json({ success: false, error: 'Feature not found' });
    }

    // Build task description from feature
    const taskDescription = `# ${feature.title}

${feature.description}

## Rationale
${feature.rationale || 'N/A'}

## User Stories
${((feature.user_stories as string[]) || []).map((s: string) => `- ${s}`).join('\n') || 'N/A'}

## Acceptance Criteria
${((feature.acceptance_criteria as string[]) || []).map((c: string) => `- [ ] ${c}`).join('\n') || 'N/A'}
`;

    // Generate proper spec directory
    const autoBuildPath = project.autoBuildPath || '.auto-claude';
    const specsDir = path.join(project.path, autoBuildPath, 'specs');

    // Ensure specs directory exists
    if (!existsSync(specsDir)) {
      mkdirSync(specsDir, { recursive: true });
    }

    // Find next available spec number
    let specNumber = 1;
    const existingDirs = existsSync(specsDir)
      ? readdirSync(specsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [];
    const existingNumbers = existingDirs
      .map((name) => {
        const match = name.match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);
    if (existingNumbers.length > 0) {
      specNumber = Math.max(...existingNumbers) + 1;
    }

    // Create spec ID with zero-padded number and slugified title
    const slugifiedTitle = (feature.title as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    const specId = `${String(specNumber).padStart(3, '0')}-${slugifiedTitle}`;

    // Create spec directory
    const specDir = path.join(specsDir, specId);
    mkdirSync(specDir, { recursive: true });

    // Create initial implementation_plan.json
    const now = new Date().toISOString();
    const implementationPlan = {
      feature: feature.title,
      description: taskDescription,
      created_at: now,
      updated_at: now,
      status: 'pending',
      phases: [],
    };
    writeFileSync(
      path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN),
      JSON.stringify(implementationPlan, null, 2)
    );

    // Create requirements.json
    const requirements = {
      task_description: taskDescription,
      workflow_type: 'feature',
    };
    writeFileSync(
      path.join(specDir, AUTO_BUILD_PATHS.REQUIREMENTS),
      JSON.stringify(requirements, null, 2)
    );

    // Build metadata
    const metadata = {
      sourceType: 'roadmap',
      featureId: feature.id,
      category: 'feature',
    };
    writeFileSync(path.join(specDir, 'task_metadata.json'), JSON.stringify(metadata, null, 2));

    // Update feature with linked spec
    feature.status = 'planned';
    feature.linked_spec_id = specId;
    roadmap.metadata = roadmap.metadata || {};
    roadmap.metadata.updated_at = new Date().toISOString();
    writeFileSync(roadmapPath, JSON.stringify(roadmap, null, 2));

    // Create task object
    const task = {
      id: specId,
      specId: specId,
      projectId,
      title: feature.title,
      description: taskDescription,
      status: 'backlog',
      subtasks: [],
      logs: [],
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return res.json({ success: true, data: task });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert feature to spec',
    });
  }
});

// ============================================
// Wire agentService events to eventBridge
// ============================================

agentService.on('roadmap-progress', (projectId: string, status: Record<string, unknown>) => {
  eventBridge.broadcast('roadmap:progress', { projectId, status });
});

agentService.on('roadmap-complete', (projectId: string) => {
  // Read the generated roadmap and broadcast it
  const project = projectService.getProject(projectId);
  if (project) {
    const roadmapPath = path.join(
      project.path,
      AUTO_BUILD_PATHS.ROADMAP_DIR,
      AUTO_BUILD_PATHS.ROADMAP_FILE
    );

    if (existsSync(roadmapPath)) {
      try {
        const content = readFileSync(roadmapPath, 'utf-8');
        const rawRoadmap = JSON.parse(content);
        const roadmap = transformRoadmap(rawRoadmap, projectId, project.name);
        eventBridge.broadcast('roadmap:complete', { projectId, roadmap });
      } catch {
        eventBridge.broadcast('roadmap:complete', { projectId });
      }
    } else {
      eventBridge.broadcast('roadmap:complete', { projectId });
    }
  } else {
    eventBridge.broadcast('roadmap:complete', { projectId });
  }
});

agentService.on('roadmap-error', (projectId: string, error: string) => {
  eventBridge.broadcast('roadmap:error', { projectId, error });
});

agentService.on('roadmap-log', (projectId: string, log: string) => {
  eventBridge.broadcast('roadmap:log', { projectId, log });
});

export default router;
