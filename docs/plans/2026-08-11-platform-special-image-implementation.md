# 平台特殊图 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有即时零售 7 图工作台中增加一个由类目、可信商品字段和真实参考图驱动的可选平台特殊图，并确保资质类材料永远不会被 AI 生成。

**Architecture:** 新增纯函数特殊图策略层，负责字段可信度、类型资格、自动路由和缺口说明；项目层保存手动选型与参考图角色，策划层把具备资格的结果扩展为第 8 个图片位。确定性类型由 Canvas 使用真实商品图和可信文字合成，礼盒展示可调用现有生图链路，背标与证照只做原图适配；导出与质检把特殊图视为可选增强项，不阻断原 7 图。

**Tech Stack:** React 19、TypeScript、Vitest、Canvas、IndexedDB、fflate、Vite、lucide-react。

---

### Task 1: 建立特殊图事实安全与路由引擎

**Files:**
- Modify: `src/types.ts:147-310`
- Create: `src/lib/retailSpecialImage.test.ts`
- Create: `src/lib/retailSpecialImage.ts`
- Modify: `src/lib/retailProduct.ts`
- Modify: `src/lib/retailProduct.test.ts`

**Step 1: Write the failing policy tests**

覆盖以下行为：

```ts
it('routes a verified beverage to a product facts card')
it('routes electronics with verified dimensions to a dimension card')
it('does not use derived or unconfirmed OCR facts as visible copy')
it('requires a real gift package image before enabling gift_pack')
it('marks certificates as upload-only and never AI-generatable')
it('falls back from an invalid manual choice to the best eligible type')
```

新增领域类型：

```ts
export type RetailSpecialImageType =
  | 'product_facts'
  | 'dimension'
  | 'size_guide'
  | 'gift_pack'
  | 'back_label'
  | 'authentic_document'

export type RetailSourceImageRole =
  | 'product'
  | 'back_label'
  | 'gift_pack'
  | 'authentic_document'

export type RetailSpecialImageState =
  | 'ready'
  | 'needs-fields'
  | 'needs-upload'
  | 'not-applicable'
```

**Step 2: Run tests to verify RED**

Run: `npm test -- src/lib/retailSpecialImage.test.ts src/lib/retailProduct.test.ts`

Expected: FAIL because the special-image module and trusted-fact helpers do not exist.

**Step 3: Implement trusted facts**

Extend `RetailFactSource` with `ocr` and `derived`, add `factVerification: Record<string, boolean>` to `RetailProduct`, and implement:

```ts
export function getTrustedRetailFacts(product: RetailProduct): Record<string, string> {
  // Existing direct user fields remain trusted for backward compatibility.
  // `derived` is never visible. `ocr` requires factVerification[label] === true.
}
```

Keep `getConfirmedRetailFacts` as a compatibility alias or delegate so the existing 7-image workflow keeps its behavior.

**Step 4: Implement the pure evaluator**

Create constants for labels, required field families and archetype priorities. Export:

```ts
export function evaluateRetailSpecialImage(input: {
  product: RetailProduct
  archetype: RetailArchetype
  sourceImageRoles: Record<string, RetailSourceImageRole>
  preferredType: RetailSpecialImageType | 'auto'
}): RetailSpecialImageEvaluation
```

The result must include selected type, state, eligible types, missing fields, visible copy lines, required source role and processing mode (`deterministic`, `ai-preserve`, or `source-only`). `authentic_document` must always return `source-only`; no branch may map it to `ai-preserve`.

**Step 5: Run focused tests and commit**

Run: `npm test -- src/lib/retailSpecialImage.test.ts src/lib/retailProduct.test.ts`

Expected: PASS.

Commit:

```bash
git add src/types.ts src/lib/retailProduct.ts src/lib/retailProduct.test.ts src/lib/retailSpecialImage.ts src/lib/retailSpecialImage.test.ts
git commit -m "feat: add trusted special image policy"
```

### Task 2: Persist the optional eighth slot and source-image roles

**Files:**
- Modify: `src/types.ts:173-310`
- Modify: `src/lib/retailProject.ts`
- Modify: `src/lib/retailProject.test.ts`
- Modify: `src/lib/db.ts` only if the persisted shape needs a migration guard

**Step 1: Write failing persistence tests**

Add tests proving that:

```ts
expect(createRetailProject().slots.map((slot) => slot.slotId)).toContain('08-special')
expect(createRetailProject().specialImageType).toBe('auto')
expect(normalizeRetailProject(legacySevenSlotProject).slots).toHaveLength(8)
expect(normalizeRetailProject(projectWithRoles).sourceImageRoles).toEqual(projectWithRoles.sourceImageRoles)
```

Also verify `collectRetailProjectImageIds` includes source-only special material.

**Step 2: Run the test to verify RED**

Run: `npm test -- src/lib/retailProject.test.ts`

Expected: FAIL because the slot and project settings are absent.

**Step 3: Extend the project contract**

Add `08-special` to `RetailSlotId` and the stable slot list. Extend `RetailProject` with:

```ts
specialImageType: RetailSpecialImageType | 'auto'
sourceImageRoles: Record<string, RetailSourceImageRole>
```

New uploads default to `product`; normalization must add the eighth slot without dropping old output IDs and must discard roles for missing image IDs.

**Step 4: Run the project tests and commit**

Run: `npm test -- src/lib/retailProject.test.ts src/lib/taskHistory.test.ts`

Expected: PASS with legacy seven-slot projects normalized to eight slots.

Commit:

```bash
git add src/types.ts src/lib/retailProject.ts src/lib/retailProject.test.ts src/lib/db.ts
git commit -m "feat: persist platform special image state"
```

### Task 3: Add special-image planning and deterministic composition

**Files:**
- Modify: `src/lib/retailPlanner.ts`
- Modify: `src/lib/retailPlanner.test.ts`
- Modify: `src/lib/retailPlatform.ts`
- Modify: `src/lib/retailPlatform.test.ts`
- Modify: `src/lib/retailComposer.ts`
- Modify: `src/lib/retailComposer.test.ts`

**Step 1: Write failing planner tests**

Retain the base-slot constant and introduce a full-slot constant:

```ts
expect(RETAIL_BASE_SLOT_IDS).toHaveLength(7)
expect(RETAIL_SLOT_IDS.at(-1)).toBe('08-special')
expect(plan.find((item) => item.id === '08-special')).toMatchObject({
  specialImageType: 'product_facts',
  generationEligible: true,
  processingMode: 'deterministic',
})
```

Add a safety assertion that authentic documents produce no model prompt and use `source-only`.

**Step 2: Write failing composition tests**

Verify the special information card uses only evaluation copy lines, dimension and size layouts preserve exact values, and source-only types return an adapted original without added content.

**Step 3: Run tests to verify RED**

Run: `npm test -- src/lib/retailPlanner.test.ts src/lib/retailPlatform.test.ts src/lib/retailComposer.test.ts`

Expected: FAIL on the missing eighth slot and composition modes.

**Step 4: Implement planning**

Change `createRetailImagePlan` to accept a special-image evaluation and always append an `08-special` plan. Add plan metadata:

```ts
generationEligible: boolean
processingMode: 'ai' | 'deterministic' | 'source-only'
specialImageType?: RetailSpecialImageType
requiredSourceRole?: RetailSourceImageRole
blockedReason?: string
```

For `product_facts`, `dimension`, and `size_guide`, do not ask the model to render text. For `gift_pack`, include both real source roles and strict packaging-preservation instructions. For `back_label` and `authentic_document`, keep `prompt` empty.

**Step 5: Implement Canvas layouts**

Add separate renderers for facts, dimensions, size guide and source-only adaptation. Use the actual uploaded image as the visual asset; keep all exact text in Canvas. Do not add internal status, source labels or missing-field copy to the output.

**Step 6: Run tests and commit**

Run: `npm test -- src/lib/retailPlanner.test.ts src/lib/retailPlatform.test.ts src/lib/retailComposer.test.ts`

Expected: PASS.

Commit:

```bash
git add src/lib/retailPlanner.ts src/lib/retailPlanner.test.ts src/lib/retailPlatform.ts src/lib/retailPlatform.test.ts src/lib/retailComposer.ts src/lib/retailComposer.test.ts
git commit -m "feat: plan and compose platform special images"
```

### Task 4: Enforce special-image quality and optional export

**Files:**
- Modify: `src/lib/retailQuality.ts`
- Modify: `src/lib/retailQuality.test.ts`
- Modify: `src/lib/retailExporter.ts`
- Modify: `src/lib/retailExporter.test.ts`

**Step 1: Write failing quality tests**

Add coverage for:

```ts
it('does not block the base upload pack when an optional special image is ineligible')
it('blocks unverified visible fields in a special image')
it('blocks any authentic-document plan whose processing mode is not source-only')
it('requires the selected source role for back-label and gift-pack outputs')
```

**Step 2: Write failing export tests**

Verify that a passing special image exports as `08_特殊图_<中文类型>.png`, an unfinished or blocked special image is omitted, and the seven base images can still be `upload-ready`. Verify the manifest records selection, state, source role and trusted fact labels without embedding raw image data.

**Step 3: Run tests to verify RED**

Run: `npm test -- src/lib/retailQuality.test.ts src/lib/retailExporter.test.ts`

Expected: FAIL on special-image policy and naming.

**Step 4: Implement quality and export rules**

Separate base completeness from optional-special completeness. Export status is `upload-ready` when all seven base slots are complete and unblocked. Include the eighth file only when its slot is done and its report is not blocked.

**Step 5: Run tests and commit**

Run: `npm test -- src/lib/retailQuality.test.ts src/lib/retailExporter.test.ts`

Expected: PASS.

Commit:

```bash
git add src/lib/retailQuality.ts src/lib/retailQuality.test.ts src/lib/retailExporter.ts src/lib/retailExporter.test.ts
git commit -m "feat: validate and export optional special images"
```

### Task 5: Add workbench controls and safe execution paths

**Files:**
- Create: `src/components/retail/SpecialImageControls.tsx`
- Modify: `src/components/retail/SourceUploader.tsx`
- Modify: `src/components/retail/PlanBoard.tsx`
- Modify: `src/components/retail/RetailImageCard.tsx`
- Modify: `src/components/retail/QualityPanel.tsx`
- Modify: `src/components/retail/ProgressDock.tsx`
- Modify: `src/components/RetailStudio.tsx`
- Modify: `src/index.css`

**Step 1: Add source-role controls**

Each uploaded thumbnail gets a compact role select with `商品主体`, `包装背标`, `礼盒/外包装`, and `真实证照材料`. The first image defaults to product; changing roles updates `project.sourceImageRoles` without changing or duplicating image data.

**Step 2: Add the special-image control section**

Show the auto-selected type, a type menu, status, and exact missing requirements. Disable unavailable manual choices with their reason. For upload-only types, make the relevant source role requirement explicit in the workbench only.

**Step 3: Update the task board and progress language**

Use `7 张基础图 + 1 张特殊图` rather than implying eight mandatory images. The eighth card must visibly distinguish `可生成`, `需要真实资料`, and `暂不生成`. Its generate button stays disabled unless the evaluator state is `ready`.

**Step 4: Route generation safely**

In `RetailStudio`:

- Build the evaluator before the plan.
- Queue all incomplete base slots plus the special slot only when eligible.
- For deterministic/source-only modes, bypass `submitPreparedTask` and compose from the required real source image.
- For gift-pack `ai` mode, pass only product and gift-pack references to the existing task API.
- A missing special image never prevents generating or exporting the base seven.
- Product or role changes invalidate an existing special output and quality state.

**Step 5: Update responsive CSS**

Keep three desktop columns and the current two-column mobile image grid. Add stable heights for the special state area, fit all select text, and verify the mobile action dock does not cover the eighth card.

**Step 6: Run focused and full tests, then commit**

Run: `npm test -- src/lib/retailSpecialImage.test.ts src/lib/retailProject.test.ts src/lib/retailPlanner.test.ts src/lib/retailComposer.test.ts src/lib/retailQuality.test.ts src/lib/retailExporter.test.ts`

Run: `npm test`

Expected: all tests PASS.

Commit:

```bash
git add src/components/retail/SpecialImageControls.tsx src/components/retail/SourceUploader.tsx src/components/retail/PlanBoard.tsx src/components/retail/RetailImageCard.tsx src/components/retail/QualityPanel.tsx src/components/retail/ProgressDock.tsx src/components/RetailStudio.tsx src/index.css
git commit -m "feat: add special image workbench flow"
```

### Task 6: Verify representative category paths and visual behavior

**Files:**
- Modify as needed based on verification findings
- Update: `README.md`

**Step 1: Run static verification**

Run: `npm test`

Expected: all Vitest files pass.

Run: `npm run build`

Expected: TypeScript and Vite build succeed without new fatal warnings.

**Step 2: Start an isolated preview**

Run: `npm run dev -- --host 127.0.0.1 --port 5174`

Expected: local preview starts without replacing the existing 5173 server.

**Step 3: Verify five representative paths in the in-app browser**

1. 饮料：完整字段自动选择商品信息卡并生成 exact copy。
2. 酒类礼盒：无礼盒参考图时提示上传；有真实礼盒图后可生成。
3. 家电：有尺寸/功率时选择尺寸参数图，无参数时不编造。
4. 服饰：有尺码映射时选择尺码参考图。
5. 医疗器械：证照类型只能使用上传原件，绝不发起 AI 请求。

Check desktop and mobile viewport for overlap, clipping, button state, readable status, and consistent spacing.

**Step 4: Verify export contents**

Export once with a passing special image and once without one. Confirm the first ZIP contains eight images and traceable manifest metadata; the second contains the original seven images with no empty eighth file.

**Step 5: Update documentation and rerun checks**

Document the special-image rules and authenticity boundary in `README.md`, then rerun `npm test` and `npm run build`.

**Step 6: Commit**

```bash
git add README.md src
git commit -m "docs: verify platform special image workflow"
```
