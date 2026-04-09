const API_BASE = 'https://store.quikms.com'

export { API_BASE }

export function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('weflow_auth_token') || ''
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('manage-store-token', token)
  }
  return fetch(input, { ...init, headers })
}
