import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createCache } from './cache.js'
import { buildDataset, useSampleData } from './dataset.js'
import { DATA_TTL_MS, MIN_FORCED_REFRESH_MS } from './config.js'
import { KelsaError, hasCredentials } from './kelsa.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const isProd = process.env.NODE_ENV === 'production'
const PORT = Number(process.env.PORT) || 3471
// There is no login: a dev server only listens on loopback; production listens everywhere.
const HOST = process.env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1')

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((_req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})

const cache = createCache(buildDataset, DATA_TTL_MS)
let lastForced = 0

function sendError(res, err) {
  if (err instanceof KelsaError) {
    const status = err.kind === 'auth_not_configured' ? 503 : 502
    res.status(status).json({ error: err.toClientJSON() })
    return
  }
  console.error(err)
  res.status(500).json({ error: { kind: 'server_error', message: 'Something went wrong building the dashboard.' } })
}

async function serve(res, force) {
  try {
    const { value, stale, storedAt } = await cache.get({ force })
    res.setHeader('Cache-Control', 'no-store')
    res.json({ ...value, stale, fetchedAt: new Date(storedAt).toISOString(), refreshMs: DATA_TTL_MS })
  } catch (err) {
    sendError(res, err)
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'))

app.get('/api/data', (_req, res) => serve(res, false))

app.post('/api/refresh', (_req, res) => {
  const now = Date.now()
  const force = now - lastForced >= MIN_FORCED_REFRESH_MS
  if (force) lastForced = now
  serve(res, force)
})

app.use('/api', (_req, res) => res.status(404).json({ error: { kind: 'not_found', message: 'Unknown endpoint.' } }))

if (isProd) {
  app.use(express.static(join(ROOT, 'dist'), { index: false, maxAge: '1h' }))
  app.get('*', (_req, res) => res.sendFile(join(ROOT, 'dist/index.html')))
}

app.listen(PORT, HOST, () => {
  console.log(`Oracle Migration Cutover Readiness API on http://${HOST}:${PORT}`)
  if (useSampleData()) console.warn('[data] Serving SAMPLE data: set KELSA_USER_EMAIL / KELSA_USER_TOKEN to read live Kelsa data.')
  else if (!hasCredentials()) console.warn('[kelsa] KELSA_USER_EMAIL / KELSA_USER_TOKEN are not set; /api/data will return 503.')
})
