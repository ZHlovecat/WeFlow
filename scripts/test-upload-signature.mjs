/**
 * 探测上传签名接口（火山 TOS 表单字段，host/dir 与原先 OSS 一致）
 * 用法: $env:WEFLOW_TOKEN="token"; node scripts/test-upload-signature.mjs
 */
const API_BASE = 'https://store.quikms.com'
const token = process.env.WEFLOW_TOKEN || ''

async function main() {
  if (!token) {
    console.log('请设置 WEFLOW_TOKEN（与 localStorage weflow_auth_token 一致）')
    process.exit(1)
  }
  for (const type of ['company', 'shop']) {
    const url = `${API_BASE}/admin/auth/getOssSignature?type=${type}`
    const res = await fetch(url, { headers: { 'manage-store-token': token } })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      console.error(type, '非 JSON:', text.slice(0, 500))
      continue
    }
    console.log(`\n=== getOssSignature type=${type} http=${res.status} errno=${json.errno} ===`)
    if (json.errno !== 0) {
      console.log('errmsg:', json.errmsg)
      continue
    }
    const d = json.data || {}
    for (const k of ['host', 'dir', 'policy', 'algorithm', 'credential', 'date', 'signature', 'securityToken']) {
      const v = d[k]
      const preview = typeof v === 'string' && v.length > 100 ? `${v.slice(0, 100)}...` : v
      console.log(`  ${k}:`, preview ?? '(missing)')
    }
    if (d.host && d.dir) {
      console.log('  最终 URL:', `${String(d.host).replace(/\/$/, '')}/${String(d.dir).replace(/^\//, '')}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
