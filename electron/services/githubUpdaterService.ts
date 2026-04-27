import https from 'https'
import { URL } from 'url'
import { app, BrowserWindow, shell } from 'electron'
import { createWriteStream, existsSync, statSync, mkdirSync, unlinkSync, readdirSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import type { ConfigService } from './config'

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface ReleaseInfo {
  tag_name: string
  name: string
  body: string
  published_at: string
  updated_at: string
  html_url: string
  assets: ReleaseAsset[]
}

export interface UpdateAvailablePayload {
  hasUpdate: boolean
  publishedAt?: string
  publishedAtMs?: number
  version?: string                // 安装包文件名里解析出的版本号
  assetName?: string
  assetSize?: number
  downloadUrl?: string
  releaseUrl?: string
  releaseNotes?: string
  releaseTitle?: string
  reason?: 'first-run' | 'no-asset' | 'no-release' | 'ignored' | 'up-to-date' | 'error'
  errorMessage?: string
}

export interface DownloadProgressPayload {
  transferred: number
  total: number
  percent: number
  bytesPerSecond: number
}

const REPO_OWNER = 'hicccc77'
const REPO_NAME = 'WeFlow'
const RELEASE_TAG = 'latest'
const RELEASE_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${RELEASE_TAG}`
const USER_AGENT = `WeFlow-Updater/${app.getVersion?.() || '0.0.0'}`

function logUpdate(...args: unknown[]) {
  console.log('[Update]', ...args)
}

function httpsGetJson(url: string, redirectsLeft = 5): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.get(
      {
        protocol: u.protocol,
        host: u.host,
        path: `${u.pathname}${u.search || ''}`,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/vnd.github+json',
        },
        timeout: 15000,
      },
      (res) => {
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume()
          httpsGetJson(new URL(res.headers.location, url).toString(), redirectsLeft - 1).then(resolve, reject)
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', reject)
      }
    )
    req.on('timeout', () => {
      req.destroy(new Error('请求 GitHub Releases 超时'))
    })
    req.on('error', reject)
  })
}

function pickAssetForCurrentPlatform(assets: ReleaseAsset[]): ReleaseAsset | null {
  if (!Array.isArray(assets) || assets.length === 0) return null
  const platform = process.platform
  const arch = process.arch

  if (platform === 'win32') {
    // 优先匹配 setup.exe（NSIS 打包），按文件名优先级排序
    const exes = assets.filter((a) => /\.exe$/i.test(a.name))
    if (exes.length === 0) return null
    if (arch === 'arm64') {
      const armPick = exes.find((a) => /arm64/i.test(a.name))
      if (armPick) return armPick
    }
    return exes.find((a) => /setup/i.test(a.name)) || exes[0]
  }

  if (platform === 'darwin') {
    const macAssets = assets.filter((a) => /\.(dmg|zip)$/i.test(a.name))
    if (macAssets.length === 0) return null
    const isArm = arch === 'arm64'
    // 优先按 arch 匹配 dmg
    const archPattern = isArm ? /(arm64|aarch64)/i : /(x64|amd64|intel|x86_64)/i
    const sameArchDmg = macAssets.find((a) => /\.dmg$/i.test(a.name) && archPattern.test(a.name))
    if (sameArchDmg) return sameArchDmg
    const anyDmg = macAssets.find((a) => /\.dmg$/i.test(a.name))
    if (anyDmg) return anyDmg
    return macAssets[0]
  }

  if (platform === 'linux') {
    const linuxAssets = assets.filter((a) => /\.(AppImage|tar\.gz|deb|rpm)$/i.test(a.name))
    if (linuxAssets.length === 0) return null
    return linuxAssets.find((a) => /\.AppImage$/i.test(a.name)) || linuxAssets[0]
  }

  return assets[0] || null
}

function parseVersionFromAssetName(assetName: string): string | undefined {
  // 例：WeFlow-4.3.0-Setup.exe / WeFlow-4.3.0-arm64.dmg / WeFlow-4.3.0-mac.zip
  const m = assetName.match(/(\d+\.\d+\.\d+(?:[-.][\w.-]+)?)/)
  return m ? m[1] : undefined
}

class GithubUpdaterService {
  private configService: ConfigService | null = null
  private latestPayload: UpdateAvailablePayload | null = null
  private downloadInProgress = false
  private downloadAbort: (() => void) | null = null
  private lastDownloadedFile: string | null = null

  init(config: ConfigService) {
    this.configService = config
  }

  private getUpdatesDir(): string {
    const dir = join(app.getPath('userData'), 'updates')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    return dir
  }

  private cleanupOldDownloads(except?: string) {
    try {
      const dir = this.getUpdatesDir()
      const files = readdirSync(dir)
      for (const f of files) {
        if (except && f === except) continue
        try {
          unlinkSync(join(dir, f))
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * 拉取 GitHub Release 信息并判断是否有更新。
   * @param manual 是否手动触发（手动触发时放宽首次基线策略，直接以 published_at vs lastSeenReleaseTime 比较）
   */
  async checkForUpdates(manual = false): Promise<UpdateAvailablePayload> {
    try {
      logUpdate(`检查更新（${manual ? '手动' : '自动'}），url=${RELEASE_API_URL}`)
      const { status, body } = await httpsGetJson(RELEASE_API_URL)
      if (status === 404) {
        logUpdate('GitHub release 不存在（404）')
        const payload: UpdateAvailablePayload = { hasUpdate: false, reason: 'no-release' }
        this.latestPayload = payload
        return payload
      }
      if (status >= 400) {
        logUpdate(`GitHub API 状态异常 status=${status}`)
        const payload: UpdateAvailablePayload = {
          hasUpdate: false,
          reason: 'error',
          errorMessage: `GitHub API 返回 ${status}`,
        }
        this.latestPayload = payload
        return payload
      }

      const release = JSON.parse(body) as ReleaseInfo
      const asset = pickAssetForCurrentPlatform(release.assets || [])
      if (!asset) {
        logUpdate('未找到当前平台的安装包资源', process.platform, process.arch)
        const payload: UpdateAvailablePayload = {
          hasUpdate: false,
          reason: 'no-asset',
          publishedAt: release.published_at,
          releaseUrl: release.html_url,
        }
        this.latestPayload = payload
        return payload
      }

      const publishedAtMs = Date.parse(release.published_at) || 0
      const lastSeen = String(this.configService?.get('lastSeenReleaseTime') || '')
      const lastSeenMs = lastSeen ? Date.parse(lastSeen) || 0 : 0
      const ignored = String(this.configService?.get('ignoredReleaseTime') || '')

      const baseInfo: UpdateAvailablePayload = {
        hasUpdate: false,
        publishedAt: release.published_at,
        publishedAtMs,
        version: parseVersionFromAssetName(asset.name) || release.tag_name,
        assetName: asset.name,
        assetSize: asset.size,
        downloadUrl: asset.browser_download_url,
        releaseUrl: release.html_url,
        releaseNotes: release.body || '',
        releaseTitle: release.name || release.tag_name,
      }

      // 首次启动（无基线）
      if (!lastSeenMs) {
        if (manual) {
          // 手动检查时不能因为"首次"就吃掉，按 release 时间提示一次
          baseInfo.hasUpdate = true
          this.latestPayload = baseInfo
          logUpdate('手动检查（无基线），按 release 时间提示更新', release.published_at)
          return baseInfo
        }
        // 自动检查：把当前 release 时间记为基线，之后再有新构建才提示
        try {
          this.configService?.set('lastSeenReleaseTime', release.published_at)
        } catch {
          /* ignore */
        }
        const payload: UpdateAvailablePayload = { ...baseInfo, hasUpdate: false, reason: 'first-run' }
        this.latestPayload = payload
        logUpdate('首次启动，写入基线 published_at=', release.published_at)
        return payload
      }

      if (publishedAtMs <= lastSeenMs) {
        const payload: UpdateAvailablePayload = { ...baseInfo, hasUpdate: false, reason: 'up-to-date' }
        this.latestPayload = payload
        logUpdate('远端版本不新于本地基线，无需更新')
        return payload
      }

      if (!manual && ignored && ignored === release.published_at) {
        const payload: UpdateAvailablePayload = { ...baseInfo, hasUpdate: false, reason: 'ignored' }
        this.latestPayload = payload
        logUpdate('该版本已被用户忽略，跳过自动提示')
        return payload
      }

      baseInfo.hasUpdate = true
      this.latestPayload = baseInfo
      logUpdate('发现新版本', release.published_at, asset.name)
      return baseInfo
    } catch (e: any) {
      const msg = e?.message || String(e)
      logUpdate('检查更新失败:', msg)
      const payload: UpdateAvailablePayload = { hasUpdate: false, reason: 'error', errorMessage: msg }
      this.latestPayload = payload
      return payload
    }
  }

  ignoreUpdate(publishedAt?: string) {
    const target = publishedAt || this.latestPayload?.publishedAt
    if (!target) return { success: false }
    try {
      this.configService?.set('ignoredReleaseTime', target)
      logUpdate('已忽略版本 publishedAt=', target)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) }
    }
  }

  isDownloading(): boolean {
    return this.downloadInProgress
  }

  cancelDownload() {
    if (this.downloadAbort) {
      try {
        this.downloadAbort()
      } catch {
        /* ignore */
      }
    }
    this.downloadAbort = null
    this.downloadInProgress = false
  }

  async downloadUpdate(win: BrowserWindow): Promise<{ success: boolean; filePath?: string; error?: string }> {
    if (!this.latestPayload || !this.latestPayload.downloadUrl || !this.latestPayload.assetName) {
      return { success: false, error: '尚未检测到可下载的更新，请先检查更新' }
    }
    if (this.downloadInProgress) {
      return { success: false, error: '更新正在下载中' }
    }

    const url = this.latestPayload.downloadUrl
    const fileName = this.latestPayload.assetName
    const dir = this.getUpdatesDir()
    const dest = join(dir, fileName)

    // 已经下载过同名文件且大小一致，跳过下载直接复用
    try {
      if (existsSync(dest) && this.latestPayload.assetSize) {
        const st = statSync(dest)
        if (st.size === this.latestPayload.assetSize) {
          logUpdate('已存在完整安装包，复用本地文件:', dest)
          this.lastDownloadedFile = dest
          win.webContents.send('app:downloadDone', { filePath: dest })
          return { success: true, filePath: dest }
        }
      }
    } catch {
      /* ignore */
    }

    // 删除旧的同 fileName 残留
    this.cleanupOldDownloads(fileName)
    try {
      if (existsSync(dest)) unlinkSync(dest)
    } catch {
      /* ignore */
    }

    this.downloadInProgress = true
    logUpdate('开始下载', url, '→', dest)

    return new Promise((resolve) => {
      const total = this.latestPayload?.assetSize || 0
      let transferred = 0
      let lastEmit = Date.now()
      let lastBytes = 0
      let aborted = false

      const cleanup = () => {
        this.downloadInProgress = false
        this.downloadAbort = null
      }

      const startedAt = Date.now()
      const file = createWriteStream(dest)

      const emitProgress = (force = false) => {
        const now = Date.now()
        if (!force && now - lastEmit < 200) return
        const elapsed = (now - startedAt) / 1000
        const speed = elapsed > 0 ? transferred / elapsed : 0
        const incremental = (transferred - lastBytes) * 1000 / Math.max(1, now - lastEmit)
        const bytesPerSecond = incremental || speed
        const realTotal = total || transferred
        const percent = realTotal > 0 ? (transferred / realTotal) * 100 : 0
        try {
          win.webContents.send('app:downloadProgress', {
            transferred,
            total: realTotal,
            percent,
            bytesPerSecond,
          } as DownloadProgressPayload)
        } catch {
          /* ignore */
        }
        lastEmit = now
        lastBytes = transferred
      }

      const doRequest = (currentUrl: string, redirectsLeft: number) => {
        const u = new URL(currentUrl)
        const req = https.get(
          {
            protocol: u.protocol,
            host: u.host,
            path: `${u.pathname}${u.search || ''}`,
            headers: {
              'User-Agent': USER_AGENT,
              Accept: 'application/octet-stream',
            },
            timeout: 30000,
          },
          (res) => {
            const status = res.statusCode || 0
            if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
              res.resume()
              doRequest(new URL(res.headers.location, currentUrl).toString(), redirectsLeft - 1)
              return
            }
            if (status !== 200) {
              try {
                file.close()
                unlinkSync(dest)
              } catch {
                /* ignore */
              }
              cleanup()
              resolve({ success: false, error: `下载失败 HTTP ${status}` })
              return
            }
            const headerTotal = Number(res.headers['content-length'] || 0)
            if (headerTotal > 0 && (!total || total !== headerTotal)) {
              if (this.latestPayload) this.latestPayload.assetSize = headerTotal
            }
            res.on('data', (chunk: Buffer) => {
              transferred += chunk.length
              emitProgress(false)
            })
            res.on('error', (err) => {
              try {
                file.close()
                unlinkSync(dest)
              } catch {
                /* ignore */
              }
              cleanup()
              if (!aborted) {
                resolve({ success: false, error: err.message || '下载异常中断' })
              }
            })
            res.pipe(file)
            file.on('finish', () => {
              file.close(() => {
                emitProgress(true)
                cleanup()
                this.lastDownloadedFile = dest
                logUpdate('下载完成', dest)
                try {
                  win.webContents.send('app:downloadDone', { filePath: dest })
                } catch {
                  /* ignore */
                }
                resolve({ success: true, filePath: dest })
              })
            })
            file.on('error', (err) => {
              try {
                file.close()
                unlinkSync(dest)
              } catch {
                /* ignore */
              }
              cleanup()
              resolve({ success: false, error: err.message || '写入文件失败' })
            })
          }
        )

        this.downloadAbort = () => {
          aborted = true
          try {
            req.destroy(new Error('用户取消'))
          } catch {
            /* ignore */
          }
          try {
            file.close()
          } catch {
            /* ignore */
          }
          try {
            if (existsSync(dest)) unlinkSync(dest)
          } catch {
            /* ignore */
          }
        }

        req.on('timeout', () => {
          req.destroy(new Error('下载超时'))
        })
        req.on('error', (err) => {
          if (aborted) return
          try {
            file.close()
            unlinkSync(dest)
          } catch {
            /* ignore */
          }
          cleanup()
          resolve({ success: false, error: err.message || '网络错误' })
        })
      }

      doRequest(url, 5)
    })
  }

  /** 安装并退出 */
  async installAndQuit(): Promise<{ success: boolean; error?: string }> {
    const filePath = this.lastDownloadedFile
    if (!filePath || !existsSync(filePath)) {
      return { success: false, error: '安装包不存在，请重新下载' }
    }
    const publishedAt = this.latestPayload?.publishedAt
    if (publishedAt) {
      try {
        this.configService?.set('lastSeenReleaseTime', publishedAt)
      } catch {
        /* ignore */
      }
    }

    if (process.platform === 'darwin') {
      // dmg / zip：用系统默认方式打开，由用户确认覆盖安装
      logUpdate('macOS 打开安装包', filePath)
      try {
        await shell.openPath(filePath)
      } catch (e: any) {
        return { success: false, error: e?.message || '打开安装包失败' }
      }
      setTimeout(() => app.quit(), 500)
      return { success: true }
    }

    if (process.platform === 'win32') {
      logUpdate('Windows 启动安装程序', filePath)
      try {
        const child = spawn(filePath, ['--updated'], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
      } catch (e: any) {
        return { success: false, error: e?.message || '启动安装程序失败' }
      }
      setTimeout(() => app.quit(), 500)
      return { success: true }
    }

    // linux 或其他：用 shell.openPath 兜底
    try {
      await shell.openPath(filePath)
    } catch (e: any) {
      return { success: false, error: e?.message || '打开安装包失败' }
    }
    setTimeout(() => app.quit(), 500)
    return { success: true }
  }
}

export const githubUpdaterService = new GithubUpdaterService()
