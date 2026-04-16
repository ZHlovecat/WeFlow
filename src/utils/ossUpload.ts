import { adminFetch, API_BASE } from './adminFetch'

/**
 * 后端 GET /admin/auth/getOssSignature?type=company|shop 返回的 data（火山 TOS，host/dir 不变）
 * 示例：
 * {
 *   "accessKeyId": "...",
 *   "policy": "eyJ...",
 *   "signature": "ce45b0b0...",
 *   "host": "https://chauge-job.tos-cn-shanghai.volces.com",
 *   "dir": "meeting-store/company/company_xxx.png",
 *   "expire": 1776337641734,
 *   "bucket": "chauge-job",
 *   "algorithm": "TOS4-HMAC-SHA256",
 *   "credential": "AK.../20260416/cn-shanghai/tos/request",
 *   "date": "20260416T100721Z",
 *   "region": "cn-shanghai"
 * }
 */
export interface GetOssSignatureData {
  accessKeyId: string
  policy: string
  /** TOS Post 签名为十六进制，与旧版阿里云 OSS 字段名相同 */
  signature: string
  host: string
  /** 对象完整路径，上传表单里的 key */
  dir: string
  expire: number
  bucket: string
  algorithm: string
  credential: string
  date: string
  region: string
  securityToken?: string
}

interface SignatureResponse {
  errno: number
  errmsg: string
  data: GetOssSignatureData | Record<string, unknown>
}

/** 从接口 data 提取火山 TOS 浏览器上传所需字段 */
function dataToTosForm(data: Record<string, unknown>): {
  host: string
  dir: string
  policy: string
  algorithm: string
  credential: string
  date: string
  signature: string
  securityToken?: string
} {
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const host = str(data.host)
  const dir = str(data.dir) || str(data.key)
  const policy = str(data.policy)
  const algorithm = str(data.algorithm)
  const credential = str(data.credential)
  const date = str(data.date)
  const signature = str(data.signature)
  const securityToken = str(data.securityToken) || str(data.x_tos_security_token) || undefined
  if (!host || !dir || !policy || !algorithm || !credential || !date || !signature) {
    throw new Error(
      '上传签名不完整：需要 host、dir、policy、algorithm、credential、date、signature（与 getOssSignature 返回一致）'
    )
  }
  return {
    host,
    dir,
    policy,
    algorithm,
    credential,
    date,
    signature,
    ...(securityToken ? { securityToken } : {}),
  }
}

async function getUploadSignature(type: 'company' | 'shop') {
  const res = await adminFetch(`${API_BASE}/admin/auth/getOssSignature?type=${type}`)
  const json = (await res.json()) as SignatureResponse
  if (json.errno !== 0) {
    throw new Error(json.errmsg || '获取上传签名失败')
  }
  if (!json.data || typeof json.data !== 'object') {
    throw new Error('上传签名为空')
  }
  return dataToTosForm(json.data as Record<string, unknown>)
}

function buildPublicUrl(host: string, dir: string): string {
  const h = host.replace(/\/$/, '')
  const d = dir.replace(/^\//, '')
  return `${h}/${d}`
}

/**
 * 使用 getOssSignature 返回的火山 TOS 字段做 PostObject 上传；最终 URL 仍为 host + '/' + dir。
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
