/**
 * Type declarations for Electron handler modules
 *
 * These declarations allow TypeScript to understand the aliased imports
 * that tsup resolves at build time. The actual implementations come from
 * the frontend Electron codebase via bundler aliases.
 */

declare module '@electron/ipc-handlers/ideation' {
  import type { IpcMainInvokeEvent } from 'electron';

  interface IPCResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
  }

  type IdeationStatus =
    | 'pending'
    | 'approved'
    | 'dismissed'
    | 'converted'
    | 'archived';

  interface IdeationConfig {
    enabledTypes: string[];
    includeRoadmapContext: boolean;
    includeKanbanContext: boolean;
    maxIdeasPerType: number;
  }

  interface IdeationSession {
    id: string;
    projectId: string;
    config: IdeationConfig;
    ideas: unknown[];
    projectContext: {
      existingFeatures: string[];
      techStack: string[];
      targetAudience?: string;
      plannedFeatures: string[];
    };
    generatedAt: Date;
    updatedAt: Date;
  }

  export function getIdeationSession(
    event: IpcMainInvokeEvent | null,
    projectId: string
  ): Promise<IPCResult<IdeationSession | null>>;

  export function updateIdeaStatus(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    ideaId: string,
    status: IdeationStatus
  ): Promise<IPCResult>;

  export function dismissIdea(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    ideaId: string
  ): Promise<IPCResult>;

  export function dismissAllIdeas(
    event: IpcMainInvokeEvent | null,
    projectId: string
  ): Promise<IPCResult<{ dismissedCount: number }>>;

  export function archiveIdea(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    ideaId: string
  ): Promise<IPCResult>;

  export function deleteIdea(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    ideaId: string
  ): Promise<IPCResult>;

  export function deleteMultipleIdeas(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    ideaIds: string[]
  ): Promise<IPCResult<{ deletedCount: number }>>;

  export function convertIdeaToSpec(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    ideaId: string
  ): Promise<IPCResult<{ specId: string }>>;
}

declare module '@electron/ipc-handlers/github' {
  import type { IpcMainInvokeEvent } from 'electron';

  interface IPCResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
  }

  interface GitHubIssue {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: string;
    labels: Array<{ name: string; color: string }>;
    created_at: string;
    updated_at: string;
    html_url: string;
  }

  interface GitHubPullRequest {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: string;
    head: { ref: string };
    base: { ref: string };
    created_at: string;
    updated_at: string;
    html_url: string;
  }

  export function getGitHubIssues(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    options?: { state?: string; labels?: string }
  ): Promise<IPCResult<GitHubIssue[]>>;

  export function getGitHubPullRequests(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    options?: { state?: string }
  ): Promise<IPCResult<GitHubPullRequest[]>>;

  export function createGitHubIssue(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    title: string,
    body: string,
    labels?: string[]
  ): Promise<IPCResult<GitHubIssue>>;
}

declare module '@electron/ipc-handlers/linear' {
  import type { IpcMainInvokeEvent } from 'electron';

  interface IPCResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
  }

  interface LinearIssue {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    state: { name: string };
    priority: number;
    url: string;
  }

  export function getLinearIssues(
    event: IpcMainInvokeEvent | null,
    projectId: string
  ): Promise<IPCResult<LinearIssue[]>>;

  export function syncLinearProject(
    event: IpcMainInvokeEvent | null,
    projectId: string
  ): Promise<IPCResult>;
}

declare module '@electron/ipc-handlers/roadmap' {
  import type { IpcMainInvokeEvent } from 'electron';

  interface IPCResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
  }

  interface RoadmapFeature {
    id: string;
    title: string;
    description: string;
    priority: string;
    category: string;
    status: string;
  }

  interface Roadmap {
    features: RoadmapFeature[];
    generatedAt: Date;
  }

  export function getRoadmap(
    event: IpcMainInvokeEvent | null,
    projectId: string
  ): Promise<IPCResult<Roadmap | null>>;

  export function updateFeatureStatus(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    featureId: string,
    status: string
  ): Promise<IPCResult>;
}

declare module '@electron/ipc-handlers/context' {
  import type { IpcMainInvokeEvent } from 'electron';

  interface IPCResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
  }

  interface ContextSettings {
    customInstructions?: string;
    excludePatterns?: string[];
    includePatterns?: string[];
  }

  export function getContextSettings(
    event: IpcMainInvokeEvent | null,
    projectId: string
  ): Promise<IPCResult<ContextSettings>>;

  export function saveContextSettings(
    event: IpcMainInvokeEvent | null,
    projectId: string,
    settings: ContextSettings
  ): Promise<IPCResult>;
}

declare module '@electron/changelog' {
  export function generateChangelog(projectPath: string): Promise<string>;
  export function getRecentChanges(projectPath: string, count?: number): Promise<unknown[]>;
}

declare module '@electron/agent' {
  export interface AgentConfig {
    model?: string;
    maxTokens?: number;
  }

  export function runAgent(config: AgentConfig): Promise<void>;
}

declare module '@shared/constants' {
  export const AUTO_BUILD_PATHS: {
    SPECS_DIR: string;
    IDEATION_DIR: string;
    IDEATION_FILE: string;
    ROADMAP_DIR: string;
    ROADMAP_FILE: string;
    CONTEXT_DIR: string;
    SETTINGS_FILE: string;
  };

  export const IPC_CHANNELS: Record<string, string>;
}

declare module '@shared/types' {
  export interface IPCResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
  }

  export type IdeationStatus =
    | 'pending'
    | 'approved'
    | 'dismissed'
    | 'converted'
    | 'archived';

  export interface IdeationSession {
    id: string;
    projectId: string;
    config: {
      enabledTypes: string[];
      includeRoadmapContext: boolean;
      includeKanbanContext: boolean;
      maxIdeasPerType: number;
    };
    ideas: unknown[];
    projectContext: {
      existingFeatures: string[];
      techStack: string[];
      targetAudience?: string;
      plannedFeatures: string[];
    };
    generatedAt: Date;
    updatedAt: Date;
  }
}
