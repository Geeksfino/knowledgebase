# 脚本说明

本文档说明 `scripts/` 目录下所有脚本的用途和使用方法。

## 脚本列表

### 契约生成脚本

### `generate-contracts.sh`
生成 TypeScript 类型定义从 OpenAPI 契约文件。

**用途**：
- 从 `contracts/knowledge-provider.yaml` 生成 TypeScript 类型
- 输出到 `libs/contracts-ts/generated/`

**使用方法**：
```bash
./scripts/generate-contracts.sh
```

**前置条件**：
- 需要安装 `openapi-typescript-codegen` 或类似工具
- 需要有效的 OpenAPI 契约文件

---

### 服务验证脚本

### `validate-service.sh`
全面的服务验证脚本，检查服务健康状态、API 端点、契约合规性和集成。

**用途**：
- 验证服务健康检查端点
- 测试所有 API 端点
- 验证契约类型合规性
- 检查与 txtai 服务的集成
- 验证多模态搜索功能

**使用方法**：
```bash
# 使用默认配置（localhost:8080）
./scripts/validate-service.sh

# 指定服务 URL
KNOWLEDGEBASE_URL=http://localhost:8080 ./scripts/validate-service.sh
```

**环境变量**：
- `KNOWLEDGEBASE_URL` - Knowledge Base 服务地址（默认：http://localhost:8080）
- `ORCHESTRATOR_URL` - Orchestrator 服务地址（默认：http://localhost:26102）
- `TXTAI_URL` - txtai 服务地址（默认：http://localhost:8000）

**输出**：
- 彩色输出显示测试结果
- 测试通过/失败统计
- 详细的错误信息

---

### 测试脚本

### `restart-and-test.sh`
重启服务并运行基本测试。

**用途**：
- 停止现有服务进程
- 启动新服务实例
- 运行基本健康检查和 API 测试

**使用方法**：
```bash
./scripts/restart-and-test.sh
```

**注意事项**：
- 会终止现有的服务进程
- 需要确保服务可以正常启动
- 日志输出到 `logs/knowledgebase.log`

---

### `test-complete.sh`
完整的多模态功能测试脚本。

**用途**：
- 测试文本文档上传
- 测试图片文档上传
- 测试文档详情查询
- 测试搜索功能
- 测试媒体文件访问

**使用方法**：
```bash
./scripts/test-complete.sh
```

**前置条件**：
- 服务必须正在运行（http://localhost:8080）
- txtai 服务必须可用

---

### `test-detailed.sh`
详细的测试脚本，包含更多测试用例。

**用途**：
- 执行详细的 API 测试
- 测试边界情况
- 测试错误处理
- 验证响应格式

**使用方法**：
```bash
./scripts/test-detailed.sh
```

---

### `test-hybrid-search.sh`
混合搜索功能测试脚本。

**用途**：
- 测试向量搜索（语义相似度）
- 测试关键词搜索（BM25）
- 测试混合搜索组合
- 验证搜索结果相关性

**使用方法**：
```bash
./scripts/test-hybrid-search.sh
```

---

### `test-integration.sh`
集成测试脚本。

**用途**：
- 测试与外部服务的集成
- 测试端到端流程
- 验证数据一致性

**使用方法**：
```bash
./scripts/test-integration.sh
```

---

### `test-multimodal.sh`
多模态搜索测试脚本。

**用途**：
- 测试图片搜索功能
- 测试视频搜索功能
- 测试文本搜索功能
- 验证多模态结果格式

**使用方法**：
```bash
./scripts/test-multimodal.sh
```

---

### `test-multimodal-search.sh`
专门的多模态搜索验证脚本。

**用途**：
- 上传文本和图片文档
- 执行文本查询搜索图片
- 验证 `media_type` 和 `media_url` 字段
- 测试媒体文件访问

**使用方法**：
```bash
./scripts/test-multimodal-search.sh
```

**特点**：
- 专注于多模态搜索功能验证
- 包含详细的输出和验证步骤

---

### 类型验证脚本

### `validate-contract-types.ts`
TypeScript 契约类型验证脚本。

**用途**：
- 验证生成的契约类型是否正确
- 检查类型定义完整性
- 验证类型导入路径

**使用方法**：
```bash
bun run scripts/validate-contract-types.ts
```

**前置条件**：
- 需要先运行 `generate-contracts.sh` 生成类型
- 需要 TypeScript 环境

---

## 脚本使用指南

### 运行顺序

1. **首次设置**：
   ```bash
   # 1. 生成契约类型
   ./scripts/generate-contracts.sh
   
   # 2. 验证类型
   bun run scripts/validate-contract-types.ts
   ```

2. **开发测试**：
   ```bash
   # 1. 重启服务并测试
   ./scripts/restart-and-test.sh
   
   # 2. 运行完整测试
   ./scripts/test-complete.sh
   ```

3. **功能验证**：
   ```bash
   # 测试特定功能
   ./scripts/test-multimodal-search.sh
   ./scripts/test-hybrid-search.sh
   ```

4. **部署前验证**：
   ```bash
   # 全面验证
   ./scripts/validate-service.sh
   ```

### 环境变量

大多数脚本支持通过环境变量配置：

```bash
# 设置服务地址
export KNOWLEDGEBASE_URL=http://localhost:8080
export TXTAI_URL=http://localhost:8000

# 运行测试
./scripts/test-complete.sh
```

### 日志输出

- 服务日志：`logs/knowledgebase.log`
- Mock txtai 日志：`logs/mock-txtai.log`
- 脚本输出：直接输出到控制台

### 错误处理

所有脚本都包含错误处理：
- 使用 `set -e` 在错误时退出
- 提供清晰的错误信息
- 返回适当的退出码

## 脚本维护

### 添加新脚本

1. 使用 `.sh` 扩展名（Shell 脚本）或 `.ts`（TypeScript 脚本）
2. 添加执行权限：`chmod +x scripts/your-script.sh`
3. 在本文档中添加说明
4. 遵循现有脚本的代码风格

### 脚本命名规范

- 使用小写字母和连字符：`test-multimodal-search.sh`
- 功能明确：`generate-contracts.sh` 而不是 `gen.sh`
- 测试脚本以 `test-` 开头
- 验证脚本以 `validate-` 开头

### 代码风格

- 使用 `#!/bin/bash` shebang
- 使用 `set -e` 进行错误处理
- 添加注释说明脚本用途
- 使用颜色输出提高可读性（参考 `validate-service.sh`）

## 故障排除

### 脚本无法执行

```bash
# 添加执行权限
chmod +x scripts/your-script.sh
```

### 服务未运行

```bash
# 检查服务状态
curl http://localhost:8080/provider/health

# 启动服务
bun run dev
```

### 契约类型未生成

```bash
# 重新生成类型
./scripts/generate-contracts.sh
```

## 相关文档

- [测试指南](../docs/testing-guide.md)
- [多模态测试指南](../docs/multimodal-testing.md)
- [环境配置](../docs/environment-configuration.md)

