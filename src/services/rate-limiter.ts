/**
 * Rate Limiter & Request Queue Service
 * 
 * 提供请求限流和队列管理功能：
 * - 令牌桶限流
 * - LLM 请求队列
 * - 并发控制
 * - 环境变量配置
 *
 * @module services/rate-limiter
 */

import { logger } from '../utils/logger.js';

/**
 * 解析整数环境变量
 */
function parseIntEnv(value: string | undefined, defaultValue: number): number {
  const parsed = parseInt(value || '', 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 令牌桶限流器配置
 */
export interface RateLimiterConfig {
  /** 最大令牌数（桶容量） */
  maxTokens: number;
  /** 每秒恢复的令牌数 */
  refillRate: number;
  /** 限流器名称 */
  name: string;
}

/**
 * 令牌桶限流器
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;
  private readonly name: string;
  private lastRefill: number;
  
  // 统计信息
  private totalRequests = 0;
  private allowedRequests = 0;
  private rejectedRequests = 0;

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.maxTokens;
    this.refillRate = config.refillRate;
    this.name = config.name;
    this.tokens = config.maxTokens;
    this.lastRefill = Date.now();

    // 定期报告统计
    setInterval(() => this.reportStats(), 60000);
  }

  /**
   * 尝试获取令牌
   * @returns true 如果获取成功，false 如果被限流
   */
  tryAcquire(): boolean {
    this.refill();
    this.totalRequests++;

    if (this.tokens >= 1) {
      this.tokens--;
      this.allowedRequests++;
      return true;
    }

    this.rejectedRequests++;
    logger.warn(`[${this.name}] Rate limited`, {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
    });
    return false;
  }

  /**
   * 等待获取令牌（阻塞式）
   * @param timeoutMs 超时时间（毫秒）
   * @returns true 如果获取成功，false 如果超时
   */
  async acquire(timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 100; // 每 100ms 检查一次

    while (Date.now() - startTime < timeoutMs) {
      if (this.tryAcquire()) {
        return true;
      }
      await this.sleep(checkInterval);
    }

    logger.warn(`[${this.name}] Acquire timeout`, { timeoutMs });
    return false;
  }

  /**
   * 释放令牌（用于提前释放）
   */
  release(): void {
    this.tokens = Math.min(this.tokens + 1, this.maxTokens);
  }

  /**
   * 获取当前可用令牌数
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      name: this.name,
      availableTokens: this.tokens,
      maxTokens: this.maxTokens,
      totalRequests: this.totalRequests,
      allowedRequests: this.allowedRequests,
      rejectedRequests: this.rejectedRequests,
      rejectRate: this.totalRequests > 0 
        ? this.rejectedRequests / this.totalRequests 
        : 0,
    };
  }

  /**
   * 补充令牌
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // 转换为秒
    const tokensToAdd = elapsed * this.refillRate;

    if (tokensToAdd >= 1) {
      this.tokens = Math.min(this.tokens + tokensToAdd, this.maxTokens);
      this.lastRefill = now;
    }
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 报告统计信息
   */
  private reportStats(): void {
    if (this.totalRequests > 0) {
      const stats = this.getStats();
      logger.debug(`[${this.name}] Rate limiter stats`, stats);
    }
  }
}

/**
 * 请求队列配置
 */
export interface RequestQueueConfig {
  /** 最大并发数 */
  concurrency: number;
  /** 队列最大长度 */
  maxQueueSize: number;
  /** 队列名称 */
  name: string;
}

/**
 * 队列任务
 */
interface QueueTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
}

/**
 * 请求队列（并发控制）
 */
export class RequestQueue {
  private readonly concurrency: number;
  private readonly maxQueueSize: number;
  private readonly name: string;
  private running = 0;
  private queue: QueueTask<unknown>[] = [];
  
  // 统计信息
  private totalEnqueued = 0;
  private totalProcessed = 0;
  private totalRejected = 0;
  private totalTimeMs = 0;

  constructor(config: RequestQueueConfig) {
    this.concurrency = config.concurrency;
    this.maxQueueSize = config.maxQueueSize;
    this.name = config.name;

    // 定期报告统计
    setInterval(() => this.reportStats(), 60000);
  }

  /**
   * 提交任务到队列
   */
  async submit<T>(fn: () => Promise<T>): Promise<T> {
    // 检查队列是否已满
    if (this.queue.length >= this.maxQueueSize) {
      this.totalRejected++;
      throw new Error(`[${this.name}] Queue is full (max: ${this.maxQueueSize})`);
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = {
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
        enqueuedAt: Date.now(),
      };

      this.queue.push(task as QueueTask<unknown>);
      this.totalEnqueued++;
      this.process();
    });
  }

  /**
   * 处理队列
   */
  private async process(): Promise<void> {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.running++;
    const startTime = Date.now();

    try {
      const result = await task.fn();
      task.resolve(result);
      this.totalProcessed++;
      this.totalTimeMs += Date.now() - startTime;
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.running--;
      // 继续处理下一个任务
      this.process();
    }
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      name: this.name,
      queueLength: this.queue.length,
      maxQueueSize: this.maxQueueSize,
      running: this.running,
      concurrency: this.concurrency,
    };
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      name: this.name,
      totalEnqueued: this.totalEnqueued,
      totalProcessed: this.totalProcessed,
      totalRejected: this.totalRejected,
      avgProcessTimeMs: this.totalProcessed > 0 
        ? this.totalTimeMs / this.totalProcessed 
        : 0,
      queueLength: this.queue.length,
      running: this.running,
    };
  }

  /**
   * 报告统计信息
   */
  private reportStats(): void {
    if (this.totalEnqueued > 0) {
      const stats = this.getStats();
      logger.debug(`[${this.name}] Request queue stats`, stats);
    }
  }

  /**
   * 清空队列
   */
  clear(): void {
    const rejected = this.queue.length;
    for (const task of this.queue) {
      task.reject(new Error('Queue cleared'));
    }
    this.queue = [];
    this.totalRejected += rejected;
    logger.info(`[${this.name}] Queue cleared`, { rejected });
  }
}

// ============================================
// 全局限流器和队列实例（从环境变量读取配置）
// ============================================

// LLM 限流器配置
const llmRateLimiterConfig = {
  maxTokens: parseIntEnv(process.env.LLM_RATE_LIMIT_MAX_TOKENS, 10),
  refillRate: parseIntEnv(process.env.LLM_RATE_LIMIT_REFILL_RATE, 2),
  name: 'LLM',
};

logger.info('🚦 LLM rate limiter initialized', {
  maxTokens: llmRateLimiterConfig.maxTokens,
  refillRate: llmRateLimiterConfig.refillRate,
});

/**
 * LLM 请求限流器
 * - 默认最大 10 个并发令牌
 * - 默认每秒恢复 2 个令牌
 */
export const llmRateLimiter = new TokenBucketRateLimiter(llmRateLimiterConfig);

// LLM 队列配置
const llmQueueConfig = {
  concurrency: parseIntEnv(process.env.LLM_QUEUE_CONCURRENCY, 5),
  maxQueueSize: parseIntEnv(process.env.LLM_QUEUE_MAX_SIZE, 50),
  name: 'LLMQueue',
};

logger.info('📋 LLM request queue initialized', {
  concurrency: llmQueueConfig.concurrency,
  maxQueueSize: llmQueueConfig.maxQueueSize,
});

/**
 * LLM 请求队列
 * - 默认最大 5 个并发请求
 * - 默认最多排队 50 个请求
 */
export const llmRequestQueue = new RequestQueue(llmQueueConfig);

// Chat 限流器配置
const chatRateLimiterConfig = {
  maxTokens: parseIntEnv(process.env.CHAT_RATE_LIMIT_MAX_TOKENS, 20),
  refillRate: parseIntEnv(process.env.CHAT_RATE_LIMIT_REFILL_RATE, 5),
  name: 'Chat',
};

logger.info('🚦 Chat rate limiter initialized', {
  maxTokens: chatRateLimiterConfig.maxTokens,
  refillRate: chatRateLimiterConfig.refillRate,
});

/**
 * Chat 请求限流器
 * - 默认最大 20 个并发令牌
 * - 默认每秒恢复 5 个令牌
 */
export const chatRateLimiter = new TokenBucketRateLimiter(chatRateLimiterConfig);

/**
 * 获取所有限流器和队列的统计
 */
export function getAllRateLimiterStats() {
  return {
    llmRateLimiter: llmRateLimiter.getStats(),
    llmRequestQueue: llmRequestQueue.getStats(),
    chatRateLimiter: chatRateLimiter.getStats(),
  };
}

/**
 * 使用限流器包装异步函数
 */
export async function withRateLimit<T>(
  limiter: TokenBucketRateLimiter,
  fn: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  const acquired = await limiter.acquire(timeoutMs);
  if (!acquired) {
    throw new Error('Rate limit timeout');
  }

  try {
    return await fn();
  } finally {
    // 令牌会自动恢复，不需要释放
  }
}

/**
 * 使用队列包装异步函数
 */
export async function withQueue<T>(
  queue: RequestQueue,
  fn: () => Promise<T>
): Promise<T> {
  return queue.submit(fn);
}
