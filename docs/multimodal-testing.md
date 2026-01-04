# 多模态测试文档

本文档说明如何测试 Knowledge Base Provider 的多模态搜索功能。

## 支持的媒体类型

| 类型 | 扩展名 | MIME 类型 |
|------|--------|-----------|
| 图片 | jpg, jpeg | image/jpeg |
| 图片 | png | image/png |
| 图片 | gif | image/gif |
| 图片 | webp | image/webp |
| 视频 | mp4 | video/mp4 |
| 视频 | avi | video/x-msvideo |
| 视频 | mov | video/quicktime |
| 文档 | pdf | application/pdf |
| 文档 | doc | application/msword |
| 文档 | docx | application/vnd.openxmlformats-officedocument.wordprocessingml.document |

## 图片上传和搜索

### 上传图片

```bash
curl -X POST http://localhost:8080/documents \
  -F "title=产品界面截图" \
  -F "file=@screenshot.png" \
  -F "description=产品主页面的用户界面截图"
```

**响应示例：**
```json
{
  "document_id": "doc_xxx",
  "status": "indexed",
  "chunks_count": 1,
  "message": "File indexed successfully with 1 chunks"
}
```

### 搜索图片

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "用户界面"
  }'
```

**响应示例：**
```json
{
  "provider_name": "customer_kb",
  "chunks": [
    {
      "chunk_id": "doc_xxx_chunk_0",
      "content": "产品界面截图。产品主页面的用户界面截图。图片: screenshot.png",
      "score": 0.82,
      "document_id": "doc_xxx",
      "document_title": "产品界面截图",
      "media_type": "image",
      "media_url": "http://localhost:8080/media/doc_xxx/screenshot.png",
      "metadata": {}
    }
  ],
  "total_tokens": 25,
  "metadata": {
    "search_mode": "hybrid",
    "results_count": 1,
    "min_score": 0.3
  }
}
```

### 访问图片

```bash
curl http://localhost:8080/media/{document_id}/{filename}
```

## PDF 文档测试

### 上传 PDF

```bash
curl -X POST http://localhost:8080/documents \
  -F "title=用户手册" \
  -F "file=@manual.pdf" \
  -F "category=documentation"
```

### 搜索 PDF 内容

PDF 内容会被提取并索引，支持全文搜索：

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "安装步骤"
  }'
```

## Word 文档测试

### 上传 DOCX

```bash
curl -X POST http://localhost:8080/documents \
  -F "title=技术规格" \
  -F "file=@specification.docx"
```

### 注意事项

- DOCX 格式完全支持
- DOC（旧格式）支持有限，建议转换为 DOCX

## 视频测试

### 上传视频

```bash
curl -X POST http://localhost:8080/documents \
  -F "title=产品演示视频" \
  -F "file=@demo.mp4" \
  -F "description=产品功能演示"
```

### 视频处理说明

当前实现：
- 视频作为整体索引
- 使用标题和描述进行检索

未来增强（需要额外配置）：
- 关键帧提取
- 音频转写（需要 Whisper）
- 帧级别搜索

## 混合搜索测试

### 准备测试数据

```bash
# 上传文本文档
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "产品功能说明",
    "content": "我们的产品支持多种功能，包括数据分析、报表生成、用户管理等。",
    "category": "docs"
  }'

# 上传图片
curl -X POST http://localhost:8080/documents \
  -F "title=功能截图" \
  -F "file=@feature.png" \
  -F "description=数据分析功能界面"

# 上传 PDF
curl -X POST http://localhost:8080/documents \
  -F "title=详细文档" \
  -F "file=@details.pdf"
```

### 执行混合搜索

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "数据分析功能",
    "limit": 10
  }'
```

**期望结果：**
- 返回文本、图片、PDF 等多种类型的结果
- 按相关性分数排序
- 每个结果包含 `media_type` 字段

## 测试脚本

### 完整多模态测试

```bash
#!/bin/bash

BASE_URL="http://localhost:8080"

echo "=== 多模态测试开始 ==="

# 创建测试文件
echo "测试文本内容" > test.txt

# 如果有测试图片
# cp /path/to/test.png ./test.png

echo -e "\n=== 1. 上传文本 ==="
curl -s -X POST $BASE_URL/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "文本文档",
    "content": "这是一个测试文本文档",
    "category": "text"
  }' | jq .

echo -e "\n=== 2. 上传文本文件 ==="
curl -s -X POST $BASE_URL/documents \
  -F "title=文本文件" \
  -F "file=@test.txt" | jq .

echo -e "\n=== 3. 列出所有文档 ==="
curl -s $BASE_URL/documents | jq .

echo -e "\n=== 4. 搜索测试 ==="
curl -s -X POST $BASE_URL/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test",
    "query": "测试"
  }' | jq .

echo -e "\n=== 5. 检查 media_type 字段 ==="
curl -s -X POST $BASE_URL/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test",
    "query": "测试"
  }' | jq '.chunks[] | {chunk_id, media_type, media_url}'

# 清理
rm -f test.txt

echo -e "\n=== 多模态测试完成 ==="
```

## 媒体文件访问测试

### 验证媒体 URL

```bash
# 从搜索结果获取 media_url
MEDIA_URL=$(curl -s -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test",
    "query": "图片"
  }' | jq -r '.chunks[0].media_url')

# 访问媒体文件
curl -I $MEDIA_URL
```

### 验证响应头

```bash
curl -I http://localhost:8080/media/{document_id}/{filename}
```

**期望响应头：**
```
HTTP/1.1 200 OK
Content-Type: image/png
Content-Length: 12345
```

## 常见问题

### 图片搜索不到

1. 确保上传时提供了有意义的 title 和 description
2. 检查 txtai 多模态索引是否启用
3. 降低 MIN_SEARCH_SCORE 阈值

### PDF 内容提取失败

1. 检查 PDF 是否为扫描版（需要 OCR）
2. 确保 pdf-parse 库正确安装
3. 检查 PDF 文件是否损坏

### 媒体文件无法访问

1. 检查 MEDIA_BASE_URL 配置
2. 确认文件已正确保存
3. 检查文件权限

