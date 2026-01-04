/**
 * MIME Types Utility
 *
 * Centralized MIME type mappings for consistent file type handling across the application.
 * This avoids duplicate MIME type definitions in multiple files.
 */

/**
 * Standard MIME type mappings by file extension
 */
export const MIME_TYPES: Readonly<Record<string, string>> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',

  // Videos
  mp4: 'video/mp4',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',

  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  // Text
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
} as const;

/**
 * Get MIME type from filename
 *
 * @param filename - The filename to get MIME type for
 * @returns The MIME type string, defaults to 'application/octet-stream' if unknown
 *
 * @example
 * ```ts
 * getMimeType('document.pdf')  // => 'application/pdf'
 * getMimeType('photo.jpg')     // => 'image/jpeg'
 * getMimeType('unknown.xyz')   // => 'application/octet-stream'
 * ```
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return MIME_TYPES[ext || ''] || 'application/octet-stream';
}

/**
 * Get file extension from MIME type
 *
 * @param mimeType - The MIME type to get extension for
 * @returns The file extension without dot, or empty string if not found
 *
 * @example
 * ```ts
 * getExtensionFromMime('image/jpeg')  // => 'jpg'
 * getExtensionFromMime('application/pdf')  // => 'pdf'
 * ```
 */
export function getExtensionFromMime(mimeType: string): string {
  for (const [ext, mime] of Object.entries(MIME_TYPES)) {
    if (mime === mimeType) {
      return ext;
    }
  }
  return '';
}

/**
 * Check if the MIME type represents an image
 */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Check if the MIME type represents a video
 */
export function isVideoMimeType(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

/**
 * Check if the MIME type represents audio
 */
export function isAudioMimeType(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

/**
 * Check if the MIME type represents a document (PDF, Word, etc.)
 */
export function isDocumentMimeType(mimeType: string): boolean {
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  return documentTypes.includes(mimeType);
}

