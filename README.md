# Amazon Image Studio

Amazon Image Studio 是一个面向 Amazon Listing 的产品图片策划与生成工作台，基于 [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground) 修改。

它适合用来把产品标题、五点描述、卖点文案和参考图，整理成 Amazon Listing 图片或 A+ Content 图片策划，并逐张生成图片。

## 核心功能

- AI 策划 `Main + PT01-PT06`：粘贴标题、五点描述或产品说明后，生成 7 张图片的逐张策划和英文生图提示词。
- AI 策划 A+ 图片：支持 `Standard / Premium` 两套 A+ 模块编排，并生成逐模块英文生图提示词。
- 参考图上传：支持上传产品实拍图、包装图、结构图，生成时会作为参考图一起发送。
- 逐张生成：在右侧选择 `MAIN`、`PT01`、`A+S01`、`A+P01` 等图片位后，当前 Prompt Preview 会切换到对应提示词。
- Amazon 合规提示：主图白底、商品占比、禁用 Amazon/Prime/价格/评价/Best Seller 等风险元素。
- 支持 2K / 4K 输出；Listing 图默认方图，A+ 图按模块比例生成高清图，并显示 Seller Central 上传建议尺寸。
- 支持 OpenAI / OpenAI 兼容图片接口，以及独立的 AI 策划 Responses API 配置。
- 保留原项目的参考图、遮罩编辑、历史记录、批量下载、本地 IndexedDB 存储等能力。

## 环境要求

推荐在 Windows 上使用。

需要先安装：

- Node.js
- npm

安装完成后，可以在 PowerShell 或命令行中检查：

```powershell
node --version
npm --version
```

## 首次安装

进入项目目录：

```powershell
cd "D:\82462\Desktop\AMZ\amazon-image-studio"
```

安装依赖：

```powershell
npm install
```

依赖只需要安装一次。以后日常使用直接启动即可。

## 启动项目

### 方式一：双击启动

双击项目根目录中的：

```text
start-amazon-image-studio.bat
```

脚本会启动本地开发服务，并自动打开浏览器：

```text
http://127.0.0.1:5173/
```

如果服务已经在运行，脚本会直接打开浏览器。

### 方式二：手动启动

也可以在项目目录中执行：

```powershell
npm run dev
```

然后打开终端中显示的本地地址，通常是：

```text
http://127.0.0.1:5173/
```

## 停止项目

双击项目根目录中的：

```text
stop-amazon-image-studio.bat
```

脚本会停止当前项目对应的本地开发服务。

## API 配置

打开页面后，点击右上角设置图标，进入 API 配置。

建议准备两个配置：

### 1. 生图配置

用于真正生成图片。

- 服务商：OpenAI 或 OpenAI 兼容接口
- API 接口：`Images API (/v1/images)`
- 模型：`gpt-image-2`
- API Key：填写你自己的 Key

### 2. AI 策划配置

用于根据 Listing 生成 `Main + PT01-PT06` 或 A+ 模块图片策划。

- 服务商：OpenAI
- API 接口：`Responses API (/v1/responses)`
- 模型：文本/多模态模型
- API Key：填写你自己的 Key

在设置页中，把“AI 策划配置”选择为这个 Responses API 配置。这样生图和策划不需要来回切换接口类型。

## 使用流程

1. 启动项目并打开页面。
2. 在设置中配置生图 API 和 AI 策划 API。
3. 在 Amazon 面板顶部选择 `Listing 图` 或 `A+ 图`。
4. 如果选择 `A+ 图`，再选择 `Standard` 或 `Premium` 编排。
5. 在策划输入框中粘贴产品标题、五点描述、产品说明或品牌说明。
6. 在“参考图”区域上传产品实拍图、包装图或结构图。
7. 点击 `AI策划` 或 `AI策划A+`，生成逐张方案。
8. 在右侧选择要生成的图片位，例如 `MAIN`、`PT01`、`A+S01` 或 `A+P01`。
9. 检查 Prompt Preview，必要时调整左侧商品信息。
10. 点击“填入”把当前提示词填到底部输入栏，或点击“提交生成”直接开始生成。
11. 生成完一张后，继续选择下一张图片位逐张生成。

## A+ 图片说明

Standard A+ 当前默认编排：

- `A+S01` Header Banner：上传建议 `970x300`
- `A+S02-A+S04` Single Image：上传建议 `970x600`
- `A+S05-A+S08` Highlight Tile：上传建议 `220x220`

Premium A+ 当前默认编排：

- `A+P01` Hero Banner：上传建议 `1464x600`
- `A+P02-A+P04` Feature Image：上传建议 `970x600`
- `A+P05-A+P06` Brand Story：上传建议 `463x625`

A+ 生图会按模块比例请求 2K / 4K 高清画布，页面中会同时显示“生成尺寸”和“上传建议尺寸”。当前版本不自动裁切、压缩到 2 MB，也不默认生成 Logo 图或对比图。

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
npm install
```

然后重新双击 `start-amazon-image-studio.bat`。

### 5173 端口被占用

先双击：

```text
stop-amazon-image-studio.bat
```

如果仍然提示被占用，说明 5173 可能被其它程序使用，需要先关闭对应程序。

### AI 策划失败

检查“AI 策划配置”是否使用了 `Responses API (/v1/responses)`，并确认模型不是图片生成模型。部分图片中转接口只开放 `/v1/images`，不支持 `/v1/responses`，这种情况下 AI 策划会失败。

### 生图失败

检查当前生图配置是否填写了正确的 API URL、API Key、模型和接口类型。生成图片建议使用 `Images API (/v1/images)` + `gpt-image-2`。

## 构建

如果需要生成生产构建：

```powershell
npm run build
```

构建产物在：

```text
dist/
```

## 许可与来源

本项目基于 MIT 许可的 [GPT Image Playground](https://github.com/CookSleep/gpt_image_playground) 修改，原作者为 CookSleep。

请保留应用内“关于”页中的原项目署名与 MIT 许可声明。
