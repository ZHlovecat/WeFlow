/**
 * 探测火山 TOS 签名接口（需登录 token）
 * 用法（PowerShell）:
 *   $env:WEFLOW_TOKEN="你的 manage-store-token"
 *   node scripts/test-tos-signature.mjs
 */
const API_BASE = 'https://store.quikms.com'
const token = process.env.WEFLOW_TOKEN || ''

async function main() {
  if (!token) {
    console.log('请设置环境变量 WEFLOW_TOKEN（与浏览器 localStorage weflow_auth_token 一致）')
    process.exit(1)
  }
  for (const type of ['company', 'shop']) {
    const url = `${API_BASE}/admin/auth/getTosSignature?type=${type}`
    const res = await fetch(url, {
      headers: { 'manage-store-token': token },
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      console.error(type, '非 JSON:', text.slice(0, 500))
      continue
    }
    console.log(`\n=== type=${type} http=${res.status} errno=${json.errno} ===`)
    if (json.errno !== 0) {
      console.log('errmsg:', json.errmsg)
      continue
    }
    const d = json.data || {}
    const keys = ['host', 'key', 'policy', 'algorithm', 'credential', 'date', 'signature', 'securityToken']
    for (const k of keys) {
      const v = d[k]
      const preview = typeof v === 'string' && v.length > 80 ? `${v.slice(0, 80)}...` : v
      console.log(`  ${k}:`, preview ?? '(missing)')
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
