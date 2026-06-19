# 亚马逊图片工作台

亚马逊图片工作台是一个面向 Amazon Listing 的产品图片策划与生成工作台，基于 [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground) 修改。

它适合用来把产品标题、五点描述、卖点文案和参考图，整理成 Amazon Listing 图片或 A+ Content 图片策划，并逐张生成图片。

项目仓库：[Ali-Aria/amazon-image-studio](https://github.com/Ali-Aria/amazon-image-studio)

## 开源说明

本仓库公开的是前端应用源码、Amazon 图片策划逻辑、Prompt 模板、知识文档、本地启动脚本和部署配置，采用 [MIT License](LICENSE) 发布。

需要注意：

- Codex / Claude Code / OpenClaw 只是可选的安装助手，不是项目运行依赖；不用 AI 编程工具也可以按下面的手动方式本地运行。
- 在线体验和本地应用都不会内置 API Key。生成图片和 AI 策划需要使用者填写自己的 OpenAI 或兼容接口 Key，并自行承担调用费用。
- `package.json` 中的 `"private": true` 仅用于防止误发布到 npm，不代表 GitHub 仓库私有，也不影响源码开源。

## 更新日志

按自然周（周一至周日）整理，最新一周在最上方。每个周块可展开查看本周推送内容，提交号用于回溯具体改动。

<details open>
<summary><strong>2026-06-15 至 2026-06-21</strong> - 自定义策划数量、A+ 模块编排与提示词分辨率</summary>

- Listing AI 策划支持自定义图片数量，默认仍为 7 张，可在 `7-12` 张之间选择，数量包含 `MAIN` 主图。
- A+ 策划前可在右侧“模块编排”中逐行添加同尺寸模块、删除模块，并可恢复当前 A+ 类型默认编排；每个 A+ 类型支持 `1-12` 张模块。
- A+ 自定义模块数量会进入 AI 策划请求，schema、系统提示词、用户提示词、Chat JSON guide 和结果校验都会按当前模块清单执行。
- 生图最终提示词会自动追加期望输出分辨率，例如 `2048x2048` 或 `4096x4096`，让模型在提示词层面也知道目标尺寸。
- Agent 批量生图和图片工具调用同步加入输出分辨率约束，减少生成尺寸和当前参数脱节。
- 开发代理会在 API URL 与本地代理目标一致时自动启用，降低本地 HTTP/内网接口配置成本。
- 提交：随本次 `main` 推送发布。

</details>

<details>
<summary><strong>2026-06-08 至 2026-06-14</strong> - 可编辑风格图、A+ 类型扩展、移动端操作窗与 DeepSeek 策划兼容</summary>

- 视觉风格新增可编辑预设和“我的风格”库，用户可从内置风格派生色板、字体、光影、材质和信息密度，并作为隐藏参考图参与附图和 A+ 生图。
- 风格编辑窗口保留英文方向作为实际参考内容，同时为字体方向、光影方向和材质方向增加中文说明，便于理解但不写入最终风格参考图。
- A+ 策划类型统一为普通A+、标准A+、高级A+、手机A+；新增手机A+ 5 张 `600x450` 模块，适合移动端短屏阅读。
- 移动端生成操作悬浮窗支持收起到左侧或右侧，收起后可通过贴边小标签展开，减少遮挡图片预览和底部输入区。
- AI 策划检测到 `https://api.deepseek.com` 时自动跳过参考图，仅发送纯文本 Chat Completions 请求，避免 DeepSeek 官方接口因 `image_url` 报错。
- 补充 DeepSeek 策划配置说明，明确官方 Chat Completions 当前不接收参考图。
- DeepSeek Chat Completions 和 Responses 策划统一按纯文本模型处理，增加反脑补约束，并在设置页和 Amazon 面板提示用户补齐产品关键特征。
- 补充 Vercel 体验版调用 HTTP API 的 HTTPS 安全策略提示。
- 提交：`8927ad1`、`8a42d09`、`b2ab475`，以及本次可编辑风格图更新。

</details>

<details>
<summary><strong>2026-06-01 至 2026-06-07</strong> - OpenRouter、参考图压缩与策划体验</summary>

- OpenRouter 生图改走 Chat Completions 图片生成，修复普通 Images API 路径下的 404。
- OpenRouter 请求补齐 `image_config.aspect_ratio` 和 `image_config.image_size`，A+ 非 1:1 图片会映射到最接近的支持比例，减少实际输出回落到 1024 级别。
- 视觉风格支持内置预设和可编辑“我的风格”，附图和 A+ 生成时会作为隐藏参考图参与最终生图。
- 参考图请求前会压缩、控尺寸并校验负载，修复大参考图导致的 413。
- 普通生图限制为 Images API，OpenRouter 图片模型保留兼容入口，避免误用不支持生图的配置。
- README 增加在线体验说明，Windows 启动脚本会在启动前自动检查并安装依赖。
- 优化 Amazon Planner 引导、API 默认配置、图片编辑流程、A+ 策划规则、风格控制和合规提示。
- 提交：`dd63338`、`9cdecd0`、`dc5e54d`、`031069d`、`56be7df`、`bff26ca`、`7d13774`、`ed43bf5`、`73c70f4`。

</details>

<details>
<summary><strong>2026-05-25 至 2026-05-31</strong> - Amazon 策划工作流、知识规则与本地化</summary>

- 大幅更新 Amazon Planner 工作流，强化 Listing 图片和 A+ 图片的策划、选择和生成流程。
- 调整图片默认参数、历史记录字段、任务展示和分类继承逻辑。
- 更新 dev proxy、mock image API、接口兼容测试和参数兼容逻辑。
- 内置 Amazon 图片规范、附图策划逻辑和 A+ 尺寸知识文档。
- 策划接口会引用内置知识规则，提高 Listing / A+ 策划稳定性。
- 项目名称统一调整为“亚马逊图片工作台”，同步页面标题、PWA manifest、启动脚本和界面文案。
- README 增加更完整的本地安装、启动和交付说明，历史记录搜索栏增加清理能力。
- 优化 Amazon Planner 工作流说明、Listing 图片策划模板、复制逻辑和相关测试。
- 提交：`a85312c`、`7c231bf`、`899532d`、`5cc09c4`、`0c8b9ec`、`d1de756`、`81a3fbd`、`3778620`。

</details>

<details>
<summary><strong>2026-05-18 至 2026-05-24</strong> - 项目初始化、部署配置与 A+ 模板</summary>

- 完成项目初始化，包含前端应用、图片生成、图片编辑、历史记录、设置页、PWA、代理和部署基础配置。
- 配置 GitHub Pages 工作流，并支持 main 分支推送后部署。
- 更新部署文档、安装路径说明和项目 GitHub 链接。
- 完善 README 使用说明。
- 优化 A+ Planner 模板、模块文案和任务历史展示。
- 默认关闭流式输出，降低默认配置复杂度。
- 提交：`ab63d9b`、`78ef9ea`、`3826fbc`、`ae118af`、`94c5cca`、`d929bdc`、`5860ddd`、`93f9585`、`f9198cb`。

</details>

## 在线体验

- 体验地址：[https://ali-aria.github.io/amazon-image-studio/](https://ali-aria.github.io/amazon-image-studio/)
- 打开在线体验不需要 Codex；Codex 只是一种可选的本地安装方式。
- 在线体验不会内置 API Key；生成图片和 AI 策划都需要在右上角设置中填写你自己的 OpenAI 或兼容接口 Key。
- API Key 保存在当前浏览器本地，不会提交到仓库；如果线上页面加载异常，也可以按下面的“启动项目”在本地运行。
- 💡 提示：若需调用非 HTTPS 的内网或本地 HTTP API，请使用 GitHub Pages 版本或自行部署，Vercel 部署的体验版绑定的 .dev 域名因安全策略通常要求接口必须为 HTTPS。

## 核心功能

- AI 策划 Listing 图片：粘贴标题、五点描述或产品说明后，默认生成 `MAIN + PT01-PT06` 共 7 张图片，也可自定义为 `7-12` 张。
- AI 策划 A+ 图片：支持 `普通A+ / 标准A+ / 高级A+ / 手机A+` 四套 A+ 模块编排，策划前可按行添加或删除同尺寸模块。
- 参考图上传：支持上传产品实拍图、包装图、结构图，生成时会作为参考图一起发送。
- 逐张生成：在右侧选择 `MAIN`、`PT01`、`A+L01`、`A+S01`、`A+P01`、`A+M01` 等图片位后，当前 Prompt Preview 会切换到对应提示词。
- Amazon 合规提示：主图白底、商品占比、禁用 Amazon/Prime/价格/评价/Best Seller 等风险元素。
- 支持 2K / 4K 输出；Listing 图默认方图，A+ 图按模块比例生成高清图，并显示 Seller Central 上传建议尺寸。
- 最终生图提示词会自动写入当前期望输出分辨率，让提示词和尺寸参数保持一致。
- A+ 小方块模块支持单独输出标题/正文文案，和图片内文字分开，避免把长文案画进 220x220 图片里。
- 支持 OpenAI / OpenAI 兼容图片接口，以及独立的 AI 策划 Chat Completions / Responses API 配置。
- 历史记录支持按商品、来源、形状筛选；从历史记录复用或编辑 Listing / A+ 图片时，新任务会继承原商品分类。
- 保留原项目的参考图、遮罩编辑、历史记录、批量下载、本地 IndexedDB 存储等能力。

## 环境要求

推荐在 Windows 上使用。

需要先安装：

- Node.js 20 LTS 或更新版本
- npm

安装完成后，可以在 PowerShell 或命令行中检查：

```powershell
node --version
npm --version
```

## 首次安装

首次安装只需要做一次。下面两种方式二选一即可；如果已经让 AI 工具完成安装并启动，就不要再重复执行手动安装。

### 方式一：Codex / Claude Code / OpenClaw 安装并启动

如果你要把项目发给别人使用，最简单的方式是直接发 GitHub 仓库链接：

```text
https://github.com/Ali-Aria/amazon-image-studio
```

对方可以在 Codex、Claude Code、Claw Code 或其它 AI 编程工具里粘贴下面这段话：

```text
请把这个 GitHub 项目安装到我的本地电脑并启动：
https://github.com/Ali-Aria/amazon-image-studio

要求：
1. 先确认本机已经安装 Node.js 20 LTS 或更新版本和 npm。
2. 如果本地还没有项目，就 clone 仓库；如果已经下载 ZIP 或源码文件夹，直接进入现有项目目录，不要重复下载。
3. 在项目目录运行 npm ci 安装依赖。
4. 如果我是 Windows 用户，优先检查仓库里的 start-amazon-image-studio.bat，能用的话帮我用它启动项目；停止时可以用 stop-amazon-image-studio.bat。
5. 如果不使用 bat 脚本，就运行 npm run dev 启动项目。
6. 告诉我浏览器应该打开哪个本地地址。
```

如果 AI 工具不会自动执行命令，也可以让它按下面“方式二：手动安装（通用）”和“启动项目”里的命令一步一步带你操作。Windows 用户可以优先双击 `start-amazon-image-studio.bat` 启动；脚本会在首次启动或依赖变更后自动安装依赖，停止时双击 `stop-amazon-image-studio.bat`。项目启动后，每个使用者都需要在页面右上角设置里填写自己的 API Key；不要把你的 API Key 发给别人。

### 方式二：手动安装（通用）

先把仓库下载到本地：

```powershell
git clone https://github.com/Ali-Aria/amazon-image-studio.git
cd amazon-image-studio
```

如果你已经下载了 ZIP 或复制了源码文件夹，直接在终端进入你自己的项目目录即可。

安装依赖：

```powershell
npm ci
```

依赖只需要安装一次。以后日常使用直接看下面的“启动项目”。

## 启动项目

### 方式一：手动启动（通用）

在项目目录中执行：

```powershell
npm run dev
```

然后打开终端中显示的本地地址，通常是：

```text
http://127.0.0.1:5173/
```

停止时，在运行开发服务的终端中按 `Ctrl + C`。

### 方式二：双击启动（Windows 可选）

仓库根目录包含 Windows 便捷脚本：

```text
start-amazon-image-studio.bat
```

双击后会启动本地开发服务，并自动打开浏览器：

```text
http://127.0.0.1:5173/
```

如果服务已经在运行，脚本会直接打开浏览器。

首次双击或 `package-lock.json` 发生变化后，脚本会先运行 `npm ci` 安装依赖；依赖安装成功后才会启动项目。如果电脑还没有安装 Node.js 20 LTS 或更新版本，脚本会提示先安装 Node.js。

## 停止项目

手动启动时，在终端中按 `Ctrl + C` 即可停止。

如果使用 Windows 双击脚本启动，也可以双击：

```text
stop-amazon-image-studio.bat
```

脚本会停止当前项目对应的本地开发服务。如果 5173 端口被其它程序占用，脚本不会强行关闭无关进程。

## API 配置

打开页面后，点击右上角设置图标，进入 API 配置。

建议准备两个配置：

### 1. 生图配置

用于真正生成图片。

- 服务商：OpenAI 或 OpenAI 兼容接口
- API 接口：`Images API (/v1/images)`
- 模型：`gpt-image-2`
- API Key：填写你自己的 Key

OpenRouter 生图模型不提供 OpenAI `/images/generations` 路径，应用会自动把 `https://openrouter.ai/api/v1` 的生图请求转到 `/chat/completions` 并发送 `modalities`。OpenRouter 示例：API URL 填 `https://openrouter.ai/api/v1`，模型填支持图片输出的模型，例如 `google/gemini-2.5-flash-image`；API 接口选择 `Images API` 或 `Chat Completions` 都可以。遮罩编辑仍需使用支持 `/images/edits` 的接口。

### 2. AI 策划配置

用于根据 Listing 生成 `MAIN + PT01...` 或 A+ 模块图片策划。

- 服务商：OpenAI
- API 接口：`Chat Completions (/chat/completions)`；OpenAI 官方也可继续使用 `Responses API (/v1/responses)`
- 模型：文本/多模态模型，例如 DeepSeek 使用 `deepseek-v4-flash`
- API Key：填写你自己的 Key

DeepSeek 示例：API URL 填 `https://api.deepseek.com`，API 接口选择 `Chat Completions (/chat/completions)`，模型填 `deepseek-v4-flash`。当前 DeepSeek 官方 Chat Completions 接口只接收文本内容，本项目检测到该地址时会自动跳过参考图，仅用 Listing 文本做 AI 策划。

在设置页中，把“AI 策划配置”选择为这个 Chat Completions 配置。这样生图和策划不需要来回切换接口类型。

AI 策划提示词已内置精炼版亚马逊图片知识库规则，包括 Listing 主图/附图规范、A+ 模块尺寸、移动端可读性和合规禁用项。原始知识库 Markdown 保存在 `docs/knowledge/` 作为规则来源备查，运行时不会把整篇原文发送给模型。

## 使用流程

1. 启动项目并打开页面。
2. 在设置中配置生图 API 和 AI 策划 API。
3. 在 Amazon 面板顶部选择 `Listing 图` 或 `A+ 图`。
4. 如果选择 `Listing 图`，可在顶部选择本次策划图片数量，默认 7 张，范围为 7-12 张。
5. 如果选择 `A+ 图`，默认使用 `普通A+`，也可以切换为 `标准A+`、`高级A+` 或 `手机A+` 编排，并在右侧模块清单里添加、删除或恢复默认模块。
6. 在策划输入框中粘贴产品标题、五点描述、产品说明或品牌说明。
7. 在“参考图”区域上传产品实拍图、包装图或结构图。
8. 点击 `AI策划` 或 `AI策划A+`，生成逐张方案。
9. 在右侧选择要生成的图片位，例如 `MAIN`、`PT01`、`A+L01`、`A+S01`、`A+P01` 或 `A+M01`。
10. 检查 Prompt Preview，必要时调整左侧商品信息。
11. 点击“填入”把当前提示词填到底部输入栏，或点击“提交生成”直接开始生成。
12. 生成完一张后，继续选择下一张图片位逐张生成。

## A+ 图片说明

普通A+ 当前默认编排，也是 A+ 图片策划的默认选项：

- `A+L01` Header Banner：上传建议 `970x300`
- `A+L02-A+L05` Single Image：上传建议 `970x600`

标准A+ 编排：

- `A+S01` Header Banner：上传建议 `970x300`
- `A+S02-A+S04` Single Image：上传建议 `970x600`
- `A+S05-A+S08` Highlight Tile：上传建议 `220x220`

高级A+ 编排：

- `A+P01` Hero Banner：上传建议 `1464x600`
- `A+P02-A+P04` Feature Image：上传建议 `970x600`
- `A+P05-A+P06` Brand Story：上传建议 `463x625`

手机A+ 编排面向移动端短屏阅读，默认 5 张 4:3 图片：

- `A+M01` Mobile Hero：上传建议 `600x450`
- `A+M02-A+M05` Mobile Feature：上传建议 `600x450`

A+ 策划前可以在右侧模块编排中调整数量：点击某一行的加号会在该行后添加同尺寸、同类型模块；点击删除会移除该模块；“恢复默认”会回到当前 A+ 类型的默认编排。每个 A+ 类型最少 1 张，最多 12 张。AI 策划完成后的结果列表保持只读，如需修改数量，请重新调整模块后再次 AI 策划。

A+ 生图会按模块比例请求 2K / 4K 高清画布，页面中会同时显示“生成尺寸”和“上传建议尺寸”。`Highlight Tile` 会额外生成可复制的 A+ 标题/正文文案；这些外部文案不会写入图片生成 Prompt。当前版本不自动裁切、压缩到 2 MB，也不默认生成 Logo 图或对比图。

## 安全说明

- 不要把你的 API Key 提交到 GitHub。
- 不要把包含 API Key 的配置截图发给别人。
- 本项目的 API Key 保存在你自己浏览器的本地存储中。
- 每个使用者应填写自己的 API Key，并自行承担 API 调用费用。
- 如果你要把项目发给别人，请确认仓库中没有 `.env`、私钥、真实 API Key 或个人数据。

## 常见问题

### 启动后打不开页面

确认是否已经安装依赖：

```powershell
npm ci
```

然后重新运行：

```powershell
npm run dev
```

Windows 用户也可以重新双击 `start-amazon-image-studio.bat`。

### 5173 端口被占用

如果是手动启动，先在终端中按 `Ctrl + C`。如果是 Windows 脚本启动，可以双击：

```text
stop-amazon-image-studio.bat
```

如果仍然提示被占用，说明 5173 可能被其它程序使用，需要先关闭对应程序，或改用 Vite 输出的其它端口。

### AI 策划失败

检查“AI 策划配置”是否使用了文本接口，并确认模型不是图片生成模型。DeepSeek 请使用 `Chat Completions (/chat/completions)`；当前 DeepSeek 官方接口不接收参考图，本项目会自动跳过参考图。部分图片中转接口只开放 `/v1/images`，不支持聊天或 Responses 接口，这种情况下 AI 策划会失败。

### 生图失败

检查当前生图配置是否填写了正确的 API URL、API Key、模型和接口类型。生成图片建议使用 `Images API (/v1/images)` + `gpt-image-2`。

如果 OpenRouter 报 404，通常是旧版本请求到了 `/images/generations`。请更新后使用 `https://openrouter.ai/api/v1` 和带 `image` 输出能力的模型；OpenRouter 的图片生成实际走 `/chat/completions`。

## 构建

如果需要生成生产构建：

```powershell
npm run build
```

构建产物在：

```text
dist/
```

## 静态部署

本项目是 Vite 单页应用，部署平台只需要安装依赖、运行构建命令，并把 `dist/` 作为静态目录发布。

推荐配置：

```text
Install command: npm ci
Build command: npm run build
Output directory: dist
Node.js version: 20
```

### GitHub Pages

仓库已包含 GitHub Pages 工作流：

```text
.github/workflows/deploy.yml
```

使用步骤：

1. 进入 GitHub 仓库的 `Settings -> Pages`。
2. `Build and deployment` 的 `Source` 选择 `GitHub Actions`。
3. 推送到 `main` 后会自动构建并部署。也可以在 `Actions` 页面手动运行 `Deploy to GitHub Pages`，或推送 `v*` 格式的 tag，例如 `v0.1.0`。

项目的 Vite `base` 已设置为 `./`，可以部署在 `https://<username>.github.io/amazon-image-studio/` 这类子路径下。

当前仓库的 GitHub Pages 体验地址：

```text
https://ali-aria.github.io/amazon-image-studio/
```

### Cloudflare Pages

连接 GitHub 仓库后，按以下方式配置：

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Node.js version: 20
```

如果使用 Cloudflare Workers 静态资源部署，也可以使用仓库中的 `wrangler.jsonc`，先执行：

```powershell
npm run build
```

再按你的 Cloudflare 账号配置运行 Wrangler 部署。

### Vercel

当前仓库的 `vercel.json` 里关闭了 Git 自动部署：

```json
{
  "git": {
    "deploymentEnabled": false
  }
}
```

如果要让 Vercel 在每次 push 后自动部署，请删除这段配置，或把 `deploymentEnabled` 改为 `true`。如果继续保留它，可以使用 `.github/workflows/vercel-tag-deploy.yml` 中的 Deploy Hook 方式，并在 GitHub Secrets 里配置 `VERCEL_DEPLOY_HOOK`。

## 许可与来源

本项目源码以 [MIT License](LICENSE) 发布。开源范围包括前端源码、Prompt 模板、内置知识文档、本地启动脚本和部署配置；不包含 OpenAI、ChatGPT、Codex 或任何第三方模型服务本身，也不附带 API Key 或免费调用额度。

本项目基于 MIT 许可的 [GPT Image Playground](https://github.com/CookSleep/gpt_image_playground) 修改，原作者为 CookSleep。

请保留应用内“关于”页中的原项目署名与 MIT 许可声明。
