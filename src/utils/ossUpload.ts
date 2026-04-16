import { adminFetch, API_BASE } from './adminFetch'

/**
 * 火山引擎 TOS 浏览器 PostObject 表单上传所需字段（由后端 GET /admin/auth/getTosSignature 生成）
 * 文档：https://www.volcengine.com/docs/6349/129225
 */
export interface TosSignatureData {
  /** 上传 POST 地址，如 https://bucket.tos-cn-beijing.volces.com */
  host: string
  /** 对象 Key（完整路径） */
  key: string
  policy: string
  /** 固定为 TOS4-HMAC-SHA256 */
  algorithm: string
  credential: string
  date: string
  /** 十六进制小写签名 */
  signature: string
  /** STS 临时凭证时必填 */
  securityToken?: string
}

interface TosSignatureResponse {
  errno: number
  errmsg: string
  data: TosSignatureData | Record<string, unknown>
}

function normalizeTosData(raw: Record<string, unknown>): TosSignatureData {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = raw[k]
      if (typeof v === 'string' && v.length > 0) return v
    }
    return ''
  }
  const host = pick('host')
  const key = pick('key')
  const policy = pick('policy')
  const algorithm = pick('algorithm', 'x_tos_algorithm')
  const credential = pick('credential', 'x_tos_credential')
  const date = pick('date', 'x_tos_date')
  const signature = pick('signature', 'x_tos_signature')
  const st = pick('securityToken', 'x_tos_security_token', 'security_token')
  if (!host || !key || !policy || !algorithm || !credential || !date || !signature) {
    throw new Error('TOS 签名数据不完整（需 host、key、policy、algorithm、credential、date、signature）')
  }
  return {
    host,
    key,
    policy,
    algorithm,
    credential,
    date,
    signature,
    ...(st ? { securityToken: st } : {}),
  }
}

async function getTosSignature(type: 'company' | 'shop'): Promise<TosSignatureData> {
  const res = await adminFetch(`${API_BASE}/admin/auth/getTosSignature?type=${type}`)
  const json = (await res.json()) as TosSignatureResponse
  if (json.errno !== 0) {
    throw new Error(json.errmsg || '获取 TOS 签名失败')
  }
  if (!json.data || typeof json.data !== 'object') {
    throw new Error('TOS 签名为空')
  }
  return normalizeTosData(json.data as Record<string, unknown>)
}

function buildObjectUrl(host: string, key: string): string {
  const h = host.replace(/\/$/, '')
  const k = key.replace(/^\//, '')
  return `${h}/${k}`
}

/**
 * 通过服务端签名上传图片到火山引擎 TOS（企业 Logo / 门店形象图）
 * @param file 要上传的文件
 * @param type 上传类型：company（企业）或 shop（门店）
 * @returns 上传后的完整 URL
 */
export async function uploadImageToOss(file: File, type: 'company' | 'shop'): Promise<string> {
  const s = await getTosSignature(type)

  const formData = new FormData()
  formData.append('key', s.key)
  formData.append('policy', s.policy)
  formData.append('x-tos-algorithm', s.algorithm)
  formData.append('x-tos-credential', s.credential)
  formData.append('x-tos-date', s.date)
  formData.append('x-tos-signature', s.signature)
  if (s.securityToken) {
    formData.append('x-tos-security-token', s.securityToken)
  }
  // file 须放在最后；不在此附加 Content-Type，避免与 policy 中未声明的字段冲突
  formData.append('file', file)

  const res = await fetch(s.host, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`上传失败，状态码：${res.status}${text ? ` ${text.slice(0, 200)}` : ''}`)
  }

  return buildObjectUrl(s.host, s.key)
}
