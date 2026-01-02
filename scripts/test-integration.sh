#!/bin/bash
# Knowledge Base Integration Test Script

set -e

KNOWLEDGEBASE_URL="${KNOWLEDGEBASE_URL:-http://localhost:8080}"
ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://localhost:26102}"

echo "🧪 Knowledge Base Integration Test"
echo "=================================="
echo ""

# Step 1: Health check
echo "1️⃣ Checking knowledgebase health..."
HEALTH=$(curl -s "${KNOWLEDGEBASE_URL}/provider/health")
echo "   Health: $HEALTH"
echo ""

# Step 2: Upload test document
echo "2️⃣ Uploading test document..."
UPLOAD_RESULT=$(curl -s -X POST "${KNOWLEDGEBASE_URL}/documents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "ChatKit 使用指南",
    "content": "ChatKit 是一个企业级对话平台。主要功能包括：1. 智能对话 - 基于大语言模型的智能问答系统。2. 知识库检索 - 支持 RAG 增强检索，可以从企业知识库中检索相关信息。3. 多轮对话 - 支持上下文理解，能够进行连贯的多轮对话。使用方法：首先登录系统，在主界面的对话框中输入您的问题，系统会结合知识库内容给出专业回答。",
    "category": "product_docs"
  }')
echo "   Upload result: $UPLOAD_RESULT"
echo ""

# Step 3: Test search
echo "3️⃣ Testing knowledge search..."
SEARCH_RESULT=$(curl -s -X POST "${KNOWLEDGEBASE_URL}/provider/search" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "query": "ChatKit 有哪些功能",
    "limit": 3
  }')
echo "   Search result: $SEARCH_RESULT"
echo ""

# Step 4: List documents
echo "4️⃣ Listing documents..."
DOCS=$(curl -s "${KNOWLEDGEBASE_URL}/documents")
echo "   Documents: $DOCS"
echo ""

echo "✅ Knowledgebase tests completed!"
echo ""

# Step 5: Test orchestrator (if available)
echo "5️⃣ Testing orchestrator integration (optional)..."
ORCH_HEALTH=$(curl -s "${ORCHESTRATOR_URL}/health" 2>/dev/null || echo "Orchestrator not running")
if [[ "$ORCH_HEALTH" == *"status"* ]]; then
  echo "   Orchestrator is running"
  echo "   Testing inbound flow..."
  
  FLOW_RESULT=$(curl -s -X POST "${ORCHESTRATOR_URL}/flows/inbound/execute" \
    -H "Content-Type: application/json" \
    -H "X-User-ID: test-user" \
    -H "X-Request-ID: test-$(date +%s)" \
    -d '{
      "message": "ChatKit 有哪些功能？",
      "query": "ChatKit 有哪些功能？"
    }' 2>/dev/null || echo "Flow execution failed")
  
  echo "   Flow result: $FLOW_RESULT"
else
  echo "   ⚠️ Orchestrator not available, skipping flow test"
  echo "   To test the full flow, start orchestrator with:"
  echo "   cd chatkit-middleware/services/enterprise/orchestrator"
  echo "   KNOWLEDGE_PROVIDER_URL=http://localhost:8080 bun run src/index.ts"
fi

echo ""
echo "🎉 Integration test completed!"

