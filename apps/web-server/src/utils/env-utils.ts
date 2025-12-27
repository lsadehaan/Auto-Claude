/**
 * Environment Utilities Module
 *
 * Provides utilities for managing environment variables for child processes.
 * Particularly important for macOS where GUI apps don't inherit the full
 * shell environment, causing issues with tools installed via Homebrew.
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Common binary directories that should be in PATH
 */
const COMMON_BIN_PATHS: Record<string, string[]> = {
  darwin: [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/opt/homebrew/sbin',
    '/usr/local/sbin',
  ],
  linux: [
    '/usr/local/bin',
    '/snap/bin',
    '~/.local/bin',
  ],
  win32: [
    'C:\\Program Files\\Git\\cmd',
    'C:\\Program Files\\GitHub CLI',
  ],
};

/**
 * Get augmented environment with additional PATH entries
 */
export function getAugmentedEnv(additionalPaths?: string[]): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  const pathSeparator = platform === 'win32' ? ';' : ':';

  const platformPaths = COMMON_BIN_PATHS[platform] || [];

  const homeDir = os.homedir();
  const expandedPaths = platformPaths.map(p =>
    p.startsWith('~') ? p.replace('~', homeDir) : p
  );

  const currentPath = env.PATH || '';
  const currentPathSet = new Set(currentPath.split(pathSeparator));

  const pathsToAdd: string[] = [];

  for (const p of expandedPaths) {
    if (!currentPathSet.has(p) && fs.existsSync(p)) {
      pathsToAdd.push(p);
    }
  }

  if (additionalPaths) {
    for (const p of additionalPaths) {
      const expanded = p.startsWith('~') ? p.replace('~', homeDir) : p;
      if (!currentPathSet.has(expanded) && fs.existsSync(expanded)) {
        pathsToAdd.push(expanded);
      }
    }
  }

  if (pathsToAdd.length > 0) {
    env.PATH = [...pathsToAdd, currentPath].filter(Boolean).join(pathSeparator);
  }

  return env;
}

/**
 * Parse .env file into key-value object
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex > 0) {
      const key = trimmed.substring(0, equalsIndex).trim();
      let value = trimmed.substring(equalsIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }
  return result;
}

/**
 * Find the full path to an executable
 */
export function findExecutable(command: string): string | null {
  const env = getAugmentedEnv();
  const pathSeparator = process.platform === 'win32' ? ';' : ':';
  const pathDirs = (env.PATH || '').split(pathSeparator);

  const extensions = process.platform === 'win32'
    ? ['', '.exe', '.cmd', '.bat', '.ps1']
    : [''];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const fullPath = path.join(dir, command + ext);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Check if a command is available
 */
export function isCommandAvailable(command: string): boolean {
  return findExecutable(command) !== null;
}
