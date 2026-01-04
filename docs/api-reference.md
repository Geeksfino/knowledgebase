# API 参考文档

本文档提供 Knowledge Base Provider 服务的完整 API 参考。

## 基础信息

- **Base URL:** `http://localhost:8080`
- **Content-Type:** `application/json` (除文件上传外)
- **响应格式:** JSON

## 端点列表

| 端点 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 服务信息 |
| `/provider/health` | GET | 健康检查 |
| `/provider/search` | POST | 搜索知识库 |
| `/documents` | GET | 列出文档 |
| `/documents` | POST | 上传文档 |
| `/documents/:id` | GET | 获取文档 |
| `/documents/:id` | DELETE | 删除文档 |
| `/media/:docId/:file` | GET | 获取媒体文件 |

---

## GET /

获取服务基本信息。

### 响应

```json
{
  "name": "Knowledge Base Provider",
  "version": "1.0.0",
  "provider_name": "customer_kb",
  "endpoints": {
    "health": "GET /provider/health",
    "search": "POST /provider/search",
    "documents": {
      "list": "GET /documents",
      "upload": "POST /documents",
      "get": "GET /documents/:id",
      "delete": "DELETE /documents/:id"
    }
  }
}
```

---

## GET /provider/health

检查服务健康状态。

### 响应

| 字段 | 类型 | 描述 |
|------|------|------|
| `status` | string | 服务状态: "healthy" \| "degraded" |
| `version` | string | 服务版本号 |
| `txtai.available` | boolean | txtai 服务是否可用 |
| `txtai.url` | string | txtai 服务地址 |
| `documents.count` | number | 已索引文档数量 |

**示例响应：**
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

---

## POST /provider/search

搜索知识库。

### 请求体

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `user_id` | string | ✓ | 用户 ID |
| `query` | string | ✓ | 搜索查询 |
| `limit` | number | | 返回结果数量限制（默认 5，最大 20） |
| `token_budget` | number | | Token 预算限制 |

**示例请求：**
```json
{
  "user_id": "user-123",
  "query": "产品功能介绍",
  "limit": 5,
  "token_budget": 2000
}
```

### 响应

| 字段 | 类型 | 描述 |
|------|------|------|
| `provider_name` | string | Provider 名称 |
| `chunks` | array | 搜索结果数组 |
| `total_tokens` | number | 结果总 Token 数 |
| `metadata` | object | 搜索元数据 |

**Chunk 对象：**
| 字段 | 类型 | 描述 |
|------|------|------|
| `chunk_id` | string | 分块 ID |
| `content` | string | 分块内容 |
| `score` | number | 相关性分数 |
| `document_id` | string | 文档 ID |
| `document_title` | string | 文档标题 |
| `media_type` | string | 媒体类型: "text" \| "image" \| "video" \| "audio" |
| `media_url` | string | 媒体文件 URL（可选） |
| `metadata` | object | 附加元数据 |

**示例响应：**
```json
{
  "provider_name": "customer_kb",
  "chunks": [
    {
      "chunk_id": "doc_abc123_chunk_0",
      "content": "产品具有以下核心功能...",
      "score": 0.85,
      "document_id": "doc_abc123",
      "document_title": "产品手册",
      "media_type": "text",
      "metadata": {
        "category": "documentation"
      }
    }
  ],
  "total_tokens": 150,
  "metadata": {
    "search_mode": "hybrid",
    "results_count": 1,
    "min_score": 0.3
  }
}
```

### 错误响应

| 状态码 | 描述 |
|--------|------|
| 400 | 缺少必填字段 |
| 500 | 服务器内部错误 |

---

## GET /documents

列出所有文档。

### 查询参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `limit` | number | 50 | 返回数量限制 |
| `offset` | number | 0 | 分页偏移量 |

### 响应

| 字段 | 类型 | 描述 |
|------|------|------|
| `documents` | array | 文档数组 |
| `total` | number | 文档总数 |
| `limit` | number | 当前限制 |
| `offset` | number | 当前偏移 |

**Document 对象：**
| 字段 | 类型 | 描述 |
|------|------|------|
| `document_id` | string | 文档 ID |
| `title` | string | 文档标题 |
| `category` | string | 文档分类（可选） |
| `description` | string | 文档描述（可选） |
| `status` | string | 状态: "indexed" \| "processing" \| "failed" |
| `chunks_count` | number | 分块数量 |
| `media_type` | string | 媒体类型 |
| `media_url` | string | 媒体 URL（可选） |
| `created_at` | string | 创建时间（ISO 8601） |
| `updated_at` | string | 更新时间（ISO 8601） |

**示例响应：**
```json
{
  "documents": [
    {
      "document_id": "doc_abc123",
      "title": "产品手册",
      "category": "documentation",
      "status": "indexed",
      "chunks_count": 5,
      "media_type": "text",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

## POST /documents

上传文档。支持两种方式：

### 方式 1: JSON 文本上传

**Content-Type:** `application/json`

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `title` | string | ✓ | 文档标题 |
| `content` | string | ✓ | 文档内容 |
| `category` | string | | 文档分类 |
| `description` | string | | 文档描述 |
| `metadata` | object | | 附加元数据 |

**示例请求：**
```json
{
  "title": "产品介绍",
  "content": "我们的产品...",
  "category": "product",
  "description": "产品基本介绍文档"
}
```

### 方式 2: 文件上传

**Content-Type:** `multipart/form-data`

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `title` | string | ✓ | 文档标题 |
| `file` | file | ✓ | 上传的文件 |
| `category` | string | | 文档分类 |
| `description` | string | | 文档描述 |
| `metadata` | string | | JSON 格式的元数据 |

**示例请求：**
```bash
curl -X POST http://localhost:8080/documents \
  -F "title=产品截图" \
  -F "file=@screenshot.png" \
  -F "category=images" \
  -F "description=产品界面截图"
```

### 响应

| 字段 | 类型 | 描述 |
|------|------|------|
| `document_id` | string | 新文档 ID |
| `status` | string | 状态: "indexed" \| "failed" |
| `chunks_count` | number | 创建的分块数量 |
| `message` | string | 结果消息 |

**示例响应：**
```json
{
  "document_id": "doc_abc123",
  "status": "indexed",
  "chunks_count": 3,
  "message": "Document indexed successfully with 3 chunks"
}
```

### 错误响应

| 状态码 | 描述 |
|--------|------|
| 400 | 缺少必填字段或无效数据 |
| 500 | 索引失败 |

---

## GET /documents/:id

获取文档详情。

### 路径参数

| 参数 | 类型 | 描述 |
|------|------|------|
| `id` | string | 文档 ID |

### 响应

返回 Document 对象（同列表中的文档对象）。

### 错误响应

| 状态码 | 描述 |
|--------|------|
| 400 | 缺少文档 ID |
| 404 | 文档不存在 |

---

## DELETE /documents/:id

删除文档。

### 路径参数

| 参数 | 类型 | 描述 |
|------|------|------|
| `id` | string | 文档 ID |

### 响应

| 字段 | 类型 | 描述 |
|------|------|------|
| `success` | boolean | 是否成功 |
| `message` | string | 结果消息 |

**示例响应：**
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

### 错误响应

| 状态码 | 描述 |
|--------|------|
| 400 | 缺少文档 ID |
| 404 | 文档不存在 |

---

## GET /media/:docId/:file

获取媒体文件。

### 路径参数

| 参数 | 类型 | 描述 |
|------|------|------|
| `docId` | string | 文档 ID |
| `file` | string | 文件名 |

### 响应

返回媒体文件的二进制内容。

**响应头：**
- `Content-Type`: 文件的 MIME 类型
- `Content-Length`: 文件大小

### 错误响应

| 状态码 | 描述 |
|--------|------|
| 404 | 文件不存在 |

---

## 错误响应格式

所有错误响应遵循统一格式：

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE"
}
```

**错误代码：**
| 代码 | 描述 |
|------|------|
| `INVALID_REQUEST` | 请求无效（缺少字段、格式错误等） |
| `NOT_FOUND` | 资源不存在 |
| `UPLOAD_ERROR` | 上传失败 |
| `INTERNAL_ERROR` | 服务器内部错误 |

---

## CORS

所有端点支持 CORS，响应包含以下头：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-ID, X-User-ID, X-Jurisdiction
```

## 请求头

可选的请求头：

| 头 | 描述 |
|------|------|
| `X-Request-ID` | 请求追踪 ID |
| `X-User-ID` | 用户 ID |
| `X-Jurisdiction` | 管辖区域 |

