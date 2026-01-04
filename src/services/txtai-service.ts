/**
 * txtai Service
 * 
 * Wrapper for txtai API, providing vector search and indexing capabilities.
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface TxtaiSearchResult {
  id: string;
  score: number;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface TxtaiIndexDocument {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export class TxtaiService {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor() {
    this.baseUrl = config.txtai.url;
    this.apiKey = config.txtai.apiKey;
    this.timeout = config.txtai.timeout;
  }

  /**
   * Search for similar documents using vector search
   */
  async search(
    query: string,
    limit: number = 5
  ): Promise<TxtaiSearchResult[]> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // txtai search API (vector search)
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          limit,
        }),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`txtai search failed: ${response.status} - ${errorText}`);
      }

      const results = await response.json() as Array<{
        id: string;
        score: number;
        text?: string;
      }>;

      return results.map((r) => ({
        id: String(r.id),
        score: r.score,
        text: r.text || '',
        metadata: {},
      }));
    } catch (error) {
      logger.error('txtai search error', {
        error: error instanceof Error ? error.message : 'Unknown',
        query,
      });
      throw error;
    }
  }

  /**
   * Hybrid search: combines vector search and keyword search (BM25)
   * This provides better results by combining semantic similarity with keyword matching
   * 
   * @param query - Search query
   * @param limit - Maximum number of results
   * @param weights - Optional weights for [vector, bm25]. Default from config.
   */
  async hybridSearch(
    query: string,
    limit: number = 5,
    weights?: [number, number]
  ): Promise<TxtaiSearchResult[]> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // Use configured weights or provided weights
      const searchWeights = weights || config.search.hybridWeights as [number, number];

      // Try hybrid search endpoint first (if configured in txtai)
      // Fallback to vector search if hybrid is not available
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/hybrid`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            query,
            limit,
            weights: searchWeights, // Pass weights to txtai for dynamic adjustment
          }),
          signal: AbortSignal.timeout(this.timeout),
        });

        // If hybrid endpoint doesn't exist, fall back to vector search
        if (response.status === 404) {
          logger.info('Hybrid search not available, falling back to vector search');
          return this.search(query, limit);
        }
      } catch (error) {
        // If hybrid endpoint fails, fall back to vector search
        logger.info('Hybrid search failed, falling back to vector search', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        return this.search(query, limit);
      }

      if (!response.ok) {
        const errorText = await response.text();
        // If hybrid search fails, fall back to vector search
        logger.warn('Hybrid search failed, falling back to vector search', {
          status: response.status,
          error: errorText,
        });
        return this.search(query, limit);
      }

      const results = await response.json() as Array<{
        id: string;
        score: number;
        text?: string;
      }>;

      return results.map((r) => ({
        id: String(r.id),
        score: r.score,
        text: r.text || '',
        metadata: {},
      }));
    } catch (error) {
      logger.error('txtai hybrid search error', {
        error: error instanceof Error ? error.message : 'Unknown',
        query,
      });
      // Fall back to vector search on error
      return this.search(query, limit);
    }
  }

  /**
   * Index documents
   */
  async index(documents: TxtaiIndexDocument[]): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // Format for txtai: array of [id, text, metadata] tuples
      const data = documents.map((doc) => ({
        id: doc.id,
        text: doc.text,
        ...(doc.metadata || {}),
      }));

      // txtai add API
      const response = await fetch(`${this.baseUrl}/add`, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(this.timeout * 2),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`txtai index failed: ${response.status} - ${errorText}`);
      }

      // Trigger index rebuild
      await this.rebuildIndex();

      logger.info('Documents indexed', { count: documents.length });
    } catch (error) {
      logger.error('txtai index error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Index multimodal documents (images/videos)
   * Uses the multimodal index configured in txtai
   */
  async indexMultimodal(documents: TxtaiIndexDocument[]): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // Format for txtai multimodal index
      // For images, txtai can process image URLs or paths
      const data = documents.map((doc) => ({
        id: doc.id,
        text: doc.text,
        // If metadata contains media_url, txtai can use it for image processing
        ...(doc.metadata || {}),
      }));

      // Use multimodal index endpoint if available, otherwise fall back to regular index
      // txtai's multimodal index can be accessed via /multimodal/add or /images/add
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/multimodal/add`, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(this.timeout * 2),
        });

        // If multimodal endpoint doesn't exist, fall back to regular index
        if (response.status === 404) {
          logger.info('Multimodal index not available, using regular index');
          return this.index(documents);
        }
      } catch (error) {
        // Fall back to regular index
        logger.info('Multimodal index failed, using regular index', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        return this.index(documents);
      }

      if (!response.ok) {
        const errorText = await response.text();
        // Fall back to regular index on error
        logger.warn('Multimodal index failed, falling back to regular index', {
          status: response.status,
          error: errorText,
        });
        return this.index(documents);
      }

      // Trigger index rebuild
      await this.rebuildIndex();

      logger.info('Multimodal documents indexed', { count: documents.length });
    } catch (error) {
      logger.error('txtai multimodal index error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // Fall back to regular index
      return this.index(documents);
    }
  }

  /**
   * Rebuild the index after adding documents
   */
  private async rebuildIndex(): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(`${this.baseUrl}/index`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(this.timeout * 2),
    });

    if (!response.ok) {
      logger.warn('Failed to rebuild index', { status: response.status });
    }
  }

  /**
   * Delete documents by IDs
   */
  async delete(documentIds: string[]): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify(documentIds),
        signal: AbortSignal.timeout(this.timeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`txtai delete failed: ${response.status} - ${errorText}`);
      }

      logger.info('Documents deleted', { count: documentIds.length });
    } catch (error) {
      logger.error('txtai delete error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch (error) {
      logger.warn('txtai health check failed', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return false;
    }
  }
}

// Singleton instance
export const txtaiService = new TxtaiService();

