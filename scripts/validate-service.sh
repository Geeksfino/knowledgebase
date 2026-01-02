#!/bin/bash
# Comprehensive Knowledge Base Service Validation Script
# Validates service health, API endpoints, contract compliance, and integration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KNOWLEDGEBASE_URL="${KNOWLEDGEBASE_URL:-http://localhost:8080}"
ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://localhost:26102}"
TXTAI_URL="${TXTAI_URL:-http://localhost:8000}"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_test() {
    echo -e "${YELLOW}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}  ✅ $1${NC}"
    ((TESTS_PASSED++))
}

print_error() {
    echo -e "${RED}  ❌ $1${NC}"
    ((TESTS_FAILED++))
}

print_info() {
    echo -e "  ℹ️  $1"
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed. Please install jq first.${NC}"
    exit 1
fi

print_header "🧪 Knowledge Base Service Validation"

echo "Configuration:"
echo "  Knowledge Base URL: $KNOWLEDGEBASE_URL"
echo "  Orchestrator URL: $ORCHESTRATOR_URL"
echo "  txtai URL: $TXTAI_URL"
echo ""

# ============================================================================
# 1. Health Checks
# ============================================================================
print_header "1️⃣  Health Checks"

# 1.1 Knowledge Base Health
print_test "Checking knowledgebase health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${KNOWLEDGEBASE_URL}/provider/health" 2>/dev/null || echo -e "\n000")
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)

if [ "$HEALTH_CODE" = "200" ]; then
    STATUS=$(echo "$HEALTH_BODY" | jq -r '.status' 2>/dev/null || echo "unknown")
    VERSION=$(echo "$HEALTH_BODY" | jq -r '.version' 2>/dev/null || echo "unknown")
    print_success "Health check passed (status: $STATUS, version: $VERSION)"
    echo "$HEALTH_BODY" | jq '.' 2>/dev/null || echo "$HEALTH_BODY"
else
    print_error "Health check failed (HTTP $HEALTH_CODE)"
    echo "$HEALTH_BODY"
fi
echo ""

# 1.2 txtai Health (if accessible)
print_test "Checking txtai service availability..."
TXTAI_HEALTH=$(curl -s "${TXTAI_URL}/" 2>/dev/null || echo "unavailable")
if [ "$TXTAI_HEALTH" != "unavailable" ]; then
    print_success "txtai service is accessible"
else
    print_info "txtai service not directly accessible (expected if running in Docker)"
fi
echo ""

# ============================================================================
# 2. Contract Compliance Tests
# ============================================================================
print_header "2️⃣  Contract Compliance Tests"

# 2.1 Provider Search Request/Response
print_test "Testing /provider/search endpoint (contract compliance)..."
SEARCH_REQUEST='{
  "user_id": "test-user-123",
  "query": "测试查询",
  "limit": 3,
  "token_budget": 1000
}'

SEARCH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${KNOWLEDGEBASE_URL}/provider/search" \
  -H "Content-Type: application/json" \
  -d "$SEARCH_REQUEST" 2>/dev/null || echo -e "\n000")

SEARCH_BODY=$(echo "$SEARCH_RESPONSE" | sed '$d')
SEARCH_CODE=$(echo "$SEARCH_RESPONSE" | tail -n 1)

if [ "$SEARCH_CODE" = "200" ]; then
    # Validate response structure matches contract
    PROVIDER_NAME=$(echo "$SEARCH_BODY" | jq -r '.provider_name' 2>/dev/null)
    CHUNKS=$(echo "$SEARCH_BODY" | jq -r '.chunks' 2>/dev/null)
    TOTAL_TOKENS=$(echo "$SEARCH_BODY" | jq -r '.total_tokens' 2>/dev/null)
    
    if [ "$PROVIDER_NAME" != "null" ] && [ "$CHUNKS" != "null" ] && [ "$TOTAL_TOKENS" != "null" ]; then
        print_success "Search response matches contract schema"
        echo "$SEARCH_BODY" | jq '.' 2>/dev/null || echo "$SEARCH_BODY"
    else
        print_error "Search response missing required fields (provider_name, chunks, total_tokens)"
    fi
else
    print_error "Search request failed (HTTP $SEARCH_CODE)"
    echo "$SEARCH_BODY"
fi
echo ""

# 2.2 Error Response (test invalid request)
print_test "Testing error response format (invalid request)..."
ERROR_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${KNOWLEDGEBASE_URL}/provider/search" \
  -H "Content-Type: application/json" \
  -d '{"invalid": "request"}' 2>/dev/null || echo -e "\n000")

ERROR_BODY=$(echo "$ERROR_RESPONSE" | sed '$d')
ERROR_CODE=$(echo "$ERROR_RESPONSE" | tail -n 1)

if [ "$ERROR_CODE" = "400" ]; then
    ERROR_MSG=$(echo "$ERROR_BODY" | jq -r '.error' 2>/dev/null)
    ERROR_CODE_FIELD=$(echo "$ERROR_BODY" | jq -r '.code' 2>/dev/null)
    
    if [ "$ERROR_MSG" != "null" ] && [ "$ERROR_CODE_FIELD" != "null" ]; then
        print_success "Error response matches contract schema"
        echo "$ERROR_BODY" | jq '.' 2>/dev/null || echo "$ERROR_BODY"
    else
        print_error "Error response missing required fields (error, code)"
    fi
else
    print_info "Expected 400 error, got HTTP $ERROR_CODE"
fi
echo ""

# ============================================================================
# 3. Document Management Tests
# ============================================================================
print_header "3️⃣  Document Management Tests"

# 3.1 Upload Document
print_test "Uploading test document..."
UPLOAD_REQUEST='{
  "title": "验证测试文档",
  "content": "这是一个用于验证知识库服务的测试文档。内容包含：1. 服务功能说明 2. API 使用示例 3. 集成指南。知识库服务支持向量检索和关键词检索的混合搜索。",
  "category": "test",
  "description": "验证测试用文档"
}'

UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${KNOWLEDGEBASE_URL}/documents" \
  -H "Content-Type: application/json" \
  -d "$UPLOAD_REQUEST" 2>/dev/null || echo -e "\n000")

UPLOAD_BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')
UPLOAD_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n 1)

if [ "$UPLOAD_CODE" = "200" ]; then
    DOC_ID=$(echo "$UPLOAD_BODY" | jq -r '.document_id' 2>/dev/null)
    STATUS=$(echo "$UPLOAD_BODY" | jq -r '.status' 2>/dev/null)
    
    if [ "$DOC_ID" != "null" ] && [ "$STATUS" != "null" ]; then
        print_success "Document uploaded (ID: $DOC_ID, Status: $STATUS)"
        echo "$UPLOAD_BODY" | jq '.' 2>/dev/null || echo "$UPLOAD_BODY"
        
        # Store document ID for later tests
        TEST_DOC_ID="$DOC_ID"
    else
        print_error "Upload response missing required fields"
    fi
else
    print_error "Document upload failed (HTTP $UPLOAD_CODE)"
    echo "$UPLOAD_BODY"
    TEST_DOC_ID=""
fi
echo ""

# 3.2 List Documents
print_test "Listing documents..."
LIST_RESPONSE=$(curl -s -w "\n%{http_code}" "${KNOWLEDGEBASE_URL}/documents?limit=10&offset=0" 2>/dev/null || echo -e "\n000")
LIST_BODY=$(echo "$LIST_RESPONSE" | sed '$d')
LIST_CODE=$(echo "$LIST_RESPONSE" | tail -n 1)

if [ "$LIST_CODE" = "200" ]; then
    TOTAL=$(echo "$LIST_BODY" | jq -r '.total' 2>/dev/null)
    DOCS_COUNT=$(echo "$LIST_BODY" | jq -r '.documents | length' 2>/dev/null)
    print_success "Documents listed (Total: $TOTAL, Returned: $DOCS_COUNT)"
    echo "$LIST_BODY" | jq '.documents[0]' 2>/dev/null || echo "$LIST_BODY"
else
    print_error "List documents failed (HTTP $LIST_CODE)"
fi
echo ""

# 3.3 Get Document (if upload succeeded)
if [ -n "$TEST_DOC_ID" ]; then
    print_test "Getting document details..."
    GET_RESPONSE=$(curl -s -w "\n%{http_code}" "${KNOWLEDGEBASE_URL}/documents/${TEST_DOC_ID}" 2>/dev/null || echo -e "\n000")
    GET_BODY=$(echo "$GET_RESPONSE" | sed '$d')
    GET_CODE=$(echo "$GET_RESPONSE" | tail -n 1)
    
    if [ "$GET_CODE" = "200" ]; then
        TITLE=$(echo "$GET_BODY" | jq -r '.title' 2>/dev/null)
        print_success "Document retrieved (Title: $TITLE)"
        echo "$GET_BODY" | jq '.' 2>/dev/null || echo "$GET_BODY"
    else
        print_error "Get document failed (HTTP $GET_CODE)"
    fi
    echo ""
fi

# 3.4 Search with uploaded document
if [ -n "$TEST_DOC_ID" ]; then
    print_test "Searching with uploaded document..."
    sleep 2  # Wait for indexing
    
    SEARCH_RESPONSE2=$(curl -s -w "\n%{http_code}" -X POST "${KNOWLEDGEBASE_URL}/provider/search" \
      -H "Content-Type: application/json" \
      -d '{
        "user_id": "test-user",
        "query": "验证测试",
        "limit": 5
      }' 2>/dev/null || echo -e "\n000")
    
    SEARCH_BODY2=$(echo "$SEARCH_RESPONSE2" | sed '$d')
    SEARCH_CODE2=$(echo "$SEARCH_RESPONSE2" | tail -n 1)
    
    if [ "$SEARCH_CODE2" = "200" ]; then
        CHUNKS_COUNT=$(echo "$SEARCH_BODY2" | jq -r '.chunks | length' 2>/dev/null)
        print_success "Search returned $CHUNKS_COUNT chunks"
        if [ "$CHUNKS_COUNT" -gt 0 ]; then
            echo "$SEARCH_BODY2" | jq '.chunks[0]' 2>/dev/null
        fi
    else
        print_error "Search failed (HTTP $SEARCH_CODE2)"
    fi
    echo ""
fi

# ============================================================================
# 4. Integration Tests
# ============================================================================
print_header "4️⃣  Integration Tests"

# 4.1 Orchestrator Integration (if available)
print_test "Testing orchestrator integration..."
ORCH_HEALTH=$(curl -s "${ORCHESTRATOR_URL}/health" 2>/dev/null || echo "unavailable")

if echo "$ORCH_HEALTH" | jq -e '.status' > /dev/null 2>&1; then
    print_success "Orchestrator is running"
    
    print_test "Testing inbound flow with knowledgebase..."
    FLOW_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${ORCHESTRATOR_URL}/flows/inbound/execute" \
      -H "Content-Type: application/json" \
      -H "X-User-ID: test-user" \
      -H "X-Request-ID: test-$(date +%s)" \
      -H "X-Jurisdiction: US" \
      -d '{
        "message": "验证测试文档包含什么内容？",
        "query": "验证测试文档包含什么内容？"
      }' 2>/dev/null || echo -e "\n000")
    
    FLOW_BODY=$(echo "$FLOW_RESPONSE" | sed '$d')
    FLOW_CODE=$(echo "$FLOW_RESPONSE" | tail -n 1)
    
    if [ "$FLOW_CODE" = "200" ]; then
        print_success "Flow execution succeeded"
        echo "$FLOW_BODY" | jq -r '.response' 2>/dev/null | head -c 200
        echo "..."
    else
        print_error "Flow execution failed (HTTP $FLOW_CODE)"
        echo "$FLOW_BODY"
    fi
else
    print_info "Orchestrator not available (expected if not running)"
    print_info "To test full integration, start orchestrator with:"
    print_info "  KNOWLEDGE_PROVIDER_URL=$KNOWLEDGEBASE_URL bun run services/enterprise/orchestrator/src/index.ts"
fi
echo ""

# ============================================================================
# 5. Summary
# ============================================================================
print_header "📊 Test Summary"

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED / $TOTAL_TESTS) * 100}")

echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo "Pass Rate: ${PASS_RATE}%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review the output above.${NC}"
    exit 1
fi

