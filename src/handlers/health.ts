/**
 * Health Handler
 */

import { config } from '../config.js';
import { txtaiService } from '../services/txtai-service.js';
import { documentStore } from '../services/document-store.js';
import { getAllRateLimiterStats } from '../services/rate-limiter.js';
import { getProviderFactory } from '../services/llm/index.js';
import type { components } from '@knowledgebase/contracts-ts/generated/knowledge-provider';

export type HealthResponse = components['schemas']['HealthResponse'] & {
  documents?: { count: number };
  rateLimiter?: {
    llm: { availableTokens: number; rejectRate: number };
    chat: { availableTokens: number; rejectRate: number };
  };
};

export async function handleHealthCheck(): Promise<HealthResponse> {
  const txtaiHealthy = await txtaiService.healthCheck();
  const docCount = documentStore.count();

  let llmAvailable = false;
  try {
    llmAvailable = getProviderFactory().getProvider().available;
  } catch {
    llmAvailable = false;
  }

  const rateLimiterStats = getAllRateLimiterStats();
  const status = txtaiHealthy && llmAvailable ? 'healthy' : 'degraded';

  return {
    status,
    version: config.provider.version,
    txtai: { available: txtaiHealthy, url: config.txtai.url },
    llm: { available: llmAvailable, provider: config.llm.provider },
    documents: { count: docCount },
    rateLimiter: {
      llm: {
        availableTokens: rateLimiterStats.llmRateLimiter.availableTokens,
        rejectRate: Math.round(rateLimiterStats.llmRateLimiter.rejectRate * 100) / 100,
      },
      chat: {
        availableTokens: rateLimiterStats.chatRateLimiter.availableTokens,
        rejectRate: Math.round(rateLimiterStats.chatRateLimiter.rejectRate * 100) / 100,
      },
    },
  };
}

