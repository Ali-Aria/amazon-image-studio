# 更新日志

按自然周（周一至周日）整理，最新一周在最上方。每个周块可展开查看本周推送内容，提交号用于回溯具体改动。

<details open>
<summary><strong>2026-08-03 至 2026-08-09</strong> - 阿里云百炼 Qwen-Image 3.0 Pro 接入</summary>

- 生图配置无需新增服务商选项：在“OpenAI 兼容接口”中填写 DashScope/MaaS API URL（例如 `https://dashscope.aliyuncs.com/api/v1` 或业务空间专属域名）和 API Key，应用会自动识别阿里云地址并切换到百炼原生多模态生图协议。
- 模型留空或仍为默认 `gpt-image-2` 时自动使用 `qwen-image-3.0-pro`，也可显式填写；请求隐式开启 `prompt_extend: true`，输出固定为 PNG。
- 原生接口支持 1–6 张结果和最多 3 张参考图，不支持遮罩编辑；界面会按接口能力隐藏质量、压缩率、审核参数，并在亚马逊工作台与上传入口按 3 张参考图上限校验。
- 百炼返回的临时图片 URL 有效期约 24 小时，应用会立即下载并保存到本地；开发服务、Docker 与 Nginx 的图片代理白名单同步加入 `aliyuncs.com` / `aliyun.com`，跨域图片可正常下载。
- 提交：随本次 `main` 推送发布。

</details>

<details open>
<summary><strong>2026-07-27 至 2026-08-02</strong> - AI 人物媒体 XMP 打标</summary>

- 新增独立“AI 人物打标”工作区，在浏览器本地为 JPG/JPEG、PNG、WebP、MP4、MOV 写入 Amazon 要求的 `contains-synthetic-performer` XMP 标记，支持单文件下载或多文件 ZIP。
- 处理只修改 XMP/容器元数据，不重编码图片像素或音视频流；写入前会先验证现有 XMP，已正确包含标记的文件不会重复写入或打包。
- 单文件最大 500 MB、单批最大 1 GB；队列中的图片/视频预览完全在浏览器内完成，原文件不会被覆盖，也不会上传服务器。
- 提交：`679618f`。

</details>

<details>
<summary><strong>2026-07-20 至 2026-07-26 · v0.2.0</strong> - iOS 视觉重构、Seedream 图片编辑与开源声明</summary>

- 工作台完成 iOS / Apple 风格视觉重构，统一浅色、深色、桌面和移动端的导航、卡片、弹层、菜单、Toast 与底部操作区。
- 新增独立“图片编辑”工作区，支持从本地图片或历史结果开始编辑，添加参考图、绘制框选/箭头/涂画等视觉标注，并使用 Seedream 5.0 Pro 执行添加、删除、替换、改色、换材质和草图渲染。
- 设置页新增独立 Seedream 图片编辑配置，不改变首页图片生成连接；编辑结果可以继续设为主图并迭代处理。
- 顶部新增“开源声明”常驻入口；关于页和 README 增加开源与第三方收费说明、官方仓库核验入口及 Issues 举报入口，不改变 MIT License 的商业使用授权。
- 关于页使用 Ali-Aria 头像替换默认 GitHub 图标。
- 设置页的公众号名称“阿梨Aria早鸟报”支持点击或键盘复制，并在复制成功后显示提示。
- 版本号由 `0.1.0` 提升至 `0.2.0`。
- 提交：`edf05e8`、`68408bb`、`0cba8d8`、`465a1ff`、`868f9e5`。

</details>

<details>
<summary><strong>2026-07-13 至 2026-07-19</strong> - AI 策划结果兼容性修复</summary>

- 修复部分模型把 `packageIncludes` 返回为数组时触发的 AI 策划解析报错。
- 加强商品标题、品牌、类目、颜色、材质、受众和包装清单等模型返回字段的类型校验与规范化。
- `packageIncludes` 为数组时会过滤无效项并合并为可读文本，异常字段不再直接调用字符串方法。
- 提交：`dc142f0`。

</details>

<details>
<summary><strong>2026-07-06 至 2026-07-12</strong> - 多站点 AI 策划、API 配置模式与流式传输移除</summary>

- 亚马逊图片工作台新增目标站点选择，支持美国站、日本站、德国站、法国站、意大利站和西班牙站。
- AI 策划会按目标站点输出本地化图片可见文案和 A+ 外部文案，生图提示词主体继续保持英文以提高模型稳定性。
- 策划历史、任务分类、任务详情和历史搜索会保留目标站点；旧历史和旧备份缺少站点字段时默认按美国站处理。
- A+ 模块尺寸继续沿用当前应用模板，相关策划文案改为“当前应用尺寸参考”，避免误认为已维护每站独立官方尺寸。
- API 配置页新增“标准双配置 / 反代或 OpenRouter 单连接”模式切换，默认继续使用独立的生图配置和 AI 策划配置。
- 单连接模式只需要维护一个当前连接的 API URL / API Key，AI 策划单独保存接口类型和模型，适合同一套反代或 OpenRouter 同时支持生图和聊天策划的场景。
- 单连接模式会隐藏内部 `AI策划` 元配置，不再把它显示在“当前连接”列表里，避免误以为还要维护两套 URL/Key。
- URL 参数导入保持兼容：普通 `apiUrl/apiKey` 只导入主连接，只有显式带 `apiSetupMode=single-connection` 时才恢复单连接和策划模型设置。
- 因部分反代或网关在流式生图时会返回 `upstream did not return image output` 等错误，移除流式传输入口，并忽略旧配置或分享链接中的流式参数。
- 提交：随本次 `main` 推送发布。

</details>

<details>
<summary><strong>2026-06-15 至 2026-06-21</strong> - 自定义策划数量、A+ 模块编排与提示词分辨率</summary>

- Listing AI 策划支持自定义图片数量，默认仍为 7 张，可在 `7-12` 张之间选择，数量包含 `MAIN` 主图。
- A+ 策划前可在右侧“模块编排”中逐行添加同尺寸模块、删除模块，并可恢复当前 A+ 类型默认编排；每个 A+ 类型支持 `1-12` 张模块。
- A+ 自定义模块数量会进入 AI 策划请求，schema、系统提示词、用户提示词、Chat JSON guide 和结果校验都会按当前模块清单执行。
- 生图最终提示词会自动追加期望输出分辨率，例如 `2048x2048` 或 `4096x4096`，让模型在提示词层面也知道目标尺寸。
- Agent 批量生图和图片工具调用同步加入输出分辨率约束，减少生成尺寸和当前参数脱节。
- 开发代理会在 API URL 与本地代理目标一致时自动启用，降低本地 HTTP/内网接口配置成本。
- 本地开发版不再内置 API 代理；如需同源代理，请使用 Docker/Nginx 等部署端代理配置。
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
- 风格板生成新增“停止”按钮，并把停止信号接入 OpenRouter、OpenAI Images API、自定义接口和 fal 请求链路。
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
