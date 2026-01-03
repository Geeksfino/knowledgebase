# 多模态搜索功能测试指南

## 测试脚本

所有测试脚本位于 `scripts/` 目录：

### 1. 重启服务并测试
```bash
./scripts/restart-and-test.sh
```
重启服务并运行基本的多模态功能测试。

### 2. 完整功能测试
```bash
./scripts/test-complete.sh
```
运行完整的多模态功能测试，包括：
- 文本上传
- 图片上传
- 文档详情验证
- 搜索功能测试
- 媒体文件访问测试

### 3. 多模态测试
```bash
./scripts/test-multimodal.sh
```
原始的多模态搜索功能测试脚本。

### 4. 详细测试
```bash
./scripts/test-detailed.sh
```
详细的测试脚本，包含更多验证步骤。

## 测试结果

测试结果文档位于 `docs/` 目录：
- `docs/test-results.md` - 测试结果报告
- `docs/feature-summary.md` - 功能实现总结

## 手动测试

### 上传文本
```bash
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "产品使用指南",
    "content": "这是产品使用指南的内容...",
    "category": "product_docs"
  }'
```

### 上传图片
```bash
curl -X POST http://localhost:8080/documents \
  -F "title=产品截图" \
  -F "file=@screenshot.png" \
  -F "category=images"
```

### 搜索
```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "query": "产品",
    "limit": 5
  }'
```

### 访问媒体文件
```bash
curl http://localhost:8080/media/{documentId}/{filename}
```

## 验证要点

1. **文档上传**
   - 文本上传应返回 `document_id` 和 `status: "indexed"`
   - 图片上传应返回 `document_id` 和 `status: "indexed"`

2. **文档详情**
   - 文本文档应包含 `media_type: "text"`
   - 图片文档应包含 `media_type: "image"` 和 `media_url`

3. **搜索结果**
   - 搜索结果应包含 `media_type` 字段
   - 图片结果应包含 `media_url` 字段

4. **媒体文件访问**
   - 应能通过 URL 访问上传的媒体文件
   - HTTP 状态码应为 200

