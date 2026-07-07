import type { ApiMode, AppSettings } from '../types'
import { normalizeBaseUrl } from './devProxy'
import {
  DEFAULT_AMAZON_PLANNER_PROFILE_ID,
  DEFAULT_CHAT_MODEL,
  createDefaultAmazonPlannerProfile,
  createDefaultOpenAIProfile,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_RESPONSES_MODEL,
  findEquivalentApiProfile,
  isAmazonPlannerProfile,
  mergeImportedSettings,
  normalizeSettings,
} from './apiProfiles'

const URL_SETTING_KEYS = [
  'settings',
  'apiUrl',
  'apiKey',
  'codexCli',
  'apiMode',
  'model',
  'streamImages',
  'streamPartialImages',
  'apiSetupMode',
  'plannerApiMode',
  'plannerModel',
]

function getProfileDedupKey(profile: Pick<AppSettings['profiles'][number], 'provider' | 'baseUrl' | 'apiKey' | 'model' | 'apiMode'>) {
  return JSON.stringify([
    profile.provider,
    profile.baseUrl.trim().replace(/\/+$/, '').toLowerCase(),
    profile.apiKey.trim(),
    profile.model.trim(),
    profile.apiMode,
  ])
}

function createUrlProfileId(usedIds: Set<string>) {
  let id = `openai-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  while (usedIds.has(id)) {
    id = `openai-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }
  return id
}

function createUrlPlannerProfileId(usedIds: Set<string>) {
  if (!usedIds.has(DEFAULT_AMAZON_PLANNER_PROFILE_ID)) return DEFAULT_AMAZON_PLANNER_PROFILE_ID

  let id = `planner-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  while (usedIds.has(id)) {
    id = `planner-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  }
  return id
}

function pickUrlSettingsPayload(value: unknown): unknown | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return {
    customProviders: record.customProviders,
    profiles: record.profiles,
  }
}

function getUrlSettingsPayload(searchParams: URLSearchParams): unknown | null {
  const raw = searchParams.get('settings')
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && 'settings' in parsed) {
      return pickUrlSettingsPayload((parsed as { settings?: unknown }).settings ?? null)
    }
    return pickUrlSettingsPayload(parsed)
  } catch {
    return null
  }
}

function activateFirstImportedProfile(settings: AppSettings, importedSettings: unknown): AppSettings {
  if (!importedSettings || typeof importedSettings !== 'object' || Array.isArray(importedSettings)) return settings

  const record = importedSettings as Record<string, unknown>
  if (!Array.isArray(record.profiles) || record.profiles.length === 0) return settings

  const imported = normalizeSettings({
    customProviders: record.customProviders,
    profiles: record.profiles,
  }, { splitDefaultProfiles: false })
  const importedProfile = imported.profiles[0]
  const activeProfile = findEquivalentApiProfile(settings, importedProfile, imported.customProviders)

  return activeProfile
    ? normalizeSettings({ ...settings, activeProfileId: activeProfile.id })
    : settings
}

function ensureUrlPlannerProfile(settings: AppSettings, patch: Partial<AppSettings['profiles'][number]>): AppSettings {
  const existing = settings.profiles.find((profile) => profile.id === settings.amazonPlannerProfileId && isAmazonPlannerProfile(profile))
  if (existing) {
    return normalizeSettings({
      ...settings,
      profiles: settings.profiles.map((profile) => profile.id === existing.id ? { ...profile, ...patch } : profile),
      amazonPlannerProfileId: existing.id,
    })
  }

  const usedIds = new Set(settings.profiles.map((profile) => profile.id))
  const plannerProfile = createDefaultAmazonPlannerProfile({
    id: createUrlPlannerProfileId(usedIds),
    ...patch,
  })
  return normalizeSettings({
    ...settings,
    profiles: [...settings.profiles, plannerProfile],
    amazonPlannerProfileId: plannerProfile.id,
  })
}

export function hasUrlSettingParams(searchParams: URLSearchParams) {
  return URL_SETTING_KEYS.some((key) => searchParams.has(key))
}

export function clearUrlSettingParams(searchParams: URLSearchParams) {
  for (const key of URL_SETTING_KEYS) searchParams.delete(key)
}

export function buildSettingsFromUrlParams(currentSettings: Partial<AppSettings> | unknown, searchParams: URLSearchParams): Partial<AppSettings> {
  const importedSettings = getUrlSettingsPayload(searchParams)
  const apiUrlParam = searchParams.get('apiUrl')
  const apiKeyParam = searchParams.get('apiKey')
  const codexCliParam = searchParams.get('codexCli')
  const apiModeParam = searchParams.get('apiMode')
  const modelParam = searchParams.get('model')
  const apiMode: ApiMode | undefined = apiModeParam === 'images' || apiModeParam === 'responses' || apiModeParam === 'chat' ? apiModeParam : undefined
  const apiSetupModeParam = searchParams.get('apiSetupMode')
  const apiSetupMode = apiSetupModeParam === 'single-connection'
    ? 'single-connection'
    : apiSetupModeParam === 'standard'
      ? 'standard'
      : undefined
  const plannerApiModeParam = searchParams.get('plannerApiMode')
  const plannerApiMode: ApiMode | undefined = plannerApiModeParam === 'responses' || plannerApiModeParam === 'chat' ? plannerApiModeParam : undefined
  const plannerModelParam = searchParams.get('plannerModel')
  const plannerModel = plannerModelParam !== null && plannerModelParam.trim() ? plannerModelParam.trim() : undefined

  const hasLegacyOpenAIParams = apiUrlParam !== null || apiKeyParam !== null || codexCliParam !== null || apiMode !== undefined || modelParam !== null
  const hasSetupModeParams = apiSetupMode !== undefined || plannerApiMode !== undefined || plannerModel !== undefined
  const settings = importedSettings == null
    ? normalizeSettings(currentSettings)
    : activateFirstImportedProfile(mergeImportedSettings(currentSettings, importedSettings), importedSettings)

  const applySetupModeParams = (sourceSettings: AppSettings): AppSettings => {
    let nextSettings = apiSetupMode ? normalizeSettings({ ...sourceSettings, apiSetupMode }) : sourceSettings
    if (plannerApiMode || plannerModel) {
      nextSettings = ensureUrlPlannerProfile(nextSettings, {
        ...(plannerApiMode ? { apiMode: plannerApiMode } : {}),
        ...(plannerModel ? { model: plannerModel } : {}),
      })
    }
    return nextSettings
  }

  if (hasLegacyOpenAIParams) {
    const profileApiMode = apiMode ?? 'images'
    const profile = createDefaultOpenAIProfile({
      id: createUrlProfileId(new Set(settings.profiles.map((item) => item.id))),
      name: 'URL 参数配置',
      apiMode: profileApiMode,
      model: profileApiMode === 'responses'
        ? DEFAULT_RESPONSES_MODEL
        : profileApiMode === 'chat'
          ? DEFAULT_CHAT_MODEL
          : DEFAULT_IMAGES_MODEL,
    })
    if (apiUrlParam !== null) profile.baseUrl = normalizeBaseUrl(apiUrlParam.trim())
    if (apiKeyParam !== null) profile.apiKey = apiKeyParam.trim()
    if (modelParam !== null && modelParam.trim()) profile.model = modelParam.trim()
    if (codexCliParam !== null) profile.codexCli = codexCliParam.trim().toLowerCase() === 'true'
    const existingProfile = settings.profiles.find((item) => getProfileDedupKey(item) === getProfileDedupKey(profile))
    if (existingProfile) {
      return applySetupModeParams(normalizeSettings({ ...settings, activeProfileId: existingProfile.id }))
    }

    return applySetupModeParams(normalizeSettings({
      ...settings,
      profiles: [...settings.profiles, profile],
      activeProfileId: profile.id,
    }))
  }

  if (importedSettings == null && !hasSetupModeParams) return {}
  return applySetupModeParams(settings)
}
