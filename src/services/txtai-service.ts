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
   * Search for similar documents
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

      // txtai search API
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

