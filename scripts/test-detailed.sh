#!/bin/bash

# 详细测试脚本

BASE_URL="http://localhost:8080"

echo "=== 详细测试多模态功能 ==="
echo ""

# 测试 1: 上传新的文本文档
echo "1. 上传新的文本文档..."
TEXT_RESPONSE=$(curl -s -X POST "$BASE_URL/documents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试文档-文本",
    "content": "这是一个测试文档，用于验证多模态搜索功能。",
    "category": "test"
  }')
TEXT_DOC_ID=$(echo "$TEXT_RESPONSE" | jq -r '.document_id')
echo "文档ID: $TEXT_DOC_ID"
echo "响应: $TEXT_RESPONSE"
echo ""

# 测试 2: 获取文档详情（检查是否有 media_type）
echo "2. 获取文档详情..."
DOC_DETAIL=$(curl -s "$BASE_URL/documents/$TEXT_DOC_ID")
echo "$DOC_DETAIL" | jq '.'
MEDIA_TYPE=$(echo "$DOC_DETAIL" | jq -r '.media_type // "null"')
echo "media_type: $MEDIA_TYPE"
echo ""

# 测试 3: 搜索并检查结果
echo "3. 搜索测试文档..."
SEARCH_RESPONSE=$(curl -s -X POST "$BASE_URL/provider/search" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "测试文档",
    "limit": 3
  }')
echo "$SEARCH_RESPONSE" | jq '.'
echo ""

# 检查第一个结果的 media_type
FIRST_CHUNK_MEDIA_TYPE=$(echo "$SEARCH_RESPONSE" | jq -r '.chunks[0].media_type // "null"')
echo "第一个结果的 media_type: $FIRST_CHUNK_MEDIA_TYPE"
echo ""

# 测试 4: 尝试上传图片（使用 base64 编码的 1x1 PNG）
echo "4. 创建并上传测试图片..."
# 创建一个有效的 PNG 文件
cat > /tmp/create_png.js << 'EOF'
const fs = require('fs');
// 1x1 红色 PNG (最小有效 PNG)
const png = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, // ...
  0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT
  0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82 // IEND
]);
fs.writeFileSync('/tmp/test_image.png', png);
EOF

node /tmp/create_png.js 2>/dev/null || echo "使用 Python 创建图片..."

# 如果 node 不可用，使用 Python
if [ ! -f /tmp/test_image.png ] || [ ! -s /tmp/test_image.png ]; then
  python3 << 'PYEOF'
import struct
png = bytearray([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE,
  0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54,
  0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
])
with open('/tmp/test_image.png', 'wb') as f:
    f.write(png)
PYEOF
fi

if [ -f /tmp/test_image.png ] && [ -s /tmp/test_image.png ]; then
  echo "图片文件已创建: $(ls -lh /tmp/test_image.png)"
  IMAGE_RESPONSE=$(curl -s -X POST "$BASE_URL/documents" \
    -F "title=测试图片" \
    -F "file=@/tmp/test_image.png" \
    -F "category=test")
  echo "上传响应: $IMAGE_RESPONSE"
  IMAGE_DOC_ID=$(echo "$IMAGE_RESPONSE" | jq -r '.document_id // empty')
  
  if [ -n "$IMAGE_DOC_ID" ] && [ "$IMAGE_DOC_ID" != "null" ]; then
    echo "✓ 图片上传成功，文档ID: $IMAGE_DOC_ID"
    
    # 获取图片文档详情
    IMAGE_DOC=$(curl -s "$BASE_URL/documents/$IMAGE_DOC_ID")
    echo "图片文档详情:"
    echo "$IMAGE_DOC" | jq '.'
    IMAGE_MEDIA_TYPE=$(echo "$IMAGE_DOC" | jq -r '.media_type // "null"')
    IMAGE_MEDIA_URL=$(echo "$IMAGE_DOC" | jq -r '.media_url // "null"')
    echo "media_type: $IMAGE_MEDIA_TYPE"
    echo "media_url: $IMAGE_MEDIA_URL"
  else
    echo "✗ 图片上传失败"
  fi
else
  echo "✗ 无法创建测试图片文件"
fi
echo ""

echo "=== 测试完成 ==="

