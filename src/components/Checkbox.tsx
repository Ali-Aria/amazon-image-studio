import React from 'react'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: React.ReactNode
  tone?: 'primary' | 'danger'
}

export function Checkbox({ checked, onChange, label, tone = 'primary', className, ...props }: CheckboxProps) {
  const toneClasses = tone === 'danger'
    ? 'border-red-300/60 checked:bg-red-500 checked:border-red-500 focus:ring-red-500/20 dark:border-red-500/30'
    : 'border-gray-300 checked:bg-blue-500 checked:border-blue-500 focus:ring-blue-500/20 dark:border-white/15'

  return (
    <label className={`group flex min-h-9 cursor-pointer items-center gap-2.5 ${className || ''}`}>
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className={`peer h-5 w-5 cursor-pointer appearance-none rounded-md border bg-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-white dark:bg-white/5 dark:focus:ring-offset-gray-900 ${toneClasses}`}
          {...props}
        />
        <svg className="pointer-events-none absolute h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      {label && <span className="text-[13px] font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">{label}</span>}
    </label>
  )
}
