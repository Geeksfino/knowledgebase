/**
 * Base LLM Provider Interface and Abstract Class
 * 
 * 基础 LLM Provider 接口和抽象类
 * 简化自 chatkit-middleware 的实现
 */
import type {
  ChatMessage,
  LLMInferRequest,
  LLMInferResponse,
  StreamChunk,
  TokenUsage,
  ProviderType,
  ProviderConfig,
} from './types.js';

/**
 * LLM Provider 接口
 */
export interface LLMProvider {
  readonly id: ProviderType;
  readonly name: string;
  readonly available: boolean;
  infer(request: LLMInferRequest): Promise<LLMInferResponse>;
  inferStream(request: LLMInferRequest): AsyncGenerator<StreamChunk>;
  healthCheck(): Promise<boolean>;
}

/**
 * OpenAI Chat Completion 响应类型
 */
export interface OpenAIChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string;
  }>;
  usage: TokenUsage;
}

/**
 * OpenAI Chat Completion Chunk 类型 (流式)
 */
export interface OpenAIChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
    };
    finish_reason: string | null;
  }>;
  usage?: TokenUsage;
}

/**
 * OpenAI 兼容 Provider 抽象基类
 * 
 * 支持所有 OpenAI 兼容的 API (OpenAI, DeepSeek, LiteLLM 等)
 */
export abstract class OpenAICompatibleProvider implements LLMProvider {
  abstract readonly id: ProviderType;
  abstract readonly name: string;

  protected readonly config: ProviderConfig;
  protected readonly maxRetries: number;
  protected readonly retryDelayMs: number;
  protected readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.maxRetries = config.maxRetries ?? 2;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.timeoutMs = config.timeoutMs ?? 60000;
  }

  get available(): boolean {
    return Boolean(this.config.apiKey && this.config.endpoint);
  }

  /**
   * 构建 chat messages
   */
  protected buildMessages(request: LLMInferRequest): ChatMessage[] {
    return [
      { role: 'system', content: request.system_prompt },
      { role: 'user', content: request.user_prompt },
    ];
  }

  /**
   * 带重试的 fetch
   */
  protected async fetchWithRetry(url: string, options: RequestInit, timeout?: number): Promise<Response> {
    const timeoutMs = timeout ?? this.timeoutMs;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, { ...options, signal: controller.signal });
          clearTimeout(timeoutId);
          return response;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          const retryDelay = this.retryDelayMs * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }
    }
    throw lastError || new Error('Fetch failed after retries');
  }

  /**
   * 解析 SSE 流
   */
  protected async *parseSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<OpenAIChatCompletionChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              yield JSON.parse(data);
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 非流式推理
   */
  async infer(request: LLMInferRequest): Promise<LLMInferResponse> {
    const messages = this.buildMessages(request);
    const model = request.model || this.config.model;

    const body = {
      model,
      messages,
      stream: false,
      temperature: request.temperature ?? 0.7,
      ...(request.max_tokens && { max_tokens: request.max_tokens }),
    };

    const response = await this.fetchWithRetry(`${this.config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${this.config.apiKey}` 
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw new Error(`LLM API error: ${response.status} - ${errorBody}`);
    }

    const result: OpenAIChatCompletion = await response.json();
    const choice = result.choices[0];

    return {
      response_text: choice.message.content || '',
      usage: {
        prompt_tokens: result.usage?.prompt_tokens || 0,
        completion_tokens: result.usage?.completion_tokens || 0,
        total_tokens: result.usage?.total_tokens || 0,
      },
      model: result.model,
      provider: this.id,
      finish_reason: choice.finish_reason,
    };
  }

  /**
   * 流式推理
   */
  async *inferStream(request: LLMInferRequest): AsyncGenerator<StreamChunk> {
    const messages = this.buildMessages(request);
    const model = request.model || this.config.model;

    const body = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true }, // 请求返回 token 使用量
      temperature: request.temperature ?? 0.7,
      ...(request.max_tokens && { max_tokens: request.max_tokens }),
    };

    const response = await this.fetchWithRetry(`${this.config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${this.config.apiKey}` 
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      yield { type: 'error', error: `LLM API error: ${response.status} - ${errorBody}` };
      return;
    }

    if (!response.body) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    let totalUsage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let finishReason: string | null = null;

    for await (const chunk of this.parseSSEStream(response.body)) {
      // 检查 usage（可能在任何 chunk 中，尤其是最后一个）
      if (chunk.usage) {
        totalUsage = {
          prompt_tokens: chunk.usage.prompt_tokens || 0,
          completion_tokens: chunk.usage.completion_tokens || 0,
          total_tokens: chunk.usage.total_tokens || 0,
        };
      }

      // 检查 finish_reason
      if (chunk.choices?.[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }

      // 输出内容
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        yield { type: 'content', content: delta.content };
      }
    }

    yield { type: 'done', usage: totalUsage, finish_reason: finishReason || 'stop' };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetchWithRetry(
        `${this.config.endpoint}/models`,
        { 
          method: 'GET', 
          headers: { 'Authorization': `Bearer ${this.config.apiKey}` } 
        },
        5000
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
