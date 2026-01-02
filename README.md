# Knowledge Base Provider

外部知识库 Provider 服务，基于 txtai 实现向量检索，用于与 chatkit-middleware 集成。

## 概述

该服务实现了标准的 Knowledge Provider 接口，可以作为外部知识库 Provider 集成到 chatkit-middleware 的 Context Assembly 流程中。

### 特性

- 基于 txtai 的向量检索
- 支持文档上传和管理
- 标准 OpenAPI 接口
- Docker 独立部署（txtai 内部端口不对外暴露）
- 与 chatkit-middleware 技术栈同构（TypeScript + Bun）

## 快速开始

### 使用 Docker Compose（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 本地开发

```bash
# 安装依赖
bun install

# 启动 txtai 服务（需要单独运行）
docker run -d -p 8000:8000 neuml/txtai-api

# 启动开发服务
bun run dev
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/provider/health` | GET | 健康检查 |
| `/provider/search` | POST | 搜索知识库 |
| `/documents` | GET | 列出文档 |
| `/documents` | POST | 上传文档 |
| `/documents/:id` | GET | 获取文档详情 |
| `/documents/:id` | DELETE | 删除文档 |

### 搜索接口

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "query": "如何使用产品",
    "limit": 5
  }'
```

### 上传文档

```bash
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "产品使用指南",
    "content": "这是产品使用指南的内容...",
    "category": "product_docs"
  }'
```

## 配置

通过环境变量配置：

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `PORT` | 8080 | 服务端口 |
| `HOST` | 0.0.0.0 | 绑定地址 |
| `TXTAI_URL` | http://localhost:8000 | txtai 服务地址 |
| `PROVIDER_NAME` | customer_kb | Provider 名称 |
| `CHUNK_SIZE` | 500 | 文档分块大小 |
| `CHUNK_OVERLAP` | 50 | 分块重叠字符数 |
| `MIN_SEARCH_SCORE` | 0.3 | 最小搜索分数阈值 |

## 目录结构

```
knowledgebase/
├── contracts/                  # OpenAPI 契约
│   └── knowledge-provider.yaml
├── src/
│   ├── index.ts               # 主服务入口
│   ├── config.ts              # 配置管理
│   ├── handlers/              # 请求处理器
│   │   ├── health.ts
│   │   ├── search.ts
│   │   └── documents.ts
│   ├── services/              # 业务服务
│   │   ├── txtai-service.ts
│   │   ├── document-processor.ts
│   │   └── document-store.ts
│   └── utils/                 # 工具函数
│       ├── logger.ts
│       └── token-counter.ts
├── docker-compose.yml         # Docker 编排
├── Dockerfile                 # 镜像构建
├── txtai-config.yml          # txtai 配置
└── package.json
```

## 与 chatkit-middleware 集成

### 1. 网络连接方式

#### 方式 A: 通过主机端口（推荐）

在 chatkit-middleware 的环境变量中配置：

```bash
KNOWLEDGE_BASE_URL=http://host.docker.internal:8080
```

#### 方式 B: Docker 网络连接

创建共享网络：

```bash
docker network create shared-network
```

修改两个项目的 docker-compose.yml 使用该网络。

### 2. Flow 配置

在 chatkit-middleware 的 flow 配置中添加 Provider：

```yaml
# flows/inbound.yaml
steps:
  - service: ai.infer
    providers:
      knowledge_base:
        - name: customer_kb
          type: http
          url: ${KNOWLEDGE_BASE_URL}
          enabled: true
          priority: 1
          timeout_ms: 5000
```

### 3. Context Assembly 集成

Context Assembly Service 会调用 `/provider/search` 端点获取知识库上下文。

## 端口说明

| 服务 | 内部端口 | 外部端口 | 说明 |
|------|---------|---------|------|
| txtai | 8000 | 无 | 仅内部网络访问 |
| knowledgebase | 8080 | 8080 | Provider API 对外暴露 |

## 开发

### 生成类型

```bash
bun run generate-types
```

### 运行测试

```bash
bun test
```

### 验证服务

运行综合验证脚本（推荐）：

```bash
# 确保服务正在运行
bun run dev

# 在另一个终端运行验证
npm run validate
```

验证包括：
- 健康检查
- 契约合规性验证
- API 端点测试
- 集成测试

详细验证指南请参考：[验证文档](docs/validation.md)

## 许可证

MIT

