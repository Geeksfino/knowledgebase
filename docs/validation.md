# 验证文档

本文档说明如何验证 Knowledge Base Provider 服务的正确性和契约合规性。

## 验证类型

### 1. 健康检查验证

验证服务是否正常运行：

```bash
curl -s http://localhost:8080/provider/health | jq .
```

**期望结果：**
- `status` 为 "healthy" 或 "degraded"
- `txtai.available` 显示 txtai 状态
- `documents.count` 显示文档数量

### 2. 契约合规性验证

验证 API 响应是否符合 OpenAPI 契约。

#### 搜索响应验证

```bash
# 执行搜索
RESPONSE=$(curl -s -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test",
    "query": "test"
  }')

# 验证必需字段
echo $RESPONSE | jq -e '.provider_name' && echo "✓ provider_name exists"
echo $RESPONSE | jq -e '.chunks' && echo "✓ chunks exists"
echo $RESPONSE | jq -e '.total_tokens' && echo "✓ total_tokens exists"
echo $RESPONSE | jq -e '.metadata' && echo "✓ metadata exists"
```

#### 文档上传响应验证

```bash
RESPONSE=$(curl -s -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test",
    "content": "Test content"
  }')

echo $RESPONSE | jq -e '.document_id' && echo "✓ document_id exists"
echo $RESPONSE | jq -e '.status' && echo "✓ status exists"
```

### 3. 功能验证

#### 完整流程验证脚本

```bash
#!/bin/bash
set -e

BASE_URL="http://localhost:8080"
PASSED=0
FAILED=0

check() {
  if [ $? -eq 0 ]; then
    echo "✓ $1"
    ((PASSED++))
  else
    echo "✗ $1"
    ((FAILED++))
  fi
}

echo "=== Knowledge Base Provider 验证 ==="
echo ""

# 1. 健康检查
echo "--- 健康检查 ---"
STATUS=$(curl -s $BASE_URL/provider/health | jq -r '.status')
[ "$STATUS" = "healthy" ] || [ "$STATUS" = "degraded" ]
check "健康检查返回有效状态"

# 2. 文档上传
echo ""
echo "--- 文档上传 ---"
DOC_RESPONSE=$(curl -s -X POST $BASE_URL/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "验证测试文档",
    "content": "这是用于验证的测试文档内容。包含一些关键词：产品、功能、测试。",
    "category": "validation"
  }')

DOC_ID=$(echo $DOC_RESPONSE | jq -r '.document_id')
DOC_STATUS=$(echo $DOC_RESPONSE | jq -r '.status')

[ -n "$DOC_ID" ] && [ "$DOC_ID" != "null" ]
check "文档上传返回 document_id"

[ "$DOC_STATUS" = "indexed" ]
check "文档状态为 indexed"

# 3. 文档列表
echo ""
echo "--- 文档列表 ---"
LIST_RESPONSE=$(curl -s $BASE_URL/documents)
TOTAL=$(echo $LIST_RESPONSE | jq -r '.total')

[ "$TOTAL" -gt 0 ]
check "文档列表返回文档"

# 4. 文档详情
echo ""
echo "--- 文档详情 ---"
DOC_DETAIL=$(curl -s $BASE_URL/documents/$DOC_ID)
DOC_TITLE=$(echo $DOC_DETAIL | jq -r '.title')

[ "$DOC_TITLE" = "验证测试文档" ]
check "文档详情返回正确标题"

# 5. 搜索功能
echo ""
echo "--- 搜索功能 ---"
SEARCH_RESPONSE=$(curl -s -X POST $BASE_URL/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "validator",
    "query": "产品功能"
  }')

PROVIDER=$(echo $SEARCH_RESPONSE | jq -r '.provider_name')
CHUNKS=$(echo $SEARCH_RESPONSE | jq -r '.chunks | length')

[ -n "$PROVIDER" ] && [ "$PROVIDER" != "null" ]
check "搜索返回 provider_name"

[ "$CHUNKS" -ge 0 ]
check "搜索返回 chunks 数组"

# 6. 错误处理
echo ""
echo "--- 错误处理 ---"
ERROR_RESPONSE=$(curl -s -X POST $BASE_URL/provider/search \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test"}')

ERROR_CODE=$(echo $ERROR_RESPONSE | jq -r '.code')
[ "$ERROR_CODE" = "INVALID_REQUEST" ]
check "缺少必填字段返回正确错误"

# 7. 文档删除
echo ""
echo "--- 文档删除 ---"
DELETE_RESPONSE=$(curl -s -X DELETE $BASE_URL/documents/$DOC_ID)
SUCCESS=$(echo $DELETE_RESPONSE | jq -r '.success')

[ "$SUCCESS" = "true" ]
check "文档删除成功"

# 8. 删除后验证
NOT_FOUND=$(curl -s $BASE_URL/documents/$DOC_ID | jq -r '.code')
[ "$NOT_FOUND" = "NOT_FOUND" ]
check "删除后文档不存在"

# 结果汇总
echo ""
echo "=== 验证结果 ==="
echo "通过: $PASSED"
echo "失败: $FAILED"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
```

### 4. 性能验证

#### 响应时间验证

```bash
# 搜索响应时间（应 < 1秒）
time curl -s -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test", "query": "test"}' > /dev/null
```

#### 并发验证

```bash
# 使用 Apache Bench 进行并发测试
ab -n 100 -c 10 -p search.json -T application/json \
  http://localhost:8080/provider/search
```

## 验证检查清单

### 部署前检查

- [ ] 服务健康检查通过
- [ ] txtai 服务可用
- [ ] 文档上传功能正常
- [ ] 搜索功能正常
- [ ] 媒体文件访问正常
- [ ] 错误响应格式正确

### 契约合规检查

- [ ] 搜索响应包含所有必需字段
- [ ] 上传响应包含 document_id 和 status
- [ ] 错误响应包含 error 和 code
- [ ] CORS 头正确设置

### 功能完整性检查

- [ ] 文本文档上传和搜索
- [ ] 图片上传和搜索
- [ ] PDF 上传和内容提取
- [ ] 文档删除和清理
- [ ] Token 预算限制生效

## 常见问题排查

### 健康检查失败

```bash
# 检查 txtai 连接
curl http://localhost:8000/

# 检查配置
echo $TXTAI_URL
```

### 搜索无结果

```bash
# 检查文档数量
curl http://localhost:8080/documents | jq '.total'

# 检查最小分数配置
echo $MIN_SEARCH_SCORE
```

### 上传失败

```bash
# 检查文件大小限制
echo $MAX_FILE_SIZE

# 检查存储目录权限
ls -la ./data/
```

## 自动化验证

### CI/CD 集成

```yaml
# .github/workflows/validate.yml
name: Validate Service

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Start services
        run: docker-compose up -d
        
      - name: Wait for services
        run: sleep 10
        
      - name: Run validation
        run: ./scripts/validate-service.sh
        
      - name: Stop services
        run: docker-compose down
```

### 定期验证

```bash
# cron job: 每小时验证一次
0 * * * * /path/to/validate-service.sh >> /var/log/kb-validation.log 2>&1
```

