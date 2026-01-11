/**
 * Knowledge Base Service
 *
 * 独立的知识库问答服务，提供：
 * - 流式会话（RAG 问答）
 * - 知识库搜索（混合检索）
 * - 文档管理
 *
 * ## 主要功能
 * - 混合搜索（向量 + BM25 关键词）
 * - 多模态支持（文本、图片、视频、PDF/Word文档）
 * - 智能查询处理（LLM 查询扩展和重写）
 * - 流式输出（SSE）
 *
 * ## API 端点 (基于 OpenAPI 契约)
 * - GET  /health              - 健康检查
 * - POST /chat                - 流式会话（RAG）
 * - GET  /provider/health     - 健康检查（兼容）
 * - POST /provider/search     - 搜索知识库
 * - POST /documents           - 上传文档
 * - GET  /documents           - 列出文档
 * - GET  /documents/:id       - 获取文档详情
 * - DELETE /documents/:id     - 删除文档
 * - GET  /media/:docId/:file  - 获取媒体文件
 *
 * @module knowledgebase
 */

import { config } from './config.js';
import { logger } from './utils/logger.js';
import { getMimeType } from './utils/mime-types.js';
import { txtaiService } from './services/txtai-service.js';
import { initializeProviderFactory, getProviderFactory } from './services/llm/index.js';
import { handleHealthCheck } from './handlers/health.js';
import {
  handleSearch,
  type ProviderSearchRequest,
  type ErrorResponse,
} from './handlers/search.js';
import {
  handleUploadDocument,
  handleUploadFile,
  handleListDocuments,
  handleGetDocument,
  handleDeleteDocument,
  type DocumentUploadRequest,
} from './handlers/documents.js';
import {
  handleChatStream,
  handleChat,
  type ChatRequest,
} from './handlers/chat.js';
import { fileStorage } from './services/file-storage.js';

/**
 * CORS 响应头配置
 * 允许跨域访问，支持必要的请求头
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-User-ID, X-Jurisdiction',
};

/**
 * 服务启动初始化
 * - 初始化 LLM Provider
 * - 初始化文件存储目录
 * - 检查 txtai 服务连接状态
 */
async function initialize() {
  // 初始化 LLM Provider Factory
  const llmFactory = initializeProviderFactory(config.llm);
  const llmProviders = llmFactory.listProviders();
  const defaultProvider = llmProviders.find(p => p.default);
  
  logger.info({
    provider: defaultProvider?.id,
    model: config.llm.model,
    available: defaultProvider?.available,
  }, '🤖 LLM Provider initialized');

  // 初始化文件存储和检查 txtai
  const [, txtaiHealthy] = await Promise.all([
    fileStorage.initialize(),
    txtaiService.healthCheck(),
  ]);

  if (txtaiHealthy) {
    logger.info({ url: config.txtai.url }, '✅ txtai service is available');
  } else {
    logger.warn({
      url: config.txtai.url,
    }, '⚠️ txtai service is not available - search functionality may be limited');
  }
}

// 执行初始化
initialize().catch(err => {
  logger.error({ error: err.message }, '❌ Initialization failed');
});

/**
 * 扩展健康检查，包含 LLM 状态
 */
async function handleExtendedHealthCheck(): Promise<Response> {
  const baseHealth = await handleHealthCheck();
  
  // 添加 LLM 状态
  try {
    const factory = getProviderFactory();
    const providers = factory.listProviders();
    const defaultProvider = providers.find(p => p.default);
    const llmHealth = await factory.healthCheck();
    
    return Response.json({
      ...baseHealth,
      llm: {
        provider: defaultProvider?.id,
        model: config.llm.model,
        available: defaultProvider?.available && llmHealth[defaultProvider.id],
      },
    }, { headers: corsHeaders });
  } catch {
    return Response.json({
      ...baseHealth,
      llm: {
        provider: config.llm.provider,
        model: config.llm.model,
        available: false,
      },
    }, { headers: corsHeaders });
  }
}

const server = Bun.serve({
  port: config.port,
  hostname: config.host,

  async fetch(req) {
    const url = new URL(req.url);
    // Extract required headers
    const requestId = req.headers.get('x-request-id') || `req_${Date.now()}`;
    const userId = req.headers.get('x-user-id');

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // ============================================
      // Health Check Endpoints
      // ============================================
      
      // New health endpoint
      if (req.method === 'GET' && url.pathname === '/health') {
        return handleExtendedHealthCheck();
      }
      
      // Legacy health endpoint (for compatibility)
      if (req.method === 'GET' && url.pathname === '/provider/health') {
        return handleExtendedHealthCheck();
      }

      // ============================================
      // Chat Endpoint (流式会话)
      // ============================================
      
      if (req.method === 'POST' && url.pathname === '/chat') {
        try {
          const body = (await req.json()) as ChatRequest;

          // Validate required fields
          if (!body.message) {
            const error: ErrorResponse = {
              error: 'Missing required field: message',
              code: 'INVALID_REQUEST',
            };
            return Response.json(error, { status: 400, headers: corsHeaders });
          }

          // Check if client wants streaming (default: yes)
          const acceptHeader = req.headers.get('accept') || '';
          const wantsStream = acceptHeader.includes('text/event-stream') || 
                             !acceptHeader.includes('application/json');

          if (wantsStream) {
            // Streaming response
            return handleChatStream(body);
          } else {
            // Non-streaming response
            const result = await handleChat(body);
            return Response.json(result, { headers: corsHeaders });
          }
        } catch (error) {
          logger.error('Chat request error', {
            error: error instanceof Error ? error.message : 'Unknown',
          });
          const errorResponse: ErrorResponse = {
            error: error instanceof Error ? error.message : 'Chat request failed',
            code: 'CHAT_ERROR',
          };
          return Response.json(errorResponse, { status: 500, headers: corsHeaders });
        }
      }

      // ============================================
      // Search Endpoint
      // ============================================
      
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

      // ============================================
      // Document Endpoints
      // ============================================

      // Upload document (supports both JSON and multipart/form-data)
      if (req.method === 'POST' && url.pathname === '/documents') {
        const contentType = req.headers.get('content-type') || '';

        // Check if it's a file upload (multipart/form-data)
        if (contentType.includes('multipart/form-data')) {
          try {
            const formData = await req.formData();
            const response = await handleUploadFile(formData);
            const status = response.status === 'failed' ? 500 : 200;
            return Response.json(response, { status, headers: corsHeaders });
          } catch (error) {
            logger.error('File upload error', {
              error: error instanceof Error ? error.message : 'Unknown',
              stack: error instanceof Error ? error.stack : undefined,
            });
            const errorResponse: ErrorResponse = {
              error: error instanceof Error ? error.message : 'File upload failed',
              code: 'UPLOAD_ERROR',
            };
            return Response.json(errorResponse, { status: 500, headers: corsHeaders });
          }
        } else {
          // Regular JSON upload
          try {
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
          } catch (error) {
            logger.error('JSON upload error', {
              error: error instanceof Error ? error.message : 'Unknown',
            });
            const errorResponse: ErrorResponse = {
              error: error instanceof Error ? error.message : 'Invalid JSON',
              code: 'INVALID_REQUEST',
            };
            return Response.json(errorResponse, { status: 400, headers: corsHeaders });
          }
        }
      }

      // Serve media files
      if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
        const pathParts = url.pathname.split('/media/')[1];
        if (!pathParts) {
          return new Response('Not Found', { status: 404, headers: corsHeaders });
        }

        const [documentId, ...filenameParts] = pathParts.split('/');
        const filename = filenameParts.join('/');

        if (!documentId || !filename) {
          return new Response('Not Found', { status: 404, headers: corsHeaders });
        }

        try {
          const fileBuffer = await fileStorage.readFile(documentId, filename);
          const mimeType = getMimeType(filename);
          
          return new Response(fileBuffer, {
            headers: {
              ...corsHeaders,
              'Content-Type': mimeType,
              'Content-Length': fileBuffer.length.toString(),
            },
          });
        } catch (error) {
          logger.error('Failed to serve media file', {
            documentId,
            filename,
            error: error instanceof Error ? error.message : 'Unknown',
          });
          return new Response('Not Found', { status: 404, headers: corsHeaders });
        }
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

      // ============================================
      // Root Endpoint
      // ============================================
      
      if (req.method === 'GET' && url.pathname === '/') {
        // Get LLM info
        let llmInfo = { provider: config.llm.provider, model: config.llm.model, available: false };
        try {
          const factory = getProviderFactory();
          const providers = factory.listProviders();
          const defaultProvider = providers.find(p => p.default);
          llmInfo = {
            provider: defaultProvider?.id || config.llm.provider,
            model: config.llm.model,
            available: defaultProvider?.available || false,
          };
        } catch { /* ignore */ }

        return Response.json(
          {
            name: 'Knowledge Base Service',
            version: config.provider.version,
            provider_name: config.provider.name,
            llm: llmInfo,
            endpoints: {
              health: 'GET /health',
              chat: 'POST /chat (streaming)',
              search: 'POST /provider/search',
              documents: {
                list: 'GET /documents',
                upload: 'POST /documents',
                get: 'GET /documents/:id',
                delete: 'DELETE /documents/:id',
              },
              media: 'GET /media/:docId/:file',
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
        userId,
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

logger.info({
  host: config.host,
  port: config.port,
  providerName: config.provider.name,
  txtaiUrl: config.txtai.url,
  llmProvider: config.llm.provider,
  llmModel: config.llm.model,
}, `🚀 Knowledge Base Service started on http://${config.host}:${config.port}`);
