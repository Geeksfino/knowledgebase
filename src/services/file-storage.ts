/**
 * File Storage Service
 *
 * 文件存储服务，处理上传媒体文件的存储和检索。
 * 提供以下功能：
 * - 文件保存（按文档 ID 组织目录）
 * - 文件读取
 * - 文件删除（支持单文件和整个文档目录）
 * - 文件存在性检查
 *
 * @module services/file-storage
 */

import { mkdir, writeFile, readFile, unlink, stat, readdir, rmdir } from 'fs/promises';
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
   * 递归删除目录及其所有内容
   *
   * @param dirPath - 要删除的目录路径
   */
  private async removeDirectoryRecursive(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      // 先删除所有子文件和子目录
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.removeDirectoryRecursive(fullPath);
        } else {
          await unlink(fullPath);
        }
      }

      // 删除空目录
      await rmdir(dirPath);
    } catch (error) {
      // 如果目录不存在，忽略错误
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 删除文档的所有相关文件
   *
   * @param documentId - 文档 ID
   */
  async deleteDocumentFiles(documentId: string): Promise<void> {
    try {
      const docDir = join(this.mediaPath, documentId);
      await this.removeDirectoryRecursive(docDir);
      logger.info('Document files deleted', {
        documentId,
        path: docDir,
      });
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

