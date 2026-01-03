/**
 * File Storage Service
 * 
 * Handles storage and retrieval of uploaded media files.
 */

import { mkdir, writeFile, readFile, unlink, stat } from 'fs/promises';
import { join } from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export class FileStorage {
  private storagePath: string;
  private mediaPath: string;
  private baseUrl: string;

  constructor() {
    this.storagePath = config.storage.path;
    this.mediaPath = config.storage.mediaPath;
    this.baseUrl = config.storage.baseUrl;
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    try {
      await mkdir(this.storagePath, { recursive: true });
      await mkdir(this.mediaPath, { recursive: true });
      logger.info('Storage directories initialized', {
        storagePath: this.storagePath,
        mediaPath: this.mediaPath,
      });
    } catch (error) {
      logger.error('Failed to initialize storage', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Save file to storage
   */
  async saveFile(
    documentId: string,
    filename: string,
    buffer: Buffer
  ): Promise<string> {
    try {
      // Create document-specific directory
      const docDir = join(this.mediaPath, documentId);
      await mkdir(docDir, { recursive: true });

      // Save file
      const filePath = join(docDir, filename);
      await writeFile(filePath, buffer);

      // Generate URL
      const url = `${this.baseUrl}/${documentId}/${filename}`;

      logger.info('File saved', {
        documentId,
        filename,
        path: filePath,
        size: buffer.length,
      });

      return url;
    } catch (error) {
      logger.error('Failed to save file', {
        error: error instanceof Error ? error.message : 'Unknown',
        documentId,
        filename,
      });
      throw error;
    }
  }

  /**
   * Read file from storage
   */
  async readFile(documentId: string, filename: string): Promise<Buffer> {
    try {
      const filePath = join(this.mediaPath, documentId, filename);
      return await readFile(filePath);
    } catch (error) {
      logger.error('Failed to read file', {
        error: error instanceof Error ? error.message : 'Unknown',
        documentId,
        filename,
      });
      throw error;
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(documentId: string, filename: string): Promise<void> {
    try {
      const filePath = join(this.mediaPath, documentId, filename);
      await unlink(filePath);
      logger.info('File deleted', { documentId: documentId, filename });
    } catch (error) {
      logger.warn('Failed to delete file (may not exist)', {
        error: error instanceof Error ? error.message : 'Unknown',
        documentId,
        filename,
      });
    }
  }

  /**
   * Delete all files for a document
   */
  async deleteDocumentFiles(documentId: string): Promise<void> {
    try {
      const docDir = join(this.mediaPath, documentId);
      // In a production system, you'd want to recursively delete the directory
      // For now, we'll just log it
      logger.info('Document files directory marked for deletion', {
        documentId,
        path: docDir,
      });
      // TODO: Implement recursive directory deletion
    } catch (error) {
      logger.warn('Failed to delete document files', {
        error: error instanceof Error ? error.message : 'Unknown',
        documentId,
      });
    }
  }

  /**
   * Get file URL
   */
  getFileUrl(documentId: string, filename: string): string {
    return `${this.baseUrl}/${documentId}/${filename}`;
  }

  /**
   * Check if file exists
   */
  async fileExists(documentId: string, filename: string): Promise<boolean> {
    try {
      const filePath = join(this.mediaPath, documentId, filename);
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const fileStorage = new FileStorage();

