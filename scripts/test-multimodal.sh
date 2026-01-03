#!/bin/bash

# 多模态搜索功能测试脚本

BASE_URL="http://localhost:8080"
echo "=== Knowledgebase 多模态搜索功能测试 ==="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试 1: 健康检查
echo -e "${YELLOW}测试 1: 健康检查${NC}"
HEALTH=$(curl -s "$BASE_URL/provider/health")
echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
echo ""

# 测试 2: 上传文本文档
echo -e "${YELLOW}测试 2: 上传文本文档${NC}"
TEXT_RESPONSE=$(curl -s -X POST "$BASE_URL/documents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "产品使用指南",
    "content": "这是一个产品使用指南。产品支持多种功能，包括文本搜索、图片搜索和视频搜索。用户可以通过界面进行操作。",
    "category": "product_docs"
  }')
echo "$TEXT_RESPONSE" | jq '.' 2>/dev/null || echo "$TEXT_RESPONSE"
TEXT_DOC_ID=$(echo "$TEXT_RESPONSE" | jq -r '.document_id' 2>/dev/null)
echo "文档ID: $TEXT_DOC_ID"
echo ""

# 测试 3: 创建测试图片文件（简单的 SVG 转 PNG 或使用 base64）
echo -e "${YELLOW}测试 3: 上传图片文件${NC}"
# 创建一个简单的测试图片（1x1 PNG）
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" | base64 -d > /tmp/test_image.png 2>/dev/null || echo "无法创建测试图片，跳过图片上传测试"

if [ -f /tmp/test_image.png ]; then
  IMAGE_RESPONSE=$(curl -s -X POST "$BASE_URL/documents" \
    -F "title=产品界面截图" \
    -F "file=@/tmp/test_image.png" \
    -F "category=images" \
    -F "description=产品主界面截图")
  echo "$IMAGE_RESPONSE" | jq '.' 2>/dev/null || echo "$IMAGE_RESPONSE"
  IMAGE_DOC_ID=$(echo "$IMAGE_RESPONSE" | jq -r '.document_id' 2>/dev/null)
  echo "图片文档ID: $IMAGE_DOC_ID"
else
  echo -e "${RED}跳过图片上传测试（无法创建测试图片）${NC}"
  IMAGE_DOC_ID=""
fi
echo ""

# 测试 4: 列出所有文档
echo -e "${YELLOW}测试 4: 列出所有文档${NC}"
LIST_RESPONSE=$(curl -s "$BASE_URL/documents?limit=10")
echo "$LIST_RESPONSE" | jq '.' 2>/dev/null || echo "$LIST_RESPONSE"
echo ""

# 测试 5: 搜索功能（文本查询）
echo -e "${YELLOW}测试 5: 搜索功能（文本查询：产品）${NC}"
SEARCH_RESPONSE=$(curl -s -X POST "$BASE_URL/provider/search" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "产品",
    "limit": 5
  }')
echo "$SEARCH_RESPONSE" | jq '.' 2>/dev/null || echo "$SEARCH_RESPONSE"
echo ""

# 测试 6: 验证搜索结果包含媒体类型信息
echo -e "${YELLOW}测试 6: 验证搜索结果结构${NC}"
HAS_MEDIA_TYPE=$(echo "$SEARCH_RESPONSE" | jq '.chunks[0].media_type // empty' 2>/dev/null)
if [ -n "$HAS_MEDIA_TYPE" ]; then
  echo -e "${GREEN}✓ 搜索结果包含 media_type 字段${NC}"
else
  echo -e "${YELLOW}⚠ 搜索结果未包含 media_type 字段（可能是文本文档）${NC}"
fi

HAS_MEDIA_URL=$(echo "$SEARCH_RESPONSE" | jq '.chunks[0].media_url // empty' 2>/dev/null)
if [ -n "$HAS_MEDIA_URL" ]; then
  echo -e "${GREEN}✓ 搜索结果包含 media_url 字段${NC}"
else
  echo -e "${YELLOW}⚠ 搜索结果未包含 media_url 字段（文本文档不需要）${NC}"
fi
echo ""

# 测试 7: 获取文档详情
if [ -n "$TEXT_DOC_ID" ]; then
  echo -e "${YELLOW}测试 7: 获取文档详情${NC}"
  DOC_RESPONSE=$(curl -s "$BASE_URL/documents/$TEXT_DOC_ID")
  echo "$DOC_RESPONSE" | jq '.' 2>/dev/null || echo "$DOC_RESPONSE"
  echo ""
fi

# 测试 8: 测试媒体文件访问
if [ -n "$IMAGE_DOC_ID" ]; then
  echo -e "${YELLOW}测试 8: 测试媒体文件访问${NC}"
  # 获取文档详情以获取媒体URL
  IMAGE_DOC=$(curl -s "$BASE_URL/documents/$IMAGE_DOC_ID")
  MEDIA_URL=$(echo "$IMAGE_DOC" | jq -r '.media_url // empty' 2>/dev/null)
  
  if [ -n "$MEDIA_URL" ] && [ "$MEDIA_URL" != "null" ]; then
    # 提取文件名
    FILENAME=$(basename "$MEDIA_URL")
    MEDIA_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/media/$IMAGE_DOC_ID/$FILENAME")
    if [ "$MEDIA_RESPONSE" = "200" ]; then
      echo -e "${GREEN}✓ 媒体文件可以正常访问${NC}"
    else
      echo -e "${RED}✗ 媒体文件访问失败 (HTTP $MEDIA_RESPONSE)${NC}"
    fi
  else
    echo -e "${YELLOW}⚠ 文档未包含 media_url${NC}"
  fi
  echo ""
fi

echo -e "${GREEN}=== 测试完成 ===${NC}"

