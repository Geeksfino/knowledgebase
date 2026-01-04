# 环境配置指南

本文档详细说明 Knowledge Base Provider 服务的环境变量配置。

## 配置方式

### 方式 1: 使用 .env 文件（开发环境推荐）

```bash
# 复制配置模板
cp env.example .env

# 编辑配置
nano .env

# 启动服务（会自动读取 .env 文件）
bun run dev
```

### 方式 2: 使用环境变量（生产环境推荐）

```bash
export PORT=8080
export TXTAI_URL=http://txtai:8000
export PROVIDER_NAME=production_kb
bun run start
```

## 配置项详解

### 服务基础配置

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PORT` | 8080 | 服务监听端口 |
| `HOST` | 0.0.0.0 | 服务绑定地址 |

### txtai 向量检索配置

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `TXTAI_URL` | http://127.0.0.1:8000 | txtai 服务地址 |
| `TXTAI_API_KEY` | - | txtai API 密钥（可选） |
| `TXTAI_TIMEOUT` | 30000 | 请求超时时间（毫秒） |

### 文件存储配置

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `STORAGE_PATH` | ./data/documents | 文档存储路径 |
| `MEDIA_PATH` | ./data/media | 媒体文件存储路径 |
| `MEDIA_BASE_URL` | http://localhost:8080/media | 媒体文件访问基础 URL |
| `MAX_FILE_SIZE` | 10485760 | 最大文件大小（字节，默认 10MB） |

### 搜索参数配置

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `DEFAULT_SEARCH_LIMIT` | 5 | 默认返回结果数 |
| `MAX_SEARCH_LIMIT` | 20 | 最大返回结果数 |
| `MIN_SEARCH_SCORE` | 0.3 | 最小相似度分数阈值 |
| `TXTAI_HYBRID_WEIGHTS` | 0.4,0.6 | 混合搜索权重 [向量,BM25] |

#### 混合搜索权重说明

- `0.0,1.0` - 纯关键词搜索（BM25）
- `1.0,0.0` - 纯向量搜索
- `0.5,0.5` - 平衡混合
- `0.4,0.6`（默认）- 略偏向关键词，提高精确匹配能力

### 文档分块配置

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CHUNK_SIZE` | 500 | 分块大小（字符数） |
| `CHUNK_OVERLAP` | 50 | 分块重叠字符数 |

### Provider 信息

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PROVIDER_NAME` | customer_kb | Provider 名称标识 |

### 查询处理（LLM）配置

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `QUERY_LLM_ENABLED` | false | 是否启用 LLM 查询处理 |
| `QUERY_LLM_URL` | http://localhost:26404 | LLM 服务地址 |
| `QUERY_LLM_TIMEOUT` | 10000 | LLM 请求超时时间（毫秒） |
| `QUERY_EXPANSION_ENABLED` | true | 是否启用查询扩展 |
| `QUERY_EXPANSION_MAX` | 3 | 最多生成的查询变体数量 |

## 生产环境部署建议

### 1. 文件存储

生产环境建议使用持久化存储：

```bash
# Docker 挂载卷
docker run -v /data/knowledgebase:/app/data ...

# 或使用网络存储
export STORAGE_PATH=/mnt/nfs/knowledgebase/documents
export MEDIA_PATH=/mnt/nfs/knowledgebase/media
```

### 2. txtai 服务

确保 txtai 服务高可用：

```bash
# 内部网络访问
export TXTAI_URL=http://txtai-service:8000

# 增加超时时间
export TXTAI_TIMEOUT=60000
```

### 3. 媒体文件访问

配置正确的外部访问 URL：

```bash
# 通过负载均衡器访问
export MEDIA_BASE_URL=https://api.example.com/media
```

### 4. 安全配置

```bash
# 限制绑定地址
export HOST=127.0.0.1

# 限制文件大小
export MAX_FILE_SIZE=5242880  # 5MB
```

## 示例配置文件

### 开发环境 (.env.development)

```bash
PORT=8080
HOST=0.0.0.0
TXTAI_URL=http://localhost:8000
PROVIDER_NAME=dev_kb
DEBUG=true
```

### 生产环境 (.env.production)

```bash
PORT=8080
HOST=0.0.0.0
TXTAI_URL=http://txtai:8000
PROVIDER_NAME=production_kb
STORAGE_PATH=/data/documents
MEDIA_PATH=/data/media
MEDIA_BASE_URL=https://api.example.com/media
MAX_FILE_SIZE=10485760
TXTAI_TIMEOUT=60000
MIN_SEARCH_SCORE=0.35
QUERY_LLM_ENABLED=true
QUERY_LLM_URL=http://llm-adapter:26404
```

