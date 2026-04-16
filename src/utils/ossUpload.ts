import { adminFetch, API_BASE } from './adminFetch'

/**
 * 服务端 GET /admin/auth/getOssSignature?type=company|shop 返回
 * - host、dir：与原先阿里云 OSS 一致（域名、存储路径/目录不变）
 * - policy、algorithm、credential、date、signature：火山引擎 TOS PostObject 签名
 * 文档：https://www.volcengine.com/docs/6349/129225
 */
export interface UploadSignatureData {
  /** 上传 POST 基址，与原先一致，如 https://your-domain.com 或桶域名 */
  host: string
  /** 对象完整路径（原 OSS 的 dir），目录规则不变 */
  dir: string
  policy: string
  /** 一般为 TOS4-HMAC-SHA256 */
  algorithm: string
  credential: string
  date: string
  signature: string
  securityToken?: string
}

interface SignatureResponse {
  errno: number
  errmsg: string
  data: UploadSignatureData | Record<string, unknown>
}

function normalizeUploadData(raw: Record<string, unknown>): UploadSignatureData {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = raw[k]
      if (typeof v === 'string' && v.length > 0) return v
    }
    return ''
  }
  const host = pick('host')
  // 与原先 OSS 字段名一致用 dir；兼容后端写 key
  const dir = pick('dir', 'key')
  const policy = pick('policy')
  const algorithm = pick('algorithm', 'x_tos_algorithm')
  const credential = pick('credential', 'x_tos_credential')
  const date = pick('date', 'x_tos_date')
  const signature = pick('signature', 'x_tos_signature')
  const st = pick('securityToken', 'x_tos_security_token', 'security_token')
  if (!host || !dir || !policy || !algorithm || !credential || !date || !signature) {
    throw new Error('上传签名数据不完整（需 host、dir、policy、algorithm、credential、date、signature）')
  }
  return {
    host,
    dir,
    policy,
    algorithm,
    credential,
    date,
    signature,
    ...(st ? { securityToken: st } : {}),
  }
}

async function getUploadSignature(type: 'company' | 'shop'): Promise<UploadSignatureData> {
  const res = await adminFetch(`${API_BASE}/admin/auth/getOssSignature?type=${type}`)
  const json = (await res.json()) as SignatureResponse
  if (json.errno !== 0) {
    throw new Error(json.errmsg || '获取上传签名失败')
  }
  if (!json.data || typeof json.data !== 'object') {
    throw new Error('上传签名为空')
  }
  return normalizeUploadData(json.data as Record<string, unknown>)
}

function buildPublicUrl(host: string, dir: string): string {
  const h = host.replace(/\/$/, '')
  const d = dir.replace(/^\//, '')
  return `${h}/${d}`
}

/**
 * 通过服务端签名上传图片到火山引擎 TOS（企业 Logo / 门店形象图）。
 * 接口路径与返回的 host、dir 与原先阿里云 OSS 保持一致，仅底层存储与表单签名为 TOS。
 */
export async function uploadImageToOss(file: File, type: 'company' | 'shop'): Promise<string> {
  const s = await getUploadSignature(type)

  const formData = new FormData()
  formData.append('key', s.dir)
  formData.append('policy', s.policy)
  formData.append('x-tos-algorithm', s.algorithm)
  formData.append('x-tos-credential', s.credential)
  formData.append('x-tos-date', s.date)
  formData.append('x-tos-signature', s.signature)
  if (s.securityToken) {
    formData.append('x-tos-security-token', s.securityToken)
  }
  formData.append('file', file)

  const res = await fetch(s.host, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`上传失败，状态码：${res.status}${text ? ` ${text.slice(0, 200)}` : ''}`)
  }

  return buildPublicUrl(s.host, s.dir)
}
