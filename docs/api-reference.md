# API 参考

**Base URL:** `http://localhost:8080`

## 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/chat` | POST | 流式会话 |
| `/provider/search` | POST | 搜索 |
| `/documents` | POST | 上传文档 |
| `/documents` | GET | 列出文档 |
| `/documents/:id` | GET | 获取文档 |
| `/documents/:id` | DELETE | 删除文档 |

---

## GET /health

健康检查。

**响应**：
```json
{
  "status": "healthy",
  "txtai": {"available": true},
  "llm": {"provider": "deepseek", "available": true},
  "documents": {"count": 100},
  "rateLimiter": {
    "llm": {"availableTokens": 10},
    "chat": {"availableTokens": 20}
  }
}
```

---

## POST /chat

流式会话（RAG）。

**请求**：
```json
{
  "message": "产品有哪些功能？",
  "options": {
    "search_limit": 5,
    "temperature": 0.7
  }
}
```

**响应（SSE）**：
```
data: {"type":"RUN_STARTED","threadId":"...","runId":"..."}
data: {"type":"CUSTOM","name":"knowledge_sources","value":[...]}
data: {"type":"TEXT_MESSAGE_START","messageId":"...","role":"assistant"}
data: {"type":"TEXT_MESSAGE_CHUNK","delta":"根据知识库..."}
data: {"type":"TEXT_MESSAGE_END","messageId":"..."}
data: {"type":"CUSTOM","name":"token_usage","value":{"total_tokens":700}}
data: {"type":"RUN_FINISHED","threadId":"...","runId":"..."}
```

---

## POST /provider/search

搜索知识库。

**请求**：
```json
{
  "user_id": "user-123",
  "query": "产品功能",
  "limit": 5
}
```

**响应**：
```json
{
  "provider_name": "customer_kb",
  "chunks": [
    {
      "chunk_id": "doc_xxx_chunk_0",
      "content": "...",
      "score": 0.85,
      "document_id": "doc_xxx",
      "document_title": "产品手册"
    }
  ],
  "total_tokens": 150
}
```

---

## POST /documents

上传文档。

**JSON 上传**：
```bash
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{"title": "文档", "content": "内容..."}'
```

**文件上传**：
```bash
curl -X POST http://localhost:8080/documents \
  -F "title=文档" -F "file=@doc.pdf"
```

**响应**：
```json
{
  "document_id": "doc_xxx",
  "status": "indexed",
  "chunks_count": 3
}
```

---

## GET /documents

列出文档。

**参数**：`?limit=50&offset=0`

**响应**：
```json
{
  "documents": [...],
  "total": 100
}
```

---

## DELETE /documents/:id

删除文档。

**响应**：
```json
{
  "success": true
}
```

---

## 错误响应

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE"
}
```

| 代码 | 说明 |
|------|------|
| `INVALID_REQUEST` | 请求无效 |
| `NOT_FOUND` | 资源不存在 |
| `RATE_LIMITED` | 请求限流 |
| `INTERNAL_ERROR` | 内部错误 |
