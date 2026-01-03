# 环境配置说明

## env.example 文件的作用

`env.example` 是一个**配置模板文件**，用于：

1. **文档化配置项**：列出所有可配置的环境变量
2. **提供默认值**：展示推荐的配置值
3. **团队协作**：帮助新成员快速了解需要配置哪些参数
4. **版本控制**：可以安全地提交到 Git（不包含敏感信息）

### 重要提示

- ⚠️ **不要**将实际的 `.env` 文件提交到 Git
- ✅ `.env` 文件已在 `.gitignore` 中，不会被提交
- ✅ `env.example` 可以安全地提交到 Git

## 如何使用

### 开发环境

1. **复制模板文件**：
   ```bash
   cp env.example .env
   ```

2. **编辑配置**：
   ```bash
   # 根据本地环境修改 .env 文件
   nano .env
   # 或
   vim .env
   ```

3. **启动服务**：
   ```bash
   bun run dev
   # 服务会自动读取 .env 文件中的配置
   ```

### 生产环境

#### 方式 1: 使用 .env 文件（简单部署）

1. **在服务器上创建 .env 文件**：
   ```bash
   # 在部署目录
   cp env.example .env
   nano .env  # 编辑配置
   ```

2. **配置生产环境变量**：
   ```bash
   # 生产环境配置示例
   PORT=8080
   HOST=0.0.0.0
   TXTAI_URL=http://txtai:8000  # Docker 内部网络
   PROVIDER_NAME=production_kb
   STORAGE_PATH=/data/documents
   MEDIA_PATH=/data/media
   MEDIA_BASE_URL=https://api.example.com/media
   MAX_FILE_SIZE=52428800  # 50MB
   DEBUG=false
   ```

3. **启动服务**：
   ```bash
   bun run start
   # 或使用 PM2
   pm2 start src/index.ts --name knowledgebase
   ```

#### 方式 2: 使用环境变量（推荐，容器化部署）

**Docker Compose 部署**：

```yaml
# docker-compose.yml
services:
  knowledgebase:
    environment:
      - PORT=8080
      - TXTAI_URL=http://txtai:8000
      - PROVIDER_NAME=production_kb
      - STORAGE_PATH=/data/documents
      - MEDIA_PATH=/data/media
      - MEDIA_BASE_URL=https://api.example.com/media
      - MAX_FILE_SIZE=52428800
      - DEBUG=false
```

**Kubernetes 部署**：

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: knowledgebase
spec:
  template:
    spec:
      containers:
      - name: knowledgebase
        env:
        - name: PORT
          value: "8080"
        - name: TXTAI_URL
          value: "http://txtai:8000"
        - name: PROVIDER_NAME
          value: "production_kb"
        # 或使用 ConfigMap
        envFrom:
        - configMapRef:
            name: knowledgebase-config
        # 敏感信息使用 Secret
        - secretRef:
            name: knowledgebase-secrets
```

**使用 ConfigMap**：
```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: knowledgebase-config
data:
  PORT: "8080"
  TXTAI_URL: "http://txtai:8000"
  PROVIDER_NAME: "production_kb"
  STORAGE_PATH: "/data/documents"
  MEDIA_PATH: "/data/media"
  MAX_FILE_SIZE: "52428800"
  DEBUG: "false"
```

#### 方式 3: 使用系统环境变量（云平台）

**AWS/阿里云/腾讯云等**：
- 在平台的环境变量配置中设置
- 服务启动时自动读取

**示例**：
```bash
# 在云平台控制台或 CI/CD 中设置
export PORT=8080
export TXTAI_URL=http://txtai:8000
export PROVIDER_NAME=production_kb
export MEDIA_BASE_URL=https://api.example.com/media
```

## 配置项说明

### 服务器配置

| 变量 | 默认值 | 说明 | 生产环境建议 |
|------|--------|------|------------|
| `PORT` | 8080 | 服务监听端口 | 8080（或根据部署调整） |
| `HOST` | 0.0.0.0 | 绑定地址 | 0.0.0.0（监听所有接口） |

### txtai 配置

| 变量 | 默认值 | 说明 | 生产环境建议 |
|------|--------|------|------------|
| `TXTAI_URL` | http://127.0.0.1:8000 | txtai 服务地址 | Docker: `http://txtai:8000`<br>K8s: `http://txtai-service:8000` |
| `TXTAI_API_KEY` | (空) | txtai API 密钥（可选） | 如果 txtai 启用了认证 |
| `TXTAI_TIMEOUT` | 30000 | 请求超时（毫秒） | 30000（30秒） |

### 存储配置

| 变量 | 默认值 | 说明 | 生产环境建议 |
|------|--------|------|------------|
| `STORAGE_PATH` | ./data/documents | 文档存储路径 | `/data/documents`（使用持久化卷） |
| `MEDIA_PATH` | ./data/media | 媒体文件存储路径 | `/data/media`（使用持久化卷） |
| `MEDIA_BASE_URL` | http://localhost:8080/media | 媒体文件访问基础URL | `https://api.example.com/media` |
| `MAX_FILE_SIZE` | 10485760 | 最大文件大小（字节，10MB） | 52428800（50MB）或根据需求调整 |

### 搜索配置

| 变量 | 默认值 | 说明 | 生产环境建议 |
|------|--------|------|------------|
| `DEFAULT_SEARCH_LIMIT` | 5 | 默认搜索结果数量 | 5-10 |
| `MAX_SEARCH_LIMIT` | 20 | 最大搜索结果数量 | 20-50 |
| `MIN_SEARCH_SCORE` | 0.3 | 最小搜索分数阈值 | 0.3-0.5（根据需求调整） |

### 分块配置

| 变量 | 默认值 | 说明 | 生产环境建议 |
|------|--------|------|------------|
| `CHUNK_SIZE` | 500 | 文档分块大小（字符） | 500-1000（根据模型调整） |
| `CHUNK_OVERLAP` | 50 | 分块重叠字符数 | 50-100 |

### Provider 配置

| 变量 | 默认值 | 说明 | 生产环境建议 |
|------|--------|------|------------|
| `PROVIDER_NAME` | customer_kb | Provider 标识名称 | 根据实际环境命名（如 `production_kb`） |

### 调试配置

| 变量 | 默认值 | 说明 | 生产环境建议 |
|------|--------|------|------------|
| `DEBUG` | false | 调试模式 | `false`（生产环境必须关闭） |

## 生产环境配置示例

### Docker Compose 部署

```yaml
# docker-compose.yml
services:
  knowledgebase:
    environment:
      # 服务器配置
      - PORT=8080
      - HOST=0.0.0.0
      
      # txtai 配置
      - TXTAI_URL=http://txtai:8000
      - TXTAI_TIMEOUT=30000
      
      # 存储配置
      - STORAGE_PATH=/data/documents
      - MEDIA_PATH=/data/media
      - MEDIA_BASE_URL=https://api.example.com/media
      - MAX_FILE_SIZE=52428800  # 50MB
      
      # 搜索配置
      - DEFAULT_SEARCH_LIMIT=5
      - MAX_SEARCH_LIMIT=20
      - MIN_SEARCH_SCORE=0.3
      
      # Provider 配置
      - PROVIDER_NAME=production_kb
      
      # 调试配置
      - DEBUG=false
    volumes:
      - knowledgebase_data:/data  # 持久化存储
```

### Kubernetes 部署

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: knowledgebase
spec:
  template:
    spec:
      containers:
      - name: knowledgebase
        env:
        - name: PORT
          value: "8080"
        - name: TXTAI_URL
          value: "http://txtai-service:8000"
        - name: PROVIDER_NAME
          value: "production_kb"
        - name: STORAGE_PATH
          value: "/data/documents"
        - name: MEDIA_PATH
          value: "/data/media"
        - name: MEDIA_BASE_URL
          value: "https://api.example.com/media"
        - name: MAX_FILE_SIZE
          value: "52428800"
        - name: DEBUG
          value: "false"
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: knowledgebase-pvc
```

## 安全建议

### 1. 敏感信息管理

**不要**在 `.env` 文件中存储敏感信息：
- ❌ API 密钥
- ❌ 数据库密码
- ❌ 私钥

**应该**使用：
- ✅ 密钥管理服务（AWS Secrets Manager, HashiCorp Vault）
- ✅ Kubernetes Secrets
- ✅ 环境变量注入（CI/CD）

### 2. 文件权限

```bash
# 设置 .env 文件权限（仅所有者可读）
chmod 600 .env
```

### 3. 生产环境检查清单

- [ ] `DEBUG=false`（必须关闭调试模式）
- [ ] `MEDIA_BASE_URL` 使用 HTTPS
- [ ] 存储路径使用持久化卷
- [ ] `MAX_FILE_SIZE` 根据实际需求设置
- [ ] `TXTAI_URL` 使用内部服务名（Docker/K8s）
- [ ] 所有路径使用绝对路径（生产环境）

## 配置验证

启动服务后，检查配置是否正确：

```bash
# 查看健康检查（包含配置信息）
curl http://localhost:8080/provider/health

# 检查日志
tail -f logs/knowledgebase.log
```

## 常见问题

### Q: 为什么需要 env.example？
A: 作为配置模板，帮助团队成员了解需要配置哪些参数，同时避免提交敏感信息。

### Q: 生产环境应该使用 .env 文件吗？
A: 对于容器化部署，推荐使用环境变量注入（Docker/K8s），而不是 .env 文件。

### Q: 如何在不同环境使用不同配置？
A: 
- 开发环境：使用 `.env` 文件
- 测试环境：使用 `.env.test`
- 生产环境：使用环境变量或 ConfigMap/Secret

### Q: 配置变更后需要重启服务吗？
A: 是的，环境变量在服务启动时读取，变更后需要重启服务。

## 总结

- `env.example` 是配置模板，用于文档化和团队协作
- 开发环境：复制为 `.env` 并编辑
- 生产环境：使用环境变量注入（推荐）或 `.env` 文件
- 敏感信息：使用密钥管理服务，不要存储在配置文件中

