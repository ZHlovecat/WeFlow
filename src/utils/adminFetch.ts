const API_BASE = 'https://store.quikms.com'

export { API_BASE }

function safeUrl(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.toString()
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  } catch {
    // ignore
  }
  return String(input)
}

function bodyPreview(init?: RequestInit): string | undefined {
  if (!init?.body) return undefined
  const body = init.body
  try {
    if (typeof body === 'string') return body.length > 300 ? body.slice(0, 300) + '…' : body
    if (body instanceof FormData) {
      const parts: string[] = []
      body.forEach((v, k) => {
        parts.push(`${k}=${typeof v === 'string' ? v : '[file]'}`)
      })
      const joined = parts.join('&')
      return joined.length > 300 ? joined.slice(0, 300) + '…' : joined
    }
    if (body instanceof URLSearchParams) {
      const s = body.toString()
      return s.length > 300 ? s.slice(0, 300) + '…' : s
    }
  } catch {
    // ignore
  }
  return undefined
}

function sendApiLog(payload: {
  phase: 'request' | 'response' | 'error'
  method: string
  url: string
  status?: number
  ok?: boolean
  elapsedMs?: number
  errno?: number
  errmsg?: string
  bodyPreview?: string
  error?: string
}): void {
  // 控制台（DevTools）
  try {
    if (payload.phase === 'request') {
      console.log(`[API] → ${payload.method} ${payload.url}`, payload.bodyPreview ?? '')
    } else if (payload.phase === 'response') {
      const flag = payload.ok && payload.errno === 0 ? '✓' : '✗'
      console.log(
        `[API] ${flag} ${payload.method} ${payload.url} ${payload.status ?? ''} ${payload.elapsedMs ?? ''}ms`,
        payload.errno != null ? `errno=${payload.errno}` : '',
        payload.errmsg || ''
      )
    } else {
      console.warn(`[API] ✗ ${payload.method} ${payload.url} ${payload.elapsedMs ?? ''}ms`, payload.error || '')
    }
  } catch {
    // ignore
  }
  // 转发到主进程终端
  try {
    window.electronAPI?.log?.api?.(payload)
  } catch {
    // ignore
  }
}

export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('weflow_auth_token') || ''
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('manage-store-token', token)
  }
  const method = (init?.method || 'GET').toUpperCase()
  const url = safeUrl(input)
  const startedAt = Date.now()

  sendApiLog({
    phase: 'request',
    method,
    url,
    bodyPreview: bodyPreview(init),
  })

  try {
    const res = await fetch(input, { ...init, headers })
    const elapsedMs = Date.now() - startedAt
    // 探测 errno/errmsg：仅对 JSON 响应做克隆解析，避免影响调用方读取流
    let errno: number | undefined
    let errmsg: string | undefined
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      try {
        const json = await res.clone().json()
        if (json && typeof json === 'object') {
          if (typeof json.errno === 'number') errno = json.errno
          if (typeof json.errmsg === 'string') errmsg = json.errmsg
        }
      } catch {
        // ignore
      }
    }
    sendApiLog({
      phase: 'response',
      method,
      url,
      status: res.status,
      ok: res.ok,
      elapsedMs,
      errno,
      errmsg,
    })
    return res
  } catch (e: any) {
    const elapsedMs = Date.now() - startedAt
    sendApiLog({
      phase: 'error',
      method,
      url,
      elapsedMs,
      error: e?.message || String(e),
    })
    throw e
  }
}
