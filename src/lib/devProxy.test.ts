import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiUrl, shouldUseApiProxy } from './devProxy'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildApiUrl', () => {
  it('uses the same-origin proxy prefix when API proxy is enabled', () => {
    expect(buildApiUrl('http://api.example.com/v1', 'images/edits', null, true)).toBe(
      '/api-proxy/images/edits',
    )
  })

  it('keeps the v1 segment when the configured API URL does not include it', () => {
    expect(buildApiUrl('http://api.example.com', 'images/generations', null, true)).toBe(
      '/api-proxy/v1/images/generations',
    )
  })

  it('uses a configured proxy prefix when one is available', () => {
    expect(
      buildApiUrl(
        'http://api.example.com/v1',
        'responses',
        {
          enabled: true,
          prefix: '/openai-proxy',
          target: 'http://api.example.com/v1',
          changeOrigin: true,
          secure: false,
        },
        true,
      ),
    ).toBe('/openai-proxy/responses')
  })

  it('uses the configured API URL directly when API proxy is disabled', () => {
    expect(buildApiUrl('http://api.example.com/v1', 'responses', null, false)).toBe(
      'http://api.example.com/v1/responses',
    )
  })

  it('can build Chat Completions URLs without forcing a v1 segment', () => {
    expect(buildApiUrl('https://api.deepseek.com', 'chat/completions', null, false, { prefixV1: false })).toBe(
      'https://api.deepseek.com/chat/completions',
    )
  })
})

describe('shouldUseApiProxy', () => {
  const proxyConfig = {
    enabled: true,
    prefix: '/api-proxy',
    target: 'http://127.0.0.1:8087/v1',
    changeOrigin: true,
    secure: false,
  }

  it('automatically uses the dev proxy when the configured API URL matches the proxy target', () => {
    expect(shouldUseApiProxy(false, proxyConfig, 'http://127.0.0.1:8087/v1')).toBe(true)
  })

  it('does not automatically proxy unrelated API URLs', () => {
    expect(shouldUseApiProxy(false, proxyConfig, 'https://api.example.com/v1')).toBe(false)
  })

  it('still honors an explicit API proxy setting', () => {
    expect(shouldUseApiProxy(true, proxyConfig, 'https://api.example.com/v1')).toBe(true)
  })

  it('ignores stored API proxy settings when the current deployment disables proxy support', () => {
    vi.stubEnv('VITE_API_PROXY_AVAILABLE', 'false')

    expect(shouldUseApiProxy(true, proxyConfig, 'http://127.0.0.1:8087/v1')).toBe(false)
  })
})
