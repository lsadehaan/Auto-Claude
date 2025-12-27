/**
 * Git Configuration Service
 * Manages git user configuration and provides utilities for running git commands
 * with proper identity and SSH configuration
 */

import { execSync, type ExecSyncOptions } from 'child_process';
import { sshKeyService } from './ssh-key-service.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface GitConfig {
  userName: string;
  userEmail: string;
}

export interface ProjectGitConfig extends GitConfig {
  projectId: string;
}

class GitConfigService {
  private configPath: string;
  private globalConfig: GitConfig | null = null;
  private projectConfigs: Map<string, GitConfig> = new Map();

  constructor() {
    this.configPath = join(homedir(), '.auto-claude', 'git-config.json');
    this.loadConfig();
  }

  /**
   * Load git configuration from disk
   */
  private loadConfig(): void {
    if (!existsSync(this.configPath)) {
      return;
    }

    try {
      const data = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      this.globalConfig = data.global || null;
      this.projectConfigs = new Map(Object.entries(data.projects || {}));
    } catch (error) {
      console.error('[GitConfigService] Failed to load config:', error);
    }
  }

  /**
   * Save git configuration to disk
   */
  private saveConfig(): void {
    try {
      const data = {
        global: this.globalConfig,
        projects: Object.fromEntries(this.projectConfigs),
      };
      writeFileSync(this.configPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[GitConfigService] Failed to save config:', error);
    }
  }

  /**
   * Set global git configuration (from onboarding)
   */
  setGlobalConfig(config: GitConfig): void {
    this.globalConfig = config;
    this.saveConfig();
  }

  /**
   * Get global git configuration
   */
  getGlobalConfig(): GitConfig | null {
    return this.globalConfig;
  }

  /**
   * Set project-specific git configuration
   */
  setProjectConfig(projectId: string, config: GitConfig): void {
    this.projectConfigs.set(projectId, config);
    this.saveConfig();
  }

  /**
   * Get project-specific git configuration (falls back to global)
   */
  getProjectConfig(projectId: string): GitConfig | null {
    return this.projectConfigs.get(projectId) || this.globalConfig;
  }

  /**
   * Clear project-specific git configuration (revert to global)
   */
  clearProjectConfig(projectId: string): void {
    this.projectConfigs.delete(projectId);
    this.saveConfig();
  }

  /**
   * Check if git is configured (globally or for project)
   */
  isConfigured(projectId?: string): boolean {
    if (projectId) {
      return this.getProjectConfig(projectId) !== null;
    }
    return this.globalConfig !== null;
  }

  /**
   * Get environment variables for git commands
   */
  getGitEnv(projectId?: string): Record<string, string> {
    const config = projectId ? this.getProjectConfig(projectId) : this.globalConfig;
    const env: Record<string, string> = { ...process.env };

    // Add git identity
    if (config) {
      env.GIT_AUTHOR_NAME = config.userName;
      env.GIT_AUTHOR_EMAIL = config.userEmail;
      env.GIT_COMMITTER_NAME = config.userName;
      env.GIT_COMMITTER_EMAIL = config.userEmail;
    }

    // Add SSH configuration
    const sshConfig = sshKeyService.getGitSSHConfig();
    Object.assign(env, sshConfig);

    return env;
  }

  /**
   * Execute a git command with proper configuration
   */
  execGit(
    command: string,
    cwd: string,
    projectId?: string,
    options?: Partial<ExecSyncOptions>
  ): string {
    const env = this.getGitEnv(projectId);

    try {
      const result = execSync(command, {
        cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        env,
        ...options,
      });

      return result.trim();
    } catch (error: any) {
      throw new Error(
        `Git command failed: ${error.message}\nCommand: ${command}\nStderr: ${error.stderr?.toString() || 'none'}`
      );
    }
  }

  /**
   * Execute a git command and return success/failure
   */
  tryExecGit(
    command: string,
    cwd: string,
    projectId?: string
  ): { success: boolean; output?: string; error?: string } {
    try {
      const output = this.execGit(command, cwd, projectId);
      return { success: true, output };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Initialize git in a directory with proper config
   */
  initGit(cwd: string, projectId?: string): { success: boolean; error?: string } {
    const config = projectId ? this.getProjectConfig(projectId) : this.globalConfig;

    if (!config) {
      return {
        success: false,
        error: 'Git user not configured. Please complete onboarding first.',
      };
    }

    try {
      // Initialize repo
      this.execGit('git init', cwd, projectId);

      // Create initial commit
      this.execGit('git add -A', cwd, projectId, { stdio: 'pipe' });
      this.execGit(
        'git commit -m "Initial commit" --allow-empty',
        cwd,
        projectId,
        { stdio: 'pipe' }
      );

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Clone a repository with proper SSH config
   */
  cloneRepo(
    gitUrl: string,
    targetDir: string,
    projectId?: string
  ): { success: boolean; error?: string } {
    const config = projectId ? this.getProjectConfig(projectId) : this.globalConfig;

    if (!config) {
      return {
        success: false,
        error: 'Git user not configured. Please complete onboarding first.',
      };
    }

    const parentDir = require('path').dirname(targetDir);
    const folderName = require('path').basename(targetDir);

    try {
      this.execGit(
        `git clone "${gitUrl}" "${folderName}"`,
        parentDir,
        projectId,
        { timeout: 120000 } // 2 minute timeout
      );

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Singleton instance
export const gitConfigService = new GitConfigService();
