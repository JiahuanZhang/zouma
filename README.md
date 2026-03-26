# ZouMa - AI 代码评审管理后台

Node.js 全栈 Monorepo 项目，用于管理 Git 仓库、LLM 配置和 AI 代码评审任务。基于 Vue3 + Express + SQLite 技术栈。

## 功能模块

- **Git 仓库管理** — 增删改查仓库信息（地址、分支、访问令牌等），支持通过目录浏览器选择本地仓库并自动识别仓库信息
- **LLM 配置管理** — 管理大语言模型配置（供应商、API Key、模型参数等），支持在线获取可用模型列表，支持 API 连通性测试（页面自动检测状态并显示绿/红点指示）
- **评审计划管理** — 配置评审计划（名称、仓库、LLM、目标分支、触发时机），支持按间隔/每天定时自动触发，支持手动立即触发
- **评审任务管理** — 创建评审任务，关联仓库与 LLM 配置，查看执行日志（含级别/消息/详情/时间）；评审计划触发时自动生成
- **任务执行器** — 独立进程轮询数据库，串行执行待处理的评审任务；执行前自动预检 LLM API 连通性；内置多智能体评审引擎（基于 Claude Agent SDK），支持 simple/smart 两种策略，评审日志与报告自动入库

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Pinia + Element Plus + TypeScript |
| 后端 | Node.js + Express + better-sqlite3 + TypeScript |
| 执行器 | @zouma/executor（独立进程，轮询执行评审任务）+ Claude Agent SDK 多智能体评审 |
| 公共 | @zouma/common（共享类型、工具、数据库管理） |
| 规范 | ESLint + Prettier |
| 模块 | ECMAScript Modules (ESM) |

## 项目结构

```
ZouMa/
├── packages/
│   ├── common/          # 公共模块（类型定义、工具函数、数据库管理）
│   ├── frontend/        # 前端（Vue3 + Vite）
│   ├── backend/         # 后端（Express + SQLite）
│   └── executor/        # 执行器（轮询数据库，串行执行评审任务）
│       └── src/core/    # 评审引擎核心（多智能体编排、扫描、依赖分析）
├── .env.example         # 环境变量模板
├── eslint.config.js     # ESLint 配置
├── tsconfig.base.json   # TypeScript 基础配置
└── package.json         # Monorepo 根配置
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 构建公共模块

```bash
npm run build:common
```

### 启动开发

```bash
# 后端（端口 3000）
npm run dev:backend

# 执行器（轮询数据库执行任务）
npm run dev:executor

# 前端（端口 5173，自动代理 /api 到后端）
npm run dev:frontend
```

### 构建项目

```bash
npm run build
```

### 代码规范

```bash
# 检查
npm run lint

# 自动修复
npm run lint:fix

# 格式化
npm run format
```

## 环境变量

复制 `.env.example` 为 `.env` 并按需修改：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 后端服务端口 |
| HOST | localhost | 后端服务主机 |
| DB_PATH | ./data/zouma.sqlite | SQLite 数据库路径 |
| VITE_API_BASE_URL | http://localhost:3000/api | 前端 API 地址 |
| POLL_INTERVAL_MS | 10000 | 执行器轮询间隔（毫秒） |
| NODE_ENV | development | 运行环境 |

## API 接口

### Git 仓库 `/api/git-repos`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/git-repos | 获取列表（支持分页 `?page=1&pageSize=10`） |
| GET | /api/git-repos/:id | 获取详情 |
| POST | /api/git-repos | 创建仓库 |
| POST | /api/git-repos/detect-local | 识别本地 Git 仓库信息（传入 path） |
| PUT | /api/git-repos/:id | 更新仓库 |
| DELETE | /api/git-repos/:id | 删除仓库 |

### LLM 配置 `/api/llm-configs`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/llm-configs | 获取列表（支持分页） |
| GET | /api/llm-configs/:id | 获取详情 |
| POST | /api/llm-configs | 创建配置 |
| POST | /api/llm-configs/models | 获取可用模型列表（需传 api_key） |
| POST | /api/llm-configs/:id/test | 测试 LLM API 连通性（返回 ok/message/latencyMs） |
| PUT | /api/llm-configs/:id | 更新配置 |
| DELETE | /api/llm-configs/:id | 删除配置 |

### 系统工具 `/api/system`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/system/browse-dirs | 浏览服务器目录（传入 `?path=` 获取子目录列表） |

### 评审计划 `/api/review-plans`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/review-plans | 获取列表（支持分页） |
| GET | /api/review-plans/:id | 获取详情 |
| POST | /api/review-plans | 创建计划 |
| POST | /api/review-plans/:id/trigger | 立即触发计划（生成一条评审任务） |
| PUT | /api/review-plans/:id | 更新计划 |
| DELETE | /api/review-plans/:id | 删除计划 |

### 评审任务 `/api/review-tasks`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/review-tasks | 获取列表（支持分页，含关联仓库和配置名称） |
| GET | /api/review-tasks/:id | 获取详情 |
| GET | /api/review-tasks/:id/logs | 获取任务执行日志列表 |
| GET | /api/review-tasks/:id/progress | 获取任务结构化进展（五级粒度：任务→阶段→批次→Agent→工具调用） |
| POST | /api/review-tasks | 创建任务 |
| POST | /api/review-tasks/:id/execute | 提交任务执行（状态置为 pending） |
| PUT | /api/review-tasks/:id | 更新任务 |
| DELETE | /api/review-tasks/:id | 删除任务 |

## 数据库表

| 表名 | 说明 |
|------|------|
| git_repo | Git 仓库配置 |
| llm_config | LLM 模型配置 |
| review_plan | 评审计划（定时触发等） |
| review_task | 评审任务实例 |
| review_log | 任务执行文本日志 |
| review_progress | 任务执行结构化进展（事件追加模式，支持五级粒度可视化） |
