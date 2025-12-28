/**
 * Project Service
 *
 * Manages projects in a configured directory.
 * All Auto-Claude projects live in PROJECTS_DIR.
 */

import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { config } from '../config.js';
import { gitConfigService } from './git-config-service.js';

export interface Project {
  id: string;
  name: string;
  path: string;
  isGitRepo: boolean;
  hasAutoClaude: boolean;
  createdAt: string;
  lastModified: string;
  autoBuildPath?: string; // Custom .auto-claude directory path
}

interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  settings?: Record<string, unknown>;
}

class ProjectService {
  private projectsDir: string;
  private metaFile: string;
  private projectsMeta: Map<string, ProjectMeta> = new Map();

  constructor() {
    this.projectsDir = config.projectsDir;
    this.metaFile = join(config.dataPath, 'projects-meta.json');
    this.ensureDirectories();
    this.loadMeta();
  }

  private ensureDirectories(): void {
    // Ensure projects directory exists
    if (!existsSync(this.projectsDir)) {
      mkdirSync(this.projectsDir, { recursive: true });
      console.log(`[ProjectService] Created projects directory: ${this.projectsDir}`);
    }

    // Ensure data directory exists for meta file
    const dataDir = config.dataPath;
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadMeta(): void {
    try {
      if (existsSync(this.metaFile)) {
        const data = JSON.parse(readFileSync(this.metaFile, 'utf-8'));
        this.projectsMeta = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('[ProjectService] Failed to load meta:', error);
    }
  }

  private saveMeta(): void {
    try {
      const data = Object.fromEntries(this.projectsMeta);
      writeFileSync(this.metaFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[ProjectService] Failed to save meta:', error);
    }
  }

  private generateId(): string {
    return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get the configured projects directory
   */
  getProjectsDir(): string {
    return this.projectsDir;
  }

  /**
   * List all projects in the projects directory
   */
  listProjects(): Project[] {
    const projects: Project[] = [];

    if (!existsSync(this.projectsDir)) {
      return projects;
    }

    const entries = readdirSync(this.projectsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue; // Skip hidden folders

      const projectPath = join(this.projectsDir, entry.name);
      const stats = statSync(projectPath);

      // Check if it's a git repo
      const isGitRepo = existsSync(join(projectPath, '.git'));

      // Check if it has Auto-Claude initialized
      const hasAutoClaude = existsSync(join(projectPath, '.auto-claude'));
      const autoBuildPath = hasAutoClaude ? '.auto-claude' : undefined;

      // Get or create meta
      let meta = this.projectsMeta.get(entry.name);
      if (!meta) {
        meta = {
          id: this.generateId(),
          name: entry.name,
          createdAt: stats.birthtime.toISOString(),
        };
        this.projectsMeta.set(entry.name, meta);
        this.saveMeta();
      }

      projects.push({
        id: meta.id,
        name: entry.name,
        path: projectPath,
        isGitRepo: isGitRepo || meta.settings?.gitInitialized === true,
        hasAutoClaude: hasAutoClaude || meta.settings?.autoClaudeInitialized === true,
        autoBuildPath,
        createdAt: meta.createdAt,
        lastModified: stats.mtime.toISOString(),
        ...(meta.settings && { settings: meta.settings }),
      });
    }

    // Sort by last modified, most recent first
    projects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return projects;
  }

  /**
   * Get a single project by ID or name
   */
  getProject(idOrName: string): Project | null {
    const projects = this.listProjects();
    return projects.find(p => p.id === idOrName || p.name === idOrName) || null;
  }

  /**
   * Create a new empty project
   */
  createProject(name: string, initGit: boolean = true): Project {
    // Sanitize name
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

    if (!safeName) {
      throw new Error('Invalid project name');
    }

    const projectPath = join(this.projectsDir, safeName);

    if (existsSync(projectPath)) {
      throw new Error(`Project "${safeName}" already exists`);
    }

    // Create directory
    mkdirSync(projectPath, { recursive: true });

    // Create meta first to get project ID
    const meta: ProjectMeta = {
      id: this.generateId(),
      name: safeName,
      createdAt: new Date().toISOString(),
    };
    this.projectsMeta.set(safeName, meta);
    this.saveMeta();

    // Initialize git if requested (now we have project ID)
    if (initGit) {
      const result = gitConfigService.initGit(projectPath, meta.id);
      if (!result.success) {
        console.warn('[ProjectService] Failed to init git:', result.error);
        // Continue anyway - project is created, just without git
      }
    }

    return {
      id: meta.id,
      name: safeName,
      path: projectPath,
      isGitRepo: initGit,
      hasAutoClaude: false,
      createdAt: meta.createdAt,
      lastModified: meta.createdAt,
    };
  }

  /**
   * Clone a git repository
   */
  cloneProject(gitUrl: string, name?: string): Project {
    // Extract repo name from URL if name not provided
    const repoName = name || basename(gitUrl, '.git').replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

    if (!repoName) {
      throw new Error('Could not determine project name from URL');
    }

    const projectPath = join(this.projectsDir, repoName);

    if (existsSync(projectPath)) {
      throw new Error(`Project "${repoName}" already exists`);
    }

    // Create meta first to get project ID
    const meta: ProjectMeta = {
      id: this.generateId(),
      name: repoName,
      createdAt: new Date().toISOString(),
    };
    this.projectsMeta.set(repoName, meta);
    this.saveMeta();

    // Clone the repository using git config service (handles SSH and user identity)
    const result = gitConfigService.cloneRepo(gitUrl, projectPath, meta.id);
    if (!result.success) {
      // Clean up meta if clone failed
      this.projectsMeta.delete(repoName);
      this.saveMeta();
      throw new Error(`Failed to clone repository: ${result.error}`);
    }

    return {
      id: meta.id,
      name: repoName,
      path: projectPath,
      isGitRepo: true,
      hasAutoClaude: existsSync(join(projectPath, '.auto-claude')),
      createdAt: meta.createdAt,
      lastModified: meta.createdAt,
    };
  }

  /**
   * Delete a project (moves to trash/backup)
   */
  deleteProject(idOrName: string): boolean {
    const project = this.getProject(idOrName);
    if (!project) {
      return false;
    }

    // For safety, we just remove from meta - don't delete files
    // User can manually delete the folder
    this.projectsMeta.delete(project.name);
    this.saveMeta();

    return true;
  }

  /**
   * Remove a project (alias for deleteProject for Electron compatibility)
   */
  removeProject(idOrName: string): boolean {
    return this.deleteProject(idOrName);
  }

  /**
   * Add an existing project by path (for Electron compatibility)
   */
  addProject(projectPath: string, name?: string): Project {
    // Check if project already exists
    const existing = this.listProjects().find(p => p.path === projectPath);
    if (existing) {
      return existing;
    }

    // Derive name from path if not provided
    const projectName = name || basename(projectPath);
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

    // Check if it's a git repo
    const isGitRepo = existsSync(join(projectPath, '.git'));

    // Check if it has Auto-Claude initialized
    const hasAutoClaude = existsSync(join(projectPath, '.auto-claude'));
    const autoBuildPath = hasAutoClaude ? '.auto-claude' : undefined;

    // Create meta
    const meta: ProjectMeta = {
      id: this.generateId(),
      name: safeName,
      createdAt: new Date().toISOString(),
    };
    this.projectsMeta.set(safeName, meta);
    this.saveMeta();

    return {
      id: meta.id,
      name: safeName,
      path: projectPath,
      isGitRepo,
      hasAutoClaude,
      createdAt: meta.createdAt,
      lastModified: meta.createdAt,
      autoBuildPath,
    };
  }

  /**
   * Update a project's properties
   */
  updateProject(idOrName: string, updates: Partial<Pick<Project, 'autoBuildPath'>>): Project | undefined {
    const project = this.getProject(idOrName);
    if (!project) {
      return undefined;
    }

    // For now, we just return the project with updates applied
    // In a full implementation, we'd persist these changes
    return {
      ...project,
      ...updates,
    };
  }

  /**
   * Update project settings
   */
  updateProjectSettings(idOrName: string, settings: Record<string, unknown>): boolean {
    const project = this.getProject(idOrName);
    if (!project) {
      return false;
    }

    const meta = this.projectsMeta.get(project.name);
    if (meta) {
      meta.settings = { ...meta.settings, ...settings };
      this.saveMeta();
    }

    return true;
  }

  /**
   * Get project settings
   */
  getProjectSettings(idOrName: string): Record<string, unknown> | null {
    const project = this.getProject(idOrName);
    if (!project) {
      return null;
    }

    const meta = this.projectsMeta.get(project.name);
    return meta?.settings || {};
  }
}

// Singleton instance
export const projectService = new ProjectService();
