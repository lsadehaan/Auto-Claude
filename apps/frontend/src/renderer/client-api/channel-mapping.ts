/**
 * IPC Channel to HTTP Endpoint Mapping
 *
 * This file defines how IPC channels map to HTTP endpoints.
 * The web-api uses this to automatically convert method calls to HTTP requests.
 *
 * Pattern syntax:
 * - {0}, {1}, etc. - Positional arguments from method call
 * - Arguments after path substitution are sent as request body (POST/PUT/DELETE) or query params (GET)
 */

export interface EndpointMapping {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  /** Which args go into the path (by index). Remaining args become body/query */
  pathArgs?: number[];
  /** For GET requests, map remaining args to these query param names */
  queryParams?: string[];
  /** For POST/PUT/DELETE, map remaining args to these body param names */
  bodyParams?: string[];
  /** Custom body builder for complex cases */
  bodyBuilder?: 'wrap' | 'spread' | 'first';
}

/**
 * Maps IPC channel names to HTTP endpoints
 *
 * Convention:
 * - {0} = first arg, {1} = second arg, etc.
 * - Remaining args after path substitution become request body
 */
export const CHANNEL_TO_HTTP: Record<string, EndpointMapping> = {
  // ============================================================================
  // Project Operations
  // ============================================================================
  'project:list': { method: 'GET', path: '/projects' },
  'project:add': { method: 'POST', path: '/projects', bodyBuilder: 'wrap' },
  'project:create': { method: 'POST', path: '/projects/create', bodyParams: ['name', 'initGit'] },
  'project:clone': { method: 'POST', path: '/projects/clone', bodyParams: ['gitUrl', 'name'] },
  'project:remove': { method: 'DELETE', path: '/projects/{0}', pathArgs: [0] },
  'project:updateSettings': { method: 'PUT', path: '/projects/{0}/settings', pathArgs: [0] },
  'project:initialize': { method: 'POST', path: '/projects/{0}/initialize', pathArgs: [0] },
  'project:updateAutoBuild': { method: 'POST', path: '/projects/{0}/initialize', pathArgs: [0] },
  'project:checkVersion': { method: 'GET', path: '/projects/{0}/version', pathArgs: [0] },

  // Tab state
  'tabState:get': { method: 'GET', path: '/settings/tabs' },
  'tabState:save': { method: 'PUT', path: '/settings/tabs' },

  // ============================================================================
  // Task Operations
  // ============================================================================
  'task:list': { method: 'GET', path: '/tasks', queryParams: ['projectId', 'projectPath'] },
  'task:create': { method: 'POST', path: '/tasks' },
  'task:delete': { method: 'DELETE', path: '/tasks/{0}', pathArgs: [0] },
  'task:update': { method: 'PUT', path: '/tasks/{0}', pathArgs: [0] },
  'task:start': { method: 'POST', path: '/tasks/{0}/start', pathArgs: [0] },
  'task:stop': { method: 'POST', path: '/tasks/{0}/stop', pathArgs: [0] },
  'task:review': { method: 'GET', path: '/tasks/{0}/review', pathArgs: [0] },
  'task:updateStatus': { method: 'PUT', path: '/tasks/{0}/status', pathArgs: [0] },
  'task:recoverStuck': { method: 'POST', path: '/tasks/{0}/recover', pathArgs: [0] },
  'task:checkRunning': { method: 'GET', path: '/tasks/running/list' },

  // Worktree operations
  'task:worktreeStatus': { method: 'GET', path: '/projects/{0}/worktrees/{1}/status', pathArgs: [0, 1] },
  'task:worktreeDiff': { method: 'GET', path: '/projects/{0}/worktrees/{1}/diff', pathArgs: [0, 1] },
  'task:worktreeMerge': { method: 'POST', path: '/projects/{0}/worktrees/{1}/merge', pathArgs: [0, 1] },
  'task:worktreeMergePreview': { method: 'GET', path: '/projects/{0}/worktrees/{1}/merge-preview', pathArgs: [0, 1] },
  'task:worktreeDiscard': { method: 'DELETE', path: '/projects/{0}/worktrees/{1}', pathArgs: [0, 1] },
  'task:listWorktrees': { method: 'GET', path: '/projects/{0}/worktrees', pathArgs: [0] },
  'task:archive': { method: 'POST', path: '/tasks/{0}/archive', pathArgs: [0] },
  'task:unarchive': { method: 'POST', path: '/tasks/{0}/unarchive', pathArgs: [0] },

  // Task logs
  'task:logsGet': { method: 'GET', path: '/tasks/{0}/logs', pathArgs: [0] },
  'task:logsWatch': { method: 'POST', path: '/tasks/{0}/logs/watch', pathArgs: [0] },
  'task:logsUnwatch': { method: 'POST', path: '/tasks/{0}/logs/unwatch', pathArgs: [0] },

  // ============================================================================
  // Terminal Operations
  // ============================================================================
  'terminal:create': { method: 'POST', path: '/terminals' },
  'terminal:destroy': { method: 'DELETE', path: '/terminals/{0}', pathArgs: [0] },
  'terminal:resize': { method: 'POST', path: '/terminals/{0}/resize', pathArgs: [0] },
  'terminal:invokeClaude': { method: 'POST', path: '/terminals/{0}/claude', pathArgs: [0] },
  'terminal:generateName': { method: 'POST', path: '/terminals/{0}/generate-name', pathArgs: [0] },
  'terminal:getSessions': { method: 'GET', path: '/terminals/sessions' },
  'terminal:restoreSession': { method: 'POST', path: '/terminals/sessions/{0}/restore', pathArgs: [0] },
  'terminal:clearSessions': { method: 'DELETE', path: '/terminals/sessions' },
  'terminal:resumeClaude': { method: 'POST', path: '/terminals/{0}/resume-claude', pathArgs: [0] },
  'terminal:getSessionDates': { method: 'GET', path: '/terminals/sessions/dates' },
  'terminal:getSessionsForDate': { method: 'GET', path: '/terminals/sessions/date/{0}', pathArgs: [0] },
  'terminal:restoreFromDate': { method: 'POST', path: '/terminals/sessions/date/{0}/restore', pathArgs: [0] },

  // ============================================================================
  // Settings Operations
  // ============================================================================
  'settings:get': { method: 'GET', path: '/settings' },
  'settings:save': { method: 'PUT', path: '/settings' },

  // ============================================================================
  // Claude Profile Operations
  // ============================================================================
  'claude:profilesGet': { method: 'GET', path: '/claude/profiles' },
  'claude:profileSave': { method: 'POST', path: '/claude/profiles' },
  'claude:profileDelete': { method: 'DELETE', path: '/claude/profiles/{0}', pathArgs: [0] },
  'claude:profileRename': { method: 'PUT', path: '/claude/profiles/{0}/rename', pathArgs: [0] },
  'claude:profileSetActive': { method: 'POST', path: '/claude/profiles/{0}/activate', pathArgs: [0] },
  'claude:profileSwitch': { method: 'POST', path: '/claude/profiles/{0}/switch', pathArgs: [0] },
  'claude:profileInitialize': { method: 'POST', path: '/claude/profiles/{0}/initialize', pathArgs: [0] },
  'claude:profileSetToken': { method: 'POST', path: '/claude/profiles/{0}/token', pathArgs: [0] },
  'claude:autoSwitchSettings': { method: 'GET', path: '/claude/auto-switch' },
  'claude:updateAutoSwitch': { method: 'PUT', path: '/claude/auto-switch' },
  'claude:fetchUsage': { method: 'GET', path: '/claude/profiles/{0}/usage', pathArgs: [0] },
  'claude:getBestProfile': { method: 'GET', path: '/claude/profiles/best' },

  // ============================================================================
  // GitHub Operations
  // ============================================================================
  'github:getRepositories': { method: 'GET', path: '/github/projects/{0}/repositories', pathArgs: [0] },
  'github:getIssues': { method: 'GET', path: '/github/projects/{0}/issues', pathArgs: [0] },
  'github:getIssue': { method: 'GET', path: '/github/projects/{0}/issues/{1}', pathArgs: [0, 1] },
  'github:getIssueComments': { method: 'GET', path: '/github/projects/{0}/issues/{1}/comments', pathArgs: [0, 1] },
  'github:checkConnection': { method: 'GET', path: '/github/projects/{0}/status', pathArgs: [0] },
  'github:investigateIssue': { method: 'POST', path: '/github/projects/{0}/issues/{1}/investigate', pathArgs: [0, 1] },
  'github:importIssues': { method: 'POST', path: '/github/projects/{0}/issues/import', pathArgs: [0] },
  'github:createRelease': { method: 'POST', path: '/github/projects/{0}/releases', pathArgs: [0] },
  'github:checkCli': { method: 'GET', path: '/github/cli/status' },
  'github:checkAuth': { method: 'GET', path: '/github/auth/status' },
  'github:startAuth': { method: 'POST', path: '/github/auth/start' },
  'github:getToken': { method: 'GET', path: '/github/auth/token' },
  'github:getUser': { method: 'GET', path: '/github/user' },
  'github:listUserRepos': { method: 'GET', path: '/github/user/repos' },
  'github:detectRepo': { method: 'GET', path: '/github/projects/{0}/detect-repo', pathArgs: [0] },
  'github:getBranches': { method: 'GET', path: '/github/projects/{0}/branches', pathArgs: [0] },
  'github:createRepo': { method: 'POST', path: '/github/repos' },
  'github:addRemote': { method: 'POST', path: '/github/projects/{0}/remote', pathArgs: [0] },
  'github:listOrgs': { method: 'GET', path: '/github/orgs' },

  // ============================================================================
  // Linear Operations
  // ============================================================================
  'linear:getTeams': { method: 'GET', path: '/linear/teams' },
  'linear:getProjects': { method: 'GET', path: '/linear/projects/{0}', pathArgs: [0] },
  'linear:getIssues': { method: 'GET', path: '/linear/projects/{0}/issues', pathArgs: [0] },
  'linear:importIssues': { method: 'POST', path: '/linear/projects/{0}/issues/import', pathArgs: [0] },
  'linear:checkConnection': { method: 'GET', path: '/linear/projects/{0}/status', pathArgs: [0] },

  // ============================================================================
  // Roadmap Operations
  // ============================================================================
  'roadmap:get': { method: 'GET', path: '/roadmap/projects/{0}', pathArgs: [0] },
  'roadmap:getStatus': { method: 'GET', path: '/roadmap/projects/{0}/status', pathArgs: [0] },
  'roadmap:save': { method: 'PUT', path: '/roadmap/projects/{0}', pathArgs: [0] },
  'roadmap:generate': { method: 'POST', path: '/roadmap/projects/{0}/generate', pathArgs: [0] },
  'roadmap:generateWithCompetitor': { method: 'POST', path: '/roadmap/projects/{0}/generate', pathArgs: [0] },
  'roadmap:refresh': { method: 'POST', path: '/roadmap/projects/{0}/refresh', pathArgs: [0] },
  'roadmap:stop': { method: 'POST', path: '/roadmap/projects/{0}/stop', pathArgs: [0] },
  'roadmap:updateFeature': { method: 'PUT', path: '/roadmap/projects/{0}/features/{1}', pathArgs: [0, 1] },
  'roadmap:convertToSpec': { method: 'POST', path: '/roadmap/projects/{0}/features/{1}/convert', pathArgs: [0, 1] },

  // ============================================================================
  // Ideation Operations
  // ============================================================================
  'ideation:get': { method: 'GET', path: '/ideation/projects/{0}', pathArgs: [0] },
  'ideation:generate': { method: 'POST', path: '/ideation/projects/{0}/generate', pathArgs: [0] },
  'ideation:refresh': { method: 'POST', path: '/ideation/projects/{0}/generate', pathArgs: [0] },
  'ideation:stop': { method: 'POST', path: '/ideation/projects/{0}/stop', pathArgs: [0] },
  'ideation:updateIdea': { method: 'PUT', path: '/ideation/projects/{0}/ideas/{1}/status', pathArgs: [0, 1] },
  'ideation:convertToTask': { method: 'POST', path: '/ideation/projects/{0}/ideas/{1}/convert', pathArgs: [0, 1] },
  'ideation:dismiss': { method: 'POST', path: '/ideation/projects/{0}/ideas/{1}/dismiss', pathArgs: [0, 1] },
  'ideation:dismissAll': { method: 'POST', path: '/ideation/projects/{0}/dismiss-all', pathArgs: [0] },
  'ideation:archive': { method: 'POST', path: '/ideation/projects/{0}/ideas/{1}/archive', pathArgs: [0, 1] },
  'ideation:delete': { method: 'DELETE', path: '/ideation/projects/{0}/ideas/{1}', pathArgs: [0, 1] },
  'ideation:deleteMultiple': { method: 'POST', path: '/ideation/projects/{0}/delete-multiple', pathArgs: [0] },

  // ============================================================================
  // Context Operations
  // ============================================================================
  'context:get': { method: 'GET', path: '/context/projects/{0}', pathArgs: [0] },
  'context:refreshIndex': { method: 'POST', path: '/context/projects/{0}/refresh', pathArgs: [0] },
  'context:memoryStatus': { method: 'GET', path: '/context/projects/{0}/memory-status', pathArgs: [0] },
  'context:searchMemories': { method: 'GET', path: '/context/projects/{0}/memories/search', pathArgs: [0], queryParams: ['query'] },
  'context:getMemories': { method: 'GET', path: '/context/projects/{0}/memories', pathArgs: [0], queryParams: ['limit'] },

  // ============================================================================
  // Environment Configuration
  // ============================================================================
  'env:get': { method: 'GET', path: '/projects/{0}/env', pathArgs: [0] },
  'env:update': { method: 'PUT', path: '/projects/{0}/env', pathArgs: [0] },
  'env:checkClaudeAuth': { method: 'GET', path: '/projects/{0}/env/claude-auth', pathArgs: [0] },
  'env:invokeClaudeSetup': { method: 'POST', path: '/projects/{0}/env/claude-setup', pathArgs: [0] },

  // ============================================================================
  // Dialog Operations (Web alternatives)
  // ============================================================================
  'dialog:selectDirectory': { method: 'GET', path: '/files/select-directory' },
  'dialog:createProjectFolder': { method: 'POST', path: '/files/create-project-folder' },
  'dialog:getDefaultProjectLocation': { method: 'GET', path: '/projects/directory' },

  // ============================================================================
  // File Explorer
  // ============================================================================
  'fileExplorer:list': { method: 'GET', path: '/files', queryParams: ['path'] },

  // ============================================================================
  // Git Operations
  // ============================================================================
  'git:getBranches': { method: 'GET', path: '/projects/{0}/git/branches', pathArgs: [0] },
  'git:getCurrentBranch': { method: 'GET', path: '/projects/{0}/git/current-branch', pathArgs: [0] },
  'git:detectMainBranch': { method: 'GET', path: '/projects/{0}/git/main-branch', pathArgs: [0] },
  'git:checkStatus': { method: 'GET', path: '/projects/{0}/git/status', pathArgs: [0] },
  'git:initialize': { method: 'POST', path: '/projects/{0}/git/initialize', pathArgs: [0] },

  // ============================================================================
  // App Info
  // ============================================================================
  'app:version': { method: 'GET', path: '/version' },

  // ============================================================================
  // Shell Operations (handled via WebSocket events)
  // ============================================================================
  'shell:openExternal': { method: 'POST', path: '/shell/open-external' },

  // ============================================================================
  // Changelog Operations
  // ============================================================================
  'changelog:getDoneTasks': { method: 'GET', path: '/changelog/projects/{0}/done-tasks', pathArgs: [0] },
  'changelog:loadTaskSpecs': { method: 'GET', path: '/changelog/projects/{0}/specs', pathArgs: [0] },
  'changelog:generate': { method: 'POST', path: '/changelog/projects/{0}/generate', pathArgs: [0] },
  'changelog:save': { method: 'PUT', path: '/changelog/projects/{0}', pathArgs: [0] },
  'changelog:readExisting': { method: 'GET', path: '/changelog/projects/{0}', pathArgs: [0] },
  'changelog:suggestVersion': { method: 'GET', path: '/changelog/projects/{0}/suggest-version', pathArgs: [0] },
  'changelog:suggestVersionFromCommits': { method: 'POST', path: '/changelog/projects/{0}/suggest-version-from-commits', pathArgs: [0] },
  'changelog:getBranches': { method: 'GET', path: '/changelog/projects/{0}/branches', pathArgs: [0] },
  'changelog:getTags': { method: 'GET', path: '/changelog/projects/{0}/tags', pathArgs: [0] },
  'changelog:getCommitsPreview': { method: 'POST', path: '/changelog/projects/{0}/commits-preview', pathArgs: [0] },
  'changelog:saveImage': { method: 'POST', path: '/changelog/projects/{0}/image', pathArgs: [0] },
  'changelog:readLocalImage': { method: 'GET', path: '/changelog/projects/{0}/image', pathArgs: [0] },

  // ============================================================================
  // Insights Operations
  // ============================================================================
  'insights:getSession': { method: 'GET', path: '/insights/projects/{0}/session', pathArgs: [0] },
  'insights:sendMessage': { method: 'POST', path: '/insights/projects/{0}/message', pathArgs: [0] },
  'insights:clearSession': { method: 'DELETE', path: '/insights/projects/{0}/session', pathArgs: [0] },
  'insights:createTask': { method: 'POST', path: '/insights/projects/{0}/create-task', pathArgs: [0] },
  'insights:listSessions': { method: 'GET', path: '/insights/projects/{0}/sessions', pathArgs: [0] },
  'insights:newSession': { method: 'POST', path: '/insights/projects/{0}/sessions', pathArgs: [0] },
  'insights:switchSession': { method: 'POST', path: '/insights/projects/{0}/sessions/{1}/switch', pathArgs: [0, 1] },
  'insights:deleteSession': { method: 'DELETE', path: '/insights/projects/{0}/sessions/{1}', pathArgs: [0, 1] },
  'insights:renameSession': { method: 'PUT', path: '/insights/projects/{0}/sessions/{1}/rename', pathArgs: [0, 1] },
  'insights:updateModelConfig': { method: 'PUT', path: '/insights/projects/{0}/model-config', pathArgs: [0] },

  // ============================================================================
  // Memory Operations
  // ============================================================================
  'memory:status': { method: 'GET', path: '/memory/status', queryParams: ['dbPath'] },
  'memory:listDatabases': { method: 'GET', path: '/memory/databases', queryParams: ['dbPath'] },
  'memory:testConnection': { method: 'POST', path: '/memory/test-connection' },

  // ============================================================================
  // Graphiti Validation
  // ============================================================================
  'graphiti:validateLlm': { method: 'POST', path: '/graphiti/validate-llm' },
  'graphiti:testConnection': { method: 'POST', path: '/graphiti/test-connection' },

  // ============================================================================
  // Ollama Operations
  // ============================================================================
  'ollama:checkStatus': { method: 'GET', path: '/ollama/status', queryParams: ['baseUrl'] },
  'ollama:listModels': { method: 'GET', path: '/ollama/models', queryParams: ['baseUrl'] },
  'ollama:listEmbeddingModels': { method: 'GET', path: '/ollama/models/embedding', queryParams: ['baseUrl'] },
  'ollama:pullModel': { method: 'POST', path: '/ollama/models/pull' },

  // ============================================================================
  // Auto Build Source Operations
  // ============================================================================
  'autobuild:source:check': { method: 'GET', path: '/autobuild/source/check' },
  'autobuild:source:download': { method: 'POST', path: '/autobuild/source/download' },
  'autobuild:source:version': { method: 'GET', path: '/autobuild/source/version' },
  'autobuild:source:env:get': { method: 'GET', path: '/autobuild/source/env' },
  'autobuild:source:env:update': { method: 'PUT', path: '/autobuild/source/env' },
  'autobuild:source:env:checkToken': { method: 'GET', path: '/autobuild/source/env/check-token' },

  // ============================================================================
  // Release Operations
  // ============================================================================
  'release:suggestVersion': { method: 'GET', path: '/release/suggest-version' },
  'release:create': { method: 'POST', path: '/release/create' },
  'release:preflight': { method: 'GET', path: '/release/preflight' },
  'release:getVersions': { method: 'GET', path: '/release/versions' },
};

/**
 * Convert a method name like 'addProject' to IPC channel 'project:add'
 * This handles the common naming conventions used in the preload APIs
 */
export function methodNameToChannel(methodName: string): string | null {
  // Common prefixes and their channel prefixes
  const prefixMap: Record<string, string> = {
    'get': '',
    'add': '',
    'remove': '',
    'create': '',
    'delete': '',
    'update': '',
    'list': '',
    'save': '',
    'check': '',
    'start': '',
    'stop': '',
    'invoke': '',
    'refresh': '',
    'generate': '',
    'import': '',
    'search': '',
    'test': '',
    'validate': '',
    'scan': '',
    'download': '',
    'pull': '',
    'detect': '',
    'initialize': '',
    'switch': '',
    'rename': '',
    'clear': '',
    'restore': '',
    'resume': '',
    'recover': '',
    'archive': '',
    'unarchive': '',
    'discard': '',
    'merge': '',
    'convert': '',
    'dismiss': '',
    'select': '',
  };

  // Try to find the channel by iterating through our mapping
  // First, try exact match with common transformations
  for (const channel of Object.keys(CHANNEL_TO_HTTP)) {
    const parts = channel.split(':');
    if (parts.length !== 2) continue;

    const [prefix, action] = parts;

    // Transform channel action to method name style
    // e.g., 'project:add' -> 'addProject', 'task:list' -> 'listTasks' or 'getTasks'
    const actionCamel = action.charAt(0).toUpperCase() + action.slice(1);
    const prefixCamel = prefix.charAt(0).toUpperCase() + prefix.slice(1);

    // Check various naming patterns
    const patterns = [
      `${action}${prefixCamel}`,           // addProject
      `${action}${prefixCamel}s`,          // getProjects (plural)
      `get${prefixCamel}${actionCamel}`,   // getProjectVersion
      `${action}`,                          // just the action
      methodName,                           // exact match
    ];

    if (patterns.includes(methodName)) {
      return channel;
    }
  }

  return null;
}

/**
 * Build the path by substituting arguments
 */
export function buildPath(mapping: EndpointMapping, args: unknown[]): string {
  let path = mapping.path;
  const pathArgs = mapping.pathArgs || [];

  for (let i = 0; i < pathArgs.length; i++) {
    const argIndex = pathArgs[i];
    const value = args[argIndex];
    path = path.replace(`{${argIndex}}`, encodeURIComponent(String(value)));
  }

  return path;
}

/**
 * Get remaining args that should go into body/query
 */
export function getRemainingArgs(mapping: EndpointMapping, args: unknown[]): unknown[] {
  const pathArgs = new Set(mapping.pathArgs || []);
  return args.filter((_, index) => !pathArgs.has(index));
}
