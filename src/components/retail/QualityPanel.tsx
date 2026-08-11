import { AlertTriangle, CheckCircle2, Download, ShieldCheck, XCircle } from 'lucide-react'
import type { RetailProject, RetailSlotId, RetailValidationIssue } from '../../types'
import type { RetailQualityReport } from '../../lib/retailQuality'

interface QualityPanelProps {
  project: RetailProject
  productIssues: RetailValidationIssue[]
  reports: Partial<Record<RetailSlotId, RetailQualityReport>>
  exporting: boolean
  onExport: () => void
}

export default function QualityPanel({ project, productIssues, reports, exporting, onExport }: QualityPanelProps) {
  const baseSlots = project.slots.filter((slot) => slot.slotId !== '08-special')
  const completed = baseSlots.filter((slot) => slot.status === 'done').length
  const specialSlot = project.slots.find((slot) => slot.slotId === '08-special')
  const specialPlan = project.plans.find((plan) => plan.id === '08-special')
  const reportValues = Object.values(reports).filter((value): value is RetailQualityReport => Boolean(value))
  const baseReports = baseSlots.flatMap((slot) => reports[slot.slotId] ? [reports[slot.slotId]!] : [])
  const blocked = productIssues.some((issue) => issue.severity === 'error') || baseReports.some((report) => report.status === 'blocked')
  const warnings = productIssues.filter((issue) => issue.severity === 'warning').length + reportValues.reduce(
    (count, report) => count + report.findings.filter((finding) => finding.severity === 'warning').length,
    0,
  )
  const findings = [
    ...productIssues.slice(0, 5).map((issue) => ({ severity: issue.severity === 'error' ? 'block' : 'warning', message: issue.message })),
    ...project.slots.flatMap((slot) => (reports[slot.slotId]?.findings ?? []).map((finding) => ({ ...finding, message: `${String(project.slots.indexOf(slot) + 1).padStart(2, '0')} ${finding.message}` }))),
  ].slice(0, 10)

  return (
    <aside className="retail-quality" aria-labelledby="quality-title">
      <div className="retail-section-heading">
        <div>
          <span className="retail-step-number">05</span>
          <h2 id="quality-title">质检与导出</h2>
        </div>
      </div>

      <div className={`retail-quality-summary ${blocked ? 'is-blocked' : completed === 7 ? 'is-ready' : ''}`}>
        {blocked ? <XCircle size={22} /> : completed === 7 ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
        <div>
          <strong>{blocked ? '存在阻断项' : completed === 7 ? '可导出' : `已完成 ${completed}/7`}</strong>
          <span>{warnings > 0 ? `${warnings} 项需人工复核` : '自动检查无异常'}</span>
        </div>
      </div>

      <div className="retail-quality-checks">
        <div><CheckCircle2 size={15} /><span>基础图规格</span><b>{baseReports.filter((report) => report.status !== 'blocked').length}/7</b></div>
        <div><CheckCircle2 size={15} /><span>商品资料</span><b>{productIssues.some((issue) => issue.severity === 'error') ? '待补充' : '完整'}</b></div>
        <div><CheckCircle2 size={15} /><span>包装保真</span><b>人工核对</b></div>
        <div><CheckCircle2 size={15} /><span>平台特殊图</span><b>{specialSlot?.status === 'done' ? '已加入' : specialPlan?.generationEligible ? '可生成' : '按需'}</b></div>
      </div>

      {findings.length > 0 && (
        <div className="retail-quality-findings">
          {findings.map((finding, index) => (
            <div key={`${finding.message}-${index}`} className={finding.severity === 'block' ? 'is-block' : ''}>
              {finding.severity === 'block' ? <XCircle size={14} /> : <AlertTriangle size={14} />}
              <span>{finding.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="retail-export-block">
        <span className="retail-step-number">06</span>
        <button type="button" className="retail-export-command" disabled={completed === 0 || exporting} onClick={onExport}>
          <Download size={18} />
          {exporting ? '正在打包' : blocked || completed < 7 ? '导出草稿 ZIP' : '导出上传包'}
        </button>
        <small>{project.product.sku || project.product.barcode || 'NO-SKU'} · {completed + (specialSlot?.status === 'done' ? 1 : 0)} 张图片</small>
      </div>
    </aside>
  )
}
