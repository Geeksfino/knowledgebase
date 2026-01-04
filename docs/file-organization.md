# 文件组织说明

本文档详细说明 Knowledge Base Provider 项目的文件结构和各文件的职责。

## 目录结构

```
knowledgebase/
├── contracts/                  # OpenAPI 契约定义
│   └── knowledge-provider.yaml # Provider API 契约
│
├── src/                        # 源代码目录
│   ├── index.ts               # 主服务入口
│   ├── config.ts              # 配置管理
│   │
│   ├── handlers/              # 请求处理器
│   │   ├── health.ts          # 健康检查处理
│   │   ├── search.ts          # 搜索请求处理
│   │   └── documents.ts       # 文档管理处理
│   │
│   ├── services/              # 业务服务层
│   │   ├── txtai-service.ts   # txtai 向量检索封装
│   │   ├── document-processor.ts  # 文档分块处理
│   │   ├── document-store.ts  # 文档元数据存储
│   │   ├── query-processor.ts # 智能查询处理
│   │   ├── media-processor.ts # 多媒体文件处理
│   │   └── file-storage.ts    # 文件存储服务
│   │
│   ├── types/                 # TypeScript 类型定义
│   │
│   └── utils/                 # 工具函数
│       ├── logger.ts          # 日志工具
│       ├── token-counter.ts   # Token 计数
│       └── mime-types.ts      # MIME 类型工具
│
├── libs/                       # 库和生成代码
│   └── contracts-ts/          # TypeScript 类型生成
│       ├── generated/         # 从 OpenAPI 生成的类型
│       ├── index.ts           # 导出入口
│       └── package.json       # 包配置
│
├── data/                       # 数据目录
│   ├── documents/             # 文档存储
│   └── media/                 # 媒体文件存储
│       └── {document_id}/     # 按文档 ID 组织
│
├── docs/                       # 项目文档
│   ├── README.md              # 文档索引
│   ├── architecture.md        # 架构说明
│   ├── environment-configuration.md  # 环境配置
│   ├── file-organization.md   # 文件组织（本文档）
│   ├── feature-summary.md     # 功能概述
│   ├── testing-guide.md       # 测试指南
│   ├── multimodal-testing.md  # 多模态测试
│   ├── api-reference.md       # API 参考
│   └── validation.md          # 验证文档
│
├── scripts/                    # 脚本目录
│   └── generate-contracts.sh  # 类型生成脚本
│
├── test-tools/                 # 测试工具
│   └── mock-txtai.ts          # txtai 模拟服务
│
├── logs/                       # 日志目录
│
├── docker-compose.yml          # Docker 编排配置
├── Dockerfile                  # Docker 镜像定义
├── txtai-config.yml           # txtai 配置
├── env.example                # 环境变量模板
├── package.json               # 项目配置
├── tsconfig.json              # TypeScript 配置
├── bun.lock                   # Bun 依赖锁
└── README.md                  # 项目说明
```

## 源代码详解

### 入口文件

#### `src/index.ts`
- 服务主入口，启动 Bun HTTP 服务器
- 定义路由和请求处理
- 初始化服务组件
- 配置 CORS 头

### 配置

#### `src/config.ts`
- 集中管理所有配置项
- 从环境变量读取配置
- 提供类型安全的配置对象

### 处理器层 (Handlers)

#### `src/handlers/health.ts`
健康检查端点实现：
- 检测 txtai 服务状态
- 返回文档统计信息
- 返回服务版本信息

#### `src/handlers/search.ts`
搜索端点实现：
- 接收搜索请求
- 调用查询处理器优化查询
- 执行混合搜索
- 应用 Token 预算限制
- 返回格式化结果

#### `src/handlers/documents.ts`
文档管理端点实现：
- JSON 文本上传
- 文件上传（multipart/form-data）
- 文档列表查询
- 文档详情获取
- 文档删除

### 服务层 (Services)

#### `src/services/txtai-service.ts`
txtai API 封装：
- 向量搜索
- 混合搜索（带自动降级）
- 文档索引
- 多模态索引
- 索引删除
- 健康检查

#### `src/services/document-processor.ts`
文档处理服务：
- 文本清理和规范化
- 智能分块（按段落优先）
- 重叠处理（保持上下文）
- 媒体文件处理适配

#### `src/services/document-store.ts`
文档元数据管理：
- 内存存储（Map）
- CRUD 操作
- 分块 ID 管理
- 文档计数

#### `src/services/query-processor.ts`
智能查询处理：
- LLM 查询扩展
- LLM 查询重写
- 规则回退
- 多查询融合支持

#### `src/services/media-processor.ts`
多媒体处理：
- 文件类型检测
- 图片处理
- 视频帧提取
- PDF 解析
- Word 文档解析

#### `src/services/file-storage.ts`
文件存储管理：
- 目录初始化
- 文件保存
- 文件读取
- 文件删除
- 目录递归删除

### 工具层 (Utils)

#### `src/utils/logger.ts`
日志工具：
- 统一日志格式
- 支持多级别
- JSON 结构化输出

#### `src/utils/token-counter.ts`
Token 计数：
- 中英文混合估算
- Token 预算截断

#### `src/utils/mime-types.ts`
MIME 类型工具：
- 类型映射表
- 文件名到 MIME 转换
- 类型判断函数

## 契约和类型

### `contracts/knowledge-provider.yaml`
OpenAPI 3.0 契约定义：
- API 端点规范
- 请求/响应模式
- 错误响应定义

### `libs/contracts-ts/`
TypeScript 类型生成：
- 从 OpenAPI 生成
- 类型安全保证
- 契约优先开发

## 配置文件

### `docker-compose.yml`
Docker 服务编排：
- knowledgebase 服务配置
- txtai 服务配置
- 网络和卷配置

### `txtai-config.yml`
txtai 向量检索配置：
- 嵌入模型配置
- 索引参数
- 搜索参数

### `env.example`
环境变量模板：
- 所有可配置项
- 默认值说明
- 使用示例

