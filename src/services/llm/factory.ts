/**
 * LLM Provider Factory
 * 
 * 管理 LLM Provider 实例
 */
import type { LLMProvider } from './base.js';
import type { ProviderType, ProviderInfo, LLMConfig } from './types.js';
import { OpenAIProvider, DeepSeekProvider, LiteLLMProvider, CustomProvider } from './openai.js';
import { logger } from '../../utils/logger.js';

// Provider-specific default base URLs
const PROVIDER_DEFAULT_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  litellm: 'http://localhost:4000/v1',
};

/**
 * Provider 工厂类
 */
export class ProviderFactory {
  private providers: Map<ProviderType, LLMProvider> = new Map();
  private defaultProvider: ProviderType;

  constructor(config: LLMConfig) {
    this.defaultProvider = config.provider;
    this.initializeProviders(config);
  }

  /**
   * 初始化 provider
   */
  private initializeProviders(config: LLMConfig): void {
    const provider = config.provider;
    const baseUrl = config.baseUrl || PROVIDER_DEFAULT_URLS[provider] || '';

    // 验证 API Key
    if (!config.apiKey) {
      logger.error({
        provider,
      }, '❌ LLM_PROVIDER_INIT | error=missing_api_key | 请在 .env 中配置 LLM_API_KEY');
      throw new Error('LLM_API_KEY is required. Please configure it in .env file.');
    }

    const providerConfig = {
      apiKey: config.apiKey,
      model: config.model,
      endpoint: baseUrl,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      retryDelayMs: config.retryDelayMs,
    };

    try {
      switch (provider) {
        case 'openai':
          this.providers.set('openai', new OpenAIProvider(providerConfig));
          break;
        case 'deepseek':
          this.providers.set('deepseek', new DeepSeekProvider(providerConfig));
          break;
        case 'litellm':
          this.providers.set('litellm', new LiteLLMProvider(providerConfig));
          break;
        case 'custom':
          this.providers.set('custom', new CustomProvider(providerConfig));
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      logger.info({
        provider,
        model: config.model,
        endpoint: baseUrl,
      }, `✅ LLM_PROVIDER_INIT | provider=${provider} | status=success`);
    } catch (error) {
      logger.error({
        provider,
        error: error instanceof Error ? error.message : String(error),
      }, `❌ LLM_PROVIDER_INIT | provider=${provider} | status=failed`);
      throw error;
    }

    // 验证默认 provider 是否可用
    if (!this.providers.has(this.defaultProvider)) {
      throw new Error(`Default provider '${this.defaultProvider}' is not available`);
    }

    logger.info({
      defaultProvider: this.defaultProvider,
      availableProviders: Array.from(this.providers.keys()),
    }, '✅ LLM_PROVIDER_FACTORY_INIT | complete');
  }

  /**
   * 获取 provider
   */
  getProvider(type?: ProviderType): LLMProvider {
    const providerType = type || this.defaultProvider;
    const provider = this.providers.get(providerType);

    if (!provider) {
      throw new Error(`Provider not available: ${providerType}`);
    }

    return provider;
  }

  /**
   * 检查 provider 是否存在
   */
  hasProvider(type: ProviderType): boolean {
    return this.providers.has(type);
  }

  /**
   * 列出所有 providers
   */
  listProviders(): ProviderInfo[] {
    return Array.from(this.providers).map(([id, provider]) => ({
      id,
      name: provider.name,
      available: provider.available,
      default: id === this.defaultProvider,
    }));
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [id, provider] of this.providers) {
      try {
        results[id] = await provider.healthCheck();
      } catch {
        results[id] = false;
      }
    }
    return results;
  }

  /**
   * 获取默认 provider 类型
   */
  getDefaultProviderType(): ProviderType {
    return this.defaultProvider;
  }
}

// 单例实例
let providerFactory: ProviderFactory | null = null;

/**
 * 初始化 Provider Factory
 */
export function initializeProviderFactory(config: LLMConfig): ProviderFactory {
  providerFactory = new ProviderFactory(config);
  return providerFactory;
}

/**
 * 获取 Provider Factory
 */
export function getProviderFactory(): ProviderFactory {
  if (!providerFactory) {
    throw new Error('ProviderFactory not initialized. Call initializeProviderFactory first.');
  }
  return providerFactory;
}
