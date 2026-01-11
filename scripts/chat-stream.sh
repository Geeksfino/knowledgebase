#!/usr/bin/env bash
#
# chat-stream.sh - 流式对话测试脚本
#
# Usage:
#   ./chat-stream.sh                        # 交互模式，持续对话
#   ./chat-stream.sh "你的问题"              # 单次问答
#
# 输入 q/quit/exit 退出
#
# Environment variables (可选):
#   KB_URL - 知识库服务地址 (默认: http://localhost:8080)
#

set -e

# 依赖检查
if ! command -v jq &> /dev/null; then
    echo "❌ 缺少依赖: jq"
    echo "   请安装: brew install jq"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo "❌ 缺少依赖: curl"
    exit 1
fi

# 配置
KB_URL="${KB_URL:-http://localhost:8080}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

# JSON 转义函数：处理特殊字符
json_escape() {
    local str="$1"
    printf '%s' "$str" | jq -Rs '.'
}

# 发送问题并获取流式回复
ask_question() {
    local query="$1"
    local thread_id="$2"
    local run_id="$3"
    
    # 转义用户输入
    local escaped_query
    escaped_query=$(json_escape "$query")
    escaped_query="${escaped_query:1:-1}"
    
    local has_output=false
    local sources_shown=false
    
    # 发送请求并流式输出
    curl -sN -X POST "${KB_URL}/chat" \
        -H "Content-Type: application/json" \
        -H "Accept: text/event-stream" \
        -d "{\"message\":\"${escaped_query}\",\"threadId\":\"${thread_id}\",\"runId\":\"${run_id}\"}" \
        | while IFS= read -r line; do
            [ -z "$line" ] && continue
            if [[ "$line" == data:* ]]; then
                json="${line#data: }"
                
                # 获取事件类型
                event_type=$(echo "$json" | jq -r '.type // empty' 2>/dev/null)
                
                case "$event_type" in
                    "RUN_STARTED")
                        # 运行开始
                        ;;
                    "TEXT_MESSAGE_START")
                        # 消息开始
                        if [ "$has_output" = false ]; then
                            echo -e "${YELLOW}🤖 AI 回复:${NC}"
                            has_output=true
                        fi
                        ;;
                    "TEXT_MESSAGE_CHUNK")
                        # 文本块 - 使用 delta 字段
                        delta=$(echo "$json" | jq -rj '.delta // empty' 2>/dev/null)
                        if [ -n "$delta" ]; then
                            printf '%s' "$delta"
                        fi
                        ;;
                    "TEXT_MESSAGE_END")
                        # 消息结束
                        echo ""
                        ;;
                    "RUN_FINISHED")
                        # 运行完成
                        ;;
                    "RUN_ERROR")
                        # 错误
                        error=$(echo "$json" | jq -r '.error // "Unknown error"' 2>/dev/null)
                        echo -e "${RED}❌ 错误: ${error}${NC}"
                        ;;
                    "CUSTOM")
                        # 自定义事件
                        event_name=$(echo "$json" | jq -r '.name // empty' 2>/dev/null)
                        if [ "$event_name" = "knowledge_sources" ] && [ "$sources_shown" = false ]; then
                            sources=$(echo "$json" | jq -r '.value // empty' 2>/dev/null)
                            if [ -n "$sources" ] && [ "$sources" != "null" ]; then
                                echo -e "${GRAY}📚 知识来源:${NC}"
                                echo "$sources" | jq -r '.[] | "   • \(.document_title // "未知") (相关度: \((.score * 100 | floor))%)"' 2>/dev/null
                                echo ""
                                sources_shown=true
                            fi
                        elif [ "$event_name" = "token_usage" ]; then
                            usage=$(echo "$json" | jq -c '.value // empty' 2>/dev/null)
                            if [ -n "$usage" ] && [ "$usage" != "null" ]; then
                                total=$(echo "$usage" | jq '.total_tokens // 0' 2>/dev/null)
                                echo -e "${GRAY}📊 Token: ${total}${NC}"
                            fi
                        fi
                        ;;
                esac
            fi
        done
    
    echo ""
}

# 健康检查
check_health() {
    local response
    response=$(curl -s "${KB_URL}/health" 2>/dev/null)
    
    if [ -z "$response" ]; then
        echo -e "${RED}❌ 服务不可用: ${KB_URL}${NC}"
        return 1
    fi
    
    local status
    status=$(echo "$response" | jq -r '.status // "unknown"')
    local llm_available
    llm_available=$(echo "$response" | jq -r '.llm.available // false')
    
    if [ "$status" = "healthy" ]; then
        echo -e "${GREEN}✓ 服务正常${NC}"
    elif [ "$status" = "degraded" ]; then
        echo -e "${YELLOW}⚠ 服务降级${NC}"
    else
        echo -e "${RED}✗ 服务异常${NC}"
    fi
    
    if [ "$llm_available" = "true" ]; then
        local provider model
        provider=$(echo "$response" | jq -r '.llm.provider // "unknown"')
        model=$(echo "$response" | jq -r '.llm.model // "unknown"')
        echo -e "${GREEN}✓ LLM: ${provider}/${model}${NC}"
    else
        echo -e "${RED}✗ LLM 不可用${NC}"
        return 1
    fi
    
    return 0
}

# 主程序
main() {
    # 生成会话 ID
    THREAD_ID="chat-$(date +%s)-$$"
    RUN_COUNT=0
    
    # 单次问答模式
    if [ -n "$1" ]; then
        check_health || exit 1
        echo ""
        RUN_COUNT=$((RUN_COUNT + 1))
        ask_question "$1" "$THREAD_ID" "run-${RUN_COUNT}"
        exit 0
    fi
    
    # 交互模式：持续对话
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}💬 知识库对话${NC} (输入 ${YELLOW}q${NC} 退出)"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # 检查服务状态
    check_health || exit 1
    echo ""
    
    while true; do
        # 使用 read -p 内置提示，\001 \002 包裹颜色代码让 readline 正确计算宽度
        read -erp $'\001\033[0;32m\002请输入问题: \001\033[0m\002' USER_QUERY
        
        # 检查退出命令
        case "$USER_QUERY" in
            q|quit|exit|Q|QUIT|EXIT)
                echo -e "${CYAN}👋 再见！${NC}"
                exit 0
                ;;
            "")
                # 空输入，继续
                continue
                ;;
        esac
        
        # 发送问题
        RUN_COUNT=$((RUN_COUNT + 1))
        ask_question "$USER_QUERY" "$THREAD_ID" "run-${RUN_COUNT}"
    done
}

main "$@"
