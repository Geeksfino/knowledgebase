/**
 * Health Handler
 * 
 * Handles health check requests.
 */

import { config } from '../config.js';
import { txtaiService } from '../services/txtai-service.js';
import { documentStore } from '../services/document-store.js';
// Import types from generated contract
// Following contract-first pattern: contracts are sacred, implementations are disposable
import type { components } from '@knowledgebase/contracts-ts/generated/knowledge-provider';

// Extract type from contract
export type HealthResponse = components['schemas']['HealthResponse'] & {
  documents?: {
    count: number;
  };
};

/**
 * Handle health check
 */
export async function handleHealthCheck(): Promise<HealthResponse> {
  const txtaiHealthy = await txtaiService.healthCheck();
  const docCount = documentStore.count();

  const status = txtaiHealthy ? 'healthy' : 'degraded';

  return {
    status,
    version: config.provider.version,
    txtai: {
      available: txtaiHealthy,
      url: config.txtai.url,
    },
    documents: {
      count: docCount,
    },
  };
}

