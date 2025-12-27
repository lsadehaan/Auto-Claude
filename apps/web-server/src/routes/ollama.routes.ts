/**
 * Ollama Routes
 * Handles Ollama server integration for local LLM support
 */

import { Router, type Request, type Response } from 'express';

const router = Router();

// Default Ollama server URL
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

/**
 * Get Ollama server URL from query params or environment
 */
function getOllamaUrl(req: Request): string {
  return (req.query.baseUrl as string) || process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL;
}

/**
 * Check Ollama server status
 * GET /api/ollama/status?baseUrl=...
 */
router.get('/status', async (req: Request, res: Response) => {
  const baseUrl = getOllamaUrl(req);

  try {
    // Try to connect to Ollama API
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      return res.json({
        success: true,
        data: {
          available: true,
          url: baseUrl,
          modelCount: data.models?.length || 0,
          version: data.version || 'unknown',
        },
      });
    }

    return res.json({
      success: true,
      data: {
        available: false,
        url: baseUrl,
        error: `Ollama server returned ${response.status}`,
      },
    });
  } catch (error) {
    return res.json({
      success: true,
      data: {
        available: false,
        url: baseUrl,
        error: error instanceof Error ? error.message : 'Failed to connect to Ollama',
      },
    });
  }
});

/**
 * List installed Ollama models
 * GET /api/ollama/models?baseUrl=...
 */
router.get('/models', async (req: Request, res: Response) => {
  const baseUrl = getOllamaUrl(req);

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return res.json({
        success: false,
        error: `Ollama server returned ${response.status}`,
      });
    }

    const data = await response.json();
    const models = (data.models || []).map((model: any) => ({
      name: model.name,
      size: model.size,
      digest: model.digest,
      modified: model.modified_at,
      details: model.details,
    }));

    return res.json({
      success: true,
      data: models,
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list Ollama models',
    });
  }
});

/**
 * List Ollama embedding models
 * GET /api/ollama/models/embedding?baseUrl=...
 */
router.get('/models/embedding', async (req: Request, res: Response) => {
  const baseUrl = getOllamaUrl(req);

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return res.json({
        success: false,
        error: `Ollama server returned ${response.status}`,
      });
    }

    const data = await response.json();

    // Filter for embedding models (typically contain "embed" in the name)
    const embeddingModels = (data.models || [])
      .filter((model: any) =>
        model.name.toLowerCase().includes('embed') ||
        model.name.toLowerCase().includes('nomic')
      )
      .map((model: any) => ({
        name: model.name,
        size: model.size,
        digest: model.digest,
        modified: model.modified_at,
        details: model.details,
      }));

    return res.json({
      success: true,
      data: embeddingModels,
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list embedding models',
    });
  }
});

/**
 * Pull an Ollama model
 * POST /api/ollama/models/pull
 * Body: { model, baseUrl? }
 */
router.post('/models/pull', async (req: Request, res: Response) => {
  const { model, baseUrl: bodyBaseUrl } = req.body;

  if (!model) {
    return res.json({
      success: false,
      error: 'Model name is required',
    });
  }

  const baseUrl = bodyBaseUrl || getOllamaUrl(req);

  try {
    // Start the pull operation
    // Note: This is a streaming endpoint in Ollama, but we'll just initiate it
    const response = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(300000), // 5 minute timeout for pulls
    });

    if (!response.ok) {
      return res.json({
        success: false,
        error: `Ollama server returned ${response.status}`,
      });
    }

    // For now, we just return success
    // In a real implementation, we'd stream progress via WebSocket
    return res.json({
      success: true,
      data: {
        model,
        status: 'pulling',
        message: `Started pulling model: ${model}`,
      },
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pull model',
    });
  }
});

/**
 * Delete an Ollama model
 * DELETE /api/ollama/models/:modelName
 */
router.delete('/models/:modelName', async (req: Request, res: Response) => {
  const { modelName } = req.params;
  const baseUrl = getOllamaUrl(req);

  try {
    const response = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.json({
        success: false,
        error: `Ollama server returned ${response.status}`,
      });
    }

    return res.json({
      success: true,
      data: { model: modelName, deleted: true },
    });
  } catch (error) {
    return res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete model',
    });
  }
});

export default router;
