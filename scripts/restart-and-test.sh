#!/bin/bash

# 重启服务并测试多模态功能

BASE_URL="http://localhost:8080"
PORT=8080

echo "=== 重启服务并测试多模态功能 ==="
echo ""

# 1. 停止现有服务
echo "1. 停止现有服务..."
PID=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$PID" ]; then
  echo "   找到运行中的服务 (PID: $PID)，正在停止..."
  kill $PID 2>/dev/null
  sleep 2
  # 强制杀死如果还在运行
  if kill -0 $PID 2>/dev/null; then
    kill -9 $PID 2>/dev/null
    echo "   强制停止服务"
  fi
  echo "   ✓ 服务已停止"
else
  echo "   ℹ 没有运行中的服务"
fi
echo ""

# 2. 等待端口释放
echo "2. 等待端口释放..."
for i in {1..5}; do
  if ! lsof -ti:$PORT >/dev/null 2>&1; then
    echo "   ✓ 端口已释放"
    break
  fi
  sleep 1
done
echo ""

# 3. 启动服务（后台运行）
echo "3. 启动服务..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
mkdir -p logs
bun run dev > logs/knowledgebase.log 2>&1 &
NEW_PID=$!
echo "   服务已启动 (PID: $NEW_PID)"
echo "   日志文件: logs/knowledgebase.log"
echo ""

# 4. 等待服务启动
echo "4. 等待服务启动..."
for i in {1..30}; do
  if curl -s "$BASE_URL/provider/health" > /dev/null 2>&1; then
    echo "   ✓ 服务已就绪"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "   ✗ 服务启动超时"
    echo "   查看日志: tail -f logs/knowledgebase.log"
    exit 1
  fi
  sleep 1
  echo -n "   ."
done
echo ""
echo ""

# 5. 测试健康检查
echo "5. 测试健康检查..."
HEALTH=$(curl -s "$BASE_URL/provider/health")
echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
echo ""

# 6. 测试文本上传
echo "6. 测试文本上传..."
TEXT_RESPONSE=$(curl -s -X POST "$BASE_URL/documents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "重启后测试文档",
    "content": "这是服务重启后的测试文档，用于验证功能是否正常。",
    "category": "test"
  }')
echo "$TEXT_RESPONSE" | jq '.' 2>/dev/null || echo "$TEXT_RESPONSE"
TEXT_DOC_ID=$(echo "$TEXT_RESPONSE" | jq -r '.document_id // empty')
if [ -n "$TEXT_DOC_ID" ] && [ "$TEXT_DOC_ID" != "null" ]; then
  echo "   ✓ 文本上传成功，文档ID: $TEXT_DOC_ID"
else
  echo "   ✗ 文本上传失败"
fi
echo ""

# 7. 检查文档详情中的 media_type
if [ -n "$TEXT_DOC_ID" ] && [ "$TEXT_DOC_ID" != "null" ]; then
  echo "7. 检查文档详情..."
  DOC_DETAIL=$(curl -s "$BASE_URL/documents/$TEXT_DOC_ID")
  MEDIA_TYPE=$(echo "$DOC_DETAIL" | jq -r '.media_type // "null"')
  echo "   media_type: $MEDIA_TYPE"
  if [ "$MEDIA_TYPE" != "null" ]; then
    echo "   ✓ media_type 字段存在"
  else
    echo "   ⚠ media_type 字段缺失"
  fi
  echo ""
fi

# 8. 测试图片上传
echo "8. 测试图片上传..."
# 创建测试图片
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

if [ -f /tmp/test_image.png ]; then
  IMAGE_RESPONSE=$(curl -s -X POST "$BASE_URL/documents" \
    -F "title=重启后测试图片" \
    -F "file=@/tmp/test_image.png" \
    -F "category=test")
  echo "$IMAGE_RESPONSE" | jq '.' 2>/dev/null || echo "$IMAGE_RESPONSE"
  IMAGE_DOC_ID=$(echo "$IMAGE_RESPONSE" | jq -r '.document_id // empty')
  
  if [ -n "$IMAGE_DOC_ID" ] && [ "$IMAGE_DOC_ID" != "null" ]; then
    echo "   ✓ 图片上传成功，文档ID: $IMAGE_DOC_ID"
    
    # 检查图片文档详情
    IMAGE_DOC=$(curl -s "$BASE_URL/documents/$IMAGE_DOC_ID")
    IMAGE_MEDIA_TYPE=$(echo "$IMAGE_DOC" | jq -r '.media_type // "null"')
    IMAGE_MEDIA_URL=$(echo "$IMAGE_DOC" | jq -r '.media_url // "null"')
    echo "   media_type: $IMAGE_MEDIA_TYPE"
    echo "   media_url: $IMAGE_MEDIA_URL"
    
    if [ "$IMAGE_MEDIA_TYPE" != "null" ] && [ "$IMAGE_MEDIA_TYPE" = "image" ]; then
      echo "   ✓ 图片文档 media_type 正确"
    fi
    
    if [ "$IMAGE_MEDIA_URL" != "null" ]; then
      echo "   ✓ 图片文档 media_url 存在"
    fi
  else
    echo "   ✗ 图片上传失败"
    echo "   错误详情: $IMAGE_RESPONSE"
  fi
else
  echo "   ✗ 无法创建测试图片"
fi
echo ""

# 9. 测试搜索功能
echo "9. 测试搜索功能..."
SEARCH_RESPONSE=$(curl -s -X POST "$BASE_URL/provider/search" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "测试",
    "limit": 3
  }')
echo "$SEARCH_RESPONSE" | jq '.' 2>/dev/null || echo "$SEARCH_RESPONSE"

# 检查搜索结果中的 media_type
FIRST_CHUNK_MEDIA_TYPE=$(echo "$SEARCH_RESPONSE" | jq -r '.chunks[0].media_type // "null"')
if [ "$FIRST_CHUNK_MEDIA_TYPE" != "null" ]; then
  echo "   ✓ 搜索结果包含 media_type 字段: $FIRST_CHUNK_MEDIA_TYPE"
else
  echo "   ⚠ 搜索结果缺少 media_type 字段"
fi
echo ""

echo "=== 测试完成 ==="
echo ""
echo "服务 PID: $NEW_PID"
echo "查看日志: tail -f logs/knowledgebase.log"
echo "停止服务: kill $NEW_PID"

