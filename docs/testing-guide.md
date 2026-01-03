# Knowledge Base 服务测试指南

本文档说明如何测试 knowledgebase 服务的各项功能。

## 快速开始

### 1. 启动服务

```bash
# 方式 1: 使用 Docker Compose（推荐）
docker-compose up -d

# 方式 2: 本地开发
# 首先启动 txtai 服务（如果使用 mock，可以跳过）
# 然后启动 knowledgebase
bun run dev
```

### 2. 验证服务是否运行

```bash
# 检查健康状态
curl http://localhost:8080/provider/health | jq .
```

预期响应：
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "txtai": {
    "available": true,
    "url": "http://localhost:8000"
  }
}
```

## 自动化测试

### 运行完整验证脚本

```bash
# 运行综合验证（推荐）
npm run validate

# 或直接运行脚本
./scripts/validate-service.sh
```

验证脚本会测试：
- ✅ 健康检查
- ✅ 契约合规性
- ✅ 文档管理（上传、列表、获取、删除）
- ✅ 搜索功能
- ✅ 错误处理

### 运行类型验证

```bash
npm run validate-types
```

验证生成的 TypeScript 类型是否正确。

## 手动测试

### 测试 1: 健康检查

```bash
curl http://localhost:8080/provider/health | jq .
```

### 测试 2: 上传文档

```bash
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试文档",
    "content": "这是测试文档的内容，用于验证知识库服务。",
    "category": "test"
  }' | jq .
```

预期响应：
```json
{
  "document_id": "doc_xxx",
  "status": "indexed",
  "chunks_count": 1,
  "message": "Document indexed successfully with 1 chunks"
}
```

### 测试 3: 列出文档

```bash
curl http://localhost:8080/documents | jq .
```

或带分页参数：
```bash
curl "http://localhost:8080/documents?limit=10&offset=0" | jq .
```

### 测试 4: 获取文档详情

```bash
# 替换 {document_id} 为实际的文档 ID
curl http://localhost:8080/documents/{document_id} | jq .
```

### 测试 5: 搜索知识库

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "测试",
    "limit": 5
  }' | jq .
```

预期响应：
```json
{
  "provider_name": "customer_kb",
  "chunks": [
    {
      "chunk_id": "doc_xxx_chunk_0",
      "content": "...",
      "score": 0.95,
      "document_id": "doc_xxx",
      "document_title": "测试文档"
    }
  ],
  "total_tokens": 50
}
```

### 测试 6: 错误处理

```bash
# 测试无效请求
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"invalid": "request"}' | jq .
```

预期响应（400）：
```json
{
  "error": "Missing required fields: user_id and query",
  "code": "INVALID_REQUEST"
}
```

### 测试 7: 删除文档

```bash
# 替换 {document_id} 为实际的文档 ID
curl -X DELETE http://localhost:8080/documents/{document_id} | jq .
```

## 完整测试流程示例

```bash
# 1. 检查服务状态
echo "=== 1. 健康检查 ==="
curl -s http://localhost:8080/provider/health | jq .

# 2. 上传测试文档
echo -e "\n=== 2. 上传文档 ==="
DOC_ID=$(curl -s -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API 测试文档",
    "content": "这是用于 API 测试的文档内容。",
    "category": "test"
  }' | jq -r '.document_id')
echo "文档 ID: $DOC_ID"

# 3. 等待索引完成
echo -e "\n=== 3. 等待索引（2秒）==="
sleep 2

# 4. 搜索文档
echo -e "\n=== 4. 搜索文档 ==="
curl -s -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "API 测试",
    "limit": 5
  }' | jq '{chunks_count: (.chunks | length), first_chunk: .chunks[0]}'

# 5. 获取文档详情
echo -e "\n=== 5. 获取文档详情 ==="
curl -s http://localhost:8080/documents/$DOC_ID | jq '{document_id, title, status, chunks_count}'

# 6. 列出所有文档
echo -e "\n=== 6. 列出文档 ==="
curl -s http://localhost:8080/documents | jq '{total, documents: [.documents[] | {document_id, title, status}]}'

# 7. 删除文档
echo -e "\n=== 7. 删除文档 ==="
curl -s -X DELETE http://localhost:8080/documents/$DOC_ID | jq .
```

## 使用 jq 进行高级查询

### 查看搜索结果的详细信息

```bash
curl -s -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","query":"测试","limit":5}' | \
  jq '{
    provider: .provider_name,
    total_chunks: (.chunks | length),
    total_tokens: .total_tokens,
    chunks: [.chunks[] | {
      id: .chunk_id,
      content: .content[:50],
      score: .score,
      document: .document_title
    }]
  }'
```

### 查看文档统计

```bash
curl -s http://localhost:8080/documents | \
  jq '{
    total: .total,
    indexed: [.documents[] | select(.status == "indexed")] | length,
    processing: [.documents[] | select(.status == "processing")] | length,
    failed: [.documents[] | select(.status == "failed")] | length
  }'
```

## 集成测试

### 测试与 chatkit-middleware 的集成

```bash
# 确保 knowledgebase 服务运行在 http://localhost:8080
# 然后在 chatkit-middleware 中测试

# 测试 orchestrator 调用 knowledgebase
curl -X POST http://localhost:26102/flows/inbound/execute \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user" \
  -H "X-Request-ID: test-123" \
  -H "X-Jurisdiction: US" \
  -d '{
    "message": "测试知识库检索",
    "query": "测试知识库检索"
  }' | jq .
```

## 性能测试

### 测试响应时间

```bash
# 健康检查响应时间
time curl -s http://localhost:8080/provider/health > /dev/null

# 搜索响应时间
time curl -s -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","query":"测试","limit":5}' > /dev/null
```

### 并发测试

```bash
# 使用 Apache Bench 测试并发
ab -n 100 -c 10 -p search.json -T application/json \
  http://localhost:8080/provider/search
```

## 常见问题排查

### 问题 1: 服务无法访问

```bash
# 检查服务是否运行
curl http://localhost:8080/provider/health

# 检查端口是否被占用
lsof -i :8080

# 查看服务日志
docker-compose logs knowledgebase
# 或
# 如果本地运行，查看终端输出
```

### 问题 2: txtai 服务不可用

```bash
# 检查 txtai 服务
curl http://localhost:8000

# 如果使用 Docker，检查容器状态
docker ps | grep txtai

# 重启 txtai 服务
docker-compose restart txtai
```

### 问题 3: 搜索返回空结果

```bash
# 检查是否有文档
curl http://localhost:8080/documents | jq '.total'

# 等待索引完成（通常需要几秒钟）
sleep 5

# 重新搜索
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","query":"测试","limit":5}' | jq .
```

## 测试检查清单

- [ ] 服务可以正常启动
- [ ] 健康检查返回 healthy
- [ ] 可以上传文档
- [ ] 文档可以正确索引
- [ ] 可以搜索到上传的文档
- [ ] 搜索结果包含正确的字段
- [ ] 错误处理返回正确的错误格式
- [ ] 文档列表功能正常
- [ ] 可以获取文档详情
- [ ] 可以删除文档
- [ ] 类型验证通过

## 相关文档

- [验证文档](./validation.md) - 详细的验证指南
- [README.md](../README.md) - 服务概述和配置
- [contracts/knowledge-provider.yaml](../contracts/knowledge-provider.yaml) - API 契约

