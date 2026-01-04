/**
 * Knowledge Base Provider 配置模块
 *
 * 集中管理所有服务配置，支持通过环境变量覆盖默认值。
 * 配置分为以下几个部分：
 * - 服务基础配置（端口、主机）
 * - txtai 向量检索服务配置
 * - 文件存储配置
 * - 搜索参数配置
 * - 文档分块配置
 * - Provider 元信息
 * - 查询处理（LLM）配置
 *
 * @module config
 */

/**
 * 解析整数环境变量，带默认值
 */
function parseIntEnv(value: string | undefined, defaultValue: number): number {
  const parsed = parseInt(value || '', 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 解析浮点数环境变量，带默认值
 */
function parseFloatEnv(value: string | undefined, defaultValue: number): number {
  const parsed = parseFloat(value || '');
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 服务配置对象
 */
export const config = {
  /**
   * 服务基础配置
   */
  port: parseIntEnv(process.env.PORT, 8080),
  host: process.env.HOST || '0.0.0.0',

  /**
   * txtai 向量检索服务配置
   * - url: txtai API 地址
   * - apiKey: 可选的 API 密钥
   * - timeout: 请求超时时间（毫秒）
   */
  txtai: {
    url: process.env.TXTAI_URL || 'http://127.0.0.1:8000',
    apiKey: process.env.TXTAI_API_KEY,
    timeout: parseIntEnv(process.env.TXTAI_TIMEOUT, 30000),
  },

  /**
   * 文件存储配置
   * - path: 文档存储路径
   * - maxFileSize: 最大文件大小（字节），默认 10MB
   * - mediaPath: 媒体文件存储路径
   * - baseUrl: 媒体文件访问基础 URL
   */
  storage: {
    path: process.env.STORAGE_PATH || './data/documents',
    maxFileSize: parseIntEnv(process.env.MAX_FILE_SIZE, 10485760),
    mediaPath: process.env.MEDIA_PATH || './data/media',
    baseUrl: process.env.MEDIA_BASE_URL || 'http://localhost:8080/media',
  },

  /**
   * 搜索参数配置
   * - defaultLimit: 默认返回结果数
   * - maxLimit: 最大返回结果数
   * - minScore: 最小相似度分数阈值
   * - hybridWeights: 混合搜索权重 [向量权重, BM25权重]
   *   - 0.0 = 纯关键词, 1.0 = 纯向量, 0.5 = 平衡
   *   - 默认 [0.4, 0.6] 略偏向关键词以提高精确度
   */
  search: {
    defaultLimit: parseIntEnv(process.env.DEFAULT_SEARCH_LIMIT, 5),
    maxLimit: parseIntEnv(process.env.MAX_SEARCH_LIMIT, 20),
    minScore: parseFloatEnv(process.env.MIN_SEARCH_SCORE, 0.3),
    hybridWeights: process.env.TXTAI_HYBRID_WEIGHTS
      ? process.env.TXTAI_HYBRID_WEIGHTS.split(',').map(w => parseFloatEnv(w.trim(), 0.5))
      : [0.4, 0.6],
  },

  /**
   * 文档分块配置
   * - size: 分块大小（字符数）
   * - overlap: 分块重叠字符数，用于保持上下文连贯性
   */
  chunking: {
    size: parseIntEnv(process.env.CHUNK_SIZE, 500),
    overlap: parseIntEnv(process.env.CHUNK_OVERLAP, 50),
  },

  /**
   * Provider 元信息
   * - name: Provider 名称，用于标识搜索结果来源
   * - version: 服务版本号
   */
  provider: {
    name: process.env.PROVIDER_NAME || 'customer_kb',
    version: '1.0.0',
  },

  /**
   * 查询处理配置
   * 支持使用 LLM 进行查询重写和扩展，提高搜索召回率
   */
  queryProcessing: {
    llm: {
      /** 是否启用 LLM 查询处理 */
      enabled: process.env.QUERY_LLM_ENABLED === 'true',
      /** LLM 服务地址（llm-adapter） */
      url: process.env.QUERY_LLM_URL || 'http://localhost:26404',
      /** LLM 请求超时时间（毫秒） */
      timeout: parseIntEnv(process.env.QUERY_LLM_TIMEOUT, 10000),
      /** 查询扩展配置 */
      expansion: {
        /** 是否启用查询扩展（默认启用，如果 LLM 可用） */
        enabled: process.env.QUERY_EXPANSION_ENABLED !== 'false',
        /** 最多生成的查询变体数量 */
        maxQueries: parseIntEnv(process.env.QUERY_EXPANSION_MAX, 3),
      },
    },
  },
} as const;

/**
 * 配置类型导出，便于类型检查
 */
export type Config = typeof config;
