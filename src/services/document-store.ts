/**
 * Document Store Service
 * 
 * SQLite-based document metadata store with persistence.
 * Data is stored in SQLite database for reliability and performance.
 *
 * @module services/document-store
 */

import { Database } from 'bun:sqlite';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

export interface StoredDocument {
  document_id: string;
  title: string;
  category?: string;
  description?: string;
  status: 'indexed' | 'processing' | 'failed';
  chunks_count: number;
  created_at: string;
  updated_at: string;
  media_type?: 'text' | 'image' | 'video' | 'audio' | 'document';
  media_url?: string;
  metadata?: Record<string, unknown>;
  /** SHA256 hash of document content for deduplication */
  content_hash?: string;
}

/**
 * SQLite-based Document Store
 */
class DocumentStore {
  private db: Database;
  private dbPath: string;

  constructor() {
    // Ensure storage directory exists
    const storageDir = config.storage.path;
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
      logger.info('Created storage directory', { path: storageDir });
    }

    // Initialize SQLite database
    this.dbPath = path.join(storageDir, 'knowledgebase.db');
    this.db = new Database(this.dbPath);
    
    // Enable WAL mode for better concurrency
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    
    // Initialize schema
    this.initSchema();
    
    // Migrate from JSON if exists
    this.migrateFromJson();

    logger.info('Document store initialized (SQLite)', { 
      path: this.dbPath,
      count: this.count(),
    });
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        document_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'indexed',
        chunks_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        media_type TEXT DEFAULT 'text',
        media_url TEXT,
        metadata TEXT,
        content_hash TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_documents_content_hash ON documents(content_hash);
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
      CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
    `);
  }

  /**
   * Migrate data from old JSON file if exists
   */
  private migrateFromJson(): void {
    const jsonPath = path.join(config.storage.path, 'document-store.json');
    
    if (!fs.existsSync(jsonPath)) {
      return;
    }

    try {
      const data = fs.readFileSync(jsonPath, 'utf-8');
      const storeData = JSON.parse(data) as {
        documents: StoredDocument[];
      };

      if (!storeData.documents || storeData.documents.length === 0) {
        return;
      }

      // Check if we already have data
      if (this.count() > 0) {
        logger.info('SQLite already has data, skipping JSON migration');
        return;
      }

      logger.info('Migrating documents from JSON to SQLite', {
        count: storeData.documents.length,
      });

      // Insert documents in a transaction
      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO documents 
        (document_id, title, category, description, status, chunks_count, 
         created_at, updated_at, media_type, media_url, metadata, content_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      this.db.transaction(() => {
        for (const doc of storeData.documents) {
          insertStmt.run(
            doc.document_id,
            doc.title,
            doc.category || null,
            doc.description || null,
            doc.status,
            doc.chunks_count,
            doc.created_at,
            doc.updated_at,
            doc.media_type || 'text',
            doc.media_url || null,
            doc.metadata ? JSON.stringify(doc.metadata) : null,
            doc.content_hash || null
          );
        }
      })();

      logger.info('Migration completed successfully', {
        migratedCount: storeData.documents.length,
      });

      // Rename old JSON file
      fs.renameSync(jsonPath, `${jsonPath}.migrated`);
      logger.info('Old JSON file renamed to .migrated');

    } catch (error) {
      logger.error('Failed to migrate from JSON', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  /**
   * Add or update a document
   */
  upsert(doc: StoredDocument): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO documents 
      (document_id, title, category, description, status, chunks_count, 
       created_at, updated_at, media_type, media_url, metadata, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        description = excluded.description,
        status = excluded.status,
        chunks_count = excluded.chunks_count,
        updated_at = excluded.updated_at,
        media_type = excluded.media_type,
        media_url = excluded.media_url,
        metadata = excluded.metadata,
        content_hash = excluded.content_hash
    `);

    stmt.run(
      doc.document_id,
      doc.title,
      doc.category || null,
      doc.description || null,
      doc.status,
      doc.chunks_count,
      doc.created_at || now,
      now,
      doc.media_type || 'text',
      doc.media_url || null,
      doc.metadata ? JSON.stringify(doc.metadata) : null,
      doc.content_hash || null
    );

    logger.debug('Document stored', { documentId: doc.document_id });
  }

  /**
   * Get a document by ID
   */
  get(documentId: string): StoredDocument | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM documents WHERE document_id = ?
    `);

    const row = stmt.get(documentId) as Record<string, unknown> | null;
    
    if (!row) {
      return undefined;
    }

    return this.rowToDocument(row);
  }

  /**
   * Delete a document
   */
  delete(documentId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM documents WHERE document_id = ?
    `);

    const result = stmt.run(documentId);
    const deleted = result.changes > 0;

    if (deleted) {
      logger.debug('Document deleted', { documentId });
    }

    return deleted;
  }

  /**
   * List all documents with pagination
   */
  list(limit: number = 50, offset: number = 0): {
    documents: StoredDocument[];
    total: number;
  } {
    // Get total count
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM documents');
    const countResult = countStmt.get() as { count: number };
    const total = countResult.count;

    // Get paginated results
    const stmt = this.db.prepare(`
      SELECT * FROM documents 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as Array<Record<string, unknown>>;
    const documents = rows.map(row => this.rowToDocument(row));

    return { documents, total };
  }

  /**
   * Check if document exists
   */
  exists(documentId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM documents WHERE document_id = ? LIMIT 1
    `);

    return stmt.get(documentId) !== null;
  }

  /**
   * Find document by content hash (for deduplication)
   */
  findByContentHash(contentHash: string): StoredDocument | null {
    const stmt = this.db.prepare(`
      SELECT * FROM documents WHERE content_hash = ? LIMIT 1
    `);

    const row = stmt.get(contentHash) as Record<string, unknown> | null;

    if (!row) {
      return null;
    }

    return this.rowToDocument(row);
  }

  /**
   * Check if content hash already exists
   */
  hashExists(contentHash: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM documents WHERE content_hash = ? LIMIT 1
    `);

    return stmt.get(contentHash) !== null;
  }

  /**
   * Get chunk IDs for a document
   */
  getChunkIds(documentId: string): string[] {
    const doc = this.get(documentId);
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
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM documents');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Search documents by title or category
   */
  search(query: string, limit: number = 20): StoredDocument[] {
    const stmt = this.db.prepare(`
      SELECT * FROM documents 
      WHERE title LIKE ? OR category LIKE ? OR description LIKE ?
      ORDER BY created_at DESC 
      LIMIT ?
    `);

    const pattern = `%${query}%`;
    const rows = stmt.all(pattern, pattern, pattern, limit) as Array<Record<string, unknown>>;
    
    return rows.map(row => this.rowToDocument(row));
  }

  /**
   * Get documents by category
   */
  getByCategory(category: string, limit: number = 50): StoredDocument[] {
    const stmt = this.db.prepare(`
      SELECT * FROM documents 
      WHERE category = ?
      ORDER BY created_at DESC 
      LIMIT ?
    `);

    const rows = stmt.all(category, limit) as Array<Record<string, unknown>>;
    
    return rows.map(row => this.rowToDocument(row));
  }

  /**
   * Clear all documents (for testing)
   */
  clear(): void {
    this.db.exec('DELETE FROM documents');
    logger.info('Document store cleared');
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
    logger.info('Document store closed');
  }

  /**
   * Convert database row to StoredDocument
   */
  private rowToDocument(row: Record<string, unknown>): StoredDocument {
    return {
      document_id: row.document_id as string,
      title: row.title as string,
      category: row.category as string | undefined,
      description: row.description as string | undefined,
      status: row.status as 'indexed' | 'processing' | 'failed',
      chunks_count: row.chunks_count as number,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      media_type: row.media_type as StoredDocument['media_type'],
      media_url: row.media_url as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      content_hash: row.content_hash as string | undefined,
    };
  }
}

// Singleton instance
export const documentStore = new DocumentStore();

// Handle graceful shutdown
process.on('beforeExit', () => {
  documentStore.close();
});

process.on('SIGINT', () => {
  documentStore.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  documentStore.close();
  process.exit(0);
});
