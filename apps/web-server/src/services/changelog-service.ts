/**
 * Changelog Service Wrapper
 *
 * Wraps the Electron changelog-service to work in web-server context.
 * We can't import the service singleton directly due to __dirname usage,
 * so we import the class and instantiate it with web-server config.
 */

import { ChangelogService } from '../../../frontend/src/main/changelog';
import { config } from '../config.js';

// Create service instance with web-server configuration
export const changelogService = new ChangelogService();

// The service will use our shimmed 'app' object for path resolution
// which points to config.dataPath and config.backendPath
