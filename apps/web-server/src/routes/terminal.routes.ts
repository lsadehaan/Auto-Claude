/**
 * Terminal REST Routes
 * Handles terminal creation, destruction, and management
 * Terminal I/O is handled via WebSocket at /ws/terminal/:id
 */

import { Router } from 'express';
import { terminalService } from '../services/terminal-service.js';
import { terminalWebSocket } from '../websocket/terminal.ws.js';
import { adaptHandler, type IPCResult } from '../adapters/index.js';

const router = Router();

// ============================================================================
// Terminal Management Routes
// ============================================================================

/**
 * List all active terminals
 */
router.get('/', adaptHandler(async (): Promise<IPCResult<Array<{ id: string; title: string; cwd: string; createdAt: Date }>>> => {
  const ids = terminalService.getActiveIds();
  const terminals = ids.map(id => {
    const info = terminalService.getInfo(id);
    return info ? {
      id: info.id,
      title: info.title,
      cwd: info.cwd,
      createdAt: info.createdAt,
      isClaudeMode: info.isClaudeMode,
      claudeSessionId: info.claudeSessionId,
    } : null;
  }).filter(Boolean);

  return { success: true, data: terminals as any };
}));

/**
 * Create a new terminal
 * Body: { id, cwd?, cols?, rows?, projectPath? }
 */
router.post('/', adaptHandler(async (body: {
  id: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  projectPath?: string;
}): Promise<IPCResult<{ id: string }>> => {
  if (!body.id) {
    return { success: false, error: 'Terminal ID is required' };
  }

  const result = terminalService.create({
    id: body.id,
    cwd: body.cwd,
    cols: body.cols,
    rows: body.rows,
    projectPath: body.projectPath,
  });

  if (result.success) {
    return { success: true, data: { id: body.id } };
  }

  return { success: false, error: result.error };
}));

/**
 * Get terminal info
 */
router.get('/:id', adaptHandler(async (id: string): Promise<IPCResult> => {
  const info = terminalService.getInfo(id);

  if (!info) {
    return { success: false, error: 'Terminal not found' };
  }

  return { success: true, data: info };
}, (req) => [req.params.id]));

/**
 * Destroy a terminal
 */
router.delete('/:id', adaptHandler(async (id: string): Promise<IPCResult> => {
  const success = terminalService.destroy(id);

  if (success) {
    return { success: true };
  }

  return { success: false, error: 'Terminal not found' };
}, (req) => [req.params.id]));

/**
 * Resize a terminal
 * Body: { cols, rows }
 */
router.post('/:id/resize', adaptHandler(async (id: string, body: { cols: number; rows: number }): Promise<IPCResult> => {
  if (!body.cols || !body.rows) {
    return { success: false, error: 'cols and rows are required' };
  }

  const success = terminalService.resize(id, body.cols, body.rows);

  if (success) {
    return { success: true };
  }

  return { success: false, error: 'Terminal not found' };
}, (req) => [req.params.id, req.body]));

/**
 * Write data to a terminal (alternative to WebSocket)
 * Body: { data }
 */
router.post('/:id/write', adaptHandler(async (id: string, body: { data: string }): Promise<IPCResult> => {
  if (!body.data) {
    return { success: false, error: 'data is required' };
  }

  const success = terminalService.write(id, body.data);

  if (success) {
    return { success: true };
  }

  return { success: false, error: 'Terminal not found' };
}, (req) => [req.params.id, req.body]));

/**
 * Invoke Claude in a terminal
 * Body: { cwd? }
 */
router.post('/:id/invoke-claude', adaptHandler(async (id: string, body: { cwd?: string }): Promise<IPCResult> => {
  const success = terminalService.invokeClaude(id, body.cwd);

  if (success) {
    return { success: true };
  }

  return { success: false, error: 'Terminal not found' };
}, (req) => [req.params.id, req.body]));

/**
 * Get terminal output buffer
 */
router.get('/:id/buffer', adaptHandler(async (id: string): Promise<IPCResult<string>> => {
  const buffer = terminalService.getOutputBuffer(id);

  if (buffer === null) {
    return { success: false, error: 'Terminal not found' };
  }

  return { success: true, data: buffer };
}, (req) => [req.params.id]));

/**
 * Get WebSocket connection stats
 */
router.get('/stats/connections', adaptHandler(async (): Promise<IPCResult> => {
  const terminalStats = terminalWebSocket.getStats();

  return {
    success: true,
    data: {
      activeTerminals: terminalService.getCount(),
      ...terminalStats,
    }
  };
}));


/**
 * GET /sessions/dates
 * Get list of dates that have saved terminal sessions
 */
router.get('/sessions/dates', adaptHandler(async (): Promise<IPCResult<string[]>> => {
  // TODO: Implement terminal session persistence
  // For now, return empty array
  return {
    success: true,
    data: []
  };
}));

export default router;
