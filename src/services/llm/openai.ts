/**
 * OpenAI Compatible Provider
 * 
 * 支持 OpenAI、DeepSeek、LiteLLM 等所有 OpenAI 兼容 API
 */
import { OpenAICompatibleProvider } from './base.js';
import type { ProviderType, ProviderConfig } from './types.js';

/**
 * OpenAI Provider
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  readonly id: ProviderType = 'openai';
  readonly name = 'OpenAI';

  constructor(config: ProviderConfig) {
    super({
      ...config,
      endpoint: config.endpoint || 'https://api.openai.com/v1',
    });
  }
}

/**
 * DeepSeek Provider
 */
export class DeepSeekProvider extends OpenAICompatibleProvider {
  readonly id: ProviderType = 'deepseek';
  readonly name = 'DeepSeek';

  constructor(config: ProviderConfig) {
    super({
      ...config,
      endpoint: config.endpoint || 'https://api.deepseek.com/v1',
    });
  }
}

/**
 * LiteLLM Provider
 */
export class LiteLLMProvider extends OpenAICompatibleProvider {
  readonly id: ProviderType = 'litellm';
  readonly name = 'LiteLLM';

  constructor(config: ProviderConfig) {
    super({
      ...config,
      endpoint: config.endpoint || 'http://localhost:4000/v1',
    });
  }
}

/**
 * Custom Provider (任意 OpenAI 兼容 API)
 */
export class CustomProvider extends OpenAICompatibleProvider {
  readonly id: ProviderType = 'custom';
  readonly name = 'Custom';

  constructor(config: ProviderConfig) {
    super(config);
  }
}
