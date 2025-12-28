/**
 * Insights Service Wrapper
 *
 * Wraps the Electron insights-service to work in web-server context.
 * We can't import the service directly due to __dirname usage,
 * so we import the class and instantiate it with web-server config.
 */

import { InsightsService } from '../../../frontend/src/main/insights-service';
import { config } from '../config.js';

// Create service instance with web-server configuration
export const insightsService = new InsightsService();

// The service will use our shimmed 'app' object for path resolution
// which points to config.dataPath and config.backendPath
