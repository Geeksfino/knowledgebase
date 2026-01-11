# 环境配置

## 配置方式

```bash
cp env.example .env
nano .env
```

## 配置项

### LLM 配置（必需）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | deepseek | 提供商 (deepseek/openai/anthropic/litellm) |
| `LLM_MODEL` | deepseek-chat | 模型 |
| `LLM_API_KEY` | - | API 密钥（**必需**） |
| `LLM_BASE_URL` | 自动 | API 地址 |
| `LLM_TIMEOUT_MS` | 60000 | 超时（毫秒） |

**示例**：
```bash
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-xxx
```

### 服务配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 8080 | 服务端口 |
| `HOST` | 0.0.0.0 | 绑定地址 |

### txtai 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TXTAI_URL` | http://127.0.0.1:8000 | txtai 地址 |
| `TXTAI_TIMEOUT` | 30000 | 超时（毫秒） |

### 搜索配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEFAULT_SEARCH_LIMIT` | 5 | 默认结果数 |
| `MAX_SEARCH_LIMIT` | 20 | 最大结果数 |
| `MIN_SEARCH_SCORE` | 0.3 | 最小相似度 |
| `TXTAI_HYBRID_WEIGHTS` | 0.4,0.6 | 混合权重 [向量,BM25] |

### 查询处理

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `QUERY_LLM_ENABLED` | true | 启用 LLM 处理 |
| `QUERY_EXPANSION_ENABLED` | true | 启用查询扩展 |
| `QUERY_EXPANSION_MAX` | 3 | 最大扩展数 |

### Chat 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CHAT_DEFAULT_TEMPERATURE` | 0.7 | LLM 温度 |
| `CHAT_DEFAULT_MAX_TOKENS` | 2048 | 最大 token |
| `CHAT_DEFAULT_SEARCH_LIMIT` | 5 | 搜索结果数 |
| `CHAT_SYSTEM_PROMPT` | 内置 | 系统提示词 |

### 限流配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_RATE_LIMIT_MAX_TOKENS` | 10 | LLM 令牌数 |
| `LLM_RATE_LIMIT_REFILL_RATE` | 2 | 每秒恢复 |
| `LLM_QUEUE_CONCURRENCY` | 5 | 并发数 |
| `LLM_QUEUE_MAX_SIZE` | 50 | 队列大小 |
| `CHAT_RATE_LIMIT_MAX_TOKENS` | 20 | Chat 令牌数 |
| `CHAT_RATE_LIMIT_REFILL_RATE` | 5 | 每秒恢复 |

### 存储配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `STORAGE_PATH` | ./data/documents | SQLite 路径 |
| `MEDIA_PATH` | ./data/media | 媒体文件路径 |
| `MAX_FILE_SIZE` | 10485760 | 最大文件（字节） |

### 分块配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CHUNK_SIZE` | 500 | 分块大小 |
| `CHUNK_OVERLAP` | 50 | 重叠字符 |

## 示例配置

### 开发环境

```bash
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-xxx
PORT=8080
TXTAI_URL=http://localhost:8000
```

### 生产环境

```bash
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-xxx
PORT=8080
TXTAI_URL=http://txtai:8000
STORAGE_PATH=/data/documents
MIN_SEARCH_SCORE=0.35
```

## Docker Compose

```yaml
services:
  knowledgebase:
    environment:
      - LLM_PROVIDER=deepseek
      - LLM_API_KEY=${LLM_API_KEY}
      - TXTAI_URL=http://txtai:8000
```
