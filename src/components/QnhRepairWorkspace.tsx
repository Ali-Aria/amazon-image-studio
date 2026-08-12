import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Eye,
  ImageOff,
  Images,
  Link2,
  LoaderCircle,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import type {
  QnhAuthenticityChecklist,
  QnhBridgeHealth,
  QnhExecutionSummary,
  QnhInventoryImage,
  QnhOutputReview,
  QnhRepairDraft,
  RetailProject,
  RetailSlotId,
} from '../types'
import { getAllRetailProjects, getImage, putRetailProject } from '../lib/db'
import { normalizeRetailProject, RETAIL_PROJECTS_CHANGED_EVENT } from '../lib/retailProject'
import {
  applyQnhInventory,
  buildQnhRepairPlanRequest,
  getQnhInventoryImages,
  getQnhRepairReadiness,
  normalizeQnhBridgeUrl,
  syncQnhRepairOutputReviews,
} from '../lib/qnhRepair'
import {
  createQnhRepairPlan,
  executeQnhRepairPlan,
  fetchQnhBridgeHealth,
  fetchQnhInventory,
  fetchQnhRepairPlan,
} from '../lib/qnhBridgeClient'
import { useStore } from '../store'
import QnhCompareModal from './qnh/QnhCompareModal'

type MobileTab = 'connection' | 'inventory' | 'compare' | 'execute'

const SLOT_LABELS: Record<RetailSlotId, string> = {
  '01-main': '01 主图',
  '02-front': '02 商品正面',
  '03-selling-points': '03 核心卖点',
  '04-detail': '04 商品细节',
  '05-scene': '05 使用场景',
  '06-specification': '06 规格信息',
  '07-detail-page': '07 详情长图',
  '08-special': '08 平台特殊图',
}

const ROLE_LABELS = {
  product: '商品实拍',
  back_label: '包装背标',
  gift_pack: '礼盒实拍',
  authentic_document: '真实证照',
} as const

const CHECKLIST_LABELS: Array<[keyof QnhAuthenticityChecklist, string]> = [
  ['packagingText', '包装文字逐字一致'],
  ['brand', '品牌与商标一致'],
  ['specification', '规格与净含量一致'],
  ['color', '颜色与印刷一致'],
  ['unitCount', '件数与组合一致'],
  ['structure', '包装结构无增删'],
]

const REMOVE_REASONS = [
  '其他平台水印',
  '二维码或联系方式',
  '价格或促销信息',
  '绝对化或功效暗示',
  '评价、销量或排名内容',
  '与当前商品不一致',
  '低清、遮挡或变形',
]

function imageLabel(image: QnhInventoryImage) {
  if (image.kind === 'main') return `主图 ${image.index + 1}`
  if (image.kind === 'detail') return `详情图 ${image.index + 1}`
  return `特殊图 ${image.pictureType ?? ''} · ${image.index + 1}`
}

function blankExecution(planId: string): QnhExecutionSummary {
  return { planId, status: 'planned', startedAt: null, finishedAt: null, error: null, ledger: [] }
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export default function QnhRepairWorkspace() {
  const showToast = useStore((state) => state.showToast)
  const [projects, setProjects] = useState<RetailProject[]>([])
  const [project, setProject] = useState<RetailProject | null>(null)
  const [health, setHealth] = useState<QnhBridgeHealth | null>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  const [mobileTab, setMobileTab] = useState<MobileTab>('connection')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [compare, setCompare] = useState<{ sourceUrl: string; outputUrl?: string; sourceLabel?: string; outputLabel?: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    void getAllRetailProjects().then((saved) => {
      if (cancelled) return
      const normalized = saved.map((item) => normalizeRetailProject(item)).sort((a, b) => b.updatedAt - a.updatedAt)
      const active = normalized[0] ?? null
      setProjects(normalized)
      setProject(active ? { ...active, qnhRepair: syncQnhRepairOutputReviews(active) } : null)
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '商品项目加载失败'))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!project) return
    const synced = syncQnhRepairOutputReviews(project)
    if (!sameJson(synced, project.qnhRepair)) {
      setProject({ ...project, qnhRepair: synced, updatedAt: Date.now() })
    }
  }, [project])

  useEffect(() => {
    if (!project) return
    let cancelled = false
    const ids = [...new Set([
      ...project.sourceImageIds,
      ...project.slots.flatMap((slot) => [slot.composedImageId, slot.outputImageId]).filter((id): id is string => Boolean(id)),
    ])]
    void Promise.all(ids.map(async (id) => [id, await getImage(id)] as const)).then((entries) => {
      if (cancelled) return
      setImages(Object.fromEntries(entries.flatMap(([id, image]) => image?.dataUrl ? [[id, image.dataUrl]] : [])))
    })
    return () => { cancelled = true }
  }, [project?.id, project?.sourceImageIds, project?.slots])

  useEffect(() => {
    if (!project) return
    const timer = window.setTimeout(() => {
      void putRetailProject(project)
      setProjects((current) => current.map((item) => item.id === project.id ? project : item).sort((a, b) => b.updatedAt - a.updatedAt))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [project])

  const updateProject = useCallback((updater: (current: RetailProject) => RetailProject) => {
    setProject((current) => current ? updater(current) : current)
  }, [])

  const updateDraft = useCallback((updater: (current: QnhRepairDraft) => QnhRepairDraft, invalidatePlan = true) => {
    updateProject((current) => {
      const next = updater(current.qnhRepair)
      return {
        ...current,
        qnhRepair: invalidatePlan ? { ...next, planId: null, planSummary: null, execution: null } : next,
        updatedAt: Date.now(),
      }
    })
    if (invalidatePlan) setConfirmation('')
  }, [updateProject])

  const connect = useCallback(async () => {
    if (!project) return
    setBusy('connect')
    setError('')
    try {
      const next = await fetchQnhBridgeHealth(project.qnhRepair.bridgeUrl)
      setHealth(next)
      showToast(`已连接 ${next.storeName}`, 'success')
    } catch (reason) {
      setHealth(null)
      setError(reason instanceof Error ? reason.message : 'Bridge 连接失败')
    } finally {
      setBusy(null)
    }
  }, [project, showToast])

  useEffect(() => {
    if (!project) return
    void connect()
  }, [project?.id])

  if (!project) {
    return (
      <main className="qnh-repair-workspace">
        <div className="qnh-empty-state"><Images size={30} /><strong>还没有商品项目</strong><span>先在出图工作台建立商品并生成需要审核的图片。</span></div>
      </main>
    )
  }

  const draft = project.qnhRepair
  const readiness = getQnhRepairReadiness(draft)
  const inventoryImages = draft.inventory ? getQnhInventoryImages(draft.inventory) : []
  const outputReviews = Object.values(draft.outputReviews).filter((item): item is QnhOutputReview => Boolean(item))
  const passedOutputs = outputReviews.filter((item) => item.verdict === 'pass')
  const removedCount = Object.values(draft.existingDecisions).filter((item) => item.decision === 'remove').length

  const selectProject = (id: string) => {
    const next = projects.find((item) => item.id === id)
    if (!next) return
    setHealth(null)
    setConfirmation('')
    setProject({ ...next, qnhRepair: syncQnhRepairOutputReviews(next) })
  }

  const changeBridgeUrl = (value: string) => {
    setHealth(null)
    updateDraft((current) => ({
      ...current,
      bridgeUrl: value,
      inventory: null,
      existingDecisions: {},
      outputReviews: {},
      detachAcknowledged: false,
    }))
  }

  const changeSpu = (value: string) => {
    updateDraft((current) => ({
      ...current,
      spuId: value.replace(/\D/g, ''),
      inventory: null,
      existingDecisions: {},
      outputReviews: {},
      detachAcknowledged: false,
    }))
  }

  const loadInventory = async () => {
    setBusy('inventory')
    setError('')
    try {
      const baseUrl = normalizeQnhBridgeUrl(draft.bridgeUrl)
      if (!health) setHealth(await fetchQnhBridgeHealth(baseUrl))
      const inventory = await fetchQnhInventory(baseUrl, draft.spuId)
      updateDraft((current) => applyQnhInventory(current, inventory), false)
      setMobileTab('inventory')
      showToast(`已读取 ${inventory.productName || inventory.spuId} 的完整图集`, 'success')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图集读取失败')
    } finally {
      setBusy(null)
    }
  }

  const reviewExisting = (imageId: string, decision: 'keep' | 'remove') => {
    updateDraft((current) => ({
      ...current,
      existingDecisions: {
        ...current.existingDecisions,
        [imageId]: {
          decision,
          reason: decision === 'keep' ? '' : current.existingDecisions[imageId]?.reason ?? '',
        },
      },
    }))
  }

  const changeRemovalReason = (imageId: string, reason: string) => {
    updateDraft((current) => ({
      ...current,
      existingDecisions: {
        ...current.existingDecisions,
        [imageId]: { decision: 'remove', reason },
      },
    }))
  }

  const updateOutputReview = (slotId: RetailSlotId, patch: Partial<QnhOutputReview>) => {
    updateDraft((current) => {
      const review = current.outputReviews[slotId]
      if (!review) return current
      return { ...current, outputReviews: { ...current.outputReviews, [slotId]: { ...review, ...patch } } }
    })
  }

  const createPlan = async () => {
    if (!health) {
      setError('请先连接本地 QNH Bridge')
      return
    }
    setBusy('plan')
    setError('')
    try {
      const request = buildQnhRepairPlanRequest({ project, health, imageDataUrls: images })
      const summary = await createQnhRepairPlan(draft.bridgeUrl, request)
      updateDraft((current) => ({
        ...current,
        planId: summary.planId,
        planSummary: summary,
        execution: blankExecution(summary.planId),
      }), false)
      setConfirmation('')
      setMobileTab('execute')
      showToast('不可变修复计划已创建', 'success')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '计划创建失败')
    } finally {
      setBusy(null)
    }
  }

  const refreshPlan = async () => {
    if (!draft.planId) return
    setBusy('refresh')
    setError('')
    try {
      const execution = await fetchQnhRepairPlan(draft.bridgeUrl, draft.planId)
      updateDraft((current) => ({ ...current, execution }), false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '计划状态读取失败')
    } finally {
      setBusy(null)
    }
  }

  const executePlan = async () => {
    if (!draft.planId || !draft.planSummary) return
    setBusy('execute')
    setError('')
    try {
      const execution = await executeQnhRepairPlan(draft.bridgeUrl, draft.planId, confirmation)
      updateDraft((current) => ({
        ...current,
        planSummary: current.planSummary ? { ...current.planSummary, status: execution.status } : null,
        execution,
      }), false)
      showToast(execution.status === 'succeeded' ? 'QNH 图集写入并回读一致' : '执行已停止，请查看台账', execution.status === 'succeeded' ? 'success' : 'error')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '执行失败')
      await refreshPlan()
    } finally {
      setBusy(null)
    }
  }

  const connectionPanel = (
    <aside className={`qnh-panel qnh-connection-panel ${mobileTab === 'connection' ? 'is-mobile-active' : ''}`}>
      <div className="qnh-panel-heading"><Server size={17} /><div><h2>本地执行器</h2><span>门店身份与目标商品</span></div></div>
      <label className="qnh-field">
        <span>商品项目</span>
        <select value={project.id} onChange={(event) => selectProject(event.target.value)}>
          {projects.map((item) => <option key={item.id} value={item.id}>{item.product.name || item.title}</option>)}
        </select>
      </label>
      <div className="qnh-product-summary">
        <strong>{project.product.name || '未命名商品'}</strong>
        <span>{project.product.sku || '无货号'} · {project.product.barcode || '无条码'}</span>
        <b>{outputReviews.length} 张成图待纳入审核</b>
      </div>
      <label className="qnh-field">
        <span>Bridge 地址</span>
        <input value={draft.bridgeUrl} onChange={(event) => changeBridgeUrl(event.target.value)} spellCheck={false} />
      </label>
      <button className="qnh-secondary-command" type="button" onClick={() => void connect()} disabled={Boolean(busy)}>
        {busy === 'connect' ? <LoaderCircle className="is-spinning" size={16} /> : <Link2 size={16} />}
        {health ? '重新连接' : '连接执行器'}
      </button>
      <div className={`qnh-bridge-status ${health ? 'is-connected' : ''}`}>
        {health ? <CheckCircle2 size={17} /> : <Circle size={17} />}
        <div>
          <strong>{health ? health.storeName : '执行器未连接'}</strong>
          <span>{health ? `租户 ${health.tenantId} · 门店 ${health.storeId} · ${health.mode === 'fake' ? '演练模式' : '真实模式'}` : '默认端口 8768，仅接受本机回环连接'}</span>
        </div>
      </div>
      <label className="qnh-field">
        <span>牵牛花 SPU ID</span>
        <input value={draft.spuId} onChange={(event) => changeSpu(event.target.value)} inputMode="numeric" placeholder="输入数字 SPU" />
      </label>
      <button className="qnh-primary-command" type="button" onClick={() => void loadInventory()} disabled={Boolean(busy) || !/^\d+$/.test(draft.spuId)}>
        {busy === 'inventory' ? <LoaderCircle className="is-spinning" size={16} /> : <RefreshCw size={16} />}
        读取完整图集
      </button>
      {!health && <code className="qnh-start-command">npm run qnh:bridge:fake</code>}
    </aside>
  )

  const inventoryPanel = (
    <section className={`qnh-panel qnh-inventory-panel ${mobileTab === 'inventory' ? 'is-mobile-active' : ''}`}>
      <div className="qnh-panel-heading"><Images size={17} /><div><h2>现有图集</h2><span>逐张保留或剔除</span></div><b>{readiness.reviewedExisting}/{readiness.totalExisting}</b></div>
      {!draft.inventory ? (
        <div className="qnh-panel-empty"><ImageOff size={28} /><strong>尚未读取图集</strong><span>连接执行器并读取 SPU 后开始审核。</span></div>
      ) : (
        <>
          <div className="qnh-inventory-meta">
            <div><strong>{draft.inventory.productName}</strong><span>SPU {draft.inventory.spuId}</span></div>
            <div><b>{draft.inventory.customizedMain ? '门店主图已自定义' : '主图继承主档'}</b><b>{draft.inventory.customizedDetail ? '门店详情已自定义' : '详情继承主档'}</b></div>
          </div>
          <div className="qnh-inventory-grid">
            {inventoryImages.map((image) => {
              const review = draft.existingDecisions[image.id]
              return (
                <article key={image.id} className={`qnh-inventory-item ${review?.decision === 'remove' ? 'is-remove' : review?.decision === 'keep' ? 'is-keep' : ''}`}>
                  <button type="button" className="qnh-image-preview" onClick={() => setCompare({ sourceUrl: image.url, sourceLabel: imageLabel(image) })} aria-label={`检查${imageLabel(image)}`}>
                    <img src={image.url} alt={imageLabel(image)} />
                    <span><Eye size={14} />放大</span>
                  </button>
                  <div className="qnh-image-review">
                    <strong>{imageLabel(image)}</strong>
                    <div className="qnh-segmented">
                      <button type="button" className={review?.decision === 'keep' ? 'is-active keep' : ''} onClick={() => reviewExisting(image.id, 'keep')}><Check size={14} />保留</button>
                      <button type="button" className={review?.decision === 'remove' ? 'is-active remove' : ''} onClick={() => reviewExisting(image.id, 'remove')}><ImageOff size={14} />剔除</button>
                    </div>
                    {review?.decision === 'remove' && (
                      <select aria-label={`${imageLabel(image)}剔除原因`} value={review.reason} onChange={(event) => changeRemovalReason(image.id, event.target.value)}>
                        <option value="">选择剔除原因</option>
                        {REMOVE_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                      </select>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )

  const comparePanel = (
    <section className={`qnh-panel qnh-output-panel ${mobileTab === 'compare' ? 'is-mobile-active' : ''}`}>
      <div className="qnh-panel-heading"><ShieldCheck size={17} /><div><h2>源图与成图</h2><span>包装保真人工闸门</span></div><b>{passedOutputs.length}/{outputReviews.length}</b></div>
      {outputReviews.length === 0 ? (
        <div className="qnh-panel-empty"><ImageOff size={28} /><strong>当前项目没有可审核成图</strong><span>回到出图工作台完成至少一张图片。</span></div>
      ) : (
        <div className="qnh-output-list">
          {outputReviews.map((review) => {
            const sourceUrl = images[review.sourceImageId]
            const outputUrl = images[review.outputImageId]
            const planSpecial = review.slotId === '08-special'
            return (
              <article key={review.slotId} className={`qnh-output-item verdict-${review.verdict}`}>
                <header><div><strong>{SLOT_LABELS[review.slotId]}</strong><span>写入：{review.target === 'main' ? '商品轮播图' : review.target === 'detail' ? '详情图' : '平台特殊图'}</span></div><b>{review.verdict === 'pass' ? 'PASS' : review.verdict === 'reject' ? 'REJECT' : '未审核'}</b></header>
                <div className="qnh-output-images">
                  <button type="button" onClick={() => sourceUrl && outputUrl && setCompare({ sourceUrl, outputUrl, sourceLabel: '真实来源图', outputLabel: SLOT_LABELS[review.slotId] })} disabled={!sourceUrl || !outputUrl}>
                    {sourceUrl ? <img src={sourceUrl} alt={`${SLOT_LABELS[review.slotId]}来源图`} /> : <span>缺来源图</span>}
                    <small>真实来源图</small>
                  </button>
                  <button type="button" onClick={() => sourceUrl && outputUrl && setCompare({ sourceUrl, outputUrl, sourceLabel: '真实来源图', outputLabel: SLOT_LABELS[review.slotId] })} disabled={!sourceUrl || !outputUrl}>
                    {outputUrl ? <img src={outputUrl} alt={`${SLOT_LABELS[review.slotId]}成图`} /> : <span>缺成图</span>}
                    <small>拟写入图</small>
                  </button>
                </div>
                <div className="qnh-output-controls">
                  <label><span>真实来源</span><select value={review.sourceImageId} disabled={review.processingMode === 'source-only'} onChange={(event) => {
                    const id = event.target.value
                    updateOutputReview(review.slotId, { sourceImageId: id, sourceRole: project.sourceImageRoles[id] ?? 'product', verdict: 'unreviewed' })
                  }}>
                    <option value="">选择来源图</option>
                    {project.sourceImageIds.map((id, index) => <option key={id} value={id}>来源图 {index + 1} · {ROLE_LABELS[project.sourceImageRoles[id] ?? 'product']}</option>)}
                  </select></label>
                  {planSpecial && <label><span>pictureType</span><select value={review.pictureType ?? ''} onChange={(event) => updateOutputReview(review.slotId, { pictureType: event.target.value ? Number(event.target.value) : null, verdict: 'unreviewed' })}>
                    <option value="">选择牵牛花特殊图类型</option>
                    {draft.inventory?.specialImages.map((item) => <option key={item.pictureType} value={item.pictureType}>{item.pictureType} · {item.label}{item.required ? '（必需）' : ''}</option>)}
                  </select></label>}
                </div>
                <div className="qnh-checklist">
                  {CHECKLIST_LABELS.map(([key, label]) => <label key={key}><input type="checkbox" checked={review.checklist[key]} onChange={(event) => updateOutputReview(review.slotId, { checklist: { ...review.checklist, [key]: event.target.checked }, verdict: 'unreviewed' })} /><span>{label}</span></label>)}
                </div>
                <textarea value={review.note} onChange={(event) => updateOutputReview(review.slotId, { note: event.target.value })} placeholder="审核备注（可选）" rows={2} />
                <div className="qnh-verdict-actions">
                  <button type="button" className={review.verdict === 'reject' ? 'is-reject' : ''} onClick={() => updateOutputReview(review.slotId, { verdict: 'reject' })}><XCircle size={16} />REJECT</button>
                  <button type="button" className={review.verdict === 'pass' ? 'is-pass' : ''} onClick={() => updateOutputReview(review.slotId, { verdict: 'pass' })}><CheckCircle2 size={16} />PASS</button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )

  const executionPanel = (
    <aside className={`qnh-panel qnh-execution-panel ${mobileTab === 'execute' ? 'is-mobile-active' : ''}`}>
      <div className="qnh-panel-heading"><ClipboardCheck size={17} /><div><h2>计划与执行</h2><span>不可变计划和回读台账</span></div></div>
      <div className={`qnh-readiness ${readiness.ready ? 'is-ready' : ''}`}>
        {readiness.ready ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
        <div><strong>{readiness.ready ? '审核条件已满足' : `${readiness.issues.length} 项待处理`}</strong><span>保留/剔除 {readiness.reviewedExisting}/{readiness.totalExisting} · PASS {readiness.passedOutputs}</span></div>
      </div>
      {!readiness.ready && <div className="qnh-issues">{readiness.issues.map((issue) => <div key={issue}><Circle size={8} />{issue}</div>)}</div>}
      <div className="qnh-change-summary">
        <div><span>保留现有图</span><strong>{Math.max(0, readiness.totalExisting - removedCount)}</strong></div>
        <div><span>剔除</span><strong>{removedCount}</strong></div>
        <div><span>新增主/附图</span><strong>{passedOutputs.filter((item) => item.target === 'main').length}</strong></div>
        <div><span>详情 / 特殊</span><strong>{passedOutputs.filter((item) => item.target === 'detail').length} / {passedOutputs.filter((item) => item.target === 'special').length}</strong></div>
      </div>
      <label className="qnh-detach-ack"><input type="checkbox" checked={draft.detachAcknowledged} onChange={(event) => updateDraft((current) => ({ ...current, detachAcknowledged: event.target.checked }))} /><span><strong>确认门店级图片解耦</strong><small>写入后，本店图片不再自动跟随租户主档后续图片更新。</small></span></label>
      {!draft.planSummary ? (
        <button type="button" className="qnh-primary-command" onClick={() => void createPlan()} disabled={Boolean(busy) || !readiness.ready || !health}>
          {busy === 'plan' ? <LoaderCircle className="is-spinning" size={16} /> : <ClipboardCheck size={16} />}
          生成不可变计划
        </button>
      ) : (
        <>
          <div className="qnh-plan-summary">
            <div><span>计划 ID</span><code>{draft.planSummary.planId}</code></div>
            <div><span>SHA-256</span><code>{draft.planSummary.sha256.slice(0, 16)}...</code></div>
            <div><span>状态</span><b className={`status-${draft.execution?.status ?? draft.planSummary.status}`}>{draft.execution?.status ?? draft.planSummary.status}</b></div>
          </div>
          <div className="qnh-confirmation">
            <label><span>逐字输入确认短语</span><code>{draft.planSummary.confirmationPhrase}</code><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={draft.execution?.status === 'succeeded' || draft.execution?.status === 'executing'} /></label>
            <button type="button" className="qnh-danger-command" onClick={() => void executePlan()} disabled={Boolean(busy) || confirmation !== draft.planSummary.confirmationPhrase || draft.execution?.status === 'succeeded'}>
              {busy === 'execute' ? <LoaderCircle className="is-spinning" size={16} /> : <Play size={16} />}
              上传、写入并回读
            </button>
          </div>
        </>
      )}
      {draft.execution && (
        <div className="qnh-ledger">
          <header><strong>执行台账</strong><button type="button" onClick={() => void refreshPlan()} disabled={Boolean(busy)} aria-label="刷新执行台账" title="刷新"><RefreshCw size={14} /></button></header>
          {draft.execution.error && <div className="qnh-ledger-error"><XCircle size={14} />{draft.execution.error}</div>}
          {draft.execution.ledger.length === 0 ? <p>尚未执行</p> : draft.execution.ledger.map((entry, index) => <div key={`${entry.ts}-${index}`} className={`is-${entry.status}`}><span>{entry.ts.slice(11, 19)}</span><b>{entry.phase}</b><p>{entry.message}</p></div>)}
        </div>
      )}
    </aside>
  )

  return (
    <main className="qnh-repair-workspace">
      <div className="qnh-repair-toolbar">
        <div><ShieldCheck size={20} /><div><h1>商品图修复</h1><span>盘点 · 保真审核 · 受控写入 · exact 回读</span></div></div>
        <div className="qnh-toolbar-status"><b>{health?.storeName ?? '未连接门店'}</b><span>{draft.inventory ? `快照 ${draft.inventory.fingerprint.slice(0, 10)}` : '无图集快照'}</span></div>
      </div>
      {error && <div className="qnh-error-banner"><AlertTriangle size={16} /><span>{error}</span><button type="button" onClick={() => setError('')}>关闭</button></div>}
      <nav className="qnh-mobile-tabs" aria-label="修复工作区阶段">
        {([
          ['connection', Server, '连接'],
          ['inventory', Images, '图集'],
          ['compare', ShieldCheck, '对比'],
          ['execute', ClipboardCheck, '执行'],
        ] as const).map(([id, Icon, label]) => <button type="button" key={id} className={mobileTab === id ? 'is-active' : ''} onClick={() => setMobileTab(id)}><Icon size={15} />{label}</button>)}
      </nav>
      <div className="qnh-repair-layout">
        {connectionPanel}
        <div className="qnh-center-stack">
          {inventoryPanel}
          {comparePanel}
        </div>
        {executionPanel}
      </div>
      <div className="qnh-mobile-dock">
        <div><strong>{readiness.reviewedExisting}/{readiness.totalExisting}</strong><span>图集审核</span></div>
        {mobileTab === 'connection' && <button type="button" onClick={() => void loadInventory()} disabled={Boolean(busy) || !/^\d+$/.test(draft.spuId)}>读取完整图集</button>}
        {mobileTab === 'inventory' && <button type="button" onClick={() => setMobileTab('compare')} disabled={!draft.inventory}>进入成图对比</button>}
        {mobileTab === 'compare' && <button type="button" onClick={() => setMobileTab('execute')}>查看执行条件</button>}
        {mobileTab === 'execute' && !draft.planSummary && <button type="button" onClick={() => void createPlan()} disabled={!readiness.ready || !health}>生成不可变计划</button>}
        {mobileTab === 'execute' && draft.planSummary && <button type="button" onClick={() => void executePlan()} disabled={confirmation !== draft.planSummary.confirmationPhrase || draft.execution?.status === 'succeeded'}>上传、写入并回读</button>}
      </div>
      {compare && <QnhCompareModal {...compare} onClose={() => setCompare(null)} />}
    </main>
  )
}
