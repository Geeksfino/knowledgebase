/**
 * LLM Provider Types
 * 
 * Knowledgebase 内置 LLM 模块类型定义
 * 简化自 chatkit-middleware 的实现
 */

// Provider 类型
export type ProviderType = 'openai' | 'deepseek' | 'anthropic' | 'litellm' | 'custom';

// Chat 消息类型
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Token 使用统计
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// LLM 推理请求
export interface LLMInferRequest {
  system_prompt: string;
  user_prompt: string;
  messages?: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

// LLM 推理响应
export interface LLMInferResponse {
  response_text: string;
  model: string;
  usage: TokenUsage;
  finish_reason: string;
  provider?: string;
}

// 流式输出 chunk 类型
export type StreamChunkType = 'content' | 'done' | 'error';

// 流式输出 chunk
export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  usage?: TokenUsage;
  finish_reason?: string;
  error?: string;
}

// Provider 配置
export interface ProviderConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

// Provider 信息
export interface ProviderInfo {
  id: ProviderType;
  name: string;
  available: boolean;
  default: boolean;
}

// 应用配置
export interface LLMConfig {
  provider: ProviderType;
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}
