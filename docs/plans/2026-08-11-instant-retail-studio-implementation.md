# 即时零售图片工作台 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有 Amazon 图片工具替换为面向美团闪购、淘宝闪购的单商品 7 图生产工作台，并把 10.9 万条商品池总结出的全类目规则接入策划、校验、生成与导出。

**Architecture:** 保留既有图片 API、任务历史、遮罩和图片存储层；新增独立的即时零售领域层、静态类目知识库、项目持久化、限流生成队列、确定性中文排版、内部质检和 SKU ZIP 导出。首页改由 `RetailStudio` 统筹六步工作流，旧 Amazon 数据可继续从历史记录读取，但不再出现在主流程。

**Tech Stack:** React 19、TypeScript、Zustand、IndexedDB、Canvas、fflate、Vite、Vitest、Tailwind CSS。

---

## Task 1: 接入全量商品池类目知识

**Files:**
- Copy: `public/knowledge/retail-category-knowledge.v1.json`
- Create: `src/lib/retailKnowledge.test.ts`
- Create: `src/lib/retailKnowledge.ts`
- Modify: `src/types.ts`

1. 先写测试，验证知识库覆盖 23 个策略、三平台所有一级类目、模糊类目匹配与未知类目回退。
2. 运行 `npm test -- src/lib/retailKnowledge.test.ts`，确认测试因模块缺失而失败。
3. 实现类型、懒加载、标准化索引和类目匹配。
4. 再跑测试，确认通过。
5. 提交：`feat: add retail category knowledge engine`。

## Task 2: 建立商品资料、平台预设与 7 图策划

**Files:**
- Create: `src/lib/retailProduct.test.ts`
- Create: `src/lib/retailProduct.ts`
- Create: `src/lib/retailPlatform.test.ts`
- Create: `src/lib/retailPlatform.ts`
- Create: `src/lib/retailPlanner.test.ts`
- Create: `src/lib/retailPlanner.ts`
- Modify: `src/types.ts`

1. 写商品资料校验测试，覆盖基础必填、类目特有事实、事实来源和禁编造字段。
2. 写平台预设测试，覆盖美团 600x600/600x450、淘宝闪购可维护预设和长图尺寸。
3. 写 7 图计划测试，验证固定顺序、保真提示、无具体券/价格/二维码、规格图只使用结构化事实。
4. 逐个运行测试，确认 RED。
5. 实现最小领域逻辑并跑绿。
6. 提交：`feat: model retail products and seven-image plans`。

## Task 3: 项目持久化与任务元数据

**Files:**
- Create: `src/lib/retailProject.test.ts`
- Create: `src/lib/retailProject.ts`
- Modify: `src/lib/db.ts`
- Modify: `src/types.ts`
- Modify: `src/lib/taskHistory.ts`

1. 写默认项目、恢复归一化和 slot 状态派生测试。
2. 运行测试并确认 RED。
3. IndexedDB 升级到 v4，增加 `retailProjects` store 和 CRUD。
4. 扩展 `TaskWorkflow`、任务 category 与历史筛选兼容。
5. 跑项目与历史测试。
6. 提交：`feat: persist instant retail projects`。

## Task 4: 可编程提交与限流生成队列

**Files:**
- Create: `src/lib/retailQueue.test.ts`
- Create: `src/lib/retailQueue.ts`
- Modify: `src/store.test.ts`
- Modify: `src/store.ts`

1. 写队列测试，覆盖并发 2、暂停后不启动新任务、失败不阻断、单 slot 重试。
2. 写 prepared task 提交测试，验证独立 prompt/input/params/category 不依赖全局输入框。
3. 运行测试并确认 RED。
4. 抽出 `submitPreparedTask`，复用既有 `executeTask`。
5. 实现可订阅的队列调度器。
6. 运行相关测试和完整 store 测试。
7. 提交：`feat: add bounded retail generation queue`。

## Task 5: 确定性文字合成、质检与 ZIP 导出

**Files:**
- Create: `src/lib/retailComposer.test.ts`
- Create: `src/lib/retailComposer.ts`
- Create: `src/lib/retailQuality.test.ts`
- Create: `src/lib/retailQuality.ts`
- Create: `src/lib/retailExporter.test.ts`
- Create: `src/lib/retailExporter.ts`

1. 写文字层测试，验证卖点、规格和详情内容全部来自商品事实且不出现内部文案。
2. 写质检测试，覆盖尺寸、缺失事实、具体券、价格、二维码、水印、包装人工复核提示。
3. 写导出测试，覆盖安全文件名、固定 7 图顺序和 `manifest.json`。
4. 分别确认 RED 后实现 Canvas 合成、纯函数质检和 fflate ZIP。
5. 运行所有新测试。
6. 提交：`feat: compose validate and export retail image sets`。

## Task 6: 构建即时零售工作台界面

**Files:**
- Create: `src/components/RetailStudio.tsx`
- Create: `src/components/retail/ProductPanel.tsx`
- Create: `src/components/retail/PlanBoard.tsx`
- Create: `src/components/retail/QualityPanel.tsx`
- Create: `src/components/retail/RetailImageCard.tsx`
- Create: `src/components/retail/SourceUploader.tsx`
- Create: `src/components/retail/PlatformControls.tsx`
- Create: `src/components/retail/ProgressDock.tsx`
- Modify: `src/components/icons.tsx`
- Modify: `src/index.css`

1. 用真实领域数据完成桌面三栏和移动分步工作流。
2. 接通原图上传、资料编辑、类目检索、平台切换、7 图预览、一键生成、暂停、续跑、单张重做、质检和导出。
3. 使用稳定尺寸与响应式约束，确保移动端底部操作区不遮挡内容。
4. 用图标按钮和 tooltip 处理熟悉操作，文字按钮只用于明确命令。
5. 提交：`feat: build instant retail studio workspace`。

## Task 7: 替换首页、品牌信息与兼容入口

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/HelpModal.tsx`
- Modify: `package.json`
- Modify: `index.html`
- Modify: `README.md`

1. 首页替换为 `RetailStudio`，移除 Amazon Planner 和全局 InputBar 的主流程占位。
2. 更新标题、安装文案、帮助和项目元数据。
3. 保留设置、历史、详情、遮罩与导入导出兼容能力。
4. 对非首屏大型模态组件使用 `React.lazy` 分包。
5. 运行构建，修复类型或打包问题。
6. 提交：`feat: replace amazon workflow with retail studio`。

## Task 8: 全量验证与视觉 QA

**Files:**
- Modify as needed based on findings.

1. 运行 `npm test`，要求全部测试通过。
2. 运行 `npm run build`，确认构建成功并检查 chunk 体积。
3. 在独立端口启动 `npm run dev -- --host 127.0.0.1 --port 5174`。
4. 用应用内浏览器验证桌面和移动视口：上传、表单、类目建议、平台切换、7 图状态、暂停/续跑、设置、历史、ZIP 导出。
5. 对照参考截图和设计文档进行视觉检查，修复重叠、裁切、字体、间距、对比度和不可用控件。
6. 最后再次运行测试和构建。
7. 提交：`test: verify instant retail studio workflow`。
