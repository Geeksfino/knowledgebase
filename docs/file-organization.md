# 文件组织结构

## 目录结构

### 测试脚本 (`scripts/`)

所有测试和工具脚本位于 `scripts/` 目录：

- `README.md` - 脚本说明文档（**详细说明每个脚本的用途**）
- `generate-contracts.sh` - 生成 TypeScript 类型定义
- `restart-and-test.sh` - 重启服务并运行基本测试
- `test-complete.sh` - 完整的多模态功能测试
- `test-detailed.sh` - 详细的测试脚本
- `test-hybrid-search.sh` - 混合搜索测试
- `test-integration.sh` - 集成测试
- `test-multimodal.sh` - 多模态搜索测试
- `test-multimodal-search.sh` - 专门的多模态搜索验证脚本
- `validate-service.sh` - 服务验证脚本
- `validate-contract-types.ts` - 契约类型验证

### 文档 (`docs/`)

所有文档位于 `docs/` 目录：

- `README.md` - 文档索引（**从这里开始**）
- `feature-summary.md` - 多模态功能实现总结
- `environment-configuration.md` - 环境变量配置指南
- `test-results.md` - 测试结果报告
- `multimodal-testing.md` - 多模态测试指南
- `multimodal-search-verification.md` - 多模态搜索验证报告
- `testing-guide.md` - 测试指南
- `validation.md` - 验证文档
- `compliance-review.md` - 合规性审查报告
- `optimization-summary.md` - 优化总结
- `file-organization.md` - 文件组织结构说明（本文档）

## 使用说明

### 运行测试脚本

所有测试脚本都可以从项目根目录运行。建议先查看脚本说明：

```bash
# 查看脚本说明（推荐先看这个）
cat scripts/README.md

# 从项目根目录运行
./scripts/restart-and-test.sh
./scripts/test-complete.sh
./scripts/test-multimodal.sh
```

### 查看文档

所有文档都在 `docs/` 目录下，建议从文档索引开始：

```bash
# 查看文档索引（推荐从这里开始）
cat docs/README.md

# 查看测试结果
cat docs/test-results.md

# 查看功能总结
cat docs/feature-summary.md

# 查看环境配置指南
cat docs/environment-configuration.md

# 查看测试指南
cat docs/multimodal-testing.md
```

### 查看日志

所有日志文件都在 `logs/` 目录下：

```bash
# 查看主服务日志
tail -f logs/knowledgebase.log

# 查看 mock txtai 日志
tail -f logs/mock-txtai.log
```

### 使用测试工具

测试工具位于 `test-tools/` 目录：

```bash
# 启动 mock txtai 服务（用于测试，无需真实 txtai）
bun run mock-txtai
```

## 文件组织原则

1. **测试脚本** → `scripts/` 目录
   - 所有 `.sh` 测试脚本
   - 所有 `.ts` 验证脚本

2. **文档** → `docs/` 目录
   - 所有 `.md` 文档文件
   - 测试报告
   - 功能说明

3. **源代码** → `src/` 目录
   - 业务逻辑代码
   - 服务实现

4. **日志** → `logs/` 目录
   - `knowledgebase.log` - 主服务日志
   - `mock-txtai.log` - Mock txtai 服务日志
   - 所有运行时日志文件

5. **测试工具** → `test-tools/` 目录
   - `mock-txtai.ts` - Mock txtai 服务（用于测试，无需真实 txtai 服务）

6. **配置** → 项目根目录
   - `package.json`
   - `txtai-config.yml`
   - `docker-compose.yml`
   - 环境配置文件

