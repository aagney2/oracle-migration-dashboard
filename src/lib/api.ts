import type { Dataset } from './types'

export interface ApiError {
  kind: string
  message: string
  pipeline?: string | null
}

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public error: ApiError,
  ) {
    super(error.message)
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiFailure(res.status, body?.error ?? { kind: 'http_error', message: `Request failed (${res.status}).` })
  return body as T
}

export const getData = () => call<Dataset>('/api/data')
export const refreshData = () => call<Dataset>('/api/refresh', { method: 'POST' })
