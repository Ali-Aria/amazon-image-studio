export type AppView = 'home' | 'repair' | 'editor' | 'tagger'

export function getAppViewFromHash(hash: string): AppView {
  const route = hash.replace(/^#\/?/, '')
  if (route === 'repair') return 'repair'
  if (route === 'editor' || route === 'seedream-pro') return 'editor'
  if (route === 'tagger') return 'tagger'
  return 'home'
}
