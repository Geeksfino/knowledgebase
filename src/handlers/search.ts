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
 * Handle search request
 */
export async function handleSearch(
  request: ProviderSearchRequest
): Promise<ProviderSearchResponse> {
  // Process query using intelligent query processor (LLM rewriting or rule-based)
  const queryResult = await queryProcessor.processQuery(request.query);
  
  logger.info('Search request received', {
    userId: request.user_id,
    originalQuery: request.query.substring(0, 50),
    processedQuery: queryResult.processedQuery.substring(0, 50),
    processingMethod: queryResult.method,
    limit: request.limit,
  });

  // Validate request
  const limit = Math.min(
    request.limit || config.search.defaultLimit,
    config.search.maxLimit
  );

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

      // Try to get title from document store, then from metadata, then fallback
      const documentTitle = doc?.title || metadata.document_title || 'Unknown';

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
 * This improves recall by combining results from different query formulations
 */
async function multiQuerySearch(
  queries: string[],
  limit: number
): Promise<Array<{ id: string; score: number; text: string; metadata?: Record<string, unknown> }>> {
  // Search with each query variant
  const allResults: Map<string, {
    id: string;
    score: number;
    text: string;
    metadata?: Record<string, unknown>;
    queryIndex: number;
  }> = new Map();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    try {
      const queryResults = await txtaiService.hybridSearch(query, limit);
      
      // Merge results: use max score if same chunk appears in multiple queries
      for (const result of queryResults) {
        const existing = allResults.get(result.id);
        if (!existing || result.score > existing.score) {
          // Boost score slightly for primary query (first one)
          const adjustedScore = i === 0 ? result.score : result.score * 0.95;
          allResults.set(result.id, {
            ...result,
            score: adjustedScore,
            queryIndex: i,
          });
        }
      }
    } catch (error) {
      logger.warn('Query variant search failed', {
        query: query.substring(0, 50),
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // Continue with other queries
    }
  }

  // Sort by score (descending) and return top results
  const sortedResults = Array.from(allResults.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  logger.info('Multi-query fusion completed', {
    totalQueries: queries.length,
    uniqueResults: sortedResults.length,
    topScore: sortedResults[0]?.score,
  });

  return sortedResults;
}

