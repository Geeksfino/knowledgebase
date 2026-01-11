/**
 * Documents Handler
 *
 * 文档管理处理器，负责：
 * - 文档上传（JSON 文本和文件上传）
 * - 文档列表查询
 * - 文档详情获取
 * - 文档删除（包括索引和媒体文件清理）
 *
 * 支持的文件类型：
 * - 文本：直接 JSON 上传
 * - 图片：jpg, png, gif, webp
 * - 视频：mp4, avi, mov
 * - 文档：pdf, doc, docx
 *
 * @module handlers/documents
 */

import { logger } from '../utils/logger.js';
import { getMimeType } from '../utils/mime-types.js';
import { calculateContentHash, calculateFileHash } from '../utils/hash.js';
import { txtaiService } from '../services/txtai-service.js';
import { documentProcessor } from '../services/document-processor.js';
import { documentStore, type StoredDocument } from '../services/document-store.js';
import { mediaProcessor, type MediaFile } from '../services/media-processor.js';
import { fileStorage } from '../services/file-storage.js';
import { config } from '../config.js';

// Import types from generated contract
// Following contract-first pattern: contracts are sacred, implementations are disposable
import type { components } from '@knowledgebase/contracts-ts/generated/knowledge-provider';

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
 * 
 * Deduplication: If a document with the same content hash already exists,
 * returns the existing document instead of creating a duplicate.
 */
export async function handleUploadDocument(
  request: DocumentUploadRequest
): Promise<DocumentUploadResponse> {
  // Calculate content hash for deduplication
  const contentHash = calculateContentHash(request.content);

  // Check for duplicate content
  const existingDoc = documentStore.findByContentHash(contentHash);
  if (existingDoc) {
    logger.info('Duplicate document detected, returning existing', {
      existingDocumentId: existingDoc.document_id,
      title: request.title,
      existingTitle: existingDoc.title,
    });

    return {
      document_id: existingDoc.document_id,
      status: 'indexed',
      chunks_count: existingDoc.chunks_count,
      message: `Duplicate content detected. Returning existing document (ID: ${existingDoc.document_id}, Title: "${existingDoc.title}")`,
    };
  }

  const documentId = generateDocumentId();

  logger.info('Document upload started', {
    documentId,
    title: request.title,
    contentLength: request.content.length,
    contentHash: contentHash.substring(0, 16) + '...',
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

    // Store document metadata with content hash
    documentStore.upsert({
      document_id: documentId,
      title: request.title,
      category: request.category,
      description: request.description,
      status: 'indexed',
      chunks_count: processed.total_chunks,
      created_at: processed.created_at,
      updated_at: processed.created_at,
      media_type: 'text',
      metadata: request.metadata,
      content_hash: contentHash,
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

    // Store failed document (without hash to allow retry)
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
 * Handle file upload (multipart/form-data)
 * 
 * Deduplication: If a file with the same content hash already exists,
 * returns the existing document instead of creating a duplicate.
 */
export async function handleUploadFile(
  formData: FormData
): Promise<DocumentUploadResponse> {
  try {
    // Extract form fields first
    const title = formData.get('title');
    const file = formData.get('file');
    const category = formData.get('category');
    const description = formData.get('description');
    const metadataStr = formData.get('metadata');

    if (!title || typeof title !== 'string') {
      throw new Error('Missing or invalid title field');
    }

    if (!file || !(file instanceof File)) {
      throw new Error('Missing or invalid file field');
    }

    // Detect MIME type from filename if not provided or is generic
    let mimeType = file.type;
    if (!mimeType || mimeType === 'application/octet-stream') {
      mimeType = getMimeType(file.name);
    }

    // Read file buffer
    let fileBuffer: Buffer;
    try {
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Calculate file hash for deduplication
    const contentHash = calculateFileHash(fileBuffer);

    // Check for duplicate content
    const existingDoc = documentStore.findByContentHash(contentHash);
    if (existingDoc) {
      logger.info('Duplicate file detected, returning existing', {
        existingDocumentId: existingDoc.document_id,
        filename: file.name,
        existingTitle: existingDoc.title,
      });

      return {
        document_id: existingDoc.document_id,
        status: 'indexed',
        chunks_count: existingDoc.chunks_count,
        message: `Duplicate file detected. Returning existing document (ID: ${existingDoc.document_id}, Title: "${existingDoc.title}")`,
      };
    }

    const documentId = generateDocumentId();

    logger.info('Processing file upload', { 
      documentId,
      filename: file.name,
      contentHash: contentHash.substring(0, 16) + '...',
    });

    logger.info('Form data extracted', {
      documentId,
      hasTitle: !!title,
      hasFile: !!file,
      titleType: typeof title,
      fileType: file?.constructor?.name,
    });

    logger.info('File info', {
      documentId,
      filename: file.name,
      size: file.size,
      mimeType: mimeType,
      fileType: file.type,
    });

    // Validate file type
    const mediaFile: MediaFile = {
      filename: file.name,
      buffer: fileBuffer,
      mimeType: mimeType,
      size: file.size,
    };

    if (!mediaProcessor.isSupportedFileType(mediaFile.mimeType)) {
      throw new Error(`Unsupported file type: ${mediaFile.mimeType}. Supported types: images (jpg, png, gif, webp), videos (mp4, avi, mov), documents (pdf, doc, docx), audio files, and text files`);
    }

    // Check file size
    if (mediaFile.size > config.storage.maxFileSize) {
      throw new Error(`File size exceeds maximum: ${config.storage.maxFileSize} bytes`);
    }

    logger.info('File upload started', {
      documentId,
      title,
      filename: file.name,
      size: file.size,
      mimeType: file.type,
    });

    // Process media file (pass title and description for better indexing)
    const processedMedia = await mediaProcessor.processMedia(mediaFile, title, description);

    // Save file to storage
    const mediaUrl = await fileStorage.saveFile(
      documentId,
      file.name,
      mediaFile.buffer
    );

    // Process media into chunks
    const processed = documentProcessor.processMedia(
      documentId,
      title,
      processedMedia,
      mediaUrl,
      metadataStr ? JSON.parse(metadataStr) : undefined
    );

    // Index chunks in txtai
    // For images/videos, we'll use the multimodal index
    if (processedMedia.mediaType === 'image' || processedMedia.mediaType === 'video') {
      // Use multimodal indexing for images/videos
      await txtaiService.indexMultimodal(
        processed.chunks.map((chunk) => ({
          id: chunk.id,
          text: chunk.text,
          metadata: chunk.metadata,
          // For images, we can pass the image path/URL to txtai
          // txtai will handle the actual image processing
        }))
      );
    } else {
      // Use regular text indexing
      await txtaiService.index(
        processed.chunks.map((chunk) => ({
          id: chunk.id,
          text: chunk.text,
          metadata: chunk.metadata,
        }))
      );
    }

    // Store document metadata with content hash
    documentStore.upsert({
      document_id: documentId,
      title,
      category: category as string | undefined,
      description: description as string | undefined,
      status: 'indexed',
      chunks_count: processed.total_chunks,
      created_at: processed.created_at,
      updated_at: processed.created_at,
      media_type: processedMedia.mediaType,
      media_url: mediaUrl,
      metadata: metadataStr ? JSON.parse(metadataStr as string) : undefined,
      content_hash: contentHash,
    });

    logger.info('File upload completed', {
      documentId,
      mediaType: processedMedia.mediaType,
      chunksCount: processed.total_chunks,
    });

    return {
      document_id: documentId,
      status: 'indexed',
      chunks_count: processed.total_chunks,
      message: `File indexed successfully with ${processed.total_chunks} chunks`,
    };
  } catch (error) {
    logger.error('File upload failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });

    return {
      document_id: '',
      status: 'failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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

    // Delete media files if they exist
    if (doc.media_url) {
      const filename = doc.media_url.split('/').pop();
      if (filename) {
        await fileStorage.deleteFile(documentId, filename);
      }
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

