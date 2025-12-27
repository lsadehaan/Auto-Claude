import { Router } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { adaptHandler, argExtractors, type IPCResult } from '../adapters/index.js';
import { projectService, type Project } from '../services/project-service.js';

const router = Router();

// ============================================================================
// Project Types
// ============================================================================

interface ProjectSettings {
  mainBranch?: string;
  autoBuildModel?: string;
  parallelAgents?: number;
}

interface GitStatus {
  isGitRepo: boolean;
  hasCommits: boolean;
  currentBranch: string | null;
}

// Extended project with autoBuildPath for frontend compatibility
interface ExtendedProject extends Project {
  autoBuildPath?: string;
  settings?: ProjectSettings;
}

// ============================================================================
// Git Helpers
// ============================================================================

function getGitBranches(projectPath: string): string[] {
  try {
    const result = execSync('git branch --list --format="%(refname:short)"', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim().split('\n').filter(b => b.trim());
  } catch {
    return [];
  }
}

function getCurrentGitBranch(projectPath: string): string | null {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

function detectMainBranch(projectPath: string): string | null {
  const branches = getGitBranches(projectPath);
  if (branches.length === 0) return null;

  const mainBranchCandidates = ['main', 'master', 'develop', 'dev', 'trunk'];
  for (const candidate of mainBranchCandidates) {
    if (branches.includes(candidate)) {
      return candidate;
    }
  }

  try {
    const result = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const ref = result.trim();
    const match = ref.match(/refs\/remotes\/origin\/(.+)/);
    if (match && branches.includes(match[1])) {
      return match[1];
    }
  } catch {
    // origin/HEAD not set
  }

  return branches[0] || null;
}

function checkGitStatus(projectPath: string, isGitRepo: boolean): GitStatus {
  try {
    // Check if it's a git repo (either from filesystem or persisted settings)
    let hasGitDir = false;
    try {
      execSync('git rev-parse --git-dir', {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      hasGitDir = true;
    } catch {
      hasGitDir = false;
    }

    // Use persisted setting OR filesystem check
    const isRepo = isGitRepo || hasGitDir;

    // Check for commits only if we have git initialized
    let hasCommits = false;
    if (isRepo) {
      try {
        execSync('git rev-parse HEAD', {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        hasCommits = true;
      } catch {
        hasCommits = false;
      }
    }

    return {
      isGitRepo: isRepo,
      hasCommits,
      currentBranch: isRepo ? getCurrentGitBranch(projectPath) : null
    };
  } catch {
    return {
      isGitRepo: isGitRepo, // Use persisted setting even if filesystem check fails
      hasCommits: false,
      currentBranch: null
    };
  }
}

function initializeGit(projectPath: string): { success: boolean; error?: string } {
  try {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';

    execSync('git init', {
      cwd: projectPath,
      encoding: 'utf-8',
      shell,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Create initial commit
    execSync('git add -A && git commit -m "Initial commit" --allow-empty', {
      cwd: projectPath,
      encoding: 'utf-8',
      shell,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return { success: true };
  } catch (error) {
    console.error('[Git Init] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Git initialization failed'
    };
  }
}

// ============================================================================
// Helper to convert Project to ExtendedProject
// ============================================================================

function toExtendedProject(project: Project): ExtendedProject {
  const autoBuildPath = existsSync(path.join(project.path, '.auto-claude'))
    ? '.auto-claude'
    : undefined;

  const settings = projectService.getProjectSettings(project.id);

  return {
    ...project,
    autoBuildPath,
    settings: settings as ProjectSettings | undefined,
  };
}

// ============================================================================
// Handler Functions
// ============================================================================

async function listProjects(): Promise<IPCResult<ExtendedProject[]>> {
  const projects = projectService.listProjects();
  const extendedProjects = projects.map(toExtendedProject);
  return { success: true, data: extendedProjects };
}

async function addProject(body: { path?: string; name?: string; gitUrl?: string; initGit?: boolean }): Promise<IPCResult<ExtendedProject>> {
  try {
    let project: Project;

    if (body.gitUrl) {
      // Clone from git
      project = projectService.cloneProject(body.gitUrl, body.name);
    } else if (body.name) {
      // Create new project
      project = projectService.createProject(body.name, body.initGit !== false);
    } else if (body.path) {
      // Legacy: add existing project by path
      // Check if it exists
      if (!existsSync(body.path)) {
        return { success: false, error: 'Directory does not exist' };
      }

      // Check if it's already in our projects directory
      const existingProject = projectService.getProject(path.basename(body.path));
      if (existingProject) {
        return { success: true, data: toExtendedProject(existingProject) };
      }

      // For now, just return an error - we want all projects in PROJECTS_DIR
      return {
        success: false,
        error: 'Please create a new project or clone from Git. External project paths are not supported.'
      };
    } else {
      return { success: false, error: 'Project name or git URL required' };
    }

    return { success: true, data: toExtendedProject(project) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create project'
    };
  }
}

async function removeProject(id: string): Promise<IPCResult> {
  const success = projectService.deleteProject(id);
  return { success, error: success ? undefined : 'Project not found' };
}

async function getProject(id: string): Promise<IPCResult<ExtendedProject>> {
  const project = projectService.getProject(id);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }
  return { success: true, data: toExtendedProject(project) };
}

async function updateProjectSettings(
  id: string,
  body: { settings: Partial<ProjectSettings> }
): Promise<IPCResult> {
  const success = projectService.updateProjectSettings(id, body.settings);
  if (!success) {
    return { success: false, error: 'Project not found' };
  }
  return { success: true };
}

async function initializeProject(id: string): Promise<IPCResult<{ success: boolean }>> {
  const project = projectService.getProject(id);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  // Create .auto-claude directory
  const autoClaudePath = path.join(project.path, '.auto-claude');
  const specsPath = path.join(autoClaudePath, 'specs');

  try {
    mkdirSync(specsPath, { recursive: true });

    // Save the initialized state so we don't ask again on refresh
    projectService.updateProjectSettings(id, { autoClaudeInitialized: true });

    return { success: true, data: { success: true } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Initialization failed'
    };
  }
}

async function checkProjectVersion(id: string): Promise<IPCResult<{ isInitialized: boolean; updateAvailable: boolean }>> {
  const project = projectService.getProject(id);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const autoClaudePath = path.join(project.path, '.auto-claude');
  const isInitialized = existsSync(autoClaudePath);

  return {
    success: true,
    data: {
      isInitialized,
      updateAvailable: false
    }
  };
}

// ============================================================================
// Routes
// ============================================================================

// Get projects directory
router.get('/directory', adaptHandler(
  async () => ({ success: true, data: projectService.getProjectsDir() }),
  argExtractors.none
));

// List all projects
router.get('/', adaptHandler(listProjects, argExtractors.none));

// Add/create a project
router.post('/', adaptHandler(addProject, argExtractors.bodyAsObject));

// Get a specific project
router.get('/:id', adaptHandler(
  async (id: string) => getProject(id),
  argExtractors.idOnly
));

// Remove a project
router.delete('/:id', adaptHandler(
  async (id: string) => removeProject(id),
  argExtractors.idOnly
));

// Update project settings
router.put('/:id/settings', adaptHandler(
  async (id: string, body: { settings: Partial<ProjectSettings> }) =>
    updateProjectSettings(id, body),
  argExtractors.idAndBody
));

// Initialize project (.auto-claude folder)
router.post('/:id/initialize', adaptHandler(
  async (id: string) => initializeProject(id),
  argExtractors.idOnly
));

// Check project version/initialization status
router.get('/:id/version', adaptHandler(
  async (id: string) => checkProjectVersion(id),
  argExtractors.idOnly
));

// ============================================================================
// Git Routes
// ============================================================================

// Get git branches
router.get('/:id/git/branches', adaptHandler(
  async (id: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }
    const branches = getGitBranches(project.path);
    return { success: true, data: branches };
  },
  argExtractors.idOnly
));

// Get current git branch
router.get('/:id/git/current-branch', adaptHandler(
  async (id: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }
    const branch = getCurrentGitBranch(project.path);
    return { success: true, data: branch };
  },
  argExtractors.idOnly
));

// Detect main branch
router.get('/:id/git/main-branch', adaptHandler(
  async (id: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }
    const mainBranch = detectMainBranch(project.path);
    return { success: true, data: mainBranch };
  },
  argExtractors.idOnly
));

// Check git status
router.get('/:id/git/status', adaptHandler(
  async (id: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }
    const status = checkGitStatus(project.path, project.isGitRepo);
    return { success: true, data: status };
  },
  argExtractors.idOnly
));

// Initialize git
router.post('/:id/git/initialize', adaptHandler(
  async (id: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }
    const result = initializeGit(project.path);

    // Save the initialized state so we don't ask again on refresh
    if (result.success) {
      projectService.updateProjectSettings(id, { gitInitialized: true });
    }

    return { success: result.success, error: result.error };
  },
  argExtractors.idOnly
));

// ============================================================================
// Worktree Routes
// ============================================================================

interface Worktree {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
  specId?: string;
}

/**
 * Parse git worktree list output
 * Format: /path/to/worktree  abc1234 [branch-name]
 */
function parseWorktreeList(output: string, mainPath: string): Worktree[] {
  const lines = output.trim().split('\n').filter(l => l.trim());
  const worktrees: Worktree[] = [];

  for (const line of lines) {
    // Match: path  commit [branch] or path  commit (detached HEAD)
    const match = line.match(/^(.+?)\s+([a-f0-9]+)\s+(?:\[(.+?)\]|\((.+?)\))$/);
    if (match) {
      const wtPath = match[1].trim();
      const commit = match[2];
      const branch = match[3] || match[4] || 'detached';
      const isMain = wtPath === mainPath || wtPath.replace(/\\/g, '/') === mainPath.replace(/\\/g, '/');

      // Extract spec ID from auto-claude branch names
      let specId: string | undefined;
      const specMatch = branch.match(/^auto-claude\/(.+)$/);
      if (specMatch) {
        specId = specMatch[1];
      }

      worktrees.push({
        path: wtPath,
        branch,
        commit,
        isMain,
        specId,
      });
    }
  }

  return worktrees;
}

/**
 * Get worktree status (modified files, etc.)
 */
function getWorktreeStatusInfo(wtPath: string): { modified: number; staged: number; untracked: number } {
  try {
    const result = execSync('git status --porcelain', {
      cwd: wtPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let modified = 0;
    let staged = 0;
    let untracked = 0;

    for (const line of result.split('\n')) {
      if (!line.trim()) continue;
      const status = line.substring(0, 2);
      if (status[0] !== ' ' && status[0] !== '?') staged++;
      if (status[1] !== ' ' && status[1] !== '?') modified++;
      if (status === '??') untracked++;
    }

    return { modified, staged, untracked };
  } catch {
    return { modified: 0, staged: 0, untracked: 0 };
  }
}

/**
 * Get diff for a worktree compared to main branch
 */
function getWorktreeDiffText(wtPath: string, mainBranch: string): string {
  try {
    const result = execSync(`git diff ${mainBranch}...HEAD`, {
      cwd: wtPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return result;
  } catch {
    return '';
  }
}

// List worktrees for a project
router.get('/:id/worktrees', adaptHandler(
  async (id: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      const result = execSync('git worktree list', {
        cwd: project.path,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const worktrees = parseWorktreeList(result, project.path);
      return { success: true, data: worktrees };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list worktrees'
      };
    }
  },
  argExtractors.idOnly
));

// Get worktree status
router.get('/:id/worktrees/:specId/status', adaptHandler(
  async (id: string, specId: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // Find the worktree for this spec
    try {
      const result = execSync('git worktree list', {
        cwd: project.path,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const worktrees = parseWorktreeList(result, project.path);
      const worktree = worktrees.find(wt => wt.specId === specId);

      if (!worktree) {
        return { success: false, error: 'Worktree not found' };
      }

      const status = getWorktreeStatusInfo(worktree.path);
      return {
        success: true,
        data: {
          ...worktree,
          ...status,
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get worktree status'
      };
    }
  },
  (req) => [req.params.id, req.params.specId]
));

// Get worktree diff
router.get('/:id/worktrees/:specId/diff', adaptHandler(
  async (id: string, specId: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      const result = execSync('git worktree list', {
        cwd: project.path,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const worktrees = parseWorktreeList(result, project.path);
      const worktree = worktrees.find(wt => wt.specId === specId);

      if (!worktree) {
        return { success: false, error: 'Worktree not found' };
      }

      const mainBranch = detectMainBranch(project.path) || 'main';
      const diff = getWorktreeDiffText(worktree.path, mainBranch);

      return { success: true, data: diff };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get worktree diff'
      };
    }
  },
  (req) => [req.params.id, req.params.specId]
));

// Merge worktree (preview)
router.get('/:id/worktrees/:specId/merge-preview', adaptHandler(
  async (id: string, specId: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      const result = execSync('git worktree list', {
        cwd: project.path,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const worktrees = parseWorktreeList(result, project.path);
      const worktree = worktrees.find(wt => wt.specId === specId);

      if (!worktree) {
        return { success: false, error: 'Worktree not found' };
      }

      // Get merge preview using diff --stat
      const mainBranch = detectMainBranch(project.path) || 'main';
      const statResult = execSync(`git diff --stat ${mainBranch}...HEAD`, {
        cwd: worktree.path,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Parse stat output for additions/deletions
      const lastLine = statResult.trim().split('\n').pop() || '';
      const statsMatch = lastLine.match(/(\d+) insertions?\(\+\).*?(\d+) deletions?\(-\)/);

      return {
        success: true,
        data: {
          conflicts: [], // Would need actual merge simulation
          additions: statsMatch ? parseInt(statsMatch[1], 10) : 0,
          deletions: statsMatch ? parseInt(statsMatch[2], 10) : 0,
          diffStat: statResult,
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to preview merge'
      };
    }
  },
  (req) => [req.params.id, req.params.specId]
));

// Merge worktree
router.post('/:id/worktrees/:specId/merge', adaptHandler(
  async (id: string, specId: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      const branchName = `auto-claude/${specId}`;

      // Merge the branch into current branch
      execSync(`git merge ${branchName} --no-edit`, {
        cwd: project.path,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return { success: true, data: { merged: true } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to merge worktree'
      };
    }
  },
  (req) => [req.params.id, req.params.specId]
));

// Discard worktree
router.delete('/:id/worktrees/:specId', adaptHandler(
  async (id: string, specId: string) => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    try {
      const branchName = `auto-claude/${specId}`;

      // Remove worktree first
      execSync(`git worktree remove .worktrees/${specId} --force`, {
        cwd: project.path,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Delete the branch
      execSync(`git branch -D ${branchName}`, {
        cwd: project.path,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      return { success: true, data: { discarded: true } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to discard worktree'
      };
    }
  },
  (req) => [req.params.id, req.params.specId]
));


// ============================================================================
// Environment Configuration Routes
// ============================================================================

/**
 * GET /projects/:id/env
 * Get project environment configuration
 */
router.get('/:id/env', adaptHandler(
  async (id: string): Promise<IPCResult> => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // TODO: Read actual .env file from project directory
    // For now, return empty config
    return {
      success: true,
      data: {
        claudeOAuthToken: '',
        autoBuildModel: '',
        defaultBranch: 'main',
        githubToken: '',
        githubRepo: '',
        linearApiKey: '',
      }
    };
  },
  (req) => [req.params.id]
));

/**
 * PUT /projects/:id/env
 * Update project environment configuration
 */
router.put('/:id/env', adaptHandler(
  async (id: string, body: Record<string, unknown>): Promise<IPCResult> => {
    const project = projectService.getProject(id);
    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    // TODO: Write to actual .env file in project directory
    console.log('[ProjectRoutes] env:update called for project:', id, body);
    
    return { success: true };
  },
  (req) => [req.params.id, req.body]
));

export default router;
