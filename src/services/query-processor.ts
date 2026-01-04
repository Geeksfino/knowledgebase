/**
 * Query Processor Service
 * 
 * Intelligent query processing for RAG systems:
 * - LLM-based query rewriting (extracts core concepts)
 * - Rule-based fallback (when LLM unavailable)
 * - Query expansion and optimization
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface QueryProcessingResult {
  processedQuery: string;
  method: 'llm' | 'rule-based' | 'original';
  keywords?: string[];
  entities?: string[];
  // Advanced: query expansion
  expandedQueries?: string[];
  queryIntent?: string;
}

export class QueryProcessor {
  private llmUrl: string;
  private llmEnabled: boolean;
  private llmTimeout: number;
  private expansionEnabled: boolean;
  private maxExpandedQueries: number;

  constructor() {
    this.llmUrl = config.queryProcessing.llm.url;
    this.llmEnabled = config.queryProcessing.llm.enabled;
    this.llmTimeout = config.queryProcessing.llm.timeout;
    this.expansionEnabled = config.queryProcessing.llm.expansion.enabled;
    this.maxExpandedQueries = config.queryProcessing.llm.expansion.maxQueries;
  }

  /**
   * Process query using intelligent methods with LLM enhancement
   * Priority: LLM expansion > LLM rewriting > Rule-based > Original
   * 
   * Advanced features:
   * - Query expansion: Generate multiple query variants
   * - Query understanding: Understand user intent
   * - Multi-query fusion: Combine results from multiple queries
   */
  async processQuery(originalQuery: string): Promise<QueryProcessingResult> {
    // If query is very short, return as-is
    if (originalQuery.length < 5) {
      return {
        processedQuery: originalQuery,
        method: 'original',
      };
    }

    // Try LLM-based intelligent processing first (if enabled)
    if (this.llmEnabled) {
      // Advanced: Query expansion and understanding (if enabled)
      if (this.expansionEnabled) {
        try {
          const expansionResult = await this.expandQueryWithLLM(originalQuery);
          if (expansionResult && expansionResult.expandedQueries && expansionResult.expandedQueries.length > 0) {
            // Limit number of expanded queries
            const limitedQueries = expansionResult.expandedQueries.slice(0, this.maxExpandedQueries);
            
            // Include original query as fallback (LLM should have already tokenized it properly)
            // Only add if not already in the list
            if (!limitedQueries.includes(originalQuery)) {
              limitedQueries.push(originalQuery);
            }
            
            logger.info('Query expanded with LLM', {
              original: originalQuery.substring(0, 50),
              expanded: limitedQueries.length,
              intent: expansionResult.queryIntent,
            });
            return {
              processedQuery: limitedQueries[0], // Primary query
              expandedQueries: limitedQueries,
              queryIntent: expansionResult.queryIntent,
              method: 'llm',
            };
          }
        } catch (error) {
          logger.warn('LLM query expansion failed, trying simple rewrite', {
            error: error instanceof Error ? error.message : 'Unknown',
            query: originalQuery.substring(0, 50),
          });
          
          // Fallback to simple LLM rewriting
          try {
            const llmResult = await this.rewriteWithLLM(originalQuery);
            if (llmResult && llmResult.trim() && llmResult !== originalQuery) {
              logger.info('Query rewritten with LLM', {
                original: originalQuery.substring(0, 50),
                rewritten: llmResult.substring(0, 50),
              });
              return {
                processedQuery: llmResult,
                method: 'llm',
              };
            }
          } catch (rewriteError) {
            logger.warn('LLM query rewriting also failed, falling back to rule-based', {
              error: rewriteError instanceof Error ? rewriteError.message : 'Unknown',
            });
          }
        }
      }
    }

    // Fallback to rule-based processing
    const ruleResult = this.ruleBasedProcessing(originalQuery);
    if (ruleResult.processedQuery !== originalQuery) {
      logger.info('Query processed with rules', {
        original: originalQuery.substring(0, 50),
        processed: ruleResult.processedQuery.substring(0, 50),
      });
      return {
        ...ruleResult,
        method: 'rule-based',
      };
    }

    // Return original if no processing needed
    return {
      processedQuery: originalQuery,
      method: 'original',
    };
  }

  /**
   * Advanced: Expand query using LLM to generate multiple query variants
   * This improves recall by searching with multiple related queries
   * 
   * IMPORTANT: LLM is responsible for ALL tokenization - queries must be space-separated
   */
  private async expandQueryWithLLM(query: string): Promise<{
    expandedQueries: string[];
    queryIntent?: string;
  } | null> {
    const systemPrompt = `你是一个查询优化和扩展专家。你的任务是为知识库检索生成优化的查询。

用户查询: "${query}"

请完成以下任务：
1. **理解查询意图**：判断用户想要查找什么类型的信息
2. **生成主查询**：提取核心概念，去除描述性词语，生成最适合向量检索的查询
3. **生成扩展查询**：生成2-3个相关的查询变体，包括：
   - 同义词替换
   - 相关概念
   - 不同表达方式

输出格式（JSON）：
{
  "intent": "查询意图描述（如：查找产品信息、技术文档、业务流程等）",
  "primary_query": "主查询（优化后的核心查询）",
  "expanded_queries": ["扩展查询1", "扩展查询2", "扩展查询3"]
}

**重要要求**：
- 所有查询必须使用**空格分隔**关键词（例如："智桂通 报价" 而不是 "智桂通报价"）
- 中文词语之间必须用空格分开，这对检索系统至关重要
- 主查询必须简洁，只包含核心概念
- 扩展查询应该与主查询相关但略有不同
- 只返回JSON，不要其他解释

示例：
- 输入: "智桂通报价" → primary_query: "智桂通 报价"
- 输入: "凡泰极客公司介绍" → primary_query: "凡泰极客 公司 介绍"
- 输入: "FinClip小程序平台" → primary_query: "FinClip 小程序 平台"`;

    try {
      const response = await fetch(`${this.llmUrl}/llm/infer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          user_prompt: `请为这个查询生成优化和扩展的查询列表: "${query}"`,
          temperature: 0.3, // Low temperature for more deterministic output
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(this.llmTimeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        response_text: string;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      const responseText = data.response_text?.trim();
      if (!responseText) {
        return null;
      }

      // Parse JSON response
      try {
        // Extract JSON from response (might be wrapped in markdown code blocks)
        let jsonText = responseText;
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                         responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                         responseText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          jsonText = jsonMatch[1] || jsonMatch[0];
        }

        const parsed = JSON.parse(jsonText) as {
          intent?: string;
          primary_query?: string;
          expanded_queries?: string[];
        };

        const expandedQueries: string[] = [];
        
        // Add primary query first
        if (parsed.primary_query) {
          expandedQueries.push(parsed.primary_query);
        }
        
        // Add expanded queries
        if (parsed.expanded_queries && Array.isArray(parsed.expanded_queries)) {
          for (const q of parsed.expanded_queries) {
            if (q && typeof q === 'string' && q.trim() && !expandedQueries.includes(q.trim())) {
              expandedQueries.push(q.trim());
            }
          }
        }

        if (expandedQueries.length === 0) {
          return null;
        }

        return {
          expandedQueries,
          queryIntent: parsed.intent,
        };
      } catch (parseError) {
        logger.warn('Failed to parse LLM expansion response as JSON, trying to extract queries', {
          error: parseError instanceof Error ? parseError.message : 'Unknown',
          response: responseText.substring(0, 200),
        });
        
        // Fallback: try to extract queries from text
        const lines = responseText.split('\n').filter(line => line.trim().length > 5);
        if (lines.length > 0) {
          return {
            expandedQueries: [lines[0].trim()],
            queryIntent: 'extracted from text',
          };
        }
        
        return null;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`LLM request timeout after ${this.llmTimeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Rewrite query using LLM (via llm-adapter)
   * Follows contract-first pattern: uses LLMInferRequest/Response types
   */
  private async rewriteWithLLM(query: string): Promise<string> {
    const systemPrompt = `你是一个查询优化专家。请将用户的自然语言查询转换为最适合向量检索的查询。

要求：
1. 提取核心概念和实体
2. 去除描述性词语（如"介绍一下"、"请解释"、"什么是"等）
3. 保留关键信息
4. 如果查询已经很简洁，直接返回
5. 只返回优化后的查询，不要解释，不要添加任何前缀或后缀

示例：
- "介绍一下投资建议合规性回溯" → "投资建议合规性回溯"
- "请解释什么是双时序知识图谱" → "双时序知识图谱"
- "如何实现合规审计" → "合规审计实现"`;

    const userPrompt = `优化这个查询用于知识库检索: "${query}"`;

    try {
      const response = await fetch(`${this.llmUrl}/llm/infer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          temperature: 0.1, // Low temperature for deterministic output
          max_tokens: 100,
        }),
        signal: AbortSignal.timeout(this.llmTimeout),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        response_text: string;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      const rewritten = data.response_text?.trim();
      
      // Validate: rewritten query should not be empty and should be different from original
      if (!rewritten || rewritten.length < 2) {
        throw new Error('LLM returned empty or too short query');
      }

      return rewritten;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`LLM request timeout after ${this.llmTimeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Fallback when LLM unavailable - just return original query
   * 
   * ALL tokenization is handled by LLM, no local processing
   */
  private ruleBasedProcessing(query: string): QueryProcessingResult {
    // No local processing - LLM handles everything
    // When LLM is unavailable, just use original query
    return {
      processedQuery: query.trim(),
      method: 'original',
    };
  }

  /**
   * Check if query might benefit from LLM processing
   */
  hasDescriptiveWords(query: string): boolean {
    // Always return true to prefer LLM processing when available
    return query.length > 5;
  }
}

// Singleton instance
export const queryProcessor = new QueryProcessor();

