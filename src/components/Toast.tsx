import { useStore } from '../store'

export default function Toast() {
  const toast = useStore((s) => s.toast)

  if (!toast) return null

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )
      default:
        return (
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[hsl(var(--ios-blue-tint))] text-[hsl(var(--primary))]">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
    }
  }

  return (
    <div className="fixed bottom-24 left-1/2 z-[120] pointer-events-none toast-enter">
      <div className="ios-floating-chrome flex w-max max-w-[calc(100vw-32px)] items-center gap-2.5 rounded-full px-5 py-3.5 text-sm font-medium text-gray-700 dark:text-gray-300 sm:max-w-[min(28rem,60vw)]">
        <span className="flex-shrink-0">{getIcon()}</span>
        <span className="leading-5 whitespace-pre-line text-center">{toast.message}</span>
      </div>
    </div>
  )
}
