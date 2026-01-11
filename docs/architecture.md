# 架构说明

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                 Knowledge Base Service                   │
├─────────────────────────────────────────────────────────┤
│  Handlers          Services              Utils          │
│  ─────────         ────────              ─────          │
│  • chat            • llm/                • logger       │
│  • health          • txtai-service       • token-counter│
│  • search          • query-processor     • mime-types   │
│  • documents       • document-store      • hash         │
│                    • document-processor                 │
│                    • rate-limiter                       │
│                    • file-storage                       │
└─────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
  ┌──────────┐         ┌──────────┐
  │  txtai   │         │   LLM    │
  │ (向量DB) │         │ Provider │
  └──────────┘         └──────────┘
```

## 核心组件

### Handlers

| 文件 | 功能 |
|------|------|
| `chat.ts` | 流式会话（RAG），SSE 输出 |
| `search.ts` | 知识库搜索，混合检索 |
| `documents.ts` | 文档上传、管理 |
| `health.ts` | 健康检查 |

### Services

| 文件 | 功能 |
|------|------|
| `llm/` | LLM 适配器（DeepSeek、OpenAI 等） |
| `txtai-service.ts` | 向量检索 |
| `query-processor.ts` | 查询扩展/重写 |
| `document-store.ts` | SQLite 文档存储 |
| `rate-limiter.ts` | 请求限流与队列 |
| `document-processor.ts` | 文档分块 |
| `file-storage.ts` | 文件存储 |

## 数据流

### Chat 流程

```
用户消息
    ↓
Query Processor ── LLM 查询扩展
    ↓
txtai Service ──── 混合搜索
    ↓
Document Store ─── 补充元数据
    ↓
LLM Provider ───── 流式推理
    ↓
SSE 响应（AG-UI 协议）
```

### 搜索流程

```
用户查询
    ↓
Query Processor ── 查询扩展（可选）
    ↓
txtai Service ──── 混合搜索
    ↓
Document Store ─── 补充元数据
    ↓
搜索结果
```

## AG-UI 协议

Chat 端点输出格式：

```
RUN_STARTED
    ↓
CUSTOM (knowledge_sources)
    ↓
TEXT_MESSAGE_START
    ↓
TEXT_MESSAGE_CHUNK (多个)
    ↓
TEXT_MESSAGE_END
    ↓
CUSTOM (token_usage)
    ↓
RUN_FINISHED
```

## 存储

- **文档元数据**：SQLite (`data/documents/knowledgebase.db`)
- **向量索引**：txtai 管理
- **媒体文件**：本地文件系统 (`data/media/`)

## 限流机制

使用令牌桶算法保护 LLM 调用：

| 限流器 | 默认配置 |
|--------|----------|
| LLM 限流 | 10 令牌，2/秒恢复 |
| Chat 限流 | 20 令牌，5/秒恢复 |
| LLM 队列 | 5 并发，50 排队 |
