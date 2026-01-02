/**
 * Knowledge Base Provider Configuration
 */

export const config = {
  // 服务端口
  port: parseInt(process.env.PORT || '8080'),
  host: process.env.HOST || '0.0.0.0',

  // txtai 配置
  txtai: {
    url: process.env.TXTAI_URL || 'http://localhost:8000',
    apiKey: process.env.TXTAI_API_KEY,
    timeout: parseInt(process.env.TXTAI_TIMEOUT || '30000'),
  },

  // 文档存储
  storage: {
    path: process.env.STORAGE_PATH || './data/documents',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
  },

  // 检索配置
  search: {
    defaultLimit: parseInt(process.env.DEFAULT_SEARCH_LIMIT || '5'),
    maxLimit: parseInt(process.env.MAX_SEARCH_LIMIT || '20'),
    minScore: parseFloat(process.env.MIN_SEARCH_SCORE || '0.3'),
  },

  // 分块配置
  chunking: {
    size: parseInt(process.env.CHUNK_SIZE || '500'),
    overlap: parseInt(process.env.CHUNK_OVERLAP || '50'),
  },

  // Provider 信息
  provider: {
    name: process.env.PROVIDER_NAME || 'customer_kb',
    version: '1.0.0',
  },
};
