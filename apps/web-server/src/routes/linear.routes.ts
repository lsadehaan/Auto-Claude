/**
 * Linear Routes
 *
 * Handles Linear integration for project management.
 * Migrated from: apps/frontend/src/main/ipc-handlers/linear-handlers.ts
 */

import { Router } from 'express';
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import { projectService } from '../services/project-service.js';
import { agentService } from '../services/agent-service.js';
import { parseEnvFile } from '../utils/env-utils.js';

const router = Router();

// Types for Linear API responses
interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

interface LinearProject {
  id: string;
  name: string;
  state: string;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: { id: string; name: string; type: string };
  priority: number;
  priorityLabel: string;
  labels: Array<{ id: string; name: string; color: string }>;
  assignee?: { id: string; name: string; email: string };
  project?: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface LinearSyncStatus {
  connected: boolean;
  teamName?: string;
  issueCount?: number;
  lastSyncedAt?: string;
  error?: string;
}

interface LinearImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors?: string[];
}

/**
 * Get Linear API key from project environment
 */
function getLinearApiKey(projectPath: string, autoBuildPath?: string): string | null {
  if (!autoBuildPath) return null;
  const envPath = path.join(projectPath, autoBuildPath, '.env');
  if (!existsSync(envPath)) return null;

  try {
    const content = readFileSync(envPath, 'utf-8');
    const vars = parseEnvFile(content);
    return vars['LINEAR_API_KEY'] || null;
  } catch {
    return null;
  }
}

/**
 * Make a request to the Linear GraphQL API
 */
async function linearGraphQL(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey
    },
    body: JSON.stringify({ query, variables })
  });

  // Check response.ok first, then try to parse JSON
  // This handles cases where the API returns non-JSON errors (e.g., 503 from proxy)
  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorResult = await response.json() as { errors?: Array<{ message: string }>; error?: string; message?: string };
      errorMessage = errorResult?.errors?.[0]?.message
        || errorResult?.error
        || errorResult?.message
        || response.statusText;
    } catch {
      // JSON parsing failed - use status text as fallback
    }
    throw new Error(`Linear API error: ${response.status} - ${errorMessage}`);
  }

  const result = await response.json() as { data?: unknown; errors?: Array<{ message: string }> };
  if (result.errors) {
    throw new Error(result.errors[0]?.message || 'Linear API error');
  }

  return result.data;
}

// ============================================
// Linear Integration Routes
// ============================================

/**
 * Check Linear connection status for a project
 * GET /linear/projects/:projectId/status
 */
router.get('/projects/:projectId/status', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const apiKey = getLinearApiKey(project.path, project.autoBuildPath);
  if (!apiKey) {
    return res.json({
      success: true,
      data: {
        connected: false,
        error: 'No Linear API key configured'
      } as LinearSyncStatus
    });
  }

  try {
    const query = `
      query {
        viewer {
          id
          name
        }
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    `;

    const data = await linearGraphQL(apiKey, query) as {
      viewer: { id: string; name: string };
      teams: { nodes: Array<{ id: string; name: string; key: string }> };
    };

    // Get issue count for the first team
    let issueCount = 0;
    let teamName: string | undefined;

    if (data.teams.nodes.length > 0) {
      teamName = data.teams.nodes[0].name;

      // Simple count estimation - get first 250 issues
      const countData = await linearGraphQL(apiKey, `
        query($teamId: ID!) {
          issues(filter: { team: { id: { eq: $teamId } } }, first: 250) {
            nodes { id }
          }
        }
      `, { teamId: data.teams.nodes[0].id }) as {
        issues: { nodes: Array<{ id: string }> };
      };
      issueCount = countData.issues.nodes.length;
    }

    return res.json({
      success: true,
      data: {
        connected: true,
        teamName,
        issueCount,
        lastSyncedAt: new Date().toISOString()
      } as LinearSyncStatus
    });
  } catch (error) {
    return res.json({
      success: true,
      data: {
        connected: false,
        error: error instanceof Error ? error.message : 'Failed to connect to Linear'
      } as LinearSyncStatus
    });
  }
});

/**
 * Get Linear teams for a project
 * GET /linear/projects/:projectId/teams
 */
router.get('/projects/:projectId/teams', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const apiKey = getLinearApiKey(project.path, project.autoBuildPath);
  if (!apiKey) {
    return res.json({ success: false, error: 'No Linear API key configured' });
  }

  try {
    const query = `
      query {
        teams {
          nodes {
            id
            name
            key
          }
        }
      }
    `;

    const data = await linearGraphQL(apiKey, query) as {
      teams: { nodes: LinearTeam[] };
    };

    return res.json({ success: true, data: data.teams.nodes });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch teams'
    });
  }
});

/**
 * Get Linear projects for a team
 * GET /linear/projects/:projectId/teams/:teamId/projects
 */
router.get('/projects/:projectId/teams/:teamId/projects', async (req, res) => {
  const { projectId, teamId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const apiKey = getLinearApiKey(project.path, project.autoBuildPath);
  if (!apiKey) {
    return res.json({ success: false, error: 'No Linear API key configured' });
  }

  try {
    const query = `
      query($teamId: ID!) {
        team(id: $teamId) {
          projects {
            nodes {
              id
              name
              state
            }
          }
        }
      }
    `;

    const data = await linearGraphQL(apiKey, query, { teamId }) as {
      team: { projects: { nodes: LinearProject[] } };
    };

    return res.json({ success: true, data: data.team.projects.nodes });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch projects'
    });
  }
});

/**
 * Get Linear issues for a project (optionally filtered by team/project)
 * GET /linear/projects/:projectId/issues
 */
router.get('/projects/:projectId/issues', async (req, res) => {
  const { projectId } = req.params;
  const { teamId, linearProjectId } = req.query as { teamId?: string; linearProjectId?: string };

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const apiKey = getLinearApiKey(project.path, project.autoBuildPath);
  if (!apiKey) {
    return res.json({ success: false, error: 'No Linear API key configured' });
  }

  try {
    // Build filter using GraphQL variables for safety
    const variables: Record<string, string> = {};
    const filterParts: string[] = [];
    const variableDeclarations: string[] = [];

    if (teamId) {
      variables.teamId = teamId;
      variableDeclarations.push('$teamId: ID!');
      filterParts.push('team: { id: { eq: $teamId } }');
    }
    if (linearProjectId) {
      variables.linearProjectId = linearProjectId;
      variableDeclarations.push('$linearProjectId: ID!');
      filterParts.push('project: { id: { eq: $linearProjectId } }');
    }

    const variablesDef = variableDeclarations.length > 0 ? `(${variableDeclarations.join(', ')})` : '';
    const filterClause = filterParts.length > 0 ? `filter: { ${filterParts.join(', ')} }, ` : '';

    const query = `
      query${variablesDef} {
        issues(${filterClause}first: 250, orderBy: updatedAt) {
          nodes {
            id
            identifier
            title
            description
            state {
              id
              name
              type
            }
            priority
            priorityLabel
            labels {
              nodes {
                id
                name
                color
              }
            }
            assignee {
              id
              name
              email
            }
            project {
              id
              name
            }
            createdAt
            updatedAt
            url
          }
        }
      }
    `;

    const data = await linearGraphQL(apiKey, query, variables) as {
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          description?: string;
          state: { id: string; name: string; type: string };
          priority: number;
          priorityLabel: string;
          labels: { nodes: Array<{ id: string; name: string; color: string }> };
          assignee?: { id: string; name: string; email: string };
          project?: { id: string; name: string };
          createdAt: string;
          updatedAt: string;
          url: string;
        }>;
      };
    };

    // Transform to our LinearIssue format
    const issues: LinearIssue[] = data.issues.nodes.map(issue => ({
      ...issue,
      labels: issue.labels.nodes
    }));

    return res.json({ success: true, data: issues });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch issues'
    });
  }
});

/**
 * Import Linear issues as tasks
 * POST /linear/projects/:projectId/import
 */
router.post('/projects/:projectId/import', async (req, res) => {
  const { projectId } = req.params;
  const { issueIds } = req.body as { issueIds: string[] };

  if (!issueIds || !Array.isArray(issueIds) || issueIds.length === 0) {
    return res.json({ success: false, error: 'No issue IDs provided' });
  }

  const project = projectService.getProject(projectId);
  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const apiKey = getLinearApiKey(project.path, project.autoBuildPath);
  if (!apiKey) {
    return res.json({ success: false, error: 'No Linear API key configured' });
  }

  try {
    // First, fetch the full details of selected issues
    const query = `
      query($ids: [ID!]!) {
        issues(filter: { id: { in: $ids } }) {
          nodes {
            id
            identifier
            title
            description
            state {
              id
              name
              type
            }
            priority
            priorityLabel
            labels {
              nodes {
                id
                name
                color
              }
            }
            url
          }
        }
      }
    `;

    const data = await linearGraphQL(apiKey, query, { ids: issueIds }) as {
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          description?: string;
          state: { id: string; name: string; type: string };
          priority: number;
          priorityLabel: string;
          labels: { nodes: Array<{ id: string; name: string; color: string }> };
          url: string;
        }>;
      };
    };

    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    // Set up specs directory
    const autoBuildPath = project.autoBuildPath || '.auto-claude';
    const specsDir = path.join(project.path, autoBuildPath, 'specs');
    if (!existsSync(specsDir)) {
      mkdirSync(specsDir, { recursive: true });
    }

    // Create tasks for each imported issue
    for (const issue of data.issues.nodes) {
      try {
        // Build description from Linear issue
        const labels = issue.labels.nodes.map(l => l.name).join(', ');
        const description = `# ${issue.title}

**Linear Issue:** [${issue.identifier}](${issue.url})
**Priority:** ${issue.priorityLabel}
**Status:** ${issue.state.name}
${labels ? `**Labels:** ${labels}` : ''}

## Description

${issue.description || 'No description provided.'}
`;

        // Find next available spec number
        let specNumber = 1;
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

        // Create spec ID with zero-padded number and slugified title
        const slugifiedTitle = issue.title
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
          feature: issue.title,
          description: description,
          created_at: now,
          updated_at: now,
          status: 'pending',
          phases: []
        };
        writeFileSync(path.join(specDir, 'implementation_plan.json'), JSON.stringify(implementationPlan, null, 2));

        // Create requirements.json
        const requirements = {
          task_description: description,
          workflow_type: 'feature'
        };
        writeFileSync(path.join(specDir, 'requirements.json'), JSON.stringify(requirements, null, 2));

        // Build metadata
        const metadata = {
          sourceType: 'linear',
          linearIssueId: issue.id,
          linearIdentifier: issue.identifier,
          linearUrl: issue.url,
          category: 'feature'
        };
        writeFileSync(path.join(specDir, 'task_metadata.json'), JSON.stringify(metadata, null, 2));

        // Start spec creation with the existing spec directory
        agentService.startSpecCreation(specId, project.path, description, specDir, metadata);

        imported++;
      } catch (err) {
        failed++;
        errors.push(`Failed to import ${issue.identifier}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return res.json({
      success: true,
      data: {
        success: failed === 0,
        imported,
        failed,
        errors: errors.length > 0 ? errors : undefined
      } as LinearImportResult
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import issues'
    });
  }
});

export default router;
