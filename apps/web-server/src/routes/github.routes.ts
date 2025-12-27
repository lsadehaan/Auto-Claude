/**
 * GitHub Routes
 *
 * Thin Express wrappers for GitHub integration.
 * Uses existing utility functions, keeps routes minimal.
 */

import { Router } from 'express';
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { projectService } from '../services/project-service.js';
import { getAugmentedEnv, parseEnvFile, isCommandAvailable } from '../utils/env-utils.js';

const router = Router();

// ============================================================================
// Types (from @electron/ipc-handlers/github/types)
// ============================================================================

interface GitHubConfig {
  token: string;
  repo: string;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: Array<{ id: number; name: string; color: string; description?: string }>;
  assignees: Array<{ login: string; avatarUrl?: string }>;
  author: { login: string; avatarUrl?: string };
  milestone?: { id: number; title: string; state: 'open' | 'closed' };
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  commentsCount: number;
  url: string;
  htmlUrl: string;
  repoFullName: string;
}

// ============================================================================
// Pure Utilities (adapted from @electron/ipc-handlers/github/utils)
// ============================================================================

function getTokenFromGhCli(): string | null {
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: getAugmentedEnv()
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}

function getGitHubConfig(projectPath: string, autoBuildPath?: string): GitHubConfig | null {
  if (!autoBuildPath) return null;
  const envPath = path.join(projectPath, autoBuildPath, '.env');
  if (!existsSync(envPath)) return null;

  try {
    const content = readFileSync(envPath, 'utf-8');
    const vars = parseEnvFile(content);
    let token: string | undefined = vars['GITHUB_TOKEN'];
    const repo = vars['GITHUB_REPO'];

    if (!token) {
      const ghToken = getTokenFromGhCli();
      if (ghToken) token = ghToken;
    }

    if (!token || !repo) return null;
    return { token, repo };
  } catch {
    return null;
  }
}

function normalizeRepoReference(repo: string): string {
  if (!repo) return '';
  let normalized = repo.replace(/\.git$/, '');
  if (normalized.startsWith('https://github.com/')) {
    normalized = normalized.replace('https://github.com/', '');
  } else if (normalized.startsWith('git@github.com:')) {
    normalized = normalized.replace('git@github.com:', '');
  }
  return normalized.trim();
}

async function githubFetch(token: string, endpoint: string, options: RequestInit = {}): Promise<unknown> {
  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Auto-Claude-UI',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

function transformIssue(apiIssue: any, repoFullName: string): GitHubIssue {
  return {
    id: apiIssue.id,
    number: apiIssue.number,
    title: apiIssue.title,
    body: apiIssue.body,
    state: apiIssue.state,
    labels: apiIssue.labels || [],
    assignees: (apiIssue.assignees || []).map((a: any) => ({
      login: a.login,
      avatarUrl: a.avatar_url
    })),
    author: {
      login: apiIssue.user?.login || 'unknown',
      avatarUrl: apiIssue.user?.avatar_url
    },
    milestone: apiIssue.milestone,
    createdAt: apiIssue.created_at,
    updatedAt: apiIssue.updated_at,
    closedAt: apiIssue.closed_at,
    commentsCount: apiIssue.comments || 0,
    url: apiIssue.url,
    htmlUrl: apiIssue.html_url,
    repoFullName
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Get GitHub sync status
 * GET /github/projects/:projectId/status
 */
router.get('/projects/:projectId/status', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const config = getGitHubConfig(project.path, project.autoBuildPath);
  const ghAvailable = isCommandAvailable('gh');

  return res.json({
    success: true,
    data: {
      connected: config !== null,
      ghCliAvailable: ghAvailable,
      repo: config?.repo ? normalizeRepoReference(config.repo) : undefined
    }
  });
});

/**
 * Get GitHub issues
 * GET /github/projects/:projectId/issues
 */
router.get('/projects/:projectId/issues', async (req, res) => {
  const { projectId } = req.params;
  const { state = 'open', labels, per_page = '30', page = '1' } = req.query as Record<string, string>;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const config = getGitHubConfig(project.path, project.autoBuildPath);
  if (!config) {
    return res.json({ success: false, error: 'GitHub not configured for this project' });
  }

  try {
    const repoFullName = normalizeRepoReference(config.repo);
    let endpoint = `/repos/${repoFullName}/issues?state=${state}&per_page=${per_page}&page=${page}`;
    if (labels) endpoint += `&labels=${encodeURIComponent(labels)}`;

    const apiIssues = await githubFetch(config.token, endpoint) as any[];

    // Filter out pull requests
    const issues = apiIssues
      .filter((issue: any) => !issue.pull_request)
      .map((issue: any) => transformIssue(issue, repoFullName));

    return res.json({ success: true, data: issues });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch issues'
    });
  }
});

/**
 * Get single issue with comments
 * GET /github/projects/:projectId/issues/:issueNumber
 */
router.get('/projects/:projectId/issues/:issueNumber', async (req, res) => {
  const { projectId, issueNumber } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const config = getGitHubConfig(project.path, project.autoBuildPath);
  if (!config) {
    return res.json({ success: false, error: 'GitHub not configured' });
  }

  try {
    const repoFullName = normalizeRepoReference(config.repo);

    const [issue, comments] = await Promise.all([
      githubFetch(config.token, `/repos/${repoFullName}/issues/${issueNumber}`),
      githubFetch(config.token, `/repos/${repoFullName}/issues/${issueNumber}/comments`)
    ]);

    return res.json({
      success: true,
      data: {
        issue: transformIssue(issue, repoFullName),
        comments: (comments as any[]).map((c: any) => ({
          id: c.id,
          body: c.body,
          author: { login: c.user?.login, avatarUrl: c.user?.avatar_url },
          createdAt: c.created_at,
          updatedAt: c.updated_at
        }))
      }
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch issue'
    });
  }
});

/**
 * Create an issue
 * POST /github/projects/:projectId/issues
 */
router.post('/projects/:projectId/issues', async (req, res) => {
  const { projectId } = req.params;
  const { title, body, labels } = req.body;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const config = getGitHubConfig(project.path, project.autoBuildPath);
  if (!config) {
    return res.json({ success: false, error: 'GitHub not configured' });
  }

  try {
    const repoFullName = normalizeRepoReference(config.repo);
    const issue = await githubFetch(config.token, `/repos/${repoFullName}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, labels })
    });

    return res.json({ success: true, data: transformIssue(issue, repoFullName) });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create issue'
    });
  }
});

/**
 * Update issue state (close/reopen)
 * PATCH /github/projects/:projectId/issues/:issueNumber
 */
router.patch('/projects/:projectId/issues/:issueNumber', async (req, res) => {
  const { projectId, issueNumber } = req.params;
  const { state } = req.body;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const config = getGitHubConfig(project.path, project.autoBuildPath);
  if (!config) {
    return res.json({ success: false, error: 'GitHub not configured' });
  }

  try {
    const repoFullName = normalizeRepoReference(config.repo);
    const issue = await githubFetch(config.token, `/repos/${repoFullName}/issues/${issueNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state })
    });

    return res.json({ success: true, data: transformIssue(issue, repoFullName) });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update issue'
    });
  }
});

/**
 * Get repository info
 * GET /github/projects/:projectId/repository
 */
router.get('/projects/:projectId/repository', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const config = getGitHubConfig(project.path, project.autoBuildPath);
  if (!config) {
    return res.json({ success: false, error: 'GitHub not configured' });
  }

  try {
    const repoFullName = normalizeRepoReference(config.repo);
    const repo = await githubFetch(config.token, `/repos/${repoFullName}`) as any;

    return res.json({
      success: true,
      data: {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch,
        private: repo.private,
        owner: {
          login: repo.owner?.login,
          avatarUrl: repo.owner?.avatar_url
        }
      }
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch repository'
    });
  }
});

/**
 * Get releases
 * GET /github/projects/:projectId/releases
 */
router.get('/projects/:projectId/releases', async (req, res) => {
  const { projectId } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const config = getGitHubConfig(project.path, project.autoBuildPath);
  if (!config) {
    return res.json({ success: false, error: 'GitHub not configured' });
  }

  try {
    const repoFullName = normalizeRepoReference(config.repo);
    const releases = await githubFetch(config.token, `/repos/${repoFullName}/releases`);
    return res.json({ success: true, data: releases });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch releases'
    });
  }
});

/**
 * Create a release
 * POST /github/projects/:projectId/releases
 */
router.post('/projects/:projectId/releases', async (req, res) => {
  const { projectId } = req.params;
  const { tag_name, name, body, draft = false, prerelease = false } = req.body;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const config = getGitHubConfig(project.path, project.autoBuildPath);
  if (!config) {
    return res.json({ success: false, error: 'GitHub not configured' });
  }

  try {
    const repoFullName = normalizeRepoReference(config.repo);
    const release = await githubFetch(config.token, `/repos/${repoFullName}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name, name, body, draft, prerelease })
    });

    return res.json({ success: true, data: release });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create release'
    });
  }
});

/**
 * Import issue as task
 * POST /github/projects/:projectId/issues/:issueNumber/import
 */
router.post('/projects/:projectId/issues/:issueNumber/import', async (req, res) => {
  const { projectId, issueNumber } = req.params;
  const project = projectService.getProject(projectId);

  if (!project) {
    return res.json({ success: false, error: 'Project not found' });
  }

  const config = getGitHubConfig(project.path, project.autoBuildPath);
  if (!config) {
    return res.json({ success: false, error: 'GitHub not configured' });
  }

  try {
    const repoFullName = normalizeRepoReference(config.repo);

    // Fetch issue details
    const [issue, comments] = await Promise.all([
      githubFetch(config.token, `/repos/${repoFullName}/issues/${issueNumber}`) as Promise<any>,
      githubFetch(config.token, `/repos/${repoFullName}/issues/${issueNumber}/comments`) as Promise<any[]>
    ]);

    // Format issue for task import
    const taskDescription = `
# GitHub Issue #${issue.number}: ${issue.title}

**Repository:** ${repoFullName}
**Author:** @${issue.user?.login}
**Created:** ${issue.created_at}
**Labels:** ${(issue.labels || []).map((l: any) => l.name).join(', ') || 'None'}

## Issue Description

${issue.body || 'No description provided.'}

${comments.length > 0 ? `
## Comments (${comments.length})

${comments.map((c: any) => `### @${c.user?.login} (${c.created_at})
${c.body}`).join('\n\n')}
` : ''}
`.trim();

    return res.json({
      success: true,
      data: {
        title: `[GH-${issue.number}] ${issue.title}`,
        description: taskDescription,
        issueNumber: issue.number,
        issueUrl: issue.html_url
      }
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import issue'
    });
  }
});

export default router;
