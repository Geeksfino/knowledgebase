/**
 * Media Processor Service
 * 
 * Handles image and video processing for multimodal search.
 * Supports OCR, feature extraction, and frame extraction.
 */

import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export type MediaType = 'image' | 'video' | 'audio' | 'text';

export interface MediaFile {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export interface ProcessedImage {
  text: string; // OCR text or description
  features?: number[]; // Image embeddings (if extracted)
  width?: number;
  height?: number;
  format?: string;
}

export interface ProcessedVideo {
  frames: ProcessedImage[];
  duration?: number;
  frameCount: number;
  text?: string; // Extracted subtitles or transcript
}

export interface ProcessedMedia {
  mediaType: MediaType;
  text: string;
  metadata: {
    filename: string;
    mimeType: string;
    size: number;
    [key: string]: unknown;
  };
  image?: ProcessedImage;
  video?: ProcessedVideo;
}

export class MediaProcessor {
  private supportedImageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];
  
  private supportedVideoTypes = [
    'video/mp4',
    'video/avi',
    'video/quicktime',
    'video/x-msvideo',
  ];

  /**
   * Detect media type from file
   */
  detectMediaType(file: MediaFile): MediaType {
    if (this.supportedImageTypes.includes(file.mimeType)) {
      return 'image';
    }
    if (this.supportedVideoTypes.includes(file.mimeType)) {
      return 'video';
    }
    if (file.mimeType.startsWith('audio/')) {
      return 'audio';
    }
    return 'text';
  }

  /**
   * Process image file
   * For now, we'll use txtai's image processing via API
   * In production, you might want to use local OCR libraries like Tesseract
   */
  async processImage(file: MediaFile, title?: string, description?: string): Promise<ProcessedImage> {
    logger.info('Processing image', {
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
      title,
    });

    // For now, we'll store the image and let txtai handle it
    // txtai can process images directly via its API
    // The actual OCR and feature extraction will be done by txtai when indexing
    
    // Generate text description for indexing
    // Include title and description to make images searchable by text
    // In production, you could use:
    // - OCR: Tesseract.js, PaddleOCR
    // - Image description: CLIP, BLIP models
    const parts: string[] = [];
    if (title) parts.push(title);
    if (description) parts.push(description);
    parts.push(`图片: ${file.filename}`);
    
    const text = parts.join('。');

    return {
      text,
      format: file.mimeType.split('/')[1],
    };
  }

  /**
   * Process video file
   * Extracts frames and processes them
   */
  async processVideo(file: MediaFile): Promise<ProcessedVideo> {
    logger.info('Processing video', {
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
    });

    // For video processing, we need to:
    // 1. Extract frames (using ffmpeg or similar)
    // 2. Process each frame as an image
    // 3. Extract audio/subtitles if available
    
    // For now, we'll let txtai handle video processing via its workflow
    // In production, you might want to use:
    // - ffmpeg for frame extraction
    // - Whisper for audio transcription
    
    const frames: ProcessedImage[] = [];
    
    // Placeholder: In production, extract actual frames
    // For now, we'll create a placeholder frame
    frames.push({
      text: `Video frame from ${file.filename}`,
    });

    return {
      frames,
      frameCount: frames.length,
      text: `Video: ${file.filename}`,
    };
  }

  /**
   * Process media file (image, video, or audio)
   */
  async processMedia(
    file: MediaFile,
    title?: string,
    description?: string
  ): Promise<ProcessedMedia> {
    const mediaType = this.detectMediaType(file);

    logger.info('Processing media file', {
      filename: file.filename,
      mediaType,
      size: file.size,
      title,
    });

    let text = '';
    let image: ProcessedImage | undefined;
    let video: ProcessedVideo | undefined;

    switch (mediaType) {
      case 'image':
        image = await this.processImage(file, title, description);
        text = image.text;
        break;
      
      case 'video':
        video = await this.processVideo(file);
        text = video.text || '';
        // Include title and description for video too
        if (title || description) {
          const parts: string[] = [];
          if (title) parts.push(title);
          if (description) parts.push(description);
          if (text) parts.push(text);
          text = parts.join('。');
        }
        break;
      
      case 'audio':
        // Audio processing would go here
        const audioParts: string[] = [];
        if (title) audioParts.push(title);
        if (description) audioParts.push(description);
        audioParts.push(`音频: ${file.filename}`);
        text = audioParts.join('。');
        break;
      
      default:
        const defaultParts: string[] = [];
        if (title) defaultParts.push(title);
        if (description) defaultParts.push(description);
        defaultParts.push(`文件: ${file.filename}`);
        text = defaultParts.join('。');
    }

    return {
      mediaType,
      text,
      metadata: {
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
      },
      image,
      video,
    };
  }

  /**
   * Validate file type
   */
  isSupportedFileType(mimeType: string): boolean {
    return (
      this.supportedImageTypes.includes(mimeType) ||
      this.supportedVideoTypes.includes(mimeType) ||
      mimeType.startsWith('audio/') ||
      mimeType.startsWith('text/')
    );
  }

  /**
   * Get file extension from filename
   */
  getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }
}

// Singleton instance
export const mediaProcessor = new MediaProcessor();

