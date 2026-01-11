/**
 * Search Handler
 *
 * 处理知识库搜索请求，支持：
 * - 混合搜索（向量相似度 + BM25 关键词匹配）
 * - 智能查询处理（LLM 扩展和重写）
 * - 多查询融合（提高召回率）
 * - Token 预算控制
 *
 * @module handlers/search
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { countTokens } from '../utils/token-counter.js';
import { txtaiService } from '../services/txtai-service.js';
import { documentStore } from '../services/document-store.js';
import { queryProcessor } from '../services/query-processor.js';

// Import types from generated contract
// Following contract-first pattern: contracts are sacred, implementations are disposable
import type { components } from '@knowledgebase/contracts-ts/generated/knowledge-provider';

// Extract types from contract
export type ProviderSearchRequest = components['schemas']['ProviderSearchRequest'];
export type ProviderChunk = components['schemas']['ProviderChunk'];
export type ProviderSearchResponse = components['schemas']['ProviderSearchResponse'];
export type ErrorResponse = components['schemas']['ErrorResponse'];

/**
 * 搜索结果元数据类型
 * 从 txtai 返回的原始结果中提取的元数据
 */
interface SearchResultMetadata {
  document_title?: string;
  media_type?: string;
  media_url?: string;
  category?: string;
  [key: string]: unknown;
}

/**
 * 从内容中智能提取标题
 * 优先级：Markdown 标题 > 第一行有意义的文本
 */
function extractTitleFromContent(content: string): string {
  if (!content) return '未知文档';
  
  // 尝试提取 Markdown 标题 (# 标题)
  const headingMatch = content.match(/^#+\s+(.+?)$/m);
  if (headingMatch && headingMatch[1]) {
    return headingMatch[1].trim().substring(0, 50);
  }
  
  // 尝试提取第一行非空文本
  const firstLine = content.split('\n').find(line => line.trim().length > 0);
  if (firstLine) {
    // 移除 Markdown 格式符号
    const cleanLine = firstLine
      .replace(/^[#*\->\s]+/, '')  // 移除开头的 #, *, -, > 等
      .replace(/[*_`~]+/g, '')      // 移除加粗、斜体等标记
      .trim();
    
    if (cleanLine.length > 0) {
      return cleanLine.substring(0, 50) + (cleanLine.length > 50 ? '...' : '');
    }
  }
  
  return '未知文档';
}

/**
 * Handle search request
 * 
 * @param request - Search request
 * @param options - Optional settings
 * @param options.skipQueryProcessing - Skip LLM query processing (use when already processed by caller)
 * @param options.preProcessedResult - Pre-processed query result from caller
 */
export async function handleSearch(
  request: ProviderSearchRequest,
  options?: {
    skipQueryProcessing?: boolean;
    preProcessedResult?: import('../services/query-processor.js').QueryProcessingResult;
  }
): Promise<ProviderSearchResponse> {
  const limit = Math.min(
    request.limit || config.search.defaultLimit,
    config.search.maxLimit
  );

  // Use pre-processed result if provided, otherwise process query
  const queryResult = options?.preProcessedResult 
    ?? (options?.skipQueryProcessing 
      ? { processedQuery: request.query, method: 'original' as const }
      : await queryProcessor.processQuery(request.query));
  
  logger.info('Search request received', {
    userId: request.user_id,
    originalQuery: request.query.substring(0, 50),
    processedQuery: queryResult.processedQuery.substring(0, 50),
    processingMethod: queryResult.method,
    limit,
  });

  try {
    // Advanced: Multi-query fusion strategy
    // If LLM generated multiple query variants, search with all of them and merge results
    let results: Array<{ id: string; score: number; text: string; metadata?: Record<string, unknown> }>;
    
    if (queryResult.expandedQueries && queryResult.expandedQueries.length > 1) {
      // Multi-query fusion: search with all expanded queries and merge results
      logger.info('Using multi-query fusion', {
        queryCount: queryResult.expandedQueries.length,
        queries: queryResult.expandedQueries.map(q => q.substring(0, 30)),
      });
      
      results = await multiQuerySearch(
        queryResult.expandedQueries,
        limit * 2
      );
    } else {
      // Single query search (original or processed)
      results = await txtaiService.hybridSearch(queryResult.processedQuery, limit * 2);
    }

    // Convert to provider chunks
    const chunks: ProviderChunk[] = [];
    let totalTokens = 0;

    for (const result of results) {
      // Skip low score results
      if (result.score < config.search.minScore) {
        continue;
      }

      // Extract document info from chunk ID (format: {documentId}_chunk_{index})
      const chunkIdParts = result.id.split('_chunk_');
      const documentId = chunkIdParts[0] || result.id;
      const doc = documentStore.get(documentId);

      // Type-safe metadata extraction
      const metadata = (result.metadata || {}) as SearchResultMetadata;

      // Try to get title from document store, then from metadata, then extract from content
      let documentTitle = doc?.title || metadata.document_title;
      
      // If no title, try to extract from content (Markdown heading or first line)
      if (!documentTitle || documentTitle === 'Unknown') {
        documentTitle = extractTitleFromContent(result.text);
      }

      // Extract media type and URL from metadata or document store
      const mediaType = metadata.media_type || doc?.media_type || 'text';
      const mediaUrl = metadata.media_url || doc?.media_url;

      // Build chunk with all fields
      const chunk = {
        chunk_id: result.id,
        content: result.text,
        score: result.score,
        document_id: documentId,
        document_title: documentTitle,
        media_type: mediaType as 'text' | 'image' | 'video' | 'audio',
        ...(mediaUrl && { media_url: mediaUrl }),
        metadata: {
          ...metadata,
          category: doc?.category || metadata.category,
        },
      } as ProviderChunk & { media_type?: string; media_url?: string };

      const chunkTokens = countTokens(chunk.content);

      // Check token budget
      if (request.token_budget && totalTokens + chunkTokens > request.token_budget) {
        break;
      }

      chunks.push(chunk);
      totalTokens += chunkTokens;

      // Check limit
      if (chunks.length >= limit) {
        break;
      }
    }

    const response: ProviderSearchResponse = {
      provider_name: config.provider.name,
      chunks,
      total_tokens: totalTokens,
      metadata: {
        search_mode: 'hybrid', // hybrid = vector + keyword
        results_count: chunks.length,
        min_score: config.search.minScore,
      },
    };

    logger.info('Search completed', {
      userId: request.user_id,
      resultsCount: chunks.length,
      totalTokens,
    });

    return response;
  } catch (error) {
    logger.error('Search failed', {
      error: error instanceof Error ? error.message : 'Unknown',
      userId: request.user_id,
    });
    throw error;
  }
}

/**
 * Multi-query fusion: Search with multiple query variants and merge results
 * Uses RRF (Reciprocal Rank Fusion) algorithm for better ranking
 * This improves recall by combining results from different query formulations
 */
async function multiQuerySearch(
  queries: string[],
  limit: number
): Promise<Array<{ id: string; score: number; text: string; metadata?: Record<string, unknown> }>> {
  const RRF_K = 60; // Constant for RRF algorithm
  
  // Map to store RRF scores and keep track of max semantic score for filtering
  const rrfResults: Map<string, {
    id: string;
    rrfScore: number;
    maxScore: number;
    text: string;
    metadata?: Record<string, unknown>;
  }> = new Map();

  // Search with each query variant
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    try {
      const queryResults = await txtaiService.hybridSearch(query, limit);
      
      // Calculate RRF score for each result in the ranked list
      queryResults.forEach((result, rank) => {
        // RRF score = 1 / (k + rank + 1)
        // rank is 0-based index
        const rrfScore = 1 / (RRF_K + rank + 1);
        
        const existing = rrfResults.get(result.id);
        if (existing) {
          // Accumulate RRF score
          existing.rrfScore += rrfScore;
          // Keep max semantic score for threshold filtering later
          existing.maxScore = Math.max(existing.maxScore, result.score);
          
          // Update metadata if this result has a higher semantic score
          if (result.score > existing.maxScore) {
            existing.text = result.text;
            existing.metadata = result.metadata;
          }
        } else {
          // Initialize new result
          rrfResults.set(result.id, {
            id: result.id,
            rrfScore: rrfScore,
            maxScore: result.score,
            text: result.text,
            metadata: result.metadata,
          });
        }
      });
    } catch (error) {
      logger.warn('Query variant search failed', {
        query: query.substring(0, 50),
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // Continue with other queries
    }
  }

  // Sort by accumulated RRF score (descending)
  const sortedResults = Array.from(rrfResults.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);

  logger.info('Multi-query fusion (RRF) completed', {
    totalQueries: queries.length,
    uniqueResults: sortedResults.length,
    topRRFScore: sortedResults[0]?.rrfScore,
  });

  // Return results mapped back to expected format
  // Note: We return maxScore as 'score' so that downstream filtering (minScore) works correctly
  // The order is determined by RRF, but the absolute score value is the semantic similarity
  return sortedResults.map(item => ({
    id: item.id,
    score: item.maxScore,
    text: item.text,
    metadata: item.metadata,
  }));
}

