/**
 * Document Processor Service
 * 
 * Handles document parsing, chunking, and preparation for indexing.
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { countTokens } from '../utils/token-counter.js';

export interface DocumentChunk {
  id: string;
  text: string;
  metadata: {
    document_id: string;
    document_title: string;
    chunk_index: number;
    start_char?: number;
    end_char?: number;
    [key: string]: unknown;
  };
}

export interface ProcessedDocument {
  document_id: string;
  title: string;
  chunks: DocumentChunk[];
  total_chunks: number;
  created_at: string;
}

export class DocumentProcessor {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor() {
    this.chunkSize = config.chunking.size;
    this.chunkOverlap = config.chunking.overlap;
  }

  /**
   * Process document text and create chunks
   */
  processDocument(
    documentId: string,
    title: string,
    content: string,
    metadata?: Record<string, unknown>
  ): ProcessedDocument {
    const chunks = this.chunkText(content, documentId, title, metadata);

    logger.info('Document processed', {
      documentId,
      title,
      chunksCount: chunks.length,
      contentLength: content.length,
    });

    return {
      document_id: documentId,
      title,
      chunks,
      total_chunks: chunks.length,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Split text into chunks with overlap
   */
  private chunkText(
    text: string,
    documentId: string,
    documentTitle: string,
    metadata?: Record<string, unknown>
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    
    // Clean and normalize text
    const cleanedText = this.cleanText(text);
    
    // Split by paragraphs first
    const paragraphs = cleanedText.split(/\n\n+/);
    
    let currentChunk = '';
    let chunkIndex = 0;
    let startChar = 0;

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) continue;

      // Check if adding this paragraph exceeds chunk size
      const potentialChunk = currentChunk
        ? `${currentChunk}\n\n${trimmedParagraph}`
        : trimmedParagraph;

      if (potentialChunk.length > this.chunkSize && currentChunk) {
        // Save current chunk
        chunks.push(this.createChunk(
          documentId,
          documentTitle,
          currentChunk,
          chunkIndex,
          startChar,
          startChar + currentChunk.length,
          metadata
        ));
        
        chunkIndex++;
        
        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk);
        startChar = startChar + currentChunk.length - overlapText.length;
        currentChunk = overlapText ? `${overlapText}\n\n${trimmedParagraph}` : trimmedParagraph;
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Add remaining chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        documentId,
        documentTitle,
        currentChunk,
        chunkIndex,
        startChar,
        startChar + currentChunk.length,
        metadata
      ));
    }

    // If no chunks created (very short text), create one chunk
    if (chunks.length === 0 && cleanedText.trim()) {
      chunks.push(this.createChunk(
        documentId,
        documentTitle,
        cleanedText.trim(),
        0,
        0,
        cleanedText.length,
        metadata
      ));
    }

    return chunks;
  }

  /**
   * Create a document chunk
   */
  private createChunk(
    documentId: string,
    documentTitle: string,
    text: string,
    chunkIndex: number,
    startChar: number,
    endChar: number,
    metadata?: Record<string, unknown>
  ): DocumentChunk {
    return {
      id: `${documentId}_chunk_${chunkIndex}`,
      text: text.trim(),
      metadata: {
        document_id: documentId,
        document_title: documentTitle,
        chunk_index: chunkIndex,
        start_char: startChar,
        end_char: endChar,
        tokens: countTokens(text),
        ...metadata,
      },
    };
  }

  /**
   * Get overlap text from the end of a chunk
   */
  private getOverlapText(text: string): string {
    if (text.length <= this.chunkOverlap) {
      return text;
    }

    // Try to find a sentence boundary within the overlap window
    const overlapWindow = text.slice(-this.chunkOverlap * 2);
    const sentenceMatch = overlapWindow.match(/[.!?]\s+[A-Z\u4e00-\u9fff]/);
    
    if (sentenceMatch && sentenceMatch.index !== undefined) {
      return overlapWindow.slice(sentenceMatch.index + 2);
    }

    // Fall back to character-based overlap
    return text.slice(-this.chunkOverlap);
  }

  /**
   * Clean and normalize text
   */
  private cleanText(text: string): string {
    return text
      // Normalize whitespace
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive blank lines
      .replace(/\n{4,}/g, '\n\n\n')
      // Remove leading/trailing whitespace from lines
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim();
  }
}

// Singleton instance
export const documentProcessor = new DocumentProcessor();

