/**
 * Search Handler
 * 
 * Handles knowledge base search requests.
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { countTokens } from '../utils/token-counter.js';
import { txtaiService } from '../services/txtai-service.js';
import { documentStore } from '../services/document-store.js';

// Import types from generated contract
import type { components } from '../../libs/contracts-ts/generated/knowledge-provider.js';

// Extract types from contract
export type ProviderSearchRequest = components['schemas']['ProviderSearchRequest'];
export type ProviderChunk = components['schemas']['ProviderChunk'];
export type ProviderSearchResponse = components['schemas']['ProviderSearchResponse'];
export type ErrorResponse = components['schemas']['ErrorResponse'];

/**
 * Handle search request
 */
export async function handleSearch(
  request: ProviderSearchRequest
): Promise<ProviderSearchResponse> {
  logger.info('Search request received', {
    userId: request.user_id,
    query: request.query.substring(0, 50),
    limit: request.limit,
  });

  // Validate request
  const limit = Math.min(
    request.limit || config.search.defaultLimit,
    config.search.maxLimit
  );

  try {
    // Search using txtai
    const results = await txtaiService.search(request.query, limit * 2);

    // Convert to provider chunks
    const chunks: ProviderChunk[] = [];
    let totalTokens = 0;

    for (const result of results) {
      // Skip low score results
      if (result.score < config.search.minScore) {
        continue;
      }

      // Extract document info from chunk ID
      const chunkIdParts = result.id.split('_chunk_');
      const documentId = chunkIdParts[0] || result.id;
      const doc = documentStore.get(documentId);

      const chunk: ProviderChunk = {
        chunk_id: result.id,
        content: result.text,
        score: result.score,
        document_id: documentId,
        document_title: doc?.title || 'Unknown',
        metadata: {
          ...(result.metadata || {}),
          category: doc?.category,
        },
      };

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
        search_mode: 'vector',
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

