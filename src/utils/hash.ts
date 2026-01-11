/**
 * Hash Utilities
 * 
 * Content hashing for document deduplication.
 */

import { createHash } from 'crypto';

/**
 * Calculate SHA256 hash of content
 * Used for document deduplication
 */
export function calculateContentHash(content: string): string {
  return createHash('sha256')
    .update(content, 'utf8')
    .digest('hex');
}

/**
 * Calculate hash for file buffer
 */
export function calculateFileHash(buffer: Buffer): string {
  return createHash('sha256')
    .update(buffer)
    .digest('hex');
}
