# QNH 商品图 Bridge

QNH Bridge 是“商品图修复”工作区与本机牵牛花图片管线之间的受控执行器。浏览器负责完整盘点和人工审核，Bridge 负责把审核结果固化为不可变计划，并在明确确认后执行上传、完整图集写入和 fresh-fetch exact 回读。

## 安全边界

- 只监听 `127.0.0.1`，拒绝局域网或公网绑定。
- 只接受配置中的本机 HTTP Origin。
- 只提供 5 个固定接口，不接收任意 URL、脚本或 QNH API。
- 计划创建后按 SHA-256 固化；相同计划内容去重，不同内容不能复用同一计划 ID。
- 执行前再次读取完整图集并核对指纹；有变化立即停止。
- 同一门店使用文件锁串行执行，失败后立即停止后续步骤。
- 写入回执不是成功依据。即使写请求报错，也会立即 fresh-fetch；三类图集逐项 exact 一致才记成功。
- 证照、背标、备案、检测报告、能效和水效材料只能原图直传，禁止 AI 生成。
- 真实上传当前只允许经过实跑验证的 PNG/JPEG，WebP 在创建计划时即被拒绝。

## 演练模式

终端一启动 fake Bridge：

```bash
npm run qnh:bridge:fake
```

终端二启动工作台：

```bash
npm run dev
```

打开 Vite 地址并进入“商品图修复”，默认 Bridge 地址为 `http://127.0.0.1:8768`，演练 SPU 为 `123456789`。fake 模式会执行完整的计划、上传、写入、回读和台账流程，但不连接 QNH，也不会改动真实门店。

## 真实模式准备

真实适配器复用已经实跑的 `tools/qnh-image-pipeline/bin/qnhimg.py`，不另造上传或写入协议。先创建不会进入 Git 的本地配置：

```bash
cp tools/qnh-bridge/config.real.example.json tools/qnh-bridge/config.real.local.json
```

填写以下字段：

| 字段 | 要求 |
| --- | --- |
| `storeName` | 与 `qnhConfig` 的 `name` 完全一致 |
| `tenantId` | 与 `qnhConfig` 的 `tenantId` 完全一致 |
| `storeId` | 与 `qnhConfig` 的 `storeId` 完全一致 |
| `pipelineRoot` | 包含 `bin/qnhimg.py` 的绝对路径 |
| `qnhConfig` | 既有门店管线配置的绝对路径 |
| `dataDir` | 不可变计划、资产、快照和台账的本地目录 |
| `allowedOrigins` | 实际 Vite 本机地址的 Origin 白名单 |

`qnhConfig` 还必须包含 `cdpPort`、`origin` 和 `outDir`。启动时任一文件缺失或三项门店身份不一致，Bridge 会直接拒绝运行。

保持对应 QNH 浏览器处于已登录状态，再手动启动真实执行器：

```bash
python3 tools/qnh-bridge/run.py --config tools/qnh-bridge/config.real.local.json
```

真实执行必须在工作台中完成逐图审核、包装保真六项检查、门店图片解耦确认和一次性确认短语。不要用自动化测试或脚本代替人工确认，也不要用真实门店验证 Bridge 测试。

## 固定接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/v1/health` | 模式、门店身份和占用状态 |
| `POST` | `/v1/inventory` | 按数字 SPU 读取完整三类图集 |
| `POST` | `/v1/plans` | 校验并创建不可变计划 |
| `GET` | `/v1/plans/{planId}` | 读取计划状态和执行台账 |
| `POST` | `/v1/plans/{planId}/execute` | 校验一次性确认短语并执行 |

计划资产按内容哈希单独保存，图片 base64 不写进 `plan.json`。每次执行会保留 `snapshot_before.json`、成功后的 `snapshot_after.json`、状态文件和 JSONL 台账，便于复核实际写入结果。

## 验证

Bridge 自动测试全部使用 fake 或注入 Stub，不接触真实门店：

```bash
python3 -W error::ResourceWarning -m unittest discover -s tools/qnh-bridge/tests -v
```

前后端完整验证：

```bash
npm test
npm run build
```
