# QNH Image Repair Bridge Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a production-oriented QNH product-image repair workspace that inventories, reviews, plans, writes, and exact-verifies a single product through a loopback-only local executor.

**Architecture:** The React app owns non-sensitive project state, visual review, and immutable-plan preparation. A Python standard-library service bound to `127.0.0.1` owns identity enforcement, plan storage, execution locking, ledgers, and QNH access through either a fake adapter or the proven external `qnhimg.py` pipeline. The browser never receives QNH credentials or a generic command/API proxy.

**Tech Stack:** React 19, TypeScript, Vitest, IndexedDB, Python 3 standard library, existing QNH CDP pipeline.

---

### Task 1: Repair Domain and Persisted Draft

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/qnhRepair.ts`
- Create: `src/lib/qnhRepair.test.ts`
- Modify: `src/lib/retailProject.ts`
- Modify: `src/lib/retailProject.test.ts`

**Step 1: Write failing domain tests**

Cover strict loopback URL validation, empty draft creation, inventory-fingerprint invalidation, complete existing-image review, removal reasons, PASS checklist/source requirements, explicit special `pictureType`, and source-only enforcement for documents.

**Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/qnhRepair.test.ts src/lib/retailProject.test.ts`

Expected: FAIL because the QNH repair domain and persisted draft do not exist.

**Step 3: Implement the minimal domain**

Add serializable QNH types to `src/types.ts`, pure validation and request-building helpers to `src/lib/qnhRepair.ts`, and `qnhRepair` normalization to `RetailProject`. Preserve legacy projects by supplying a valid empty draft.

**Step 4: Run tests and verify GREEN**

Run: `npm test -- src/lib/qnhRepair.test.ts src/lib/retailProject.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/types.ts src/lib/qnhRepair.ts src/lib/qnhRepair.test.ts src/lib/retailProject.ts src/lib/retailProject.test.ts
git commit -m "feat: add qnh repair domain state"
```

### Task 2: Typed Loopback Bridge Client

**Files:**
- Create: `src/lib/qnhBridgeClient.ts`
- Create: `src/lib/qnhBridgeClient.test.ts`

**Step 1: Write failing client tests**

Test the health, inventory, plan, plan-status, and execute request shapes; JSON error extraction; and rejection before fetch when the URL is not loopback HTTP.

**Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/qnhBridgeClient.test.ts`

Expected: FAIL because the client module does not exist.

**Step 3: Implement the client**

Use one request helper with JSON bodies, `cache: no-store`, no credentials, and a strict base URL normalizer. Expose only the five fixed Bridge endpoints.

**Step 4: Run tests and verify GREEN**

Run: `npm test -- src/lib/qnhBridgeClient.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/qnhBridgeClient.ts src/lib/qnhBridgeClient.test.ts
git commit -m "feat: add typed qnh bridge client"
```

### Task 3: Repair Workspace UI

**Files:**
- Create: `src/components/QnhRepairWorkspace.tsx`
- Create: `src/components/qnh/QnhCompareModal.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/index.css`

**Step 1: Add a failing route assertion**

Export and test the hash parser so `#/repair` resolves to the dedicated repair workspace without changing existing routes.

**Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/qnhRepair.test.ts`

Expected: FAIL for the missing repair route behavior.

**Step 3: Implement the workspace**

Add project selection, Bridge connection status, SPU inventory loading, full existing-image keep/remove review, removal reasons, source/output comparison, six authenticity checks, PASS/REJECT decisions, explicit special-slot mapping, immutable-plan summary, detachment acknowledgement, typed confirmation, execution status, and ledger display. Persist every draft edit through the existing retail-project store.

**Step 4: Implement responsive layout**

Use an unframed three-column desktop work surface and four mobile tabs. Keep command dimensions stable, prevent image/text overlap, and use Lucide icons for tool actions.

**Step 5: Run focused tests and build**

Run: `npm test -- src/lib/qnhRepair.test.ts src/lib/qnhBridgeClient.test.ts src/lib/retailProject.test.ts`

Run: `npm run build`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/App.tsx src/components/Header.tsx src/components/QnhRepairWorkspace.tsx src/components/qnh/QnhCompareModal.tsx src/index.css
git commit -m "feat: add qnh image repair workspace"
```

### Task 4: Bridge Plan Validation and Immutable Storage

**Files:**
- Create: `tools/qnh-bridge/qnh_bridge/__init__.py`
- Create: `tools/qnh-bridge/qnh_bridge/domain.py`
- Create: `tools/qnh-bridge/qnh_bridge/repository.py`
- Create: `tools/qnh-bridge/tests/test_domain.py`
- Create: `tools/qnh-bridge/tests/test_repository.py`

**Step 1: Write failing Python tests**

Cover config identity, numeric SPU, exact inventory review coverage, mandatory removal reasons, PASS asset MIME/size checks, distinct source/output IDs, document source-only mode, explicit special type, detachment acknowledgement, canonical SHA-256, immutable plan creation, and asset extraction.

**Step 2: Run tests and verify RED**

Run: `python3 -m unittest discover -s tools/qnh-bridge/tests -v`

Expected: FAIL because the bridge package does not exist.

**Step 3: Implement validation and storage**

Normalize plans into stable JSON, decode only PNG/JPEG/WebP data URLs under the configured byte limit, write source/output assets beneath the plan directory, atomically create `plan.json` and `state.json`, and reject an existing plan ID with different content.

**Step 4: Run tests and verify GREEN**

Run: `python3 -m unittest discover -s tools/qnh-bridge/tests -v`

Expected: PASS.

**Step 5: Commit**

```bash
git add tools/qnh-bridge/qnh_bridge tools/qnh-bridge/tests
git commit -m "feat: add immutable qnh repair plans"
```

### Task 5: Loopback HTTP Service and Fake Adapter

**Files:**
- Create: `tools/qnh-bridge/qnh_bridge/adapters.py`
- Create: `tools/qnh-bridge/qnh_bridge/service.py`
- Create: `tools/qnh-bridge/qnh_bridge/server.py`
- Create: `tools/qnh-bridge/tests/test_service.py`
- Create: `tools/qnh-bridge/tests/test_http.py`
- Create: `tools/qnh-bridge/config.example.json`
- Create: `tools/qnh-bridge/run.py`

**Step 1: Write failing service and HTTP tests**

Cover health identity, fake inventory, stale-fingerprint rejection, confirmation phrase validation, non-blocking file lock conflict, stop-on-failure state, JSONL ledger records, fixed endpoints, CORS allowlist, body limit, and loopback-bind enforcement.

**Step 2: Run tests and verify RED**

Run: `python3 -m unittest discover -s tools/qnh-bridge/tests -v`

Expected: FAIL for missing service and HTTP behavior.

**Step 3: Implement fake execution and state machine**

The fake adapter returns a deterministic inventory and records the exact desired final galleries. The service checks a fresh inventory fingerprint before execution, acquires a per-store `flock`, transitions `planned -> executing -> succeeded|failed`, and appends each transition to JSONL.

**Step 4: Implement HTTP server**

Bind only `127.0.0.1`; implement the five API endpoints plus OPTIONS; reject disallowed browser origins; never expose file paths, arbitrary URLs, script execution, or a generic proxy.

**Step 5: Run tests and verify GREEN**

Run: `python3 -m unittest discover -s tools/qnh-bridge/tests -v`

Expected: PASS.

**Step 6: Commit**

```bash
git add tools/qnh-bridge
git commit -m "feat: add loopback qnh bridge service"
```

### Task 6: Proven QNH Pipeline Adapter

**Files:**
- Modify: `tools/qnh-bridge/qnh_bridge/adapters.py`
- Create: `tools/qnh-bridge/tests/test_real_adapter.py`

**Step 1: Write failing adapter contract tests**

Use an injected fake pipeline module to verify inventory normalization, tenant/store assertions, upload readback delegation, final main/detail/special list construction, one full-list store update, and fresh-fetch exact comparison. No real QNH write is permitted in tests.

**Step 2: Run tests and verify RED**

Run: `python3 -m unittest tools.qnh-bridge.tests.test_real_adapter -v`

Expected: FAIL for missing real adapter.

**Step 3: Implement the real adapter**

Dynamically load `qnhimg.py` from configured `pipelineRoot`, instantiate its `Pipeline`, delegate uploads to its byte-readback `upload_file`, use its payload helpers and scope assertion, write complete reviewed lists in one store update, and accept success only when a fresh detail fetch exactly equals every desired list.

**Step 4: Run tests and verify GREEN**

Run: `python3 -m unittest discover -s tools/qnh-bridge/tests -v`

Expected: PASS without touching a live store.

**Step 5: Commit**

```bash
git add tools/qnh-bridge/qnh_bridge/adapters.py tools/qnh-bridge/tests/test_real_adapter.py
git commit -m "feat: connect bridge to proven qnh pipeline"
```

### Task 7: Documentation, Compatibility, and Browser Acceptance

**Files:**
- Modify: `README.md`
- Create: `tools/qnh-bridge/README.md`
- Modify: `package.json`

**Step 1: Document safe startup and recovery**

Document fake and real configurations, local-only binding, QNH visible/login prerequisites, plan/ledger locations, stale inventory handling, detachment consequences, and explicit prohibition on generated compliance documents.

**Step 2: Run all automated verification**

Run: `npm test`

Run: `python3 -m unittest discover -s tools/qnh-bridge/tests -v`

Run: `npm run build`

Expected: all PASS.

**Step 3: Start the fake Bridge and Vite**

Run: `python3 tools/qnh-bridge/run.py --config tools/qnh-bridge/config.example.json`

Run: `npm run dev -- --host 127.0.0.1`

Expected: Bridge health at `http://127.0.0.1:8768/v1/health` and app on a free local Vite port.

**Step 4: Browser acceptance**

Verify desktop and 390px mobile layouts for disconnected Bridge, inventory review blocking, keep/remove reasons, source/output compare, checklist and PASS/REJECT gate, special-type mapping, detachment acknowledgement, immutable plan summary, confirmation mismatch, successful fake execution, ledger rendering, console cleanliness, and no horizontal overflow.

**Step 5: Verify compatibility**

Open the original workbench and confirm ordinary 7+1 generation state, batch products, barcode catalog fill, and both export layouts remain accessible and existing tests still pass.

**Step 6: Commit and publish**

```bash
git add README.md package.json tools/qnh-bridge/README.md
git commit -m "docs: ship qnh repair bridge workflow"
git push fork codex/platform-special-image
```

Update pull request #6 with the tested workflow and safety boundary.
