/**
 * Insights Service Wrapper
 *
 * Wraps the Electron insights-service to work in web-server context.
 * The bundler redirects claude-profile-manager imports to our web-server shim,
 * which allows the service to work without Electron.
 */

import { InsightsService } from '../../../frontend/src/main/insights-service';
import { config } from '../config.js';
import path from 'path';

// Create service instance with web-server configuration
export const insightsService = new InsightsService();

// Configure with venv Python and backend path
const venvPython = path.join(config.backendPath || '', '.venv', 'bin', 'python3');
const backendPath = config.backendPath || '';

console.log('[InsightsService] Configuring with:', { venvPython, backendPath });
insightsService.configure(venvPython, backendPath);

// Add error event listener for debugging
insightsService.on('error', (projectId: string, error: string) => {
  console.error('[InsightsService] Error:', { projectId, error });
});
