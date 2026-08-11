import { lazy, Suspense, useEffect, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import RetailStudio from './components/RetailStudio'
import ImageEditorPage from './components/ImageEditorPage'
import SyntheticPerformerTaggerPage from './components/SyntheticPerformerTaggerPage'
import { useGlobalClickSuppression } from './lib/clickSuppression'

const DetailModal = lazy(() => import('./components/DetailModal'))
const Lightbox = lazy(() => import('./components/Lightbox'))
const SettingsModal = lazy(() => import('./components/SettingsModal'))
const ConfirmDialog = lazy(() => import('./components/ConfirmDialog'))
const Toast = lazy(() => import('./components/Toast'))
const MaskEditorModal = lazy(() => import('./components/MaskEditorModal'))
const ImageContextMenu = lazy(() => import('./components/ImageContextMenu'))

export type AppView = 'home' | 'editor' | 'tagger'

function getAppViewFromHash(): AppView {
  const route = window.location.hash.replace(/^#\/?/, '')
  if (route === 'editor' || route === 'seedream-pro') return 'editor'
  if (route === 'tagger') return 'tagger'
  return 'home'
}

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const [view, setView] = useState<AppView>(getAppViewFromHash)
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    if (hasUrlSettingParams(searchParams)) {
      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    initStore()
    useStore.getState().setAppMode('gallery')
  }, [setSettings])

  useEffect(() => {
    const syncViewFromLocation = () => {
      if (window.location.hash.replace(/^#\/?/, '') === 'seedream-pro') {
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/editor`)
      }
      setView(getAppViewFromHash())
    }
    syncViewFromLocation()
    window.addEventListener('hashchange', syncViewFromLocation)
    window.addEventListener('popstate', syncViewFromLocation)
    return () => {
      window.removeEventListener('hashchange', syncViewFromLocation)
      window.removeEventListener('popstate', syncViewFromLocation)
    }
  }, [])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  const navigate = (nextView: AppView) => {
    setView(nextView)
    if (nextView === 'editor' || nextView === 'tagger') {
      const hash = `#/${nextView}`
      if (window.location.hash !== hash) window.location.hash = `/${nextView}`
      return
    }

    const nextUrl = `${window.location.pathname}${window.location.search}`
    window.history.pushState(null, '', nextUrl)
  }

  return (
    <>
      <Header activeView={view} onNavigate={navigate} />
      {view === 'home' ? (
        <RetailStudio />
      ) : (
        <main data-home-main data-drag-select-surface className="pb-10">
          <div className={`safe-area-x mx-auto lg:!px-6 ${view === 'editor' ? 'max-w-[96rem]' : 'max-w-7xl'}`}>
            {view === 'editor' ? <ImageEditorPage /> : <SyntheticPerformerTaggerPage />}
          </div>
        </main>
      )}
      <Suspense fallback={null}>
        <DetailModal />
        <Lightbox />
        <SettingsModal scope={view === 'editor' ? 'editor' : 'home'} />
        <ConfirmDialog />
        <Toast />
        <MaskEditorModal />
        <ImageContextMenu />
      </Suspense>
    </>
  )
}
