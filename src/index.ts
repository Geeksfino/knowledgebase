/**
 * Knowledge Base Provider Service
 * 
 * External knowledge base provider using txtai for RAG.
 * Implements standard Provider interface for integration with chatkit-middleware.
 * 
 * API Endpoints (based on OpenAPI contract):
 * - GET  /provider/health     - Health check
 * - POST /provider/search     - Search knowledge base
 * - POST /documents           - Upload document
 * - GET  /documents           - List documents
 * - GET  /documents/:id       - Get document
 * - DELETE /documents/:id     - Delete document
 */

import { config } from './config.js';
import { logger } from './utils/logger.js';
import { txtaiService } from './services/txtai-service.js';
import { handleHealthCheck } from './handlers/health.js';
import {
  handleSearch,
  type ProviderSearchRequest,
  type ErrorResponse,
} from './handlers/search.js';
import {
  handleUploadDocument,
  handleListDocuments,
  handleGetDocument,
  handleDeleteDocument,
  type DocumentUploadRequest,
} from './handlers/documents.js';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
};

// Check txtai connection on startup
txtaiService.healthCheck().then((healthy) => {
  if (healthy) {
    logger.info('txtai service is available', { url: config.txtai.url });
  } else {
    logger.warn('txtai service is not available', { url: config.txtai.url });
  }
});

const server = Bun.serve({
  port: config.port,
  hostname: config.host,

  async fetch(req) {
    const url = new URL(req.url);
    const requestId = req.headers.get('x-request-id') || `req_${Date.now()}`;

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // Health check
      if (req.method === 'GET' && url.pathname === '/provider/health') {
        const response = await handleHealthCheck();
        return Response.json(response, { headers: corsHeaders });
      }

      // Search endpoint
      if (req.method === 'POST' && url.pathname === '/provider/search') {
        const body = (await req.json()) as ProviderSearchRequest;

        // Validate required fields
        if (!body.user_id || !body.query) {
          const error: ErrorResponse = {
            error: 'Missing required fields: user_id and query',
            code: 'INVALID_REQUEST',
          };
          return Response.json(error, { status: 400, headers: corsHeaders });
        }

        const response = await handleSearch(body);
        return Response.json(response, { headers: corsHeaders });
      }

      // Upload document
      if (req.method === 'POST' && url.pathname === '/documents') {
        const body = (await req.json()) as DocumentUploadRequest;

        // Validate required fields
        if (!body.title || !body.content) {
          const error: ErrorResponse = {
            error: 'Missing required fields: title and content',
            code: 'INVALID_REQUEST',
          };
          return Response.json(error, { status: 400, headers: corsHeaders });
        }

        const response = await handleUploadDocument(body);
        const status = response.status === 'failed' ? 500 : 200;
        return Response.json(response, { status, headers: corsHeaders });
      }

      // List documents
      if (req.method === 'GET' && url.pathname === '/documents') {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const response = handleListDocuments(limit, offset);
        return Response.json(response, { headers: corsHeaders });
      }

      // Get document
      if (req.method === 'GET' && url.pathname.startsWith('/documents/')) {
        const documentId = url.pathname.split('/documents/')[1];
        if (!documentId) {
          const error: ErrorResponse = {
            error: 'Document ID is required',
            code: 'INVALID_REQUEST',
          };
          return Response.json(error, { status: 400, headers: corsHeaders });
        }

        const document = handleGetDocument(documentId);
        if (!document) {
          const error: ErrorResponse = {
            error: 'Document not found',
            code: 'NOT_FOUND',
          };
          return Response.json(error, { status: 404, headers: corsHeaders });
        }

        return Response.json(document, { headers: corsHeaders });
      }

      // Delete document
      if (req.method === 'DELETE' && url.pathname.startsWith('/documents/')) {
        const documentId = url.pathname.split('/documents/')[1];
        if (!documentId) {
          const error: ErrorResponse = {
            error: 'Document ID is required',
            code: 'INVALID_REQUEST',
          };
          return Response.json(error, { status: 400, headers: corsHeaders });
        }

        const response = await handleDeleteDocument(documentId);
        const status = response.success ? 200 : 404;
        return Response.json(response, { status, headers: corsHeaders });
      }

      // Root endpoint - basic info
      if (req.method === 'GET' && url.pathname === '/') {
        return Response.json(
          {
            name: 'Knowledge Base Provider',
            version: config.provider.version,
            provider_name: config.provider.name,
            endpoints: {
              health: 'GET /provider/health',
              search: 'POST /provider/search',
              documents: {
                list: 'GET /documents',
                upload: 'POST /documents',
                get: 'GET /documents/:id',
                delete: 'DELETE /documents/:id',
              },
            },
          },
          { headers: corsHeaders }
        );
      }

      // 404
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      logger.error('Request failed', {
        error: error instanceof Error ? error.message : 'Unknown',
        requestId,
        path: url.pathname,
        method: req.method,
      });

      const errorResponse: ErrorResponse = {
        error: error instanceof Error ? error.message : 'Internal server error',
        code: 'INTERNAL_ERROR',
      };

      return Response.json(errorResponse, {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
});

logger.info(`Knowledge Base Provider started`, {
  host: config.host,
  port: config.port,
  providerName: config.provider.name,
  txtaiUrl: config.txtai.url,
});

