/**
 * IPC Handlers Setup - Web Version
 *
 * Web-compatible version of IPC setup that excludes Electron-specific handlers.
 * This version is used when running Auto-Claude as a web application via electron-to-web.
 *
 * Excluded handlers:
 * - registerAppUpdateHandlers: Uses electron-updater (Electron-only)
 *
 * All other handlers are web-compatible as they use APIs shimmed by electron-to-web:
 * - shell, dialog, clipboard, Notification, app, safeStorage, etc.
 */

import type { BrowserWindow } from 'electron';
import { AgentManager } from './agent';
import { TerminalManager } from './terminal-manager';
import { PythonEnvManager } from './python-env-manager';

// Import all web-compatible handler registration functions
import { registerProjectHandlers } from './ipc-handlers/project-handlers';
import { registerTaskHandlers } from './ipc-handlers/task-handlers';
import { registerTerminalHandlers } from './ipc-handlers/terminal-handlers';
import { registerAgenteventsHandlers } from './ipc-handlers/agent-events-handlers';
import { registerSettingsHandlers } from './ipc-handlers/settings-handlers';
import { registerFileHandlers } from './ipc-handlers/file-handlers';
import { registerRoadmapHandlers } from './ipc-handlers/roadmap-handlers';
import { registerContextHandlers } from './ipc-handlers/context-handlers';
import { registerEnvHandlers } from './ipc-handlers/env-handlers';
import { registerLinearHandlers } from './ipc-handlers/linear-handlers';
import { registerGithubHandlers } from './ipc-handlers/github-handlers';
import { registerGitlabHandlers } from './ipc-handlers/gitlab-handlers';
import { registerAutobuildSourceHandlers } from './ipc-handlers/autobuild-source-handlers';
import { registerIdeationHandlers } from './ipc-handlers/ideation-handlers';
import { registerChangelogHandlers } from './ipc-handlers/changelog-handlers';
import { registerInsightsHandlers } from './ipc-handlers/insights-handlers';
import { registerMemoryHandlers } from './ipc-handlers/memory-handlers';
import { registerDebugHandlers } from './ipc-handlers/debug-handlers';
import { registerClaudeCodeHandlers } from './ipc-handlers/claude-code-handlers';
import { registerMcpHandlers } from './ipc-handlers/mcp-handlers';
// EXCLUDED: registerAppUpdateHandlers - uses electron-updater

import { notificationService } from './notification-service';

/**
 * Setup all web-compatible IPC handlers
 *
 * @param agentManager - The agent manager instance
 * @param terminalManager - The terminal manager instance
 * @param getMainWindow - Function to get the main BrowserWindow
 * @param pythonEnvManager - The Python environment manager instance
 */
export function setupIpcHandlers(
  agentManager: AgentManager,
  terminalManager: TerminalManager,
  getMainWindow: () => BrowserWindow | null,
  pythonEnvManager: PythonEnvManager
): void {
  // Initialize notification service
  notificationService.initialize(getMainWindow);

  // Project handlers (including Python environment setup)
  registerProjectHandlers(pythonEnvManager, agentManager, getMainWindow);

  // Task handlers
  registerTaskHandlers(agentManager, pythonEnvManager, getMainWindow);

  // Terminal and Claude profile handlers
  registerTerminalHandlers(terminalManager, getMainWindow);

  // Agent event handlers (event forwarding from agent manager to renderer)
  registerAgenteventsHandlers(agentManager, getMainWindow);

  // Settings and dialog handlers
  registerSettingsHandlers(agentManager, getMainWindow);

  // File explorer handlers
  registerFileHandlers();

  // Roadmap handlers
  registerRoadmapHandlers(agentManager, getMainWindow);

  // Context and memory handlers
  registerContextHandlers(getMainWindow);

  // Environment configuration handlers
  registerEnvHandlers(getMainWindow);

  // Linear integration handlers
  registerLinearHandlers(agentManager, getMainWindow);

  // GitHub integration handlers
  registerGithubHandlers(agentManager, getMainWindow);

  // GitLab integration handlers
  registerGitlabHandlers(agentManager, getMainWindow);

  // Auto-build source update handlers
  registerAutobuildSourceHandlers(getMainWindow);

  // Ideation handlers
  registerIdeationHandlers(agentManager, getMainWindow);

  // Changelog handlers
  registerChangelogHandlers(getMainWindow);

  // Insights handlers
  registerInsightsHandlers(getMainWindow);

  // Memory & infrastructure handlers (for Graphiti/LadybugDB)
  registerMemoryHandlers();

  // EXCLUDED: registerAppUpdateHandlers() - not needed in web version
  // App updates are handled differently in web deployments

  // Debug handlers (logs, debug info, etc.)
  registerDebugHandlers();

  // Claude Code CLI handlers (version checking, installation)
  registerClaudeCodeHandlers();

  // MCP server health check handlers
  registerMcpHandlers();

  console.warn('[IPC] All web-compatible handler modules registered successfully');
}
