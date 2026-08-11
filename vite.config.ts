import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

function isAllowedImageProxyUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return host === 'volces.com' ||
      host.endsWith('.volces.com') ||
      host === 'volcengine.com' ||
      host.endsWith('.volcengine.com') ||
      host === 'aliyuncs.com' ||
      host.endsWith('.aliyuncs.com') ||
      host === 'aliyun.com' ||
      host.endsWith('.aliyun.com')
  } catch {
    return false
  }
}

function imageProxyPlugin() {
  return {
    name: 'amazon-image-studio-image-proxy',
    configureServer(server: any) {
      server.middlewares.use('/image-proxy/', async (req: any, res: any) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        const imageUrl = Array.isArray(req.headers['x-image-url'])
          ? req.headers['x-image-url'][0]
          : req.headers['x-image-url']
        if (typeof imageUrl !== 'string' || !isAllowedImageProxyUrl(imageUrl)) {
          res.statusCode = 403
          res.end('Forbidden image URL')
          return
        }

        try {
          const upstream = await fetch(imageUrl, { cache: 'no-store' })
          res.statusCode = upstream.status
          res.setHeader('X-Image-Proxy', '1')
          const contentType = upstream.headers.get('content-type')
          if (contentType) res.setHeader('Content-Type', contentType)
          const contentLength = upstream.headers.get('content-length')
          if (contentLength) res.setHeader('Content-Length', contentLength)
          const buffer = Buffer.from(await upstream.arrayBuffer())
          res.end(buffer)
        } catch (err) {
          res.statusCode = 502
          res.end(err instanceof Error ? err.message : 'Image proxy failed')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), imageProxyPlugin()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true,
  },
})
