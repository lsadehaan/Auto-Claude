/**
 * Web API Client
 *
 * HTTP/WebSocket-based API for web deployment.
 * Uses a Proxy pattern to automatically generate API methods from channel mappings,
 * drastically reducing code duplication.
 *
 * Most methods are auto-generated from channel-mapping.ts.
 * Only special cases (WebSocket events, terminal I/O, etc.) are manually implemented.
 */

import { WebSocketClient } from './websocket-client';
import { CHANNEL_TO_HTTP, buildPath, getRemainingArgs, type EndpointMapping } from './channel-mapping';

// Get API URLs from environment or use defaults
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api';
const WS_BASE_URL = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:3001';

// WebSocket client singleton
let wsClient: WebSocketClient | null = null;

function getWsClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient(WS_BASE_URL);
  }
  return wsClient;
}

// ============================================================================
// HTTP Request Helper
// ============================================================================

interface IPCResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  queryParams?: Record<string, string>
): Promise<IPCResult<T>> {
  try {
    let url = `${API_BASE_URL}${path}`;

    // Add query params for GET requests
    if (queryParams && Object.keys(queryParams).length > 0) {
      const params = new URLSearchParams(queryParams);
      url += `?${params.toString()}`;
    }

    console.log('[WebAPI] Request:', { method, url, body });

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });

    const result = await response.json();
    console.log('[WebAPI] Response:', { url, result });

    return result;
  } catch (error) {
    console.error('[WebAPI] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

// ============================================================================
// Method Name to Channel Mapping
// ============================================================================

/**
 * Maps common method name patterns to IPC channels
 */
const METHOD_TO_CHANNEL: Record<string, string> = {
  // Projects
  getProjects: 'project:list',
  addProject: 'project:add',
  removeProject: 'project:remove',
  updateProjectSettings: 'project:updateSettings',
  initializeProject: 'project:initialize',
  updateProjectAutoBuild: 'project:updateAutoBuild',
  checkProjectVersion: 'project:checkVersion',

  // Tab state
  getTabState: 'tabState:get',
  saveTabState: 'tabState:save',

  // Tasks
  getTasks: 'task:list',
  createTask: 'task:create',
  deleteTask: 'task:delete',
  updateTask: 'task:update',
  startTask: 'task:start',
  stopTask: 'task:stop',
  reviewTask: 'task:review',
  updateTaskStatus: 'task:updateStatus',
  recoverStuckTask: 'task:recoverStuck',
  checkTaskRunning: 'task:checkRunning',
  archiveTask: 'task:archive',
  unarchiveTask: 'task:unarchive',

  // Worktrees
  getWorktreeStatus: 'task:worktreeStatus',
  getWorktreeDiff: 'task:worktreeDiff',
  mergeWorktree: 'task:worktreeMerge',
  mergeWorktreePreview: 'task:worktreeMergePreview',
  discardWorktree: 'task:worktreeDiscard',
  listWorktrees: 'task:listWorktrees',

  // Task logs
  getTaskLogs: 'task:logsGet',
  watchTaskLogs: 'task:logsWatch',
  unwatchTaskLogs: 'task:logsUnwatch',

  // Terminals
  createTerminal: 'terminal:create',
  destroyTerminal: 'terminal:destroy',
  resizeTerminal: 'terminal:resize',
  invokeClaudeInTerminal: 'terminal:invokeClaude',
  generateTerminalName: 'terminal:generateName',
  getTerminalSessions: 'terminal:getSessions',
  restoreTerminalSession: 'terminal:restoreSession',
  clearTerminalSessions: 'terminal:clearSessions',
  resumeTerminalClaude: 'terminal:resumeClaude',
  getTerminalSessionDates: 'terminal:getSessionDates',
  getTerminalSessionsForDate: 'terminal:getSessionsForDate',
  restoreTerminalFromDate: 'terminal:restoreFromDate',

  // Settings
  getSettings: 'settings:get',
  saveSettings: 'settings:save',

  // Claude profiles
  getClaudeProfiles: 'claude:profilesGet',
  saveClaudeProfile: 'claude:profileSave',
  deleteClaudeProfile: 'claude:profileDelete',
  renameClaudeProfile: 'claude:profileRename',
  setActiveClaudeProfile: 'claude:profileSetActive',
  switchClaudeProfile: 'claude:profileSwitch',
  initializeClaudeProfile: 'claude:profileInitialize',
  setClaudeProfileToken: 'claude:profileSetToken',
  getAutoSwitchSettings: 'claude:autoSwitchSettings',
  updateAutoSwitchSettings: 'claude:updateAutoSwitch',
  fetchClaudeUsage: 'claude:fetchUsage',
  getBestClaudeProfile: 'claude:getBestProfile',

  // GitHub
  getGitHubRepositories: 'github:getRepositories',
  getGitHubIssues: 'github:getIssues',
  getGitHubIssue: 'github:getIssue',
  getGitHubIssueComments: 'github:getIssueComments',
  checkGitHubConnection: 'github:checkConnection',
  investigateGitHubIssue: 'github:investigateIssue',
  importGitHubIssues: 'github:importIssues',
  createGitHubRelease: 'github:createRelease',
  checkGitHubCli: 'github:checkCli',
  checkGitHubAuth: 'github:checkAuth',
  startGitHubAuth: 'github:startAuth',
  getGitHubToken: 'github:getToken',
  getGitHubUser: 'github:getUser',
  listGitHubUserRepos: 'github:listUserRepos',
  detectGitHubRepo: 'github:detectRepo',
  getGitHubBranches: 'github:getBranches',
  createGitHubRepo: 'github:createRepo',
  addGitHubRemote: 'github:addRemote',
  listGitHubOrgs: 'github:listOrgs',

  // Linear
  getLinearTeams: 'linear:getTeams',
  getLinearProjects: 'linear:getProjects',
  getLinearIssues: 'linear:getIssues',
  importLinearIssues: 'linear:importIssues',
  checkLinearConnection: 'linear:checkConnection',

  // Roadmap
  getRoadmap: 'roadmap:get',
  getRoadmapStatus: 'roadmap:getStatus',
  saveRoadmap: 'roadmap:save',
  generateRoadmap: 'roadmap:generate',
  generateRoadmapWithCompetitor: 'roadmap:generateWithCompetitor',
  refreshRoadmap: 'roadmap:refresh',
  stopRoadmap: 'roadmap:stop',
  updateRoadmapFeature: 'roadmap:updateFeature',
  convertFeatureToSpec: 'roadmap:convertToSpec',

  // Ideation
  getIdeation: 'ideation:get',
  generateIdeation: 'ideation:generate',
  refreshIdeation: 'ideation:refresh',
  stopIdeation: 'ideation:stop',
  updateIdeaStatus: 'ideation:updateIdea',
  convertIdeaToTask: 'ideation:convertToTask',
  dismissIdea: 'ideation:dismiss',
  dismissAllIdeas: 'ideation:dismissAll',
  archiveIdea: 'ideation:archive',
  deleteIdea: 'ideation:delete',
  deleteMultipleIdeas: 'ideation:deleteMultiple',

  // Context
  getProjectContext: 'context:get',
  refreshProjectIndex: 'context:refreshIndex',
  getMemoryStatus: 'context:memoryStatus',
  searchMemories: 'context:searchMemories',
  getRecentMemories: 'context:getMemories',

  // Environment
  getProjectEnv: 'env:get',
  updateProjectEnv: 'env:update',
  checkClaudeAuth: 'env:checkClaudeAuth',
  invokeClaudeSetup: 'env:invokeClaudeSetup',

  // Dialogs
  selectDirectory: 'dialog:selectDirectory',
  createProjectFolder: 'dialog:createProjectFolder',
  getDefaultProjectLocation: 'dialog:getDefaultProjectLocation',

  // Files
  listDirectory: 'fileExplorer:list',

  // Git
  getGitBranches: 'git:getBranches',
  getCurrentGitBranch: 'git:getCurrentBranch',
  detectMainBranch: 'git:detectMainBranch',
  checkGitStatus: 'git:checkStatus',
  initializeGit: 'git:initialize',

  // App
  getAppVersion: 'app:version',

  // Shell
  openExternal: 'shell:openExternal',

  // Changelog
  getChangelogDoneTasks: 'changelog:getDoneTasks',
  loadChangelogTaskSpecs: 'changelog:loadTaskSpecs',
  generateChangelog: 'changelog:generate',
  saveChangelog: 'changelog:save',
  readExistingChangelog: 'changelog:readExisting',
  suggestChangelogVersion: 'changelog:suggestVersion',
  suggestChangelogVersionFromCommits: 'changelog:suggestVersionFromCommits',
  getChangelogBranches: 'changelog:getBranches',
  getChangelogTags: 'changelog:getTags',
  getChangelogCommitsPreview: 'changelog:getCommitsPreview',
  saveChangelogImage: 'changelog:saveImage',
  readChangelogLocalImage: 'changelog:readLocalImage',

  // Insights
  getInsightsSession: 'insights:getSession',
  sendInsightsMessage: 'insights:sendMessage',
  clearInsightsSession: 'insights:clearSession',
  createTaskFromInsights: 'insights:createTask',
  listInsightsSessions: 'insights:listSessions',
  newInsightsSession: 'insights:newSession',
  switchInsightsSession: 'insights:switchSession',
  deleteInsightsSession: 'insights:deleteSession',
  renameInsightsSession: 'insights:renameSession',
  updateInsightsModelConfig: 'insights:updateModelConfig',

  // Memory
  getMemoryInfrastructureStatus: 'memory:status',
  listMemoryDatabases: 'memory:listDatabases',
  testMemoryConnection: 'memory:testConnection',

  // Graphiti
  validateLLMApiKey: 'graphiti:validateLlm',
  testGraphitiConnection: 'graphiti:testConnection',

  // Ollama
  checkOllamaStatus: 'ollama:checkStatus',
  listOllamaModels: 'ollama:listModels',
  listOllamaEmbeddingModels: 'ollama:listEmbeddingModels',
  pullOllamaModel: 'ollama:pullModel',

  // Auto build source
  checkAutoBuildSource: 'autobuild:source:check',
  downloadAutoBuildSource: 'autobuild:source:download',
  getAutoBuildSourceVersion: 'autobuild:source:version',
  getAutoBuildSourceEnv: 'autobuild:source:env:get',
  updateAutoBuildSourceEnv: 'autobuild:source:env:update',
  checkAutoBuildSourceToken: 'autobuild:source:env:checkToken',

  // Release
  suggestReleaseVersion: 'release:suggestVersion',
  createRelease: 'release:create',
  runReleasePreflight: 'release:preflight',
  getReleaseVersions: 'release:getVersions',
};

// ============================================================================
// Auto-generate API method from mapping
// ============================================================================

function createAutoMethod(mapping: EndpointMapping) {
  return async (...args: unknown[]): Promise<IPCResult> => {
    const path = buildPath(mapping, args);
    const remainingArgs = getRemainingArgs(mapping, args);

    if (mapping.method === 'GET') {
      // Build query params from remaining args
      const queryParams: Record<string, string> = {};
      if (mapping.queryParams) {
        mapping.queryParams.forEach((param, index) => {
          if (remainingArgs[index] !== undefined) {
            queryParams[param] = String(remainingArgs[index]);
          }
        });
      }
      return request(mapping.method, path, undefined, queryParams);
    } else {
      // POST/PUT/DELETE - remaining args become body
      let body: unknown = undefined;
      if (remainingArgs.length === 1) {
        body = remainingArgs[0];
      } else if (remainingArgs.length > 1) {
        body = remainingArgs;
      }
      return request(mapping.method, path, body);
    }
  };
}

// ============================================================================
// Stub utilities for unimplemented features
// ============================================================================

function stubError(name: string, error: string = 'Not implemented in web mode'): () => Promise<IPCResult<never>> {
  return async () => {
    console.warn(`[WebAPI] ${name} - ${error}`);
    return { success: false, error };
  };
}

function stubEvent(name: string): (callback: unknown) => () => void {
  return () => {
    console.debug(`[WebAPI] ${name} - Event listener registered (web mode)`);
    return () => {};
  };
}

// ============================================================================
// Create Web API with Proxy
// ============================================================================

export function createWebAPI() {
  const ws = getWsClient();

  // Manual overrides for special cases
  const manualMethods: Record<string, unknown> = {
    // ========================================================================
    // Auth (special - not from IPC channels)
    // ========================================================================
    checkAuthStatus: () => request('GET', '/auth/status'),
    login: (password: string) => request('POST', '/auth/login', { password }),
    logout: () => request('POST', '/auth/logout'),

    // ========================================================================
    // Terminal I/O (needs WebSocket)
    // ========================================================================
    createTerminal: async (options: { id: string; cwd?: string; cols?: number; rows?: number; projectPath?: string }) => {
      const result = await request<{ id: string }>('POST', '/terminals', options);
      if (result.success) {
        try {
          await ws.connectTerminal(options.id);
        } catch (e) {
          console.error('Failed to connect terminal WebSocket:', e);
        }
      }
      return result;
    },

    destroyTerminal: async (terminalId: string) => {
      ws.disconnectTerminal(terminalId);
      return request('DELETE', `/terminals/${terminalId}`);
    },

    sendTerminalInput: (terminalId: string, data: string) => {
      ws.sendTerminalInput(terminalId, data);
    },

    resizeTerminal: (terminalId: string, cols: number, rows: number) => {
      ws.resizeTerminal(terminalId, cols, rows);
      request('POST', `/terminals/${terminalId}/resize`, { cols, rows });
    },

    // ========================================================================
    // WebSocket Event Subscriptions
    // ========================================================================

    // Terminal events
    onTerminalOutput: (callback: (terminalId: string, data: string) => void) =>
      ws.subscribe('terminal:output', callback),
    onTerminalExit: (callback: (terminalId: string, exitCode: number) => void) =>
      ws.subscribe('terminal:exit', callback),
    onTerminalTitleChange: (callback: (terminalId: string, title: string) => void) =>
      ws.subscribe('terminal:titleChange', callback),
    onTerminalClaudeSession: (callback: unknown) => ws.subscribe('terminal:claudeSession', callback),
    onTerminalRateLimit: (callback: unknown) => ws.subscribe('terminal:rateLimit', callback),
    onTerminalOAuthToken: (callback: unknown) => ws.subscribe('oauth:token', callback),

    // Task events
    onTaskProgress: (callback: unknown) => ws.subscribe('task:progress', callback),
    onTaskError: (callback: unknown) => ws.subscribe('task:error', callback),
    onTaskLog: (callback: unknown) => ws.subscribe('task:log', callback),
    onTaskStatusChange: (callback: unknown) => ws.subscribe('task:statusChange', callback),
    onTaskExecutionProgress: (callback: unknown) => ws.subscribe('task:progress', callback),
    onTaskExecutionError: (callback: unknown) => ws.subscribe('task:error', callback),
    onTaskExecutionLog: (callback: unknown) => ws.subscribe('task:log', callback),
    onTaskExecutionComplete: (callback: unknown) => ws.subscribe('task:complete', callback),
    onTaskLogsChanged: (callback: unknown) => ws.subscribe('task:logsChanged', callback),

    // Roadmap events
    onRoadmapProgress: (callback: unknown) => ws.subscribe('roadmap:progress', callback),
    onRoadmapComplete: (callback: unknown) => ws.subscribe('roadmap:complete', callback),
    onRoadmapError: (callback: unknown) => ws.subscribe('roadmap:error', callback),
    onRoadmapStopped: (callback: unknown) => ws.subscribe('roadmap:stopped', callback),

    // Ideation events
    onIdeationProgress: (callback: unknown) => ws.subscribe('ideation:progress', callback),
    onIdeationComplete: (callback: unknown) => ws.subscribe('ideation:complete', callback),
    onIdeationError: (callback: unknown) => ws.subscribe('ideation:error', callback),
    onIdeationStopped: (callback: unknown) => ws.subscribe('ideation:stopped', callback),
    onIdeationLog: (callback: unknown) => ws.subscribe('ideation:log', callback),
    onIdeationTypeComplete: (callback: unknown) => ws.subscribe('ideation:typeComplete', callback),
    onIdeationTypeFailed: (callback: unknown) => ws.subscribe('ideation:typeFailed', callback),

    // Insights events
    onInsightsStreamChunk: (callback: unknown) => ws.subscribe('insights:chunk', callback),
    onInsightsStatus: (callback: unknown) => ws.subscribe('insights:status', callback),
    onInsightsError: (callback: unknown) => ws.subscribe('insights:error', callback),

    // Changelog events
    onChangelogProgress: (callback: unknown) => ws.subscribe('changelog:progress', callback),
    onChangelogComplete: (callback: unknown) => ws.subscribe('changelog:complete', callback),
    onChangelogError: (callback: unknown) => ws.subscribe('changelog:error', callback),
    onChangelogGenerationProgress: (callback: unknown) => ws.subscribe('changelog:generationProgress', callback),
    onChangelogGenerationComplete: (callback: unknown) => ws.subscribe('changelog:generationComplete', callback),
    onChangelogGenerationError: (callback: unknown) => ws.subscribe('changelog:generationError', callback),

    // GitHub events
    onGitHubInvestigationProgress: (callback: unknown) => ws.subscribe('github:investigationProgress', callback),
    onGitHubInvestigationComplete: (callback: unknown) => ws.subscribe('github:investigationComplete', callback),
    onGitHubInvestigationError: (callback: unknown) => ws.subscribe('github:investigationError', callback),

    // Shell events (from electron shim)
    onShellOpenExternal: (callback: (data: { url: string }) => void) =>
      ws.subscribe('shell:openExternal', callback),
    onShellOpenPath: (callback: (data: { path: string }) => void) =>
      ws.subscribe('shell:openPath', callback),

    // SDK/Usage events
    onSDKRateLimit: (callback: unknown) => ws.subscribe('sdk:rateLimit', callback),
    onUsageUpdated: (callback: unknown) => ws.subscribe('usage:updated', callback),
    onProactiveSwapNotification: (callback: unknown) => ws.subscribe('proactiveSwap', callback),

    // App update events (stub for web)
    onAppUpdateAvailable: stubEvent('onAppUpdateAvailable'),
    onAppUpdateDownloaded: stubEvent('onAppUpdateDownloaded'),
    onAppUpdateError: stubEvent('onAppUpdateError'),
    onAppUpdateProgress: stubEvent('onAppUpdateProgress'),
    onAutoBuildSourceUpdateProgress: stubEvent('onAutoBuildSourceUpdateProgress'),
    onDownloadProgress: stubEvent('onDownloadProgress'),

    // App version
    getAppVersion: async () => '2.7.2-web',

    // ========================================================================
    // Browser-native implementations
    // ========================================================================
    openExternal: async (url: string) => {
      window.open(url, '_blank');
      return { success: true };
    },

    copyToClipboard: async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        return { success: true };
      } catch {
        return { success: false, error: 'Clipboard access denied' };
      }
    },

    // ========================================================================
    // Not available in web mode
    // ========================================================================
    selectDirectory: async () => {
      console.warn('[WebAPI] selectDirectory - Not available in web mode');
      return null;
    },

    // Window controls (N/A for web)
    minimizeWindow: async () => {},
    maximizeWindow: async () => {},
    closeWindow: async () => {},
    isWindowMaximized: async () => ({ success: true, data: false }),

    // App updates (N/A for web)
    checkForUpdates: async () => ({ success: true, data: undefined }),
    checkAppUpdate: async () => ({ success: true, data: { updateAvailable: false } }),
    downloadUpdate: stubError('downloadUpdate', 'Not available in web mode'),
    downloadAppUpdate: stubError('downloadAppUpdate', 'Not available in web mode'),
    installUpdate: stubError('installUpdate', 'Not available in web mode'),
    installAppUpdate: stubError('installAppUpdate', 'Not available in web mode'),

    // NOTE: initializeClaudeProfile is auto-generated from channel mapping
    // It calls POST /api/claude/profiles/{id}/initialize which returns requiresManualToken

    // ========================================================================
    // WebSocket management
    // ========================================================================
    setActiveProject: (projectId: string) => {
      ws.setProject(projectId);
    },

    isWebSocketConnected: () => ws.isConnected(),
  };

  // Create Proxy that auto-generates methods from channel mappings
  return new Proxy(manualMethods, {
    get(target, prop: string) {
      // First check manual overrides
      if (prop in target) {
        return target[prop];
      }

      // Try to find channel mapping for this method
      const channel = METHOD_TO_CHANNEL[prop];
      if (channel && channel in CHANNEL_TO_HTTP) {
        const mapping = CHANNEL_TO_HTTP[channel];
        return createAutoMethod(mapping);
      }

      // Fallback: try direct channel lookup (for methods named exactly like channels)
      const directChannel = prop.replace(/([A-Z])/g, ':$1').toLowerCase();
      if (directChannel in CHANNEL_TO_HTTP) {
        const mapping = CHANNEL_TO_HTTP[directChannel];
        return createAutoMethod(mapping);
      }

      // Unknown method - return stub
      console.warn(`[WebAPI] Unknown method: ${prop}`);
      return stubError(prop, `Method '${prop}' not implemented`);
    },
  }) as WebAPI;
}

// Export type (for type safety when using the API)
export type WebAPI = ReturnType<typeof createWebAPI>;
