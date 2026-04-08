import OSS from 'ali-oss'
import * as configService from '../services/config'

/**
 * 获取 OSS 客户端（延迟初始化，从配置读取密钥）
 */
let _client: OSS | null = null

export function resetOssClient(): void {
  _client = null
}

async function getOssClient(): Promise<OSS> {
  if (_client) return _client
  const accessKeyId = await configService.getOssAccessKeyId()
  const accessKeySecret = await configService.getOssAccessKeySecret()
  if (!accessKeyId || !accessKeySecret) {
    throw new Error('请先在设置中配置 OSS 密钥')
  }
  _client = new OSS({
    region: 'oss-cn-hangzhou',
    endpoint: 'oss-cn-hangzhou.aliyuncs.com',
    accessKeyId,
    accessKeySecret,
    bucket: 'chauge-job',
    secure: true,
  })
  return _client
}

/**
 * 上传图片到阿里云 OSS（启用服务端 AES256 加密）
 * @param file 要上传的文件
 * @returns 上传后的完整 URL
 */
export async function uploadImageToOss(file: File): Promise<string> {
  const client = await getOssClient()
  const ext = file.name.split('.').pop() || 'png'
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  const ossKey = `meeting-store/${timestamp}_${random}.${ext}`

  const result = await client.put(ossKey, file, {
    headers: {
      'x-oss-server-side-encryption': 'AES256',
    },
  })
  return result.url
}
