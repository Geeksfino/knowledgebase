# Knowledge Base Service

独立的知识库问答服务，提供 RAG（检索增强生成）能力。

## 快速开始

### Docker Compose（推荐）

```bash
cp env.example .env
# 编辑 .env 设置 LLM_API_KEY

docker-compose up -d

# 测试
./scripts/chat-stream.sh "你好"
```

### 本地开发

```bash
bun install

# 启动 txtai
docker run -d -p 8000:8000 neuml/txtai-api

cp env.example .env
# 编辑 .env 设置 LLM_API_KEY

bun run dev
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/chat` | POST | 流式会话（RAG） |
| `/provider/search` | POST | 搜索知识库 |
| `/documents` | POST | 上传文档 |
| `/documents` | GET | 列出文档 |
| `/documents/:id` | GET/DELETE | 文档详情/删除 |

### 流式会话

```bash
curl -X POST http://localhost:8080/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "产品有哪些功能？"}'
```

### 搜索

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test", "query": "产品功能", "limit": 5}'
```

## 配置

### 必需配置

| 变量 | 说明 |
|------|------|
| `LLM_PROVIDER` | LLM 提供商 (deepseek/openai/anthropic) |
| `LLM_API_KEY` | API 密钥 |

### 常用配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 8080 | 服务端口 |
| `TXTAI_URL` | http://localhost:8000 | txtai 地址 |
| `QUERY_EXPANSION_ENABLED` | true | 启用查询扩展 |
| `MIN_SEARCH_SCORE` | 0.3 | 最小相似度 |

详细配置见 [环境配置](./docs/environment-configuration.md)

## 目录结构

```
knowledgebase/
├── src/
│   ├── index.ts            # 入口
│   ├── config.ts           # 配置
│   ├── handlers/           # 请求处理
│   │   ├── chat.ts         # 流式会话
│   │   ├── search.ts       # 搜索
│   │   └── documents.ts    # 文档管理
│   └── services/
│       ├── llm/            # LLM 适配器
│       ├── txtai-service.ts
│       ├── query-processor.ts
│       ├── document-store.ts  # SQLite 存储
│       └── rate-limiter.ts    # 限流
├── contracts/              # OpenAPI 契约
├── docker-compose.yml
└── env.example
```

## 文档

- [功能概述](./docs/feature-summary.md)
- [架构说明](./docs/architecture.md)
- [环境配置](./docs/environment-configuration.md)
- [API 参考](./docs/api-reference.md)

## License

MIT
