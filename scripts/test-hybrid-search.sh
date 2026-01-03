#!/bin/bash
# Hybrid Search Test Script for Knowledge Base
# Tests hybrid search functionality (vector + keyword)

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

KNOWLEDGEBASE_URL="${KNOWLEDGEBASE_URL:-http://localhost:8080}"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔍 混合搜索功能测试${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ Error: jq is required. Please install jq first.${NC}"
    exit 1
fi

# Step 1: Health Check
echo -e "${YELLOW}1️⃣  健康检查${NC}"
HEALTH=$(curl -s "${KNOWLEDGEBASE_URL}/provider/health" 2>/dev/null || echo "")
if [ -z "$HEALTH" ]; then
    echo -e "${RED}❌ 服务未运行，请先启动服务：${NC}"
    echo "   bun run dev"
    echo "   或"
    echo "   docker-compose up -d"
    exit 1
fi

STATUS=$(echo "$HEALTH" | jq -r '.status' 2>/dev/null || echo "unknown")
echo -e "${GREEN}✅ 服务状态: $STATUS${NC}"
echo ""

# Step 2: Upload test documents
echo -e "${YELLOW}2️⃣  上传测试文档${NC}"

# Document 1: Contains exact keyword "API 密钥"
echo "   上传文档 1: API 密钥配置指南..."
DOC1=$(curl -s -X POST "${KNOWLEDGEBASE_URL}/documents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "API 密钥配置指南",
    "content": "要配置 API 密钥，您需要：1. 登录系统 2. 进入设置页面 3. 输入您的 API 密钥。API 密钥是一个重要的安全凭证，请妥善保管。",
    "category": "docs"
  }')

DOC1_ID=$(echo "$DOC1" | jq -r '.document_id' 2>/dev/null)
if [ "$DOC1_ID" != "null" ] && [ -n "$DOC1_ID" ]; then
    echo -e "${GREEN}   ✅ 文档 1 上传成功 (ID: $DOC1_ID)${NC}"
else
    echo -e "${RED}   ❌ 文档 1 上传失败${NC}"
    echo "$DOC1" | jq '.' 2>/dev/null || echo "$DOC1"
fi

# Document 2: Semantic match (no exact keyword "API 密钥")
echo "   上传文档 2: 访问令牌设置..."
DOC2=$(curl -s -X POST "${KNOWLEDGEBASE_URL}/documents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "访问令牌设置",
    "content": "访问令牌用于身份验证。在配置页面中，您可以输入访问令牌来授权应用程序访问您的账户。访问令牌与 API 密钥功能类似，但使用不同的认证机制。",
    "category": "docs"
  }')

DOC2_ID=$(echo "$DOC2" | jq -r '.document_id' 2>/dev/null)
if [ "$DOC2_ID" != "null" ] && [ -n "$DOC2_ID" ]; then
    echo -e "${GREEN}   ✅ 文档 2 上传成功 (ID: $DOC2_ID)${NC}"
else
    echo -e "${RED}   ❌ 文档 2 上传失败${NC}"
fi

echo ""
echo "   等待索引完成..."
sleep 5
echo ""

# Step 3: Test Keyword Search (BM25 advantage)
echo -e "${YELLOW}3️⃣  测试关键词搜索（BM25 优势）${NC}"
echo "   查询: \"API 密钥\""
echo "   预期: 应该找到包含精确关键词的文档 1"

KEYWORD_RESULT=$(curl -s -X POST "${KNOWLEDGEBASE_URL}/provider/search" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "API 密钥",
    "limit": 5
  }')

SEARCH_MODE=$(echo "$KEYWORD_RESULT" | jq -r '.metadata.search_mode' 2>/dev/null)
CHUNKS_COUNT=$(echo "$KEYWORD_RESULT" | jq -r '.chunks | length' 2>/dev/null)

echo -e "   搜索模式: ${GREEN}$SEARCH_MODE${NC}"
echo -e "   结果数量: ${GREEN}$CHUNKS_COUNT${NC}"

if [ "$CHUNKS_COUNT" -gt 0 ]; then
    TOP_TITLE=$(echo "$KEYWORD_RESULT" | jq -r '.chunks[0].document_title' 2>/dev/null)
    TOP_SCORE=$(echo "$KEYWORD_RESULT" | jq -r '.chunks[0].score' 2>/dev/null)
    echo -e "   最高分文档: ${GREEN}$TOP_TITLE${NC} (分数: $TOP_SCORE)"
    
    # Check if document 1 is in results
    FOUND_DOC1=$(echo "$KEYWORD_RESULT" | jq -r '.chunks[] | select(.document_id == "'"$DOC1_ID"'") | .document_title' 2>/dev/null)
    if [ -n "$FOUND_DOC1" ]; then
        echo -e "   ${GREEN}✅ 找到包含关键词的文档 1${NC}"
    else
        echo -e "   ${YELLOW}⚠️  未找到文档 1（可能需要更多索引时间）${NC}"
    fi
else
    echo -e "   ${RED}❌ 未找到结果${NC}"
fi
echo ""

# Step 4: Test Semantic Search (Vector advantage)
echo -e "${YELLOW}4️⃣  测试语义搜索（向量搜索优势）${NC}"
echo "   查询: \"如何设置访问凭证\""
echo "   预期: 应该找到语义相关的文档 2（即使不包含精确关键词）"

SEMANTIC_RESULT=$(curl -s -X POST "${KNOWLEDGEBASE_URL}/provider/search" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "如何设置访问凭证",
    "limit": 5
  }')

SEMANTIC_MODE=$(echo "$SEMANTIC_RESULT" | jq -r '.metadata.search_mode' 2>/dev/null)
SEMANTIC_COUNT=$(echo "$SEMANTIC_RESULT" | jq -r '.chunks | length' 2>/dev/null)

echo -e "   搜索模式: ${GREEN}$SEMANTIC_MODE${NC}"
echo -e "   结果数量: ${GREEN}$SEMANTIC_COUNT${NC}"

if [ "$SEMANTIC_COUNT" -gt 0 ]; then
    SEMANTIC_TITLE=$(echo "$SEMANTIC_RESULT" | jq -r '.chunks[0].document_title' 2>/dev/null)
    SEMANTIC_SCORE=$(echo "$SEMANTIC_RESULT" | jq -r '.chunks[0].score' 2>/dev/null)
    echo -e "   最高分文档: ${GREEN}$SEMANTIC_TITLE${NC} (分数: $SEMANTIC_SCORE)"
    
    # Check if document 2 is in results
    FOUND_DOC2=$(echo "$SEMANTIC_RESULT" | jq -r '.chunks[] | select(.document_id == "'"$DOC2_ID"'") | .document_title' 2>/dev/null)
    if [ -n "$FOUND_DOC2" ]; then
        echo -e "   ${GREEN}✅ 找到语义相关的文档 2${NC}"
    else
        echo -e "   ${YELLOW}⚠️  未找到文档 2（可能需要更多索引时间）${NC}"
    fi
else
    echo -e "   ${RED}❌ 未找到结果${NC}"
fi
echo ""

# Step 5: Test Hybrid Search (Combined)
echo -e "${YELLOW}5️⃣  测试混合搜索（关键词 + 语义）${NC}"
echo "   查询: \"配置 API 密钥和访问令牌\""
echo "   预期: 应该同时找到文档 1 和文档 2"

HYBRID_RESULT=$(curl -s -X POST "${KNOWLEDGEBASE_URL}/provider/search" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "配置 API 密钥和访问令牌",
    "limit": 5
  }')

HYBRID_MODE=$(echo "$HYBRID_RESULT" | jq -r '.metadata.search_mode' 2>/dev/null)
HYBRID_COUNT=$(echo "$HYBRID_RESULT" | jq -r '.chunks | length' 2>/dev/null)

echo -e "   搜索模式: ${GREEN}$HYBRID_MODE${NC}"
echo -e "   结果数量: ${GREEN}$HYBRID_COUNT${NC}"

if [ "$HYBRID_COUNT" -gt 0 ]; then
    echo "   找到的文档:"
    echo "$HYBRID_RESULT" | jq -r '.chunks[] | "     - \(.document_title) (分数: \(.score), ID: \(.document_id))"' 2>/dev/null
    
    FOUND_BOTH=$(echo "$HYBRID_RESULT" | jq -r '.chunks[] | .document_id' 2>/dev/null | grep -E "^($DOC1_ID|$DOC2_ID)$" | wc -l)
    if [ "$FOUND_BOTH" -ge 2 ]; then
        echo -e "   ${GREEN}✅ 混合搜索成功找到两个文档${NC}"
    elif [ "$FOUND_BOTH" -eq 1 ]; then
        echo -e "   ${YELLOW}⚠️  只找到一个文档（可能需要更多索引时间）${NC}"
    else
        echo -e "   ${YELLOW}⚠️  未找到预期文档（可能需要更多索引时间）${NC}"
    fi
else
    echo -e "   ${RED}❌ 未找到结果${NC}"
fi
echo ""

# Step 6: Verify search mode
echo -e "${YELLOW}6️⃣  验证搜索模式${NC}"
if [ "$HYBRID_MODE" = "hybrid" ]; then
    echo -e "   ${GREEN}✅ 搜索模式正确: hybrid${NC}"
    echo "   说明: 混合搜索已启用（向量 + 关键词）"
elif [ "$HYBRID_MODE" = "vector" ]; then
    echo -e "   ${YELLOW}⚠️  搜索模式: vector（已降级为纯向量搜索）${NC}"
    echo "   说明: txtai 可能未配置混合搜索，系统自动降级为向量搜索"
else
    echo -e "   ${RED}❌ 未知搜索模式: $HYBRID_MODE${NC}"
fi
echo ""

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 测试总结${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "搜索模式: $HYBRID_MODE"
echo "关键词搜索结果: $CHUNKS_COUNT 个"
echo "语义搜索结果: $SEMANTIC_COUNT 个"
echo "混合搜索结果: $HYBRID_COUNT 个"
echo ""

if [ "$HYBRID_MODE" = "hybrid" ]; then
    echo -e "${GREEN}✅ 混合搜索功能正常工作！${NC}"
else
    echo -e "${YELLOW}⚠️  混合搜索已降级为向量搜索${NC}"
    echo "   如需启用混合搜索，请检查 txtai 配置（txtai-config.yml）"
fi
echo ""

