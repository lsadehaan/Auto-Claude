/**
 * Insights Service Wrapper
 *
 * Wraps the Electron insights-service to work in web-server context.
 * We can't import the service directly due to __dirname usage,
 * so we import the class and instantiate it with web-server config.
 */

import { InsightsService } from '../../../frontend/src/main/insights-service';
import { config } from '../config.js';
import path from 'path';

// Create service instance with web-server configuration
export const insightsService = new InsightsService();

// Configure with venv Python and backend path
const venvPython = path.join(config.backendPath || '', '.venv', 'bin', 'python3');
const backendPath = config.backendPath || '';

insightsService.configure(venvPython, backendPath);
