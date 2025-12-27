import cors from 'cors';
import { config } from '../config.js';

/**
 * CORS configuration for the API
 */
export const corsMiddleware = cors({
  origin: config.isDev
    ? true // Allow all origins in development
    : config.corsOrigin.split(',').map(o => o.trim()),
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
