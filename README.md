# Knowledge Base Provider

外部知识库 Provider 服务，基于 txtai 实现向量检索，用于与 chatkit-middleware 集成。

## 概述

该服务实现了标准的 Knowledge Provider 接口，可以作为外部知识库 Provider 集成到 chatkit-middleware 的 Context Assembly 流程中。

### 特性

- **混合搜索**：结合向量搜索（语义相似度）和关键词搜索（BM25），提供更准确的搜索结果
- **多模态支持**：支持文本、图片和视频的搜索和索引
- 基于 txtai 的向量检索（支持多模态嵌入）
- 支持文档上传和管理（文本和文件上传）
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

# 方式 1: 使用真实的 txtai 服务（推荐）
docker run -d -p 8000:8000 neuml/txtai-api

# 方式 2: 使用 mock txtai 服务（用于测试，无需真实 txtai）
bun run mock-txtai

# 启动开发服务
bun run dev
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/provider/health` | GET | 健康检查 |
| `/provider/search` | POST | 搜索知识库（支持文本、图片、视频） |
| `/documents` | GET | 列出文档 |
| `/documents` | POST | 上传文档（支持文本 JSON 或文件上传） |
| `/documents/:id` | GET | 获取文档详情 |
| `/documents/:id` | DELETE | 删除文档 |
| `/media/:documentId/:filename` | GET | 获取媒体文件（图片/视频） |

### 搜索接口

搜索接口使用**混合搜索**（Hybrid Search），结合了：
- **向量搜索**：基于语义相似度的检索，理解查询意图
- **关键词搜索**（BM25）：基于关键词匹配的精确检索

```bash
curl -X POST http://localhost:8080/provider/search \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user-123",
    "query": "如何使用产品",
    "limit": 5
  }'
```

**响应示例：**
```json
{
  "provider_name": "customer_kb",
  "chunks": [
    {
      "chunk_id": "doc1_chunk_0",
      "content": "...",
      "score": 0.85,
      "document_id": "doc1",
      "document_title": "产品使用指南",
      "media_type": "text",
      "metadata": {}
    },
    {
      "chunk_id": "img1_chunk_0",
      "content": "产品截图",
      "score": 0.82,
      "document_id": "img1",
      "document_title": "产品界面截图",
      "media_type": "image",
      "media_url": "http://localhost:8080/media/img1/screenshot.png",
      "metadata": {}
    }
  ],
  "total_tokens": 150,
  "metadata": {
    "search_mode": "hybrid",
    "results_count": 5,
    "min_score": 0.3
  }
}
```

> **注意**：如果 txtai 服务未配置混合搜索，系统会自动降级为纯向量搜索，确保向后兼容。

### 上传文档

#### 方式 1: 上传文本内容（JSON）

```bash
curl -X POST http://localhost:8080/documents \
  -H "Content-Type: application/json" \
  -d '{
    "title": "产品使用指南",
    "content": "这是产品使用指南的内容...",
    "category": "product_docs"
  }'
```

#### 方式 2: 上传文件（multipart/form-data）

支持上传图片、视频等多媒体文件：

```bash
# 上传图片
curl -X POST http://localhost:8080/documents \
  -F "title=产品截图" \
  -F "file=@screenshot.png" \
  -F "category=images"

# 上传视频
curl -X POST http://localhost:8080/documents \
  -F "title=产品演示视频" \
  -F "file=@demo.mp4" \
  -F "category=videos" \
  -F "description=产品功能演示"
```

**支持的文件类型：**
- **图片**：jpg, jpeg, png, gif, webp
- **视频**：mp4, avi, mov
- **文本**：txt, pdf 等

**响应示例：**
```json
{
  "document_id": "doc_abc123",
  "status": "indexed",
  "chunks_count": 1,
  "message": "File indexed successfully with 1 chunks"
}
```

## 配置

### 环境变量配置

服务通过环境变量进行配置。有两种方式：

#### 方式 1: 使用 .env 文件（开发环境推荐）

1. **复制配置模板**：
   ```bash
   cp env.example .env
   ```

2. **编辑配置**：
   ```bash
   nano .env  # 根据本地环境修改
   ```

3. **启动服务**：
   ```bash
   bun run dev  # 服务会自动读取 .env 文件
   ```

#### 方式 2: 使用环境变量（生产环境推荐）

在启动服务前设置环境变量：

```bash
export PORT=8080
export TXTAI_URL=http://txtai:8000
export PROVIDER_NAME=production_kb
bun run start
```

### 配置项说明

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
| `MEDIA_PATH` | ./data/media | 媒体文件存储路径 |
| `MEDIA_BASE_URL` | http://localhost:8080/media | 媒体文件访问基础URL |
| `MAX_FILE_SIZE` | 10485760 | 最大文件大小（字节，默认 10MB） |

> 📖 **详细配置说明**：查看 [环境配置文档](docs/environment-configuration.md) 了解完整的配置选项和生产环境部署指南。

## 目录结构

```
knowledgebase/
├── contracts/                  # OpenAPI 契约
│   └── knowledge-provider.yaml
├── src/                        # 源代码
│   ├── index.ts               # 主服务入口
│   ├── config.ts              # 配置管理
│   ├── handlers/              # 请求处理器
│   │   ├── health.ts
│   │   ├── search.ts
│   │   └── documents.ts
│   ├── services/              # 业务服务
│   │   ├── txtai-service.ts
│   │   ├── document-processor.ts
│   │   ├── document-store.ts
│   │   ├── media-processor.ts
│   │   └── file-storage.ts
│   └── utils/                 # 工具函数
│       ├── logger.ts
│       └── token-counter.ts
├── docs/                      # 文档目录
│   ├── README.md              # 文档索引
│   ├── environment-configuration.md
│   ├── feature-summary.md
│   └── ...                    # 更多文档
├── scripts/                   # 脚本目录
│   ├── README.md              # 脚本说明
│   ├── validate-service.sh
│   ├── test-complete.sh
│   └── ...                    # 更多脚本
├── test-tools/                # 测试工具
│   └── mock-txtai.ts
├── docker-compose.yml         # Docker 编排
├── Dockerfile                 # 镜像构建
├── txtai-config.yml          # txtai 配置
├── env.example               # 环境变量模板
└── package.json
```

> 📖 **详细说明**：查看 [文件组织文档](docs/file-organization.md) 了解完整的目录结构和使用说明。

## 多模态搜索功能

### 图片搜索

系统支持图片的语义搜索。上传的图片会被处理并生成向量嵌入，可以通过文本查询搜索相关图片。

**示例：**
- 上传产品截图，可以通过"产品界面"、"登录页面"等文本查询找到相关图片
- 支持基于图片内容的语义理解，而不仅仅是文件名匹配

### 视频搜索

视频文件会被处理，提取关键帧并生成向量嵌入。可以通过文本查询搜索视频内容。

**处理流程：**
1. 视频上传后，系统提取关键帧（默认 10 帧）
2. 每帧作为图片处理，生成向量嵌入
3. 搜索时，可以匹配到相关的视频帧

### 混合搜索

搜索接口支持同时返回文本、图片和视频结果，结果按相关性排序。

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

### 多模态功能测试

测试多模态搜索功能（图片和视频）：

```bash
# 重启服务并运行基本测试
./scripts/restart-and-test.sh

# 运行完整功能测试
./scripts/test-complete.sh
```

详细测试指南请参考：[多模态测试文档](docs/multimodal-testing.md)

## 文档和脚本

### 文档目录 (`docs/`)

项目文档位于 `docs/` 目录，包含完整的功能说明、测试指南和配置文档。

**快速导航**：
- 📚 [文档索引](docs/README.md) - 所有文档的完整索引和分类
- ⚙️ [环境配置指南](docs/environment-configuration.md) - 环境变量配置和生产部署
- 🧪 [测试指南](docs/testing-guide.md) - 测试流程和最佳实践
- 📋 [文件组织说明](docs/file-organization.md) - 项目文件结构说明

**完整文档列表**：查看 [docs/README.md](docs/README.md)

### 脚本目录 (`scripts/`)

测试和工具脚本位于 `scripts/` 目录，用于服务验证、测试和类型生成。

**常用脚本**：
- `validate-service.sh` - 全面的服务验证（推荐用于部署前检查）
- `restart-and-test.sh` - 重启服务并运行基本测试
- `test-complete.sh` - 完整的多模态功能测试
- `test-multimodal-search.sh` - 多模态搜索验证
- `generate-contracts.sh` - 生成 TypeScript 类型定义

**完整脚本说明**：查看 [scripts/README.md](scripts/README.md)

## 许可证

MIT

