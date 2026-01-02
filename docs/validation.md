# Knowledge Base Service Validation Guide

本文档说明如何验证 knowledgebase 服务的功能、契约合规性和集成。

## 验证方法概览

### 1. 快速验证（推荐）

运行综合验证脚本，自动执行所有验证步骤：

```bash
# 确保服务正在运行
bun run dev

# 在另一个终端运行验证
npm run validate
# 或
./scripts/validate-service.sh
```

验证脚本会检查：
- ✅ 健康检查端点
- ✅ 契约合规性（请求/响应格式）
- ✅ 文档管理功能（上传、列表、获取、删除）
- ✅ 搜索功能
- ✅ 与 chatkit-middleware 的集成

### 2. 类型验证

验证生成的 TypeScript 类型是否正确：

```bash
npm run validate-types
# 或
bun run scripts/validate-contract-types.ts
```

### 3. 集成测试

运行集成测试脚本（包含与 orchestrator 的集成测试）：

```bash
./scripts/test-integration.sh
```

## 详细验证步骤

### 步骤 1: 健康检查

```bash
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

### 步骤 2: 契约合规性验证

#### 2.1 搜索接口

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "测试查询",
    "limit": 5,
    "token_budget": 1000
  }' | jq .
```

预期响应（符合 `ProviderSearchResponse` 契约）：
```json
{
  "provider_name": "customer_kb",
  "chunks": [
    {
      "chunk_id": "doc_xxx_chunk_0",
      "content": "...",
      "score": 0.95,
      "document_id": "doc_xxx",
      "document_title": "...",
      "metadata": {}
    }
  ],
  "total_tokens": 150
}
```

#### 2.2 错误响应验证

```bash
# 测试无效请求
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"invalid": "request"}' | jq .
```

预期响应（符合 `ErrorResponse` 契约）：
```json
{
  "error": "Missing required fields: user_id and query",
  "code": "INVALID_REQUEST"
}
```

### 步骤 3: 文档管理验证

#### 3.1 上传文档

```bash
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试文档",
    "content": "这是测试文档的内容...",
    "category": "test",
    "description": "测试用文档"
  }' | jq .
```

预期响应（符合 `DocumentUploadResponse` 契约）：
```json
{
  "document_id": "doc_xxx",
  "status": "indexed",
  "chunks_count": 3,
  "message": "Document indexed successfully with 3 chunks"
}
```

#### 3.2 列出文档

```bash
curl "http://localhost:8080/documents?limit=10&offset=0" | jq .
```

预期响应（符合 `DocumentListResponse` 契约）：
```json
{
  "documents": [
    {
      "document_id": "doc_xxx",
      "title": "测试文档",
      "status": "indexed",
      "chunks_count": 3,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

#### 3.3 获取文档

```bash
curl "http://localhost:8080/documents/{document_id}" | jq .
```

#### 3.4 删除文档

```bash
curl -X DELETE "http://localhost:8080/documents/{document_id}" | jq .
```

### 步骤 4: 搜索功能验证

```bash
# 等待索引完成（通常几秒钟）
sleep 3

# 搜索
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "测试",
    "limit": 5
  }' | jq .
```

验证点：
- ✅ 返回的 chunks 包含相关文档
- ✅ score 在 0-1 范围内
- ✅ 每个 chunk 包含必需的字段（chunk_id, content, score）
- ✅ total_tokens 正确计算

### 步骤 5: 集成验证

#### 5.1 与 Orchestrator 集成

确保 orchestrator 正在运行并配置了 knowledgebase URL：

```bash
# 设置环境变量
export KNOWLEDGE_PROVIDER_URL=http://localhost:8080

# 启动 orchestrator
cd ../chatkit-middleware
KNOWLEDGE_PROVIDER_URL=http://localhost:8080 \
  bun run services/enterprise/orchestrator/src/index.ts
```

测试完整流程：

```bash
curl -X POST http://localhost:26102/flows/inbound/execute \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test-user" \
  -H "X-Request-ID: test-123" \
  -H "X-Jurisdiction: US" \
  -d '{
    "message": "测试文档包含什么内容？",
    "query": "测试文档包含什么内容？"
  }' | jq .
```

验证点：
- ✅ orchestrator 成功调用 knowledgebase
- ✅ 返回的响应包含知识库检索的内容
- ✅ 流程完整执行

## 验证检查清单

### 基础功能
- [ ] 健康检查端点正常响应
- [ ] 所有 API 端点可访问
- [ ] 错误处理正确（返回符合契约的错误响应）

### 契约合规性
- [ ] 请求格式符合 OpenAPI 契约
- [ ] 响应格式符合 OpenAPI 契约
- [ ] 必需字段都存在
- [ ] 类型验证通过（运行 `npm run validate-types`）

### 文档管理
- [ ] 可以上传文档
- [ ] 文档正确分块和索引
- [ ] 可以列出文档
- [ ] 可以获取文档详情
- [ ] 可以删除文档

### 搜索功能
- [ ] 搜索返回相关结果
- [ ] 分数计算正确
- [ ] token 预算限制生效
- [ ] limit 参数生效
- [ ] 空查询返回空结果

### 集成
- [ ] 与 txtai 服务正常通信
- [ ] 与 orchestrator 集成正常
- [ ] 在完整流程中正常工作

## 常见问题

### Q: 健康检查返回 "degraded" 状态

**原因**: txtai 服务不可用

**解决**:
```bash
# 检查 txtai 是否运行
docker ps | grep txtai

# 启动 txtai
docker run -d -p 8000:8000 neuml/txtai-api
```

### Q: 搜索返回空结果

**原因**: 文档未正确索引

**解决**:
1. 检查文档上传是否成功（status 应为 "indexed"）
2. 等待几秒钟让索引完成
3. 检查 txtai 日志

### Q: 契约类型验证失败

**原因**: 生成的类型与代码不匹配

**解决**:
```bash
# 重新生成类型
npm run generate-contracts

# 检查代码是否使用正确的类型
npm run validate-types
```

### Q: 集成测试失败

**原因**: orchestrator 未配置 knowledgebase URL

**解决**:
```bash
# 设置环境变量
export KNOWLEDGE_PROVIDER_URL=http://localhost:8080

# 重启 orchestrator
```

## 自动化验证

### CI/CD 集成

在 CI/CD 流水线中添加验证步骤：

```yaml
# .github/workflows/validate.yml
- name: Validate Service
  run: |
    # 启动服务
    bun run dev &
    sleep 5
    
    # 运行验证
    npm run validate
    
    # 验证类型
    npm run validate-types
```

### 预提交钩子

添加 pre-commit 钩子自动验证：

```bash
#!/bin/bash
# .git/hooks/pre-commit

# 验证类型
bun run scripts/validate-contract-types.ts

if [ $? -ne 0 ]; then
  echo "Type validation failed. Please fix before committing."
  exit 1
fi
```

## 性能验证

### 响应时间

```bash
# 测试搜索响应时间
time curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test", "query": "test", "limit": 5}'
```

预期：
- 健康检查: < 100ms
- 搜索: < 500ms
- 文档上传: < 2s（取决于文档大小）

### 并发测试

```bash
# 使用 Apache Bench 测试并发
ab -n 100 -c 10 -p search.json -T application/json \
  http://localhost:8080/provider/search
```

## 相关文档

- [README.md](../README.md) - 服务概述和快速开始
- [contracts/knowledge-provider.yaml](../contracts/knowledge-provider.yaml) - OpenAPI 契约
- [scripts/test-integration.sh](../scripts/test-integration.sh) - 集成测试脚本

