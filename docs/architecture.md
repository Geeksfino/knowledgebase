# 架构概述

本文档描述 Knowledge Base Provider 服务的整体架构和核心组件。

## 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    Knowledge Base Provider                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │   Handlers  │   │   Services  │   │    Utils    │           │
│  ├─────────────┤   ├─────────────┤   ├─────────────┤           │
│  │ • health    │   │ • txtai     │   │ • logger    │           │
│  │ • search    │   │ • document  │   │ • token     │           │
│  │ • documents │   │   processor │   │   counter   │           │
│  │             │   │ • document  │   │ • mime-types│           │
│  │             │   │   store     │   │             │           │
│  │             │   │ • query     │   │             │           │
│  │             │   │   processor │   │             │           │
│  │             │   │ • media     │   │             │           │
│  │             │   │   processor │   │             │           │
│  │             │   │ • file      │   │             │           │
│  │             │   │   storage   │   │             │           │
│  └─────────────┘   └─────────────┘   └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  txtai   │        │   LLM    │        │   File   │
    │  Vector  │        │ Adapter  │        │  System  │
    │  Search  │        │(optional)│        │          │
    └──────────┘        └──────────┘        └──────────┘
```

## 核心组件

### 1. Handlers（请求处理器）

负责处理 HTTP 请求，实现 API 端点逻辑。

#### health.ts
- 健康检查端点
- 检测 txtai 服务可用性
- 返回服务状态和文档统计

#### search.ts
- 知识库搜索端点
- 支持混合搜索（向量 + BM25）
- 支持多查询融合
- Token 预算控制

#### documents.ts
- 文档管理端点
- 支持 JSON 文本上传和文件上传
- 文档列表、详情、删除操作

### 2. Services（业务服务）

核心业务逻辑实现。

#### txtai-service.ts
txtai 向量检索服务封装：
- `search()` - 纯向量搜索
- `hybridSearch()` - 混合搜索（向量 + BM25）
- `index()` - 文档索引
- `indexMultimodal()` - 多模态索引
- `delete()` - 删除索引
- `healthCheck()` - 健康检查

#### document-processor.ts
文档处理服务：
- 文本分块（支持中英文）
- 智能重叠（保持上下文连贯）
- 媒体文件处理适配

#### document-store.ts
文档元数据存储（内存存储）：
- 文档 CRUD 操作
- 分块 ID 管理
- 生产环境建议替换为数据库

#### query-processor.ts
智能查询处理服务：
- LLM 查询扩展（生成多个查询变体）
- LLM 查询重写（优化检索效果）
- 规则回退（LLM 不可用时）

#### media-processor.ts
多媒体处理服务：
- 图片处理（OCR、描述生成）
- 视频处理（帧提取）
- 文档解析（PDF、Word）

#### file-storage.ts
文件存储服务：
- 媒体文件存储和读取
- 目录管理
- 文件清理

### 3. Utils（工具函数）

通用工具函数。

#### logger.ts
- 统一日志格式
- 支持 debug/info/warn/error 级别
- JSON 结构化日志

#### token-counter.ts
- Token 计数估算
- 支持中英文混合文本
- Token 预算截断

#### mime-types.ts
- MIME 类型映射
- 文件类型检测
- 类型判断工具函数

## 数据流

### 搜索流程

```
用户查询
    │
    ▼
┌─────────────────┐
│ Query Processor │ ─── LLM 查询扩展/重写（可选）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  txtai Service  │ ─── 混合搜索（向量 + BM25）
└─────────────────┘
    │
    ▼
┌─────────────────┐
│ Document Store  │ ─── 补充文档元数据
└─────────────────┘
    │
    ▼
搜索结果（带元数据和分数）
```

### 文档上传流程

```
用户上传
    │
    ├─── JSON 文本 ───┐
    │                 │
    └─── 文件上传 ────┤
                      ▼
            ┌─────────────────┐
            │ Media Processor │ ─── 文件类型检测和处理
            └─────────────────┘
                      │
                      ▼
            ┌─────────────────┐
            │Document Processor│ ─── 文本分块
            └─────────────────┘
                      │
                      ▼
            ┌─────────────────┐
            │  txtai Service  │ ─── 向量索引
            └─────────────────┘
                      │
                      ▼
            ┌─────────────────┐
            │ Document Store  │ ─── 存储元数据
            └─────────────────┘
                      │
                      ▼
            ┌─────────────────┐
            │  File Storage   │ ─── 保存媒体文件（如有）
            └─────────────────┘
```

## 扩展点

### 替换存储后端

当前 `document-store.ts` 使用内存存储，生产环境可替换为：
- PostgreSQL
- MongoDB
- Redis

### 自定义媒体处理

扩展 `media-processor.ts` 以支持：
- 自定义 OCR 引擎（Tesseract、PaddleOCR）
- 图片描述模型（CLIP、BLIP）
- 音频转写（Whisper）

### 外部 LLM 集成

配置 `query-processor.ts` 连接不同的 LLM 服务：
- OpenAI API
- 本地部署的 LLM
- 其他兼容接口

## 与 chatkit-middleware 集成

Knowledge Base Provider 作为外部知识源集成到 chatkit-middleware 的 Context Assembly 流程：

```
chatkit-middleware
        │
        ▼
┌───────────────────┐
│ Context Assembler │
└───────────────────┘
        │
        ▼ POST /provider/search
┌───────────────────┐
│  Knowledge Base   │
│    Provider       │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ 搜索结果作为上下文 │
│ 注入到 LLM 提示   │
└───────────────────┘
```

