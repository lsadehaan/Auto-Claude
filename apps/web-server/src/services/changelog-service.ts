/**
 * Changelog Service Wrapper
 *
 * Wraps the Electron changelog-service to work in web-server context.
 * The bundler redirects claude-profile-manager imports to our web-server shim,
 * which allows the service to work without Electron.
 */

import { ChangelogService } from '../../../frontend/src/main/changelog';
import { config } from '../config.js';
import path from 'path';

// Create service instance with web-server configuration
export const changelogService = new ChangelogService();

// Configure with venv Python and backend path
const venvPython = path.join(config.backendPath || '', '.venv', 'bin', 'python3');
const backendPath = config.backendPath || '';

changelogService.configure(venvPython, backendPath);
