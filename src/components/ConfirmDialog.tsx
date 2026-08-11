import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { Checkbox } from './Checkbox'
import { CopyIcon } from './icons'
import { Button, type ButtonVariant } from './Button'
import { Sheet } from './Sheet'

function renderMessage(message: string) {
  return message.split(/(`[^`]+`|「[^」]+」|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
          {part.slice(1, -1)}
        </code>
      )
    }

    if (part.startsWith('「') && part.endsWith('」')) {
      return (
        <strong key={index} className="font-semibold text-gray-700 dark:text-gray-200">
          {part}
        </strong>
      )
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-semibold text-gray-700 dark:text-gray-200">
          {part.slice(2, -2)}
        </strong>
      )
    }

    return part
  })
}

function getActionButtonVariant(tone: 'primary' | 'secondary' | 'danger' | 'warning' = 'primary'): ButtonVariant {
  if (tone === 'secondary') return 'tinted'
  if (tone === 'danger' || tone === 'warning') return 'danger'
  return 'filled'
}

export default function ConfirmDialog() {
  const confirmDialog = useStore((s) => s.confirmDialog)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const [canConfirm, setCanConfirm] = useState(true)
  const [checkboxChecked, setCheckboxChecked] = useState(false)

  useEffect(() => {
    const delay = confirmDialog?.minConfirmDelayMs ?? 0
    if (!confirmDialog || delay <= 0) {
      setCanConfirm(true)
      return
    }

    setCanConfirm(false)
    const timer = window.setTimeout(() => setCanConfirm(true), delay)
    return () => window.clearTimeout(timer)
  }, [confirmDialog])

  useEffect(() => {
    setCheckboxChecked(confirmDialog?.checkbox?.defaultChecked ?? false)
  }, [confirmDialog])

  const handleClose = () => {
    if (!canConfirm) return
    setConfirmDialog(null)
  }

  const handleCancel = () => {
    confirmDialog?.cancelAction?.(checkboxChecked)
    handleClose()
  }

  useCloseOnEscape(Boolean(confirmDialog) && canConfirm, handleClose)
  usePreventBackgroundScroll(Boolean(confirmDialog))

  if (!confirmDialog) return null
  const isDestructive = confirmDialog.title.includes('删除') || confirmDialog.title.includes('清空')
  const confirmTone = confirmDialog.tone ?? (isDestructive ? 'danger' : undefined)
  const confirmVariant = getActionButtonVariant(confirmTone === 'danger' || confirmTone === 'warning' ? confirmTone : 'primary')
  const confirmText = confirmDialog.confirmText ?? (isDestructive ? '确认删除' : '确认')
  const cancelText = confirmDialog.cancelText ?? '取消'
  const customButtons = confirmDialog.buttons?.filter((button) => button.label.trim()) ?? []

  return (
    <Sheet
      onClose={handleClose}
      rootClassName="z-[110]"
      className="max-w-sm p-6 pt-8"
      labelledBy="confirm-dialog-title"
    >
        <h3 id="confirm-dialog-title" className="mb-2 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
          {confirmDialog.icon === 'info' && (
            <svg className="h-5 w-5 shrink-0 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          )}
          {confirmDialog.icon === 'copy' && (
            <CopyIcon className="h-5 w-5 shrink-0 text-blue-500" />
          )}
          {confirmDialog.title}
        </h3>
        <p className={`text-sm text-gray-500 dark:text-gray-400 ${confirmDialog.checkbox ? 'mb-4' : 'mb-6'} leading-relaxed whitespace-pre-line ${confirmDialog.messageAlign === 'center' ? 'text-center' : ''}`}>
          {renderMessage(confirmDialog.message)}
        </p>
        {confirmDialog.checkbox && (
          <Checkbox
            checked={checkboxChecked}
            onChange={setCheckboxChecked}
            label={confirmDialog.checkbox.label}
            tone={confirmDialog.checkbox.tone}
            disabled={confirmDialog.checkbox.disabled}
            className="mb-6"
          />
        )}
        {customButtons.length > 0 ? (
          <div className="flex gap-2">
            {customButtons.map((button) => (
              <Button
                key={button.label}
                onClick={() => {
                  if (!canConfirm) return
                  button.action(checkboxChecked)
                  setConfirmDialog(null)
                }}
                disabled={!canConfirm}
                variant={getActionButtonVariant(button.tone)}
                className="flex-1"
              >
                {button.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex gap-2">
            {confirmDialog.showCancel !== false && (
              <Button
                onClick={handleCancel}
                variant="tinted"
                className="flex-1"
              >
                {cancelText}
              </Button>
            )}
            <Button
              onClick={() => {
                if (!canConfirm) return
                confirmDialog.action?.(checkboxChecked)
                setConfirmDialog(null)
              }}
              disabled={!canConfirm}
              variant={confirmVariant}
              className="flex-1"
            >
              {confirmText}
            </Button>
          </div>
        )}
    </Sheet>
  )
}
