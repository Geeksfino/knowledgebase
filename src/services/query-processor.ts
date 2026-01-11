/**
 * Query Processor Service - 智能查询处理
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getProviderFactory } from './llm/index.js';
import { llmRateLimiter, llmRequestQueue } from './rate-limiter.js';
import type { LLMInferRequest } from './llm/types.js';

export interface QueryProcessingResult {
  processedQuery: string;
  method: 'llm' | 'original';
  expandedQueries?: string[];
  queryIntent?: string;
}

export class QueryProcessor {
  private expansionEnabled: boolean;
  private maxExpandedQueries: number;
  private llmEnabled: boolean;

  constructor() {
    this.llmEnabled = config.queryProcessing.enabled;
    this.expansionEnabled = config.queryProcessing.expansion.enabled;
    this.maxExpandedQueries = config.queryProcessing.expansion.maxQueries;
  }

  async processQuery(originalQuery: string): Promise<QueryProcessingResult> {
    if (originalQuery.length < 5) {
      return { processedQuery: originalQuery, method: 'original' };
    }

    if (this.llmEnabled && this.isLLMAvailable()) {
      // 尝试查询扩展
      if (this.expansionEnabled) {
        try {
          const result = await this.expandQueryWithLLM(originalQuery);
          if (result?.expandedQueries?.length > 0) {
            const queries = result.expandedQueries.slice(0, this.maxExpandedQueries);
            if (!queries.includes(originalQuery)) queries.push(originalQuery);
            
            logger.info('Query expanded', {
              original: originalQuery.substring(0, 50),
              expanded: queries.length,
            });
            
            return {
              processedQuery: queries[0],
              expandedQueries: queries,
              queryIntent: result.queryIntent,
              method: 'llm',
            };
          }
        } catch (error) {
          logger.warn('Query expansion failed', {
            error: error instanceof Error ? error.message : 'Unknown',
          });
        }
      }

      // 回退到简单重写
      try {
        const rewritten = await this.rewriteWithLLM(originalQuery);
        if (rewritten && rewritten !== originalQuery) {
          return { processedQuery: rewritten, method: 'llm' };
        }
      } catch (error) {
        logger.warn('Query rewrite failed', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return { processedQuery: originalQuery, method: 'original' };
  }

  private isLLMAvailable(): boolean {
    try {
      return getProviderFactory().getProvider().available;
    } catch {
      return false;
    }
  }

  private async expandQueryWithLLM(query: string): Promise<{
    expandedQueries: string[];
    queryIntent?: string;
  } | null> {
    const systemPrompt = `你是查询优化专家。为知识库检索生成优化的查询。

用户查询: "${query}"

输出 JSON：
{
  "intent": "查询意图",
  "primary_query": "主查询（空格分隔关键词）",
  "expanded_queries": ["扩展查询1", "扩展查询2"]
}

要求：关键词用空格分隔，只返回JSON。`;

    const request: LLMInferRequest = {
      system_prompt: systemPrompt,
      user_prompt: `优化查询: "${query}"`,
      temperature: 0.3,
      max_tokens: 300,
    };

    if (!llmRateLimiter.tryAcquire()) return null;

    const response = await llmRequestQueue.submit(async () => {
      return getProviderFactory().getProvider().infer(request);
    });
    
    const text = response.response_text?.trim();
    if (!text) return null;

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] || text) as {
        intent?: string;
        primary_query?: string;
        expanded_queries?: string[];
      };

      const queries: string[] = [];
      if (parsed.primary_query) queries.push(parsed.primary_query);
      if (parsed.expanded_queries) {
        for (const q of parsed.expanded_queries) {
          if (q && !queries.includes(q.trim())) queries.push(q.trim());
        }
      }

      return queries.length > 0 ? { expandedQueries: queries, queryIntent: parsed.intent } : null;
    } catch {
      return null;
    }
  }

  private async rewriteWithLLM(query: string): Promise<string> {
    const request: LLMInferRequest = {
      system_prompt: '将查询转换为适合向量检索的简洁形式。只返回优化后的查询。',
      user_prompt: `优化: "${query}"`,
      temperature: 0.1,
      max_tokens: 100,
    };

    if (!llmRateLimiter.tryAcquire()) return query;

    const response = await llmRequestQueue.submit(async () => {
      return getProviderFactory().getProvider().infer(request);
    });
    
    const rewritten = response.response_text?.trim();
    return rewritten && rewritten.length >= 2 ? rewritten : query;
  }
}

export const queryProcessor = new QueryProcessor();
