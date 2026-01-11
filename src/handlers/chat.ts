/**
 * Chat Handler
 * 
 * 处理流式会话请求，实现完整的 RAG 流程：
 * 1. 查询处理（扩展/重写）
 * 2. 知识库搜索
 * 3. 上下文构建
 * 4. LLM 推理（流式输出）
 *
 * 流式输出格式遵循 AG-UI 协议，与 chatkit-middleware 的 ag-ui-server 保持一致
 *
 * @module handlers/chat
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { queryProcessor } from '../services/query-processor.js';
import { handleSearch, type ProviderSearchRequest } from './search.js';
import { getProviderFactory } from '../services/llm/index.js';
import { chatRateLimiter } from '../services/rate-limiter.js';
import type { LLMInferRequest } from '../services/llm/types.js';

// Import types from generated contract (Contract-First Pattern)
import type { components } from '@knowledgebase/contracts-ts/generated/knowledge-provider';

// Re-export contract types for external use
export type ChatRequest = components['schemas']['ChatRequest'];
export type ChatStreamEvent = components['schemas']['ChatStreamEvent'];
export type SourceReference = components['schemas']['SourceReference'];
export type TokenUsage = components['schemas']['TokenUsage'];

// AG-UI event type (from contract)
type AGUIEventType = ChatStreamEvent['type'];

// Internal event interface (compatible with contract)
interface AGUIEvent {
  type: AGUIEventType;
  threadId: string;
  runId: string;
  messageId?: string;
  role?: 'assistant' | 'user';
  delta?: string;
  error?: string;
  name?: string;
  value?: unknown;
}

/**
 * 生成唯一 ID
 */
function generateId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 发送 SSE 事件
 */
function sendEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: AGUIEvent
): void {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

/**
 * 构建上下文文本
 */
function buildContextText(chunks: Array<{ content: string; document_title?: string }>): string {
  if (chunks.length === 0) {
    return '暂无相关知识库内容。';
  }

  return chunks
    .map((chunk, index) => {
      const title = chunk.document_title || `来源 ${index + 1}`;
      return `【${title}】\n${chunk.content}`;
    })
    .join('\n\n---\n\n');
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(context: string): string {
  const template = config.chat.systemPromptTemplate;
  return template.replace('{context}', context);
}

/**
 * 处理流式会话请求
 * 
 * SSE 输出格式遵循 AG-UI 协议：
 * - RUN_STARTED
 * - TEXT_MESSAGE_START
 * - TEXT_MESSAGE_CHUNK (多个)
 * - TEXT_MESSAGE_END
 * - RUN_FINISHED
 */
export async function handleChatStream(request: ChatRequest): Promise<Response> {
  const startTime = Date.now();
  const threadId = request.threadId || generateId('thread');
  const runId = request.runId || generateId('run');
  const messageId = generateId('msg');
  const userId = request.user_id || 'anonymous';
  const searchLimit = request.options?.search_limit || config.chat.defaultSearchLimit;
  const temperature = request.options?.temperature || config.chat.defaultTemperature;
  const maxTokens = request.options?.max_tokens || config.chat.defaultMaxTokens;
  const includeSources = request.options?.include_sources !== false;

  // 检查 Chat 限流
  if (!chatRateLimiter.tryAcquire()) {
    logger.warn({ threadId, runId, userId }, '⚠️ CHAT_RATE_LIMITED');
    return Response.json(
      { 
        error: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
      },
      { status: 429 }
    );
  }

  logger.info({
    threadId,
    runId,
    userId,
    messageLen: request.message.length,
    searchLimit,
  }, '📥 CHAT_REQUEST | start');

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Step 1: RUN_STARTED
        sendEvent(controller, encoder, {
          type: 'RUN_STARTED',
          threadId,
          runId,
        });

        // Step 2: 查询处理（扩展/重写）
        const queryResult = await queryProcessor.processQuery(request.message);
        
        logger.info({
          original: request.message.substring(0, 50),
          processed: queryResult.processedQuery.substring(0, 50),
          method: queryResult.method,
          expandedCount: queryResult.expandedQueries?.length || 0,
        }, '🔍 QUERY_PROCESSED');

        // Step 3: 搜索知识库 (传递预处理结果，避免重复 LLM 调用)
        const searchRequest: ProviderSearchRequest = {
          user_id: userId,
          query: queryResult.processedQuery,
          limit: searchLimit,
        };

        const searchResult = await handleSearch(searchRequest, {
          preProcessedResult: queryResult,
        });

        logger.info({
          chunksCount: searchResult.chunks.length,
          totalTokens: searchResult.total_tokens,
        }, '📚 KNOWLEDGE_SEARCH_COMPLETE');

        // Step 4: 发送 CUSTOM 事件（知识库来源，如果启用）
        if (includeSources && searchResult.chunks.length > 0) {
          const sources: SourceReference[] = searchResult.chunks.map(chunk => ({
            chunk_id: chunk.chunk_id,
            document_title: chunk.document_title,
            content_preview: chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : ''),
            score: chunk.score,
          }));
          
          sendEvent(controller, encoder, {
            type: 'CUSTOM',
            threadId,
            runId,
            name: 'knowledge_sources',
            value: sources,
          });
        }

        // Step 5: 构建上下文
        const contextText = buildContextText(searchResult.chunks);
        const systemPrompt = buildSystemPrompt(contextText);

        // Step 6: TEXT_MESSAGE_START
        sendEvent(controller, encoder, {
          type: 'TEXT_MESSAGE_START',
          threadId,
          runId,
          messageId,
          role: 'assistant',
        });

        // Step 7: 调用 LLM 流式推理
        const llmRequest: LLMInferRequest = {
          system_prompt: systemPrompt,
          user_prompt: request.message,
          temperature,
          max_tokens: maxTokens,
        };

        const factory = getProviderFactory();
        const provider = factory.getProvider();

        logger.info({
          provider: provider.id,
          model: config.llm.model,
          contextLen: contextText.length,
        }, '🤖 LLM_INFERENCE_START');

        let tokenUsage: TokenUsage | undefined;

        for await (const chunk of provider.inferStream(llmRequest)) {
          if (chunk.type === 'content' && chunk.content) {
            // TEXT_MESSAGE_CHUNK - 使用 delta 字段
            sendEvent(controller, encoder, {
              type: 'TEXT_MESSAGE_CHUNK',
              threadId,
              runId,
              messageId,
              delta: chunk.content,
            });
          } else if (chunk.type === 'done') {
            tokenUsage = chunk.usage;
          } else if (chunk.type === 'error') {
            throw new Error(chunk.error || 'LLM stream error');
          }
        }

        // Step 8: TEXT_MESSAGE_END
        sendEvent(controller, encoder, {
          type: 'TEXT_MESSAGE_END',
          threadId,
          runId,
          messageId,
        });

        // Step 9: 发送 CUSTOM 事件（token 使用统计）
        if (tokenUsage) {
          sendEvent(controller, encoder, {
            type: 'CUSTOM',
            threadId,
            runId,
            name: 'token_usage',
            value: tokenUsage,
          });
        }

        // Step 10: RUN_FINISHED
        sendEvent(controller, encoder, {
          type: 'RUN_FINISHED',
          threadId,
          runId,
        });

        const duration = Date.now() - startTime;
        logger.info({
          threadId,
          runId,
          userId,
          duration,
          usage: tokenUsage,
        }, '✅ CHAT_COMPLETE | success');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // RUN_ERROR
        sendEvent(controller, encoder, {
          type: 'RUN_ERROR',
          threadId,
          runId,
          error: errorMessage,
        });
        
        logger.error({
          threadId,
          runId,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        }, '❌ CHAT_ERROR');
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * 处理非流式会话请求（同步返回完整响应）
 */
export async function handleChat(request: ChatRequest): Promise<{
  threadId: string;
  runId: string;
  messageId: string;
  response: string;
  sources?: SourceReference[];
  usage?: TokenUsage;
}> {
  const startTime = Date.now();
  const threadId = request.threadId || generateId('thread');
  const runId = request.runId || generateId('run');
  const messageId = generateId('msg');
  const userId = request.user_id || 'anonymous';
  const searchLimit = request.options?.search_limit || config.chat.defaultSearchLimit;
  const temperature = request.options?.temperature || config.chat.defaultTemperature;
  const maxTokens = request.options?.max_tokens || config.chat.defaultMaxTokens;
  const includeSources = request.options?.include_sources !== false;

  logger.info({
    threadId,
    runId,
    userId,
    messageLen: request.message.length,
  }, '📥 CHAT_REQUEST_SYNC | start');

  try {
    // 查询处理
    const queryResult = await queryProcessor.processQuery(request.message);

    // 搜索知识库 (传递预处理结果，避免重复 LLM 调用)
    const searchRequest: ProviderSearchRequest = {
      user_id: userId,
      query: queryResult.processedQuery,
      limit: searchLimit,
    };
    const searchResult = await handleSearch(searchRequest, {
      preProcessedResult: queryResult,
    });

    // 构建上下文
    const contextText = buildContextText(searchResult.chunks);
    const systemPrompt = buildSystemPrompt(contextText);

    // 调用 LLM
    const llmRequest: LLMInferRequest = {
      system_prompt: systemPrompt,
      user_prompt: request.message,
      temperature,
      max_tokens: maxTokens,
    };

    const factory = getProviderFactory();
    const provider = factory.getProvider();
    const response = await provider.infer(llmRequest);

    const duration = Date.now() - startTime;
    logger.info({
      threadId,
      runId,
      userId,
      duration,
      usage: response.usage,
    }, '✅ CHAT_SYNC_COMPLETE | success');

    // 构建来源引用
    const sources: SourceReference[] | undefined = includeSources && searchResult.chunks.length > 0
      ? searchResult.chunks.map(chunk => ({
          chunk_id: chunk.chunk_id,
          document_title: chunk.document_title,
          content_preview: chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : ''),
          score: chunk.score,
        }))
      : undefined;

    return {
      threadId,
      runId,
      messageId,
      response: response.response_text,
      sources,
      usage: response.usage,
    };
  } catch (error) {
    logger.error({
      threadId,
      runId,
      error: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
    }, '❌ CHAT_SYNC_ERROR');
    throw error;
  }
}
