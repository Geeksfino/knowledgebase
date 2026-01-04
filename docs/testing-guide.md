# 测试指南

本文档说明如何测试 Knowledge Base Provider 服务。

## 环境准备

### 1. 启动服务

**使用真实 txtai（推荐）：**
```bash
# 启动 txtai
docker run -d -p 8000:8000 neuml/txtai-api

# 启动服务
bun run dev
```

**使用 Mock txtai（无需真实服务）：**
```bash
# 启动 mock 服务
bun run mock-txtai

# 在另一个终端启动主服务
bun run dev
```

### 2. 使用 Docker Compose

```bash
docker-compose up -d
```

## 基础测试

### 健康检查

```bash
curl http://localhost:8080/provider/health
```

**期望响应：**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "txtai": {
    "available": true,
    "url": "http://localhost:8000"
  },
  "documents": {
    "count": 0
  }
}
```

### 根端点

```bash
curl http://localhost:8080/
```

**期望响应：**
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

## 文档管理测试

### 上传文本文档

```bash
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试文档",
    "content": "这是一个测试文档的内容，用于验证文档上传功能。",
    "category": "test"
  }'
```

**期望响应：**
```json
{
  "document_id": "doc_xxx",
  "status": "indexed",
  "chunks_count": 1,
  "message": "Document indexed successfully with 1 chunks"
}
```

### 上传文件

```bash
# 创建测试文件
echo "这是测试文件内容" > test.txt

# 上传
curl -X POST http://localhost:8080/documents \
  -F "title=测试文件" \
  -F "file=@test.txt"
```

### 列出文档

```bash
curl http://localhost:8080/documents
```

### 获取文档详情

```bash
curl http://localhost:8080/documents/{document_id}
```

### 删除文档

```bash
curl -X DELETE http://localhost:8080/documents/{document_id}
```

## 搜索测试

### 基础搜索

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "测试"
  }'
```

### 带限制的搜索

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "测试",
    "limit": 3
  }'
```

### 带 Token 预算的搜索

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "测试",
    "limit": 10,
    "token_budget": 500
  }'
```

## 完整测试流程

### 端到端测试脚本

```bash
#!/bin/bash

BASE_URL="http://localhost:8080"

echo "=== 1. 健康检查 ==="
curl -s $BASE_URL/provider/health | jq .

echo -e "\n=== 2. 上传文档 ==="
DOC_RESPONSE=$(curl -s -X POST $BASE_URL/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "产品介绍",
    "content": "我们的产品具有以下特点：高性能、易使用、可扩展。支持多种部署方式。",
    "category": "product"
  }')
echo $DOC_RESPONSE | jq .
DOC_ID=$(echo $DOC_RESPONSE | jq -r '.document_id')

echo -e "\n=== 3. 列出文档 ==="
curl -s $BASE_URL/documents | jq .

echo -e "\n=== 4. 获取文档详情 ==="
curl -s $BASE_URL/documents/$DOC_ID | jq .

echo -e "\n=== 5. 搜索文档 ==="
curl -s -X POST $BASE_URL/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "产品特点"
  }' | jq .

echo -e "\n=== 6. 删除文档 ==="
curl -s -X DELETE $BASE_URL/documents/$DOC_ID | jq .

echo -e "\n=== 7. 确认删除 ==="
curl -s $BASE_URL/documents | jq .

echo -e "\n=== 测试完成 ==="
```

## 错误场景测试

### 缺少必填字段

```bash
# 缺少 query
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test"}'
```

**期望：** 400 错误，提示缺少字段

### 无效 JSON

```bash
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d 'invalid json'
```

**期望：** 400 错误

### 不存在的文档

```bash
curl http://localhost:8080/documents/nonexistent
```

**期望：** 404 错误

## 性能测试

### 批量上传测试

```bash
for i in {1..10}; do
  curl -s -X POST http://localhost:8080/documents \
    -H "Content-Type: application/json" \
    -d "{
      \"title\": \"测试文档 $i\",
      \"content\": \"这是第 $i 个测试文档的内容。\",
      \"category\": \"batch-test\"
    }"
done
```

### 搜索响应时间

```bash
time curl -s -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test",
    "query": "测试",
    "limit": 10
  }' > /dev/null
```

## 调试技巧

### 启用 Debug 日志

```bash
DEBUG=true bun run dev
```

### 查看服务日志

```bash
# Docker 环境
docker-compose logs -f knowledgebase

# 本地环境
tail -f logs/knowledgebase.log
```

### 检查 txtai 状态

```bash
curl http://localhost:8000/
```

## 常见问题

### txtai 连接失败

检查：
1. txtai 服务是否运行
2. 网络连接是否正常
3. `TXTAI_URL` 配置是否正确

### 搜索无结果

检查：
1. 是否有文档已索引
2. 查询是否与内容相关
3. `MIN_SEARCH_SCORE` 是否设置过高

### 文件上传失败

检查：
1. 文件大小是否超过限制
2. 文件类型是否支持
3. 存储目录权限是否正确

