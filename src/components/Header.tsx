import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useTooltip } from '../hooks/useTooltip'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import ViewportTooltip from './ViewportTooltip'
import HelpModal from './HelpModal'
import { HelpCircleIcon, InstallIcon, SettingsIcon } from './icons'
import { Button } from './Button'
import type { AppView } from '../lib/appRoute'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type HeaderProps = {
  activeView: AppView
  onNavigate: (view: AppView) => void
}

function isInstalledPwa() {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export default function Header({ activeView, onNavigate }: HeaderProps) {
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const [showHelp, setShowHelp] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isPwaInstalled, setIsPwaInstalled] = useState(isInstalledPwa)

  const installTooltip = useTooltip()
  const helpTooltip = useTooltip()
  const settingsTooltip = useTooltip()

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setIsPwaInstalled(false)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsPwaInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (installPrompt) {
      const promptEvent = installPrompt
      setInstallPrompt(null)

      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        setIsPwaInstalled(choice.outcome === 'accepted')
      } catch {
        setIsPwaInstalled(isInstalledPwa())
      }
    } else {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (isIos) {
        setConfirmDialog({
          title: '安装为应用',
          message: '在 Safari 浏览器中，点击底部「分享」按钮，选择「添加到主屏幕」即可安装此应用。',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      } else {
        setConfirmDialog({
          title: '安装为应用',
          message: '请在浏览器的菜单中选择「添加到主屏幕」或「安装应用」。\n\n（如果在微信等内置浏览器中，请先在外部浏览器打开）',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      }
    }
  }

  return (
    <>
      <header data-no-drag-select className={`${activeView === 'home' || activeView === 'repair' ? 'retail-app-header ' : ''}safe-area-top fixed left-0 right-0 top-0 z-40 border-b border-black/[0.06] bg-white/75 shadow-[0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-gray-950/80 dark:shadow-none`}>
        <div className="safe-area-x safe-header-inner mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            <h1 className="hidden min-w-0 min-[520px]:block">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="truncate text-[17px] font-semibold tracking-[-0.025em] text-gray-900 transition-colors hover:text-gray-600 dark:text-gray-100 dark:hover:text-gray-300 sm:text-lg"
              >
                即时零售图片工作台
              </button>
            </h1>
            <nav className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                data-nav-active={activeView === 'home'}
                className={`h-8 rounded-[10px] px-2.5 text-xs font-semibold transition sm:px-3 ${activeView === 'home' ? 'bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900' : 'text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100'}`}
              >
                <span className="hidden sm:inline">出图工作台</span><span className="sm:hidden">出图</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('repair')}
                data-nav-active={activeView === 'repair'}
                className={`h-8 rounded-[10px] px-2.5 text-xs font-semibold transition sm:px-3 ${activeView === 'repair' ? 'bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900' : 'text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100'}`}
              >
                商品图修复
              </button>
              <button
                type="button"
                onClick={() => onNavigate('editor')}
                data-nav-active={activeView === 'editor'}
                className={`h-8 rounded-[10px] px-2.5 text-xs font-semibold transition sm:px-3 ${activeView === 'editor' ? 'bg-[hsl(var(--primary))] text-white shadow-sm' : 'text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100'}`}
              >
                <span className="hidden sm:inline">图片编辑</span><span className="sm:hidden">编辑</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('tagger')}
                data-nav-active={activeView === 'tagger'}
                className={`hidden h-8 rounded-[10px] px-2.5 text-xs font-semibold transition min-[820px]:inline-flex min-[820px]:items-center sm:px-3 ${activeView === 'tagger' ? 'bg-[hsl(var(--primary))] text-white shadow-sm' : 'text-gray-500 hover:bg-black/[0.05] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100'}`}
              >
                AI 人物打标
              </button>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setShowSettings(true, 'about')}
              className="hidden h-8 whitespace-nowrap rounded-[10px] px-2 text-[11px] font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--ios-blue-tint))] active:translate-y-px sm:px-2.5 sm:text-xs min-[620px]:inline-flex min-[620px]:items-center"
            >
              开源声明
            </button>
            {!isPwaInstalled && (
              <div
                className="relative"
                {...installTooltip.handlers}
              >
                <Button
                  onClick={() => {
                    dismissAllTooltips()
                    handleInstallClick()
                  }}
                  variant="plain"
                  size="icon"
                  className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  aria-label="安装为应用"
                >
                  <InstallIcon className="h-5 w-5" />
                </Button>
                <ViewportTooltip visible={installTooltip.visible} className="whitespace-nowrap">
                  安装为应用
                </ViewportTooltip>
              </div>
            )}
            <div
              className="relative"
              {...helpTooltip.handlers}
            >
              <Button
                onClick={() => {
                  dismissAllTooltips()
                  setShowHelp(true)
                }}
                variant="plain"
                size="icon"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                aria-label="操作指南"
              >
                <HelpCircleIcon className="h-5 w-5" />
              </Button>
              <ViewportTooltip visible={helpTooltip.visible} className="whitespace-nowrap">
                操作指南
              </ViewportTooltip>
            </div>
            <div
              className="relative"
              {...settingsTooltip.handlers}
            >
              <Button
                onClick={() => setShowSettings(true)}
                variant="plain"
                size="icon"
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                aria-label="设置"
              >
                <SettingsIcon className="h-5 w-5" />
              </Button>
              <ViewportTooltip visible={settingsTooltip.visible} className="whitespace-nowrap">
                设置
              </ViewportTooltip>
            </div>
          </div>
        </div>
      </header>

      <div className="safe-area-top invisible pointer-events-none" aria-hidden="true">
        <div className="safe-header-inner" />
      </div>
      {showHelp && <HelpModal appMode="gallery" onClose={() => setShowHelp(false)} />}
    </>
  )
}
