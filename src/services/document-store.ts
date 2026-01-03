/**
 * Document Store Service
 * 
 * In-memory document metadata store.
 * For production, this should be replaced with a database.
 */

import { logger } from '../utils/logger.js';

export interface StoredDocument {
  document_id: string;
  title: string;
  category?: string;
  description?: string;
  status: 'indexed' | 'processing' | 'failed';
  chunks_count: number;
  created_at: string;
  updated_at: string;
  media_type?: 'text' | 'image' | 'video' | 'audio';
  media_url?: string;
  metadata?: Record<string, unknown>;
}

class DocumentStore {
  private documents: Map<string, StoredDocument> = new Map();

  /**
   * Add or update a document
   */
  upsert(doc: StoredDocument): void {
    this.documents.set(doc.document_id, {
      ...doc,
      updated_at: new Date().toISOString(),
    });
    logger.debug('Document stored', { documentId: doc.document_id });
  }

  /**
   * Get a document by ID
   */
  get(documentId: string): StoredDocument | undefined {
    return this.documents.get(documentId);
  }

  /**
   * Delete a document
   */
  delete(documentId: string): boolean {
    const existed = this.documents.has(documentId);
    this.documents.delete(documentId);
    if (existed) {
      logger.debug('Document deleted', { documentId });
    }
    return existed;
  }

  /**
   * List all documents
   */
  list(limit: number = 50, offset: number = 0): {
    documents: StoredDocument[];
    total: number;
  } {
    const allDocs = Array.from(this.documents.values());
    const total = allDocs.length;
    const documents = allDocs
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(offset, offset + limit);

    return { documents, total };
  }

  /**
   * Check if document exists
   */
  exists(documentId: string): boolean {
    return this.documents.has(documentId);
  }

  /**
   * Get chunk IDs for a document
   */
  getChunkIds(documentId: string): string[] {
    const doc = this.documents.get(documentId);
    if (!doc) return [];
    
    const ids: string[] = [];
    for (let i = 0; i < doc.chunks_count; i++) {
      ids.push(`${documentId}_chunk_${i}`);
    }
    return ids;
  }

  /**
   * Get count of documents
   */
  count(): number {
    return this.documents.size;
  }
}

// Singleton instance
export const documentStore = new DocumentStore();

