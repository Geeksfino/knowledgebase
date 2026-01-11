# 功能概述

## 核心功能

### 1. 流式会话（RAG）

基于知识库的智能问答：

```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "产品有哪些功能？"}'
```

**流程**：查询扩展 → 知识库搜索 → 上下文构建 → LLM 推理 → SSE 输出

### 2. 混合搜索

向量搜索 + BM25 关键词搜索：

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test", "query": "产品报价", "limit": 5}'
```

配置权重：
```bash
TXTAI_HYBRID_WEIGHTS=0.4,0.6  # 向量:BM25
```

### 3. 智能查询处理

LLM 驱动的查询优化：
- **查询扩展**：生成多个查询变体
- **查询重写**：提取核心概念

```bash
QUERY_EXPANSION_ENABLED=true
```

### 4. 文档管理

```bash
# JSON 上传
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{"title": "文档标题", "content": "内容..."}'

# 文件上传
curl -X POST http://localhost:8080/documents \
  -F "title=文档" -F "file=@doc.pdf"
```

支持格式：文本、图片、PDF、Word

### 5. LLM 集成

| Provider | 说明 |
|----------|------|
| DeepSeek | 默认 |
| OpenAI | GPT 系列 |
| Anthropic | Claude |
| LiteLLM | 代理 |

### 6. 限流保护

令牌桶算法保护 LLM 调用，防止过载。

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/chat` | POST | 流式会话 |
| `/provider/search` | POST | 搜索 |
| `/documents` | POST/GET | 文档管理 |
| `/documents/:id` | GET/DELETE | 文档操作 |

## 性能优化

### 禁用查询扩展

```bash
QUERY_EXPANSION_ENABLED=false  # 减少 LLM 调用
```

### 调整搜索权重

```bash
TXTAI_HYBRID_WEIGHTS=0.3,0.7  # 偏向精确匹配
```

### 调整阈值

```bash
MIN_SEARCH_SCORE=0.4  # 过滤低相关结果
```
