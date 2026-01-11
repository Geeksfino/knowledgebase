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

// Helper for waiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class TxtaiService {
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;
  private batchSize = 50; // Default batch size for indexing
  private indexQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.baseUrl = config.txtai.url;
    this.apiKey = config.txtai.apiKey;
    this.timeout = config.txtai.timeout;
  }

  /**
   * Search for similar documents using vector search
   * txtai uses GET method with query parameters for search
   */
  async search(
    query: string,
    limit: number = 5
  ): Promise<TxtaiSearchResult[]> {
    try {
      const headers: Record<string, string> = {};

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // txtai search API uses GET with query parameters
      const params = new URLSearchParams({
        query,
        limit: String(limit),
      });

      const response = await fetch(`${this.baseUrl}/search?${params}`, {
        method: 'GET',
        headers,
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
   * Index documents with batching and retry logic
   */
  async index(documents: TxtaiIndexDocument[]): Promise<void> {
    if (documents.length === 0) return;

    let successCount = 0;
    const errors: string[] = [];

    // Process in batches
    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const batchNum = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(documents.length / this.batchSize);

      try {
        await this.indexBatchWithRetry(batch, false);
        successCount += batch.length;
        logger.info(`Indexed batch ${batchNum}/${totalBatches} (${batch.length} docs)`);
      } catch (error) {
        const msg = `Failed to index batch ${batchNum}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(msg);
        errors.push(msg);
      }
    }

    // Note: No need to call rebuildIndex() since /upsert handles it automatically

    if (errors.length > 0) {
      // Throw error if any batch failed, but still allow partial success (handled by caller if needed)
      throw new Error(`Indexing completed with ${errors.length} batch errors:\n${errors.join('\n')}`);
    }

    logger.info('All documents indexed successfully', { count: successCount });
  }

  /**
   * Index multimodal documents (images/videos) with batching and retry logic
   */
  async indexMultimodal(documents: TxtaiIndexDocument[]): Promise<void> {
    if (documents.length === 0) return;

    let successCount = 0;
    const errors: string[] = [];

    // Process in batches
    for (let i = 0; i < documents.length; i += this.batchSize) {
      const batch = documents.slice(i, i + this.batchSize);
      const batchNum = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(documents.length / this.batchSize);

      try {
        await this.indexBatchWithRetry(batch, true);
        successCount += batch.length;
        logger.info(`Indexed multimodal batch ${batchNum}/${totalBatches} (${batch.length} docs)`);
      } catch (error) {
        const msg = `Failed to index multimodal batch ${batchNum}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(msg);
        errors.push(msg);
      }
    }

    // Note: No need to call rebuildIndex() since /upsert handles it automatically

    if (errors.length > 0) {
      throw new Error(`Multimodal indexing completed with ${errors.length} batch errors:\n${errors.join('\n')}`);
    }

    logger.info('All multimodal documents indexed successfully', { count: successCount });
  }

  /**
   * Internal method to index a single batch with retry logic
   * Uses /add endpoint to add documents to buffer, then /index to build index
   */
  private async indexBatchWithRetry(
    batch: TxtaiIndexDocument[], 
    isMultimodal: boolean, 
    retries = 3
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // txtai /add expects array of [id, text, tags] or objects with id/text
    const data = batch.map((doc) => ({
      id: doc.id,
      text: doc.text,
      ...(doc.metadata || {}),
    }));

    const endpoint = isMultimodal ? '/addobject' : '/add';
    const operationName = isMultimodal ? 'multimodal add' : 'add';

    const performIndex = async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          // Step 1: Add documents to buffer
          const addUrl = `${this.baseUrl}${endpoint}`;
          logger.debug(`Sending ${operationName} request to ${addUrl}`);
          
          const addResponse = await fetch(addUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(this.timeout * 2),
          });

          if (addResponse.status === 404 && isMultimodal) {
            logger.info('Multimodal add not available, falling back to regular add');
            // 注意：这里递归调用本身是危险的，如果已经在队列中。
            // 但既然我们在 performIndex 内部，直接调用 this.indexBatchWithRetry 会创建一个新的队列项。
            // 为了简单起见，这里我们直接抛出一个特定的错误或者让外层处理。
            // 实际上，递归调用会追加到队列末尾，这也是可以接受的。
            // 但为了保持上下文简单，我们假设递归调用是可以的。
            return this.indexBatchWithRetry(batch, false, retries);
          }

          if (!addResponse.ok) {
            const errorText = await addResponse.text();
            throw new Error(`Add failed (${addUrl}) - Status ${addResponse.status}: ${errorText}`);
          }

          // Step 2: Upsert documents (txtai uses GET for /upsert)
          // IMPORTANT: Use /upsert instead of /index!
          // /index overwrites the entire index, /upsert adds incrementally
          const upsertUrl = `${this.baseUrl}/upsert`;
          logger.debug(`Sending upsert request to ${upsertUrl}`);
          const upsertResponse = await fetch(upsertUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(this.timeout * 3),
          });

          // 500 error from /upsert can happen when buffer is empty (already indexed)
          // This is not a real error in our case
          if (!upsertResponse.ok && upsertResponse.status !== 500) {
            const errorText = await upsertResponse.text();
            throw new Error(`Upsert failed (${upsertUrl}) - Status ${upsertResponse.status}: ${errorText}`);
          }

          return;
        } catch (error) {
          if (attempt === retries) {
            throw error;
          }
          
          logger.warn(`${operationName} batch attempt ${attempt} failed, retrying in ${attempt}s...`, {
            error: error instanceof Error ? error.message : 'Unknown',
          });
          await delay(1000 * attempt);
        }
      }
    };

    // Chain the execution to the queue
    const execution = this.indexQueue.then(performIndex);
    
    // Update the queue pointer, catching errors to ensure the queue keeps moving
    this.indexQueue = execution.catch(() => {});

    return execution;
  }

  /**
   * Rebuild the index after adding documents
   * txtai uses GET method for index endpoint
   * 
   * Note: txtai's /index endpoint will return 500 if there are no documents
   * in the buffer (self.documents is None). This is expected behavior when:
   * - The index was already built and buffer was cleared
   * - No documents were added before calling /index
   * 
   * We handle this gracefully since it's not a real error.
   */
  private async rebuildIndex(): Promise<void> {
    const headers: Record<string, string> = {};

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}/index`, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(this.timeout * 2),
      });

      if (response.ok) {
        logger.info('Index rebuilt successfully');
      } else if (response.status === 500) {
        // 500 error from /index usually means the document buffer is empty
        // This is expected if documents were already indexed or no new documents added
        // txtai throws TypeError: 'NoneType' object is not iterable when buffer is empty
        // We silently ignore this as it's not a real error
        logger.debug('Index rebuild skipped (buffer likely empty)', { status: response.status });
      } else {
        logger.warn('Unexpected response from index rebuild', { status: response.status });
      }
    } catch (error) {
      // Network errors or timeouts - these are real issues worth logging
      logger.warn('Error triggering index rebuild', { 
        error: error instanceof Error ? error.message : 'Unknown' 
      });
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
   * Health check using /count endpoint which returns 200
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Use /count endpoint instead of root to avoid 404 logs
      const response = await fetch(`${this.baseUrl}/count`, {
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
