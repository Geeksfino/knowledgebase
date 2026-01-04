# 功能概述

本文档概述 Knowledge Base Provider 服务的核心功能和使用说明。

## 核心功能

### 1. 混合搜索

结合向量搜索（语义相似度）和关键词搜索（BM25）：

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "query": "产品报价",
    "limit": 5
  }'
```

**特点：**
- 语义理解：理解查询意图，不仅匹配关键词
- 精确匹配：BM25 确保关键词精确匹配
- 可配置权重：通过 `TXTAI_HYBRID_WEIGHTS` 调整搜索策略
- 自动降级：txtai 不支持混合搜索时自动降级为向量搜索

### 2. 智能查询处理

使用 LLM 优化搜索查询（可选）：

**查询扩展：**
- 生成多个查询变体
- 提高搜索召回率
- 多查询融合排序

**查询重写：**
- 提取核心概念
- 去除描述性词语
- 优化检索效果

**配置启用：**
```bash
QUERY_LLM_ENABLED=true
QUERY_LLM_URL=http://llm-adapter:26404
```

### 3. 多模态支持

支持多种文件类型的索引和搜索：

#### 文本文档
直接 JSON 上传：
```bash
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "产品手册",
    "content": "产品使用说明...",
    "category": "docs"
  }'
```

#### 图片
```bash
curl -X POST http://localhost:8080/documents \
  -F "title=产品截图" \
  -F "file=@screenshot.png" \
  -F "description=产品界面截图"
```

#### PDF 文档
```bash
curl -X POST http://localhost:8080/documents \
  -F "title=用户手册" \
  -F "file=@manual.pdf"
```

#### Word 文档
```bash
curl -X POST http://localhost:8080/documents \
  -F "title=技术规格" \
  -F "file=@spec.docx"
```

### 4. 文档管理

#### 列出文档
```bash
curl http://localhost:8080/documents?limit=10&offset=0
```

#### 获取文档详情
```bash
curl http://localhost:8080/documents/{document_id}
```

#### 删除文档
```bash
curl -X DELETE http://localhost:8080/documents/{document_id}
```

### 5. 智能分块

文档自动分块处理：

- **按段落分块**：优先保持段落完整性
- **智能重叠**：分块间重叠确保上下文连贯
- **句子边界**：在句子边界处分割
- **中英文支持**：正确处理中英文混合文本

**配置参数：**
```bash
CHUNK_SIZE=500      # 分块大小（字符数）
CHUNK_OVERLAP=50    # 重叠字符数
```

### 6. Token 预算控制

搜索时可指定 Token 预算：

```bash
curl -X POST http://localhost:8080/provider/search \
  -d '{
    "user_id": "user-123",
    "query": "产品功能",
    "limit": 10,
    "token_budget": 2000
  }'
```

- 返回结果不超过指定 Token 数
- 支持中英文混合文本的 Token 估算
- 自动截断超出预算的结果

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/provider/health` | GET | 健康检查 |
| `/provider/search` | POST | 搜索知识库 |
| `/documents` | GET | 列出文档 |
| `/documents` | POST | 上传文档 |
| `/documents/:id` | GET | 获取文档详情 |
| `/documents/:id` | DELETE | 删除文档 |
| `/media/:docId/:file` | GET | 获取媒体文件 |

## 响应格式

### 搜索响应

```json
{
  "provider_name": "customer_kb",
  "chunks": [
    {
      "chunk_id": "doc_xxx_chunk_0",
      "content": "搜索结果内容...",
      "score": 0.85,
      "document_id": "doc_xxx",
      "document_title": "产品手册",
      "media_type": "text",
      "metadata": {
        "category": "docs"
      }
    }
  ],
  "total_tokens": 150,
  "metadata": {
    "search_mode": "hybrid",
    "results_count": 5,
    "min_score": 0.3
  }
}
```

### 上传响应

```json
{
  "document_id": "doc_xxx",
  "status": "indexed",
  "chunks_count": 3,
  "message": "Document indexed successfully with 3 chunks"
}
```

### 健康检查响应

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "txtai": {
    "available": true,
    "url": "http://localhost:8000"
  },
  "documents": {
    "count": 42
  }
}
```

## 与 chatkit-middleware 集成

### 网络配置

```bash
# 通过主机端口
KNOWLEDGE_BASE_URL=http://host.docker.internal:8080

# 或通过 Docker 网络
KNOWLEDGE_BASE_URL=http://knowledgebase:8080
```

### Flow 配置

```yaml
# flows/inbound.yaml
steps:
  - service: ai.infer
    providers:
      knowledge_base:
        - name: customer_kb
          type: http
          url: ${KNOWLEDGE_BASE_URL}
          enabled: true
          priority: 1
          timeout_ms: 5000
```

## 最佳实践

### 1. 文档上传

- 提供有意义的标题和描述
- 使用 category 字段分类文档
- 控制单个文档大小（建议 < 1MB）

### 2. 搜索优化

- 启用 LLM 查询处理提高召回率
- 根据使用场景调整混合搜索权重
- 设置合适的最小分数阈值

### 3. 生产部署

- 使用持久化存储
- 配置合适的超时时间
- 监控 txtai 服务健康状态

