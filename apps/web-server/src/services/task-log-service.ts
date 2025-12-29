import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { EventEmitter } from 'events';

/**
 * Task log types (mirrored from frontend/shared/types)
 */
export type TaskLogPhase = 'planning' | 'coding' | 'validation';
export type TaskLogPhaseStatus = 'pending' | 'active' | 'completed' | 'failed';
export type TaskLogEntryType = 'text' | 'tool_start' | 'tool_end' | 'phase_start' | 'phase_end' | 'error' | 'success' | 'info';

export interface TaskLogEntry {
  timestamp: string;
  type: TaskLogEntryType;
  content: string;
  phase: TaskLogPhase;
  tool_name?: string;
  tool_input?: string;
  subtask_id?: string;
  session?: number;
  detail?: string;
  subphase?: string;
  collapsed?: boolean;
}

export interface TaskPhaseLog {
  phase: TaskLogPhase;
  status: TaskLogPhaseStatus;
  started_at: string | null;
  completed_at: string | null;
  entries: TaskLogEntry[];
}

export interface TaskLogs {
  spec_id: string;
  created_at: string;
  updated_at: string;
  phases: {
    planning: TaskPhaseLog;
    coding: TaskPhaseLog;
    validation: TaskPhaseLog;
  };
}

export interface TaskLogStreamChunk {
  type: 'text' | 'tool_start' | 'tool_end' | 'phase_start' | 'phase_end' | 'error';
  content?: string;
  phase?: TaskLogPhase;
  timestamp?: string;
  tool?: {
    name: string;
    input?: string;
    success?: boolean;
  };
  subtask_id?: string;
}

/**
 * Service for loading and watching phase-based task logs (task_logs.json)
 */
export class TaskLogService extends EventEmitter {
  private logCache: Map<string, TaskLogs> = new Map();
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private watchedPaths: Map<string, { mainSpecDir: string; worktreeSpecDir: string | null }> = new Map();

  private readonly POLL_INTERVAL_MS = 1000;

  constructor() {
    super();
  }

  /**
   * Load task logs from a single spec directory
   */
  loadLogsFromPath(specDir: string): TaskLogs | null {
    const logFile = path.join(specDir, 'task_logs.json');

    if (!existsSync(logFile)) {
      return null;
    }

    try {
      const content = readFileSync(logFile, 'utf-8');
      const logs = JSON.parse(content) as TaskLogs;
      this.logCache.set(specDir, logs);
      return logs;
    } catch (error) {
      // JSON parse error - file may be mid-write, return cached version if available
      const cached = this.logCache.get(specDir);
      if (cached) {
        return cached;
      }
      console.error(`[TaskLogService] Failed to load logs from ${logFile}:`, error);
      return null;
    }
  }

  /**
   * Merge logs from main and worktree spec directories
   */
  private mergeLogs(mainLogs: TaskLogs | null, worktreeLogs: TaskLogs | null, specDir: string): TaskLogs | null {
    if (!worktreeLogs) {
      if (mainLogs) {
        this.logCache.set(specDir, mainLogs);
      }
      return mainLogs;
    }

    if (!mainLogs) {
      this.logCache.set(specDir, worktreeLogs);
      return worktreeLogs;
    }

    // Merge logs: planning from main, coding/validation from worktree (if available)
    const mergedLogs: TaskLogs = {
      spec_id: mainLogs.spec_id,
      created_at: mainLogs.created_at,
      updated_at: worktreeLogs.updated_at > mainLogs.updated_at ? worktreeLogs.updated_at : mainLogs.updated_at,
      phases: {
        planning: mainLogs.phases.planning || worktreeLogs.phases.planning,
        coding: (worktreeLogs.phases.coding?.entries?.length > 0 || worktreeLogs.phases.coding?.status !== 'pending')
          ? worktreeLogs.phases.coding
          : mainLogs.phases.coding,
        validation: (worktreeLogs.phases.validation?.entries?.length > 0 || worktreeLogs.phases.validation?.status !== 'pending')
          ? worktreeLogs.phases.validation
          : mainLogs.phases.validation
      }
    };

    this.logCache.set(specDir, mergedLogs);
    return mergedLogs;
  }

  /**
   * Load and merge task logs from main spec dir and worktree spec dir
   */
  loadLogs(projectPath: string, specId: string): TaskLogs | null {
    const mainSpecDir = path.join(projectPath, '.auto-claude', 'specs', specId);
    const worktreeSpecDir = path.join(projectPath, '.worktrees', specId, '.auto-claude', 'specs', specId);

    const mainLogs = this.loadLogsFromPath(mainSpecDir);

    let worktreeLogs: TaskLogs | null = null;
    if (existsSync(worktreeSpecDir)) {
      worktreeLogs = this.loadLogsFromPath(worktreeSpecDir);
    }

    return this.mergeLogs(mainLogs, worktreeLogs, mainSpecDir);
  }

  /**
   * Start watching a spec directory for log changes
   */
  startWatching(projectPath: string, specId: string): void {
    // Stop any existing watch
    this.stopWatching(specId);

    const mainSpecDir = path.join(projectPath, '.auto-claude', 'specs', specId);
    const worktreeSpecDir = path.join(projectPath, '.worktrees', specId, '.auto-claude', 'specs', specId);

    // Store watched paths
    this.watchedPaths.set(specId, {
      mainSpecDir,
      worktreeSpecDir: existsSync(worktreeSpecDir) ? worktreeSpecDir : null
    });

    const mainLogFile = path.join(mainSpecDir, 'task_logs.json');
    const worktreeLogFile = path.join(worktreeSpecDir, 'task_logs.json');

    let lastMainContent = '';
    let lastWorktreeContent = '';

    // Initial load
    if (existsSync(mainLogFile)) {
      try {
        lastMainContent = readFileSync(mainLogFile, 'utf-8');
      } catch (_e) {
        // Ignore
      }
    }

    if (existsSync(worktreeLogFile)) {
      try {
        lastWorktreeContent = readFileSync(worktreeLogFile, 'utf-8');
      } catch (_e) {
        // Ignore
      }
    }

    const initialLogs = this.loadLogs(projectPath, specId);
    if (initialLogs) {
      this.logCache.set(mainSpecDir, initialLogs);
    }

    // Poll for changes
    const pollInterval = setInterval(() => {
      let mainChanged = false;
      let worktreeChanged = false;

      // Check main spec dir
      if (existsSync(mainLogFile)) {
        try {
          const currentContent = readFileSync(mainLogFile, 'utf-8');
          if (currentContent !== lastMainContent) {
            lastMainContent = currentContent;
            mainChanged = true;
          }
        } catch (_error) {
          // Ignore
        }
      }

      // Check worktree spec dir
      if (existsSync(worktreeLogFile)) {
        try {
          const currentContent = readFileSync(worktreeLogFile, 'utf-8');
          if (currentContent !== lastWorktreeContent) {
            lastWorktreeContent = currentContent;
            worktreeChanged = true;
          }
        } catch (_error) {
          // Ignore
        }
      }

      // If either file changed, reload and emit
      if (mainChanged || worktreeChanged) {
        const previousLogs = this.logCache.get(mainSpecDir);
        const logs = this.loadLogs(projectPath, specId);

        if (logs) {
          this.emit('logs-changed', specId, logs);
          this.emitNewEntries(specId, previousLogs, logs);
        }
      }
    }, this.POLL_INTERVAL_MS);

    this.pollIntervals.set(specId, pollInterval);
    console.log(`[TaskLogService] Started watching ${specId}`);
  }

  /**
   * Stop watching a spec directory
   */
  stopWatching(specId: string): void {
    const interval = this.pollIntervals.get(specId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(specId);
      this.watchedPaths.delete(specId);
      console.log(`[TaskLogService] Stopped watching ${specId}`);
    }
  }

  /**
   * Emit streaming updates for new log entries
   */
  private emitNewEntries(specId: string, previousLogs: TaskLogs | undefined, currentLogs: TaskLogs): void {
    const phases: TaskLogPhase[] = ['planning', 'coding', 'validation'];

    for (const phase of phases) {
      const prevPhase = previousLogs?.phases[phase];
      const currPhase = currentLogs.phases[phase];

      if (!currPhase) continue;

      // Check for phase status changes
      if (prevPhase?.status !== currPhase.status) {
        if (currPhase.status === 'active') {
          this.emit('stream-chunk', specId, {
            type: 'phase_start',
            phase,
            timestamp: currPhase.started_at || new Date().toISOString()
          } as TaskLogStreamChunk);
        } else if (currPhase.status === 'completed' || currPhase.status === 'failed') {
          this.emit('stream-chunk', specId, {
            type: 'phase_end',
            phase,
            timestamp: currPhase.completed_at || new Date().toISOString()
          } as TaskLogStreamChunk);
        }
      }

      // Check for new entries
      const prevEntryCount = prevPhase?.entries.length || 0;
      const currEntryCount = currPhase.entries.length;

      if (currEntryCount > prevEntryCount) {
        for (let i = prevEntryCount; i < currEntryCount; i++) {
          const entry = currPhase.entries[i];

          const streamUpdate: TaskLogStreamChunk = {
            type: entry.type as TaskLogStreamChunk['type'],
            content: entry.content,
            phase: entry.phase,
            timestamp: entry.timestamp,
            subtask_id: entry.subtask_id
          };

          if (entry.tool_name) {
            streamUpdate.tool = {
              name: entry.tool_name,
              input: entry.tool_input
            };
          }

          this.emit('stream-chunk', specId, streamUpdate);
        }
      }
    }
  }

  /**
   * Check if logs exist for a spec
   */
  hasLogs(projectPath: string, specId: string): boolean {
    const mainLogFile = path.join(projectPath, '.auto-claude', 'specs', specId, 'task_logs.json');
    const worktreeLogFile = path.join(projectPath, '.worktrees', specId, '.auto-claude', 'specs', specId, 'task_logs.json');
    return existsSync(mainLogFile) || existsSync(worktreeLogFile);
  }
}

// Singleton instance
export const taskLogService = new TaskLogService();
