/**
 * Agent Service
 * Manages Python process spawning for task execution
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AgentProcess {
  taskId: string;
  process: ChildProcess;
  startedAt: Date;
  projectPath: string;
  specId: string;
  phase: string;
  output: string;
}

export interface ExecutionProgress {
  phase: string;
  phaseProgress: number;
  overallProgress: number;
  currentSubtask?: string;
  message?: string;
}

type ProcessType = 'task-execution' | 'spec-creation' | 'roadmap' | 'ideation' | 'insights';

export interface RoadmapConfig {
  model?: string;
  thinkingLevel?: string;
}

export interface TaskMetadata {
  sourceType?: string;
  featureId?: string;
  category?: string;
  [key: string]: unknown;
}

/**
 * Agent Service - manages Python process spawning
 */
export class AgentService extends EventEmitter {
  private processes = new Map<string, AgentProcess>();
  private roadmapProcesses = new Map<string, AgentProcess>(); // keyed by projectId
  private ideationProcesses = new Map<string, AgentProcess>(); // keyed by projectId
  private insightsProcesses = new Map<string, AgentProcess>(); // keyed by projectId
  private pythonPath: string;
  private backendPath: string;

  constructor() {
    super();
    this.setMaxListeners(100);

    // Use configured paths or auto-detect
    this.pythonPath = config.pythonPath || this.findPythonCommand();
    this.backendPath = config.backendPath || this.findBackendPath();

    console.log(`[AgentService] Python: ${this.pythonPath}`);
    console.log(`[AgentService] Backend: ${this.backendPath}`);
  }

  /**
   * Find Python command
   */
  private findPythonCommand(): string {
    // Common Python command names
    const commands = ['python3', 'python', 'py'];

    for (const cmd of commands) {
      try {
        const { execSync } = require('child_process');
        execSync(`${cmd} --version`, { stdio: 'pipe' });
        return cmd;
      } catch {
        // Try next command
      }
    }

    return 'python';
  }

  /**
   * Find the backend path
   */
  private findBackendPath(): string {
    const possiblePaths = [
      // From web-server/src/services -> apps/backend
      path.resolve(__dirname, '..', '..', '..', '..', 'backend'),
      // From project root
      path.resolve(process.cwd(), 'apps', 'backend'),
      // Fallback
      path.resolve(__dirname, '../../../../backend'),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p) && existsSync(path.join(p, 'run.py'))) {
        return p;
      }
    }

    console.warn('[AgentService] Backend path not found, using default');
    return possiblePaths[0];
  }

  /**
   * Load environment variables from backend .env file
   */
  private loadBackendEnv(): Record<string, string> {
    const envPath = path.join(this.backendPath, '.env');
    if (!existsSync(envPath)) {
      return {};
    }

    try {
      const content = readFileSync(envPath, 'utf-8');
      const env: Record<string, string> = {};

      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();

          // Remove quotes
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          env[key] = value;
        }
      }

      return env;
    } catch {
      return {};
    }
  }

  /**
   * Get the Claude OAuth token from profiles, settings, config, or backend .env
   */
  private getOAuthToken(): string | null {
    // First check Claude profiles (saved via UI onboarding)
    const profilesPath = path.join(homedir(), '.auto-claude', 'claude-profiles.json');
    if (existsSync(profilesPath)) {
      try {
        const profilesData = JSON.parse(readFileSync(profilesPath, 'utf-8'));
        // Get the active profile's token
        if (profilesData.activeProfileId) {
          const activeProfile = profilesData.profiles?.find(
            (p: any) => p.id === profilesData.activeProfileId
          );
          if (activeProfile?.oauthToken) {
            return activeProfile.oauthToken;
          }
        }
        // Fall back to any profile with a token
        const profileWithToken = profilesData.profiles?.find((p: any) => p.oauthToken);
        if (profileWithToken?.oauthToken) {
          return profileWithToken.oauthToken;
        }
      } catch {
        // Ignore errors reading profiles
      }
    }

    // Check global settings (backward compatibility)
    const settingsPath = path.join(homedir(), '.auto-claude', 'settings.json');
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        if (settings.globalClaudeOAuthToken) {
          return settings.globalClaudeOAuthToken;
        }
      } catch {
        // Ignore errors reading settings
      }
    }

    // Fall back to config (from environment variable)
    if (config.claudeOAuthToken) {
      return config.claudeOAuthToken;
    }

    // Finally check backend .env
    const backendEnv = this.loadBackendEnv();
    if (backendEnv['CLAUDE_CODE_OAUTH_TOKEN']) {
      return backendEnv['CLAUDE_CODE_OAUTH_TOKEN'];
    }

    return null;
  }

  /**
   * Start a task execution
   */
  startTask(
    taskId: string,
    projectPath: string,
    specId: string,
    options: {
      autoContinue?: boolean;
      maxIterations?: number;
    } = {}
  ): { success: boolean; error?: string } {
    // Check if task is already running
    if (this.processes.has(taskId)) {
      return { success: false, error: 'Task is already running' };
    }

    // Build command arguments
    const runScript = path.join(this.backendPath, 'run.py');
    if (!existsSync(runScript)) {
      return { success: false, error: `Backend script not found: ${runScript}` };
    }

    const args = [
      runScript,
      '--spec', specId,
      '--project-dir', projectPath,
    ];

    if (options.autoContinue !== false) {
      args.push('--auto-continue');
    }

    if (options.maxIterations) {
      args.push('--max-iterations', options.maxIterations.toString());
    }

    return this.spawnProcess(taskId, projectPath, specId, args, 'task-execution');
  }

  /**
   * Create a spec for a task
   */
  createSpec(
    taskId: string,
    projectPath: string,
    taskDescription: string,
    options: {
      complexity?: 'simple' | 'standard' | 'complex';
    } = {}
  ): { success: boolean; error?: string } {
    // Check if task is already running
    if (this.processes.has(taskId)) {
      return { success: false, error: 'Task is already running' };
    }

    // Use the spec_runner.py script for creating specs
    const runScript = path.join(this.backendPath, 'runners', 'spec_runner.py');
    if (!existsSync(runScript)) {
      return { success: false, error: `Spec runner not found: ${runScript}` };
    }

    const args = [
      runScript,
      '--task', taskDescription,
      '--project-dir', projectPath,
      '--auto-approve', // Skip human review checkpoint (UI handles approval)
      '--no-build', // Don't auto-start build (UI will start it separately)
    ];

    if (options.complexity) {
      args.push('--complexity', options.complexity);
    }

    return this.spawnProcess(taskId, projectPath, 'new', args, 'spec-creation');
  }

  /**
   * Spawn a Python process
   */
  private spawnProcess(
    taskId: string,
    projectPath: string,
    specId: string,
    args: string[],
    processType: ProcessType
  ): { success: boolean; error?: string } {
    try {
      const backendEnv = this.loadBackendEnv();

      // Ensure we have the OAuth token (check settings, config, and backend .env)
      const oauthToken = this.getOAuthToken();
      if (!oauthToken) {
        return { success: false, error: 'CLAUDE_CODE_OAUTH_TOKEN not configured' };
      }

      const childProcess = spawn(this.pythonPath, args, {
        cwd: projectPath,
        env: {
          ...process.env,
          ...backendEnv,
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      });

      const agentProcess: AgentProcess = {
        taskId,
        process: childProcess,
        startedAt: new Date(),
        projectPath,
        specId,
        phase: processType === 'spec-creation' ? 'planning' : 'starting',
        output: '',
      };

      this.processes.set(taskId, agentProcess);

      // Emit initial progress
      this.emit('execution-progress', taskId, {
        phase: agentProcess.phase,
        phaseProgress: 0,
        overallProgress: 0,
        message: processType === 'spec-creation' ? 'Creating spec...' : 'Starting build...',
      });

      // Handle stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        const log = data.toString('utf8');
        agentProcess.output = (agentProcess.output + log).slice(-100000); // Keep last 100KB

        this.emit('log', taskId, log);
        this.parseProgress(taskId, log, processType === 'spec-creation');
      });

      // Handle stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const log = data.toString('utf8');
        agentProcess.output = (agentProcess.output + log).slice(-100000);

        this.emit('log', taskId, log);
        this.parseProgress(taskId, log, processType === 'spec-creation');
      });

      // Handle exit
      childProcess.on('exit', (code: number | null) => {
        this.processes.delete(taskId);

        this.emit('exit', taskId, code ?? -1);

        if (code === 0) {
          this.emit('execution-progress', taskId, {
            phase: 'complete',
            phaseProgress: 100,
            overallProgress: 100,
            message: 'Task completed successfully',
          });
        } else {
          this.emit('error', taskId, `Process exited with code ${code}`);
        }
      });

      // Handle error
      childProcess.on('error', (error) => {
        this.processes.delete(taskId);
        this.emit('error', taskId, error.message);
      });

      console.log(`[AgentService] Started task ${taskId} with PID ${childProcess.pid}`);
      return { success: true };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to spawn process';
      return { success: false, error: message };
    }
  }

  /**
   * Parse output for progress updates
   */
  private parseProgress(taskId: string, log: string, isSpecCreation: boolean): void {
    const proc = this.processes.get(taskId);
    if (!proc) return;

    // Detect phase changes from output patterns
    let newPhase = proc.phase;
    let message: string | undefined;

    // Common phase patterns
    if (log.includes('PHASE: PLANNING') || log.includes('Creating implementation plan')) {
      newPhase = 'planning';
      message = 'Creating implementation plan...';
    } else if (log.includes('PHASE: IMPLEMENTING') || log.includes('Implementing subtask')) {
      newPhase = 'implementing';
      message = 'Implementing changes...';
    } else if (log.includes('PHASE: QA') || log.includes('Running QA')) {
      newPhase = 'qa';
      message = 'Running QA validation...';
    } else if (log.includes('PHASE: COMPLETE') || log.includes('Build complete')) {
      newPhase = 'complete';
      message = 'Build complete';
    } else if (log.includes('>>> Subtask:') || log.includes('Working on:')) {
      const match = log.match(/(?:>>> Subtask:|Working on:)\s*(.+)/);
      if (match) {
        message = match[1].trim();
      }
    }

    // Update phase if changed
    if (newPhase !== proc.phase) {
      proc.phase = newPhase;

      // Calculate progress based on phase
      const phaseProgress: Record<string, number> = {
        'starting': 0,
        'planning': 20,
        'implementing': 50,
        'qa': 80,
        'complete': 100,
      };

      this.emit('execution-progress', taskId, {
        phase: newPhase,
        phaseProgress: phaseProgress[newPhase] || 0,
        overallProgress: phaseProgress[newPhase] || 0,
        message,
      });
    }
  }

  /**
   * Stop a running task
   */
  stopTask(taskId: string): boolean {
    const proc = this.processes.get(taskId);
    if (!proc) {
      return false;
    }

    try {
      proc.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.processes.has(taskId)) {
          proc.process.kill('SIGKILL');
          this.processes.delete(taskId);
        }
      }, 5000);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a task is running
   */
  isRunning(taskId: string): boolean {
    return this.processes.has(taskId);
  }

  /**
   * Get running task IDs
   */
  getRunningTasks(): string[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Get task info
   */
  getTaskInfo(taskId: string): Omit<AgentProcess, 'process'> | null {
    const proc = this.processes.get(taskId);
    if (!proc) return null;

    const { process: _, ...info } = proc;
    return info;
  }

  /**
   * Stop all running tasks
   */
  stopAll(): void {
    for (const taskId of this.processes.keys()) {
      this.stopTask(taskId);
    }
  }

  // ============================================
  // Roadmap Operations
  // ============================================

  /**
   * Start roadmap generation
   */
  startRoadmapGeneration(
    projectId: string,
    projectPath: string,
    refresh: boolean = false,
    enableCompetitorAnalysis: boolean = false,
    refreshCompetitorAnalysis: boolean = false,
    config: RoadmapConfig = {}
  ): { success: boolean; error?: string } {
    // Check if roadmap is already running for this project
    if (this.roadmapProcesses.has(projectId)) {
      return { success: false, error: 'Roadmap generation is already running for this project' };
    }

    const runScript = path.join(this.backendPath, 'runners', 'roadmap_runner.py');
    if (!existsSync(runScript)) {
      return { success: false, error: `Roadmap runner not found: ${runScript}` };
    }

    const args = [
      runScript,
      '--project', projectPath,
    ];

    if (refresh) {
      args.push('--refresh');
    }

    if (config.model) {
      args.push('--model', config.model);
    }

    if (config.thinkingLevel) {
      args.push('--thinking-level', config.thinkingLevel);
    }

    if (enableCompetitorAnalysis) {
      args.push('--competitor-analysis');
    }

    if (refreshCompetitorAnalysis) {
      args.push('--refresh-competitor-analysis');
    }

    return this.spawnRoadmapProcess(projectId, projectPath, args);
  }

  /**
   * Spawn a roadmap Python process
   */
  private spawnRoadmapProcess(
    projectId: string,
    projectPath: string,
    args: string[]
  ): { success: boolean; error?: string } {
    try {
      const backendEnv = this.loadBackendEnv();
      const oauthToken = this.getOAuthToken();

      if (!oauthToken) {
        return { success: false, error: 'CLAUDE_CODE_OAUTH_TOKEN not configured' };
      }

      const childProcess = spawn(this.pythonPath, args, {
        cwd: projectPath,
        env: {
          ...process.env,
          ...backendEnv,
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      });

      const agentProcess: AgentProcess = {
        taskId: `roadmap-${projectId}`,
        process: childProcess,
        startedAt: new Date(),
        projectPath,
        specId: 'roadmap',
        phase: 'analyzing',
        output: '',
      };

      this.roadmapProcesses.set(projectId, agentProcess);

      // Emit initial progress
      this.emit('roadmap-progress', projectId, {
        phase: 'analyzing',
        progress: 10,
        message: 'Analyzing project structure...',
      });

      // Handle stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        const log = data.toString('utf8');
        agentProcess.output = (agentProcess.output + log).slice(-100000);

        this.emit('roadmap-log', projectId, log);
        this.parseRoadmapProgress(projectId, log);
      });

      // Handle stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const log = data.toString('utf8');
        agentProcess.output = (agentProcess.output + log).slice(-100000);

        this.emit('roadmap-log', projectId, log);
        this.parseRoadmapProgress(projectId, log);
      });

      // Handle exit
      childProcess.on('exit', (code: number | null) => {
        this.roadmapProcesses.delete(projectId);

        if (code === 0) {
          this.emit('roadmap-complete', projectId);
        } else {
          this.emit('roadmap-error', projectId, `Roadmap generation exited with code ${code}`);
        }
      });

      // Handle error
      childProcess.on('error', (error) => {
        this.roadmapProcesses.delete(projectId);
        this.emit('roadmap-error', projectId, error.message);
      });

      console.log(`[AgentService] Started roadmap generation for ${projectId} with PID ${childProcess.pid}`);
      return { success: true };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to spawn roadmap process';
      return { success: false, error: message };
    }
  }

  /**
   * Parse roadmap output for progress updates
   */
  private parseRoadmapProgress(projectId: string, log: string): void {
    const proc = this.roadmapProcesses.get(projectId);
    if (!proc) return;

    let phase = proc.phase;
    let progress = 0;
    let message: string | undefined;

    // Parse phase from output
    if (log.includes('Analyzing project') || log.includes('PHASE: DISCOVERY')) {
      phase = 'analyzing';
      progress = 20;
      message = 'Analyzing project structure...';
    } else if (log.includes('Generating features') || log.includes('PHASE: GENERATION')) {
      phase = 'generating';
      progress = 50;
      message = 'Generating feature roadmap...';
    } else if (log.includes('Competitor analysis') || log.includes('PHASE: COMPETITOR')) {
      phase = 'competitor_analysis';
      progress = 70;
      message = 'Performing competitor analysis...';
    } else if (log.includes('Writing roadmap') || log.includes('PHASE: OUTPUT')) {
      phase = 'writing';
      progress = 90;
      message = 'Writing roadmap...';
    } else if (log.includes('Roadmap complete') || log.includes('SUCCESS')) {
      phase = 'complete';
      progress = 100;
      message = 'Roadmap generation complete';
    }

    if (phase !== proc.phase) {
      proc.phase = phase;
      this.emit('roadmap-progress', projectId, {
        phase,
        progress,
        message,
      });
    }
  }

  /**
   * Stop roadmap generation
   */
  stopRoadmap(projectId: string): boolean {
    const proc = this.roadmapProcesses.get(projectId);
    if (!proc) {
      return false;
    }

    try {
      proc.process.kill('SIGTERM');

      setTimeout(() => {
        if (this.roadmapProcesses.has(projectId)) {
          proc.process.kill('SIGKILL');
          this.roadmapProcesses.delete(projectId);
        }
      }, 5000);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if roadmap generation is running
   */
  isRoadmapRunning(projectId: string): boolean {
    return this.roadmapProcesses.has(projectId);
  }

  // ============================================
  // Ideation Operations
  // ============================================

  /**
   * Start ideation generation
   */
  startIdeationGeneration(
    projectId: string,
    projectPath: string,
    configOptions: {
      enabledTypes?: string[];
      maxIdeasPerType?: number;
      includeRoadmapContext?: boolean;
      includeKanbanContext?: boolean;
      model?: string;
      thinkingLevel?: string;
    } = {},
    refresh: boolean = false
  ): { success: boolean; error?: string } {
    if (this.ideationProcesses.has(projectId)) {
      return { success: false, error: 'Ideation generation is already running for this project' };
    }

    const runScript = path.join(this.backendPath, 'runners', 'ideation_runner.py');
    if (!existsSync(runScript)) {
      return { success: false, error: `Ideation runner not found: ${runScript}` };
    }

    const args = [
      runScript,
      '--project', projectPath,
    ];

    if (refresh) {
      args.push('--refresh');
    }

    if (configOptions.enabledTypes && configOptions.enabledTypes.length > 0) {
      args.push('--types', configOptions.enabledTypes.join(','));
    }

    if (configOptions.maxIdeasPerType) {
      args.push('--max-ideas', configOptions.maxIdeasPerType.toString());
    }

    if (configOptions.includeRoadmapContext === false) {
      args.push('--no-roadmap');
    }

    if (configOptions.includeKanbanContext === false) {
      args.push('--no-kanban');
    }

    if (configOptions.model) {
      args.push('--model', configOptions.model);
    }

    if (configOptions.thinkingLevel) {
      args.push('--thinking-level', configOptions.thinkingLevel);
    }

    return this.spawnIdeationProcess(projectId, projectPath, args);
  }

  /**
   * Spawn an ideation Python process
   */
  private spawnIdeationProcess(
    projectId: string,
    projectPath: string,
    args: string[]
  ): { success: boolean; error?: string } {
    try {
      const backendEnv = this.loadBackendEnv();
      const oauthToken = this.getOAuthToken();

      if (!oauthToken) {
        return { success: false, error: 'CLAUDE_CODE_OAUTH_TOKEN not configured' };
      }

      const childProcess = spawn(this.pythonPath, args, {
        cwd: projectPath,
        env: {
          ...process.env,
          ...backendEnv,
          CLAUDE_CODE_OAUTH_TOKEN: oauthToken,
          PYTHONUNBUFFERED: '1',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      });

      const agentProcess: AgentProcess = {
        taskId: `ideation-${projectId}`,
        process: childProcess,
        startedAt: new Date(),
        projectPath,
        specId: 'ideation',
        phase: 'analyzing',
        output: '',
      };

      this.ideationProcesses.set(projectId, agentProcess);

      // Emit initial progress
      this.emit('ideation-progress', projectId, {
        phase: 'analyzing',
        progress: 10,
        message: 'Analyzing project structure...',
      });

      // Handle stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        const log = data.toString('utf8');
        agentProcess.output = (agentProcess.output + log).slice(-100000);

        this.emit('ideation-log', projectId, log);
        this.parseIdeationProgress(projectId, log);
      });

      // Handle stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const log = data.toString('utf8');
        agentProcess.output = (agentProcess.output + log).slice(-100000);

        this.emit('ideation-log', projectId, log);
        this.parseIdeationProgress(projectId, log);
      });

      // Handle exit
      childProcess.on('exit', (code: number | null) => {
        this.ideationProcesses.delete(projectId);

        if (code === 0) {
          this.emit('ideation-complete', projectId);
        } else {
          this.emit('ideation-error', projectId, `Ideation generation exited with code ${code}`);
        }
      });

      // Handle error
      childProcess.on('error', (error) => {
        this.ideationProcesses.delete(projectId);
        this.emit('ideation-error', projectId, error.message);
      });

      console.log(`[AgentService] Started ideation generation for ${projectId} with PID ${childProcess.pid}`);
      return { success: true };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to spawn ideation process';
      return { success: false, error: message };
    }
  }

  /**
   * Parse ideation output for progress updates
   */
  private parseIdeationProgress(projectId: string, log: string): void {
    const proc = this.ideationProcesses.get(projectId);
    if (!proc) return;

    let phase = proc.phase;
    let progress = 0;
    let message: string | undefined;

    // Parse phase from output
    if (log.includes('Analyzing project') || log.includes('PHASE: DISCOVERY')) {
      phase = 'analyzing';
      progress = 20;
      message = 'Analyzing project structure...';
    } else if (log.includes('Generating ideas') || log.includes('PHASE: GENERATION')) {
      phase = 'generating';
      progress = 50;
      message = 'Generating ideas...';
    } else if (log.includes('Writing ideation') || log.includes('PHASE: OUTPUT')) {
      phase = 'writing';
      progress = 90;
      message = 'Writing ideation results...';
    } else if (log.includes('Ideation complete') || log.includes('SUCCESS')) {
      phase = 'complete';
      progress = 100;
      message = 'Ideation generation complete';
    }

    // Check for type-specific progress
    const typeMatch = log.match(/Generating (\w+) ideas/i);
    if (typeMatch) {
      message = `Generating ${typeMatch[1]} ideas...`;
    }

    if (phase !== proc.phase || message) {
      proc.phase = phase;
      this.emit('ideation-progress', projectId, {
        phase,
        progress,
        message,
      });
    }
  }

  /**
   * Stop ideation generation
   */
  stopIdeation(projectId: string): boolean {
    const proc = this.ideationProcesses.get(projectId);
    if (!proc) {
      return false;
    }

    try {
      proc.process.kill('SIGTERM');

      setTimeout(() => {
        if (this.ideationProcesses.has(projectId)) {
          proc.process.kill('SIGKILL');
          this.ideationProcesses.delete(projectId);
        }
      }, 5000);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if ideation generation is running
   */
  isIdeationRunning(projectId: string): boolean {
    return this.ideationProcesses.has(projectId);
  }

  // ============================================
  // Spec Creation (with metadata)
  // ============================================

  /**
   * Start spec creation from external sources (roadmap feature, linear issue, etc.)
   */
  startSpecCreation(
    specId: string,
    projectPath: string,
    description: string,
    specDir: string,
    metadata?: TaskMetadata
  ): { success: boolean; error?: string } {
    // For now, this just emits an event - actual spec creation
    // happens when user starts the task from kanban board
    console.log(`[AgentService] Spec created: ${specId} in ${specDir}`);
    console.log(`[AgentService] Metadata:`, metadata);

    // Emit event for UI notification
    this.emit('spec-created', {
      specId,
      projectPath,
      description,
      specDir,
      metadata,
    });

    return { success: true };
  }
}

// Singleton instance
export const agentService = new AgentService();
