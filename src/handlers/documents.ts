/**
 * Documents Handler
 * 
 * Handles document management (upload, list, get, delete).
 */

import { logger } from '../utils/logger.js';
import { txtaiService } from '../services/txtai-service.js';
import { documentProcessor } from '../services/document-processor.js';
import { documentStore, type StoredDocument } from '../services/document-store.js';

// Import types from generated contract
import type { components } from '../../libs/contracts-ts/generated/knowledge-provider.js';

// Extract types from contract
export type DocumentUploadRequest = components['schemas']['DocumentUploadRequest'];
export type DocumentUploadResponse = components['schemas']['DocumentUploadResponse'];
export type DocumentListResponse = components['schemas']['DocumentListResponse'];
export type DeleteResponse = components['schemas']['DeleteResponse'];

/**
 * Generate unique document ID
 */
function generateDocumentId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `doc_${timestamp}_${random}`;
}

/**
 * Handle document upload
 */
export async function handleUploadDocument(
  request: DocumentUploadRequest
): Promise<DocumentUploadResponse> {
  const documentId = generateDocumentId();

  logger.info('Document upload started', {
    documentId,
    title: request.title,
    contentLength: request.content.length,
  });

  try {
    // Process document into chunks
    const processed = documentProcessor.processDocument(
      documentId,
      request.title,
      request.content,
      request.metadata
    );

    // Index chunks in txtai
    await txtaiService.index(
      processed.chunks.map((chunk) => ({
        id: chunk.id,
        text: chunk.text,
        metadata: chunk.metadata,
      }))
    );

    // Store document metadata
    documentStore.upsert({
      document_id: documentId,
      title: request.title,
      category: request.category,
      description: request.description,
      status: 'indexed',
      chunks_count: processed.total_chunks,
      created_at: processed.created_at,
      updated_at: processed.created_at,
      metadata: request.metadata,
    });

    logger.info('Document upload completed', {
      documentId,
      chunksCount: processed.total_chunks,
    });

    return {
      document_id: documentId,
      status: 'indexed',
      chunks_count: processed.total_chunks,
      message: `Document indexed successfully with ${processed.total_chunks} chunks`,
    };
  } catch (error) {
    logger.error('Document upload failed', {
      documentId,
      error: error instanceof Error ? error.message : 'Unknown',
    });

    // Store failed document
    documentStore.upsert({
      document_id: documentId,
      title: request.title,
      category: request.category,
      description: request.description,
      status: 'failed',
      chunks_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: request.metadata,
    });

    return {
      document_id: documentId,
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle list documents
 */
export function handleListDocuments(
  limit: number = 50,
  offset: number = 0
): DocumentListResponse {
  const result = documentStore.list(limit, offset);

  return {
    documents: result.documents,
    total: result.total,
    limit,
    offset,
  };
}

/**
 * Handle get document
 */
export function handleGetDocument(documentId: string): StoredDocument | null {
  const doc = documentStore.get(documentId);
  return doc || null;
}

/**
 * Handle delete document
 */
export async function handleDeleteDocument(
  documentId: string
): Promise<DeleteResponse> {
  const doc = documentStore.get(documentId);

  if (!doc) {
    return {
      success: false,
      message: 'Document not found',
    };
  }

  try {
    // Get chunk IDs and delete from txtai
    const chunkIds = documentStore.getChunkIds(documentId);
    if (chunkIds.length > 0) {
      await txtaiService.delete(chunkIds);
    }

    // Delete from store
    documentStore.delete(documentId);

    logger.info('Document deleted', { documentId });

    return {
      success: true,
      message: 'Document deleted successfully',
    };
  } catch (error) {
    logger.error('Document delete failed', {
      documentId,
      error: error instanceof Error ? error.message : 'Unknown',
    });

    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

