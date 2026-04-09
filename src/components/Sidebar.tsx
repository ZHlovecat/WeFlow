import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Home, MessageSquare, BarChart3, FileText, Settings, Download, Aperture, UserCircle, Lock, LockOpen, ChevronUp, RefreshCw, FolderClosed, Building2, Store, ChevronDown, Wrench, MapPin, Clock, UserCog, Tag, LogOut, Users, Shield, KeyRound } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useChatStore } from '../stores/chatStore'
import { useAnalyticsStore } from '../stores/analyticsStore'
import * as configService from '../services/config'
import { onExportSessionStatus, requestExportSessionStatus } from '../services/exportBridge'
import { UserRound } from 'lucide-react'

import { adminFetch } from '../utils/adminFetch'
import './Sidebar.scss'

interface SidebarUserProfile {
  wxid: string
  displayName: string
  alias?: string
  avatarUrl?: string
}

const SIDEBAR_USER_PROFILE_CACHE_KEY = 'sidebar_user_profile_cache_v1'
const ACCOUNT_PROFILES_CACHE_KEY = 'account_profiles_cache_v1'

interface SidebarUserProfileCache extends SidebarUserProfile {
  updatedAt: number
}

interface AccountProfilesCache {
  [wxid: string]: {
    displayName: string
    avatarUrl?: string
    alias?: string
    updatedAt: number
  }
}

interface WxidOption {
  wxid: string
  modifiedTime: number
  nickname?: string
  displayName?: string
  avatarUrl?: string
}

const readSidebarUserProfileCache = (): SidebarUserProfile | null => {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_USER_PROFILE_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SidebarUserProfileCache
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.wxid || !parsed.displayName) return null
    return {
      wxid: parsed.wxid,
      displayName: parsed.displayName,
      alias: parsed.alias,
      avatarUrl: parsed.avatarUrl
    }
  } catch {
    return null
  }
}

const writeSidebarUserProfileCache = (profile: SidebarUserProfile): void => {
  if (!profile.wxid || !profile.displayName) return
  try {
    const payload: SidebarUserProfileCache = {
      ...profile,
      updatedAt: Date.now()
    }
    window.localStorage.setItem(SIDEBAR_USER_PROFILE_CACHE_KEY, JSON.stringify(payload))

    // 同时写入账号缓存池
    const accountsCache = readAccountProfilesCache()
    accountsCache[profile.wxid] = {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      alias: profile.alias,
      updatedAt: Date.now()
    }
    window.localStorage.setItem(ACCOUNT_PROFILES_CACHE_KEY, JSON.stringify(accountsCache))
  } catch {
    // 忽略本地缓存失败，不影响主流程
  }
}

const readAccountProfilesCache = (): AccountProfilesCache => {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_PROFILES_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

const normalizeAccountId = (value?: string | null): string => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.toLowerCase().startsWith('wxid_')) {
    const match = trimmed.match(/^(wxid_[^_]+)/i)
    return match?.[1] || trimmed
  }
  const suffixMatch = trimmed.match(/^(.+)_([a-zA-Z0-9]{4})$/)
  return suffixMatch ? suffixMatch[1] : trimmed
}

interface SidebarProps {
  collapsed: boolean
}

function Sidebar({ collapsed }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [authEnabled, setAuthEnabled] = useState(false)
  const [activeExportTaskCount, setActiveExportTaskCount] = useState(0)
  const [userProfile, setUserProfile] = useState<SidebarUserProfile>({
    wxid: '',
    displayName: '未识别用户'
  })
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [configMenuOpen, setConfigMenuOpen] = useState(false)
  const [showSwitchAccountDialog, setShowSwitchAccountDialog] = useState(false)
  const [wxidOptions, setWxidOptions] = useState<WxidOption[]>([])
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false)
  const accountCardWrapRef = useRef<HTMLDivElement | null>(null)
  const setLocked = useAppStore(state => state.setLocked)
  const setIsLoggedIn = useAppStore(state => state.setIsLoggedIn)
  const clearAuth = useAppStore(state => state.clearAuth)
  const isDbConnected = useAppStore(state => state.isDbConnected)
  const isMacPlatform = useAppStore(state => state.isMacPlatform)
  const allowedMenuIds = useAppStore(state => state.allowedMenuIds)
  const authUsername = useAppStore(state => state.authUsername)
  const authToken = useAppStore(state => state.authToken)
  const resetChatStore = useChatStore(state => state.reset)
  const clearAnalyticsStoreCache = useAnalyticsStore(state => state.clearCache)
  const [sysMenuOpen, setSysMenuOpen] = useState(false)
  const [showChangePwdDialog, setShowChangePwdDialog] = useState(false)
  const [changePwdLoading, setChangePwdLoading] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changePwdError, setChangePwdError] = useState('')

  const handleChangePassword = async () => {
    if (!oldPassword.trim()) { setChangePwdError('请输入原密码'); return }
    if (!newPassword.trim()) { setChangePwdError('请输入新密码'); return }
    if (newPassword.length < 6) { setChangePwdError('新密码长度不能少于6位'); return }
    if (newPassword !== confirmPassword) { setChangePwdError('两次输入的新密码不一致'); return }
    setChangePwdError('')
    setChangePwdLoading(true)
    try {
      const form = new URLSearchParams()
      form.append('password', oldPassword)
      form.append('newPassword', newPassword)
      const res = await adminFetch('https://store.quikms.com/admin/auth/changePassword', {
        method: 'POST',
        body: form,
      })
      const json = await res.json()
      if (json.errno === 0) {
        setShowChangePwdDialog(false)
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        window.alert('密码修改成功，请重新登录')
        clearAuth()
        setIsLoggedIn(false)
      } else {
        setChangePwdError(json.errmsg || '修改失败')
      }
    } catch {
      setChangePwdError('请求失败，请稍后重试')
    } finally {
      setChangePwdLoading(false)
    }
  }

  const hasMenu = (ids: number[]) => ids.length === 0 || ids.some(id => allowedMenuIds.includes(id))

  useEffect(() => {
    window.electronAPI.auth.verifyEnabled().then(setAuthEnabled)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isAccountMenuOpen) return
      const target = event.target as Node | null
      if (accountCardWrapRef.current && target && !accountCardWrapRef.current.contains(target)) {
        setIsAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isAccountMenuOpen])

  useEffect(() => {
    const unsubscribe = onExportSessionStatus((payload) => {
      const countFromPayload = typeof payload?.activeTaskCount === 'number'
        ? payload.activeTaskCount
        : Array.isArray(payload?.inProgressSessionIds)
          ? payload.inProgressSessionIds.length
          : 0
      const normalized = Math.max(0, Math.floor(countFromPayload))
      setActiveExportTaskCount(normalized)
    })

    requestExportSessionStatus()
    const timer = window.setTimeout(() => requestExportSessionStatus(), 120)

    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const loadCurrentUser = async () => {
      const patchUserProfile = (patch: Partial<SidebarUserProfile>, expectedWxid?: string) => {
        setUserProfile(prev => {
          if (expectedWxid && prev.wxid && prev.wxid !== expectedWxid) {
            return prev
          }
          const next: SidebarUserProfile = {
            ...prev,
            ...patch
          }
          if (!next.displayName) {
            next.displayName = next.wxid || '未识别用户'
          }
          writeSidebarUserProfileCache(next)
          return next
        })
      }

      try {
        const wxid = await configService.getMyWxid()
        const resolvedWxidRaw = String(wxid || '').trim()
        const cleanedWxid = normalizeAccountId(resolvedWxidRaw)
        const resolvedWxid = cleanedWxid || resolvedWxidRaw

        if (!resolvedWxidRaw && !resolvedWxid) return

        const wxidCandidates = new Set<string>([
          resolvedWxidRaw.toLowerCase(),
          resolvedWxid.trim().toLowerCase(),
          cleanedWxid.trim().toLowerCase()
        ].filter(Boolean))

        const normalizeName = (value?: string | null): string | undefined => {
          if (!value) return undefined
          const trimmed = value.trim()
          if (!trimmed) return undefined
          const lowered = trimmed.toLowerCase()
          if (lowered === 'self') return undefined
          if (lowered.startsWith('wxid_')) return undefined
          if (wxidCandidates.has(lowered)) return undefined
          return trimmed
        }

        const pickFirstValidName = (...candidates: Array<string | null | undefined>): string | undefined => {
          for (const candidate of candidates) {
            const normalized = normalizeName(candidate)
            if (normalized) return normalized
          }
          return undefined
        }

        // 并行获取名称和头像
        const [contactResult, avatarResult] = await Promise.allSettled([
          (async () => {
            const candidates = Array.from(new Set([resolvedWxidRaw, resolvedWxid, cleanedWxid].filter(Boolean)))
            for (const candidate of candidates) {
              const contact = await window.electronAPI.chat.getContact(candidate)
              if (contact?.remark || contact?.nickName || contact?.alias) {
                return contact
              }
            }
            return null
          })(),
          window.electronAPI.chat.getMyAvatarUrl()
        ])

        const myContact = contactResult.status === 'fulfilled' ? contactResult.value : null
        const displayName = pickFirstValidName(
          myContact?.remark,
          myContact?.nickName,
          myContact?.alias
        ) || resolvedWxid || '未识别用户'

        patchUserProfile({
          wxid: resolvedWxid,
          displayName,
          alias: myContact?.alias,
          avatarUrl: avatarResult.status === 'fulfilled' && avatarResult.value.success
            ? avatarResult.value.avatarUrl
            : undefined
        })
      } catch (error) {
        console.error('加载侧边栏用户信息失败:', error)
      }
    }

    const cachedProfile = readSidebarUserProfileCache()
    if (cachedProfile) {
      setUserProfile(cachedProfile)
    }

    void loadCurrentUser()
    const onWxidChanged = () => { void loadCurrentUser() }
    window.addEventListener('wxid-changed', onWxidChanged as EventListener)
    return () => window.removeEventListener('wxid-changed', onWxidChanged as EventListener)
  }, [])

  const getAvatarLetter = (name: string): string => {
    if (!name) return '?'
    return [...name][0] || '?'
  }

  const openSwitchAccountDialog = async () => {
    setIsAccountMenuOpen(false)
    if (!isDbConnected) {
      window.alert('数据库未连接，无法切换账号')
      return
    }
    const dbPath = await configService.getDbPath()
    if (!dbPath) {
      window.alert('请先在设置中配置数据库路径')
      return
    }
    try {
      const wxids = await window.electronAPI.dbPath.scanWxids(dbPath)
      const accountsCache = readAccountProfilesCache()
      console.log('[切换账号] 账号缓存:', accountsCache)

      const enrichedWxids = wxids.map((option: WxidOption) => {
        const normalizedWxid = normalizeAccountId(option.wxid)
        const cached = accountsCache[option.wxid] || accountsCache[normalizedWxid]

        let displayName = option.nickname || option.wxid
        let avatarUrl = option.avatarUrl

        if (option.wxid === userProfile.wxid || normalizedWxid === userProfile.wxid) {
          displayName = userProfile.displayName || displayName
          avatarUrl = userProfile.avatarUrl || avatarUrl
        }

        else if (cached) {
          displayName = cached.displayName || displayName
          avatarUrl = cached.avatarUrl || avatarUrl
        }

        return {
          ...option,
          displayName,
          avatarUrl
        }
      })

      setWxidOptions(enrichedWxids)
      setShowSwitchAccountDialog(true)
    } catch (error) {
      console.error('扫描账号失败:', error)
      window.alert('扫描账号失败，请稍后重试')
    }
  }

  const handleSwitchAccount = async (selectedWxid: string) => {
    if (!selectedWxid || isSwitchingAccount) return
    setIsSwitchingAccount(true)
    try {
      console.log('[切换账号] 开始切换到:', selectedWxid)
      const currentWxid = userProfile.wxid
      if (currentWxid === selectedWxid) {
        console.log('[切换账号] 已经是当前账号，跳过')
        setShowSwitchAccountDialog(false)
        setIsSwitchingAccount(false)
        return
      }

      console.log('[切换账号] 设置新 wxid')
      await configService.setMyWxid(selectedWxid)

      console.log('[切换账号] 获取账号配置')
      const wxidConfig = await configService.getWxidConfig(selectedWxid)
      console.log('[切换账号] 配置内容:', wxidConfig)
      if (wxidConfig?.decryptKey) {
        console.log('[切换账号] 设置 decryptKey')
        await configService.setDecryptKey(wxidConfig.decryptKey)
      }
      if (typeof wxidConfig?.imageXorKey === 'number') {
        console.log('[切换账号] 设置 imageXorKey:', wxidConfig.imageXorKey)
        await configService.setImageXorKey(wxidConfig.imageXorKey)
      }
      if (wxidConfig?.imageAesKey) {
        console.log('[切换账号] 设置 imageAesKey')
        await configService.setImageAesKey(wxidConfig.imageAesKey)
      }

      console.log('[切换账号] 检查数据库连接状态')
      console.log('[切换账号] 数据库连接状态:', isDbConnected)
      if (isDbConnected) {
        console.log('[切换账号] 关闭数据库连接')
        await window.electronAPI.chat.close()
      }

      console.log('[切换账号] 清除缓存')
      window.localStorage.removeItem(SIDEBAR_USER_PROFILE_CACHE_KEY)
      clearAnalyticsStoreCache()
      resetChatStore()

      console.log('[切换账号] 触发 wxid-changed 事件')
      window.dispatchEvent(new CustomEvent('wxid-changed', { detail: { wxid: selectedWxid } }))

      console.log('[切换账号] 切换成功')
      setShowSwitchAccountDialog(false)
    } catch (error) {
      console.error('[切换账号] 失败:', error)
      window.alert('切换账号失败，请稍后重试')
    } finally {
      setIsSwitchingAccount(false)
    }
  }

  const openSettingsFromAccountMenu = () => {
    setIsAccountMenuOpen(false)
    navigate('/settings', {
      state: {
        backgroundLocation: location
      }
    })
  }

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }
  const exportTaskBadge = activeExportTaskCount > 99 ? '99+' : `${activeExportTaskCount}`

  return (
    <>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <nav className="nav-menu">
          {/* 首页 */}
          <NavLink
            to="/home"
            className={`nav-item ${isActive('/home') ? 'active' : ''}`}
            title={collapsed ? '首页' : undefined}
          >
            <span className="nav-icon"><Home size={20} /></span>
            <span className="nav-label">首页</span>
          </NavLink>

          {/* 聊天 */}
          <NavLink
            to="/chat"
            className={`nav-item ${isActive('/chat') ? 'active' : ''} ${isMacPlatform ? 'disabled' : ''}`}
            title={collapsed ? '聊天' : undefined}
            onClick={(e) => { if (isMacPlatform) e.preventDefault() }}
          >
            <span className="nav-icon"><MessageSquare size={20} /></span>
            <span className="nav-label">聊天</span>
          </NavLink>

          {/* 通讯录 */}
          <NavLink
            to="/contacts"
            className={`nav-item ${isActive('/contacts') ? 'active' : ''} ${isMacPlatform ? 'disabled' : ''}`}
            title={collapsed ? '通讯录' : undefined}
            onClick={(e) => { if (isMacPlatform) e.preventDefault() }}
          >
            <span className="nav-icon"><UserCircle size={20} /></span>
            <span className="nav-label">通讯录</span>
          </NavLink>

          {/* 人力仓 */}
          {hasMenu([102]) && (
          <NavLink
            to="/store"
            className={`nav-item ${isActive('/store') ? 'active' : ''}`}
            title={collapsed ? '人力仓' : undefined}
          >
            <span className="nav-icon"><Users size={20} /></span>
            <span className="nav-label">人力仓</span>
          </NavLink>
          )}

          {/* 企业列表 */}
          {hasMenu([103]) && (
          <NavLink
            to="/company"
            className={`nav-item ${isActive('/company') ? 'active' : ''}`}
            title={collapsed ? '企业列表' : undefined}
          >
            <span className="nav-icon"><Building2 size={20} /></span>
            <span className="nav-label">企业列表</span>
          </NavLink>
          )}

          {/* 门店列表 */}
          {hasMenu([104]) && (
          <NavLink
            to="/shop"
            className={`nav-item ${isActive('/shop') ? 'active' : ''}`}
            title={collapsed ? '门店列表' : undefined}
          >
            <span className="nav-icon"><Store size={20} /></span>
            <span className="nav-label">门店列表</span>
          </NavLink>
          )}

          {/* 店长列表 */}
          {hasMenu([105]) && (
          <NavLink
            to="/manager"
            className={`nav-item ${isActive('/manager') ? 'active' : ''}`}
            title={collapsed ? '店长列表' : undefined}
          >
            <span className="nav-icon"><UserCog size={20} /></span>
            <span className="nav-label">店长列表</span>
          </NavLink>
          )}

          {/* 系统配置维护 */}
          {hasMenu([106]) && (
          <div className={`nav-group ${isActive('/city') || isActive('/time') || isActive('/tag-dict') ? 'has-active' : ''}`}>
            <div
              className={`nav-item nav-group-title ${configMenuOpen ? 'open' : ''}`}
              onClick={() => setConfigMenuOpen(!configMenuOpen)}
              title={collapsed ? '系统配置维护' : undefined}
            >
              <span className="nav-icon"><Wrench size={20} /></span>
              <span className="nav-label">系统配置维护</span>
              <span className="nav-group-arrow">
                <ChevronDown size={14} className={configMenuOpen ? 'arrow-open' : 'arrow-closed'} />
              </span>
            </div>
            {configMenuOpen && (
              <div className="nav-group-children">
                <NavLink
                  to="/city"
                  className={`nav-item nav-child ${isActive('/city') ? 'active' : ''}`}
                  title={collapsed ? '商圈列表' : undefined}
                >
                  <span className="nav-icon"><MapPin size={18} /></span>
                  <span className="nav-label">商圈列表</span>
                </NavLink>
                <NavLink
                  to="/time"
                  className={`nav-item nav-child ${isActive('/time') ? 'active' : ''}`}
                  title={collapsed ? '基础时间' : undefined}
                >
                  <span className="nav-icon"><Clock size={18} /></span>
                  <span className="nav-label">基础时间</span>
                </NavLink>
                <NavLink
                  to="/tag-dict"
                  className={`nav-item nav-child ${isActive('/tag-dict') ? 'active' : ''}`}
                  title={collapsed ? '标签字典' : undefined}
                >
                  <span className="nav-icon"><Tag size={18} /></span>
                  <span className="nav-label">标签字典</span>
                </NavLink>
              </div>
            )}
          </div>
          )}

          {/* 系统管理 */}
          {hasMenu([107]) && (
          <div className={`nav-group ${isActive('/account') || isActive('/role') ? 'has-active' : ''}`}>
            <div
              className={`nav-item nav-group-title ${sysMenuOpen ? 'open' : ''}`}
              onClick={() => setSysMenuOpen(!sysMenuOpen)}
              title={collapsed ? '系统管理' : undefined}
            >
              <span className="nav-icon"><Shield size={20} /></span>
              <span className="nav-label">系统管理</span>
              <span className="nav-group-arrow">
                <ChevronDown size={14} className={sysMenuOpen ? 'arrow-open' : 'arrow-closed'} />
              </span>
            </div>
            {sysMenuOpen && (
              <div className="nav-group-children">
                <NavLink
                  to="/account"
                  className={`nav-item nav-child ${isActive('/account') ? 'active' : ''}`}
                  title={collapsed ? '账号管理' : undefined}
                >
                  <span className="nav-icon"><UserCog size={18} /></span>
                  <span className="nav-label">账号管理</span>
                </NavLink>
                <NavLink
                  to="/role"
                  className={`nav-item nav-child ${isActive('/role') ? 'active' : ''}`}
                  title={collapsed ? '角色管理' : undefined}
                >
                  <span className="nav-icon"><Shield size={18} /></span>
                  <span className="nav-label">角色管理</span>
                </NavLink>
              </div>
            )}
          </div>
          )}

        </nav>

        <div className="sidebar-footer">
          {authUsername && (
            <div className="sidebar-admin-info">
              <div className="admin-account">
                <UserRound size={14} />
                <span className="admin-name" title={authUsername}>{authUsername}</span>
              </div>
              <button
                className="admin-change-pwd-btn"
                onClick={() => { setShowChangePwdDialog(true); setChangePwdError(''); setOldPassword(''); setNewPassword(''); setConfirmPassword('') }}
                type="button"
              >
                <KeyRound size={13} />
                <span>修改密码</span>
              </button>
            </div>
          )}
          <div className="sidebar-user-card-wrap" ref={accountCardWrapRef}>
            <div className={`sidebar-user-menu ${isAccountMenuOpen ? 'open' : ''}`} role="menu" aria-label="账号菜单">
              <button
                className="sidebar-user-menu-item"
                onClick={openSwitchAccountDialog}
                type="button"
                role="menuitem"
              >
                <RefreshCw size={14} />
                <span>切换账号</span>
              </button>
              <button
                className="sidebar-user-menu-item"
                onClick={openSettingsFromAccountMenu}
                type="button"
                role="menuitem"
              >
                <Settings size={14} />
                <span>设置</span>
              </button>
              <button
                className="sidebar-user-menu-item danger"
                onClick={async () => {
                  setIsAccountMenuOpen(false)
                  try { await adminFetch('https://store.quikms.com/admin/auth/logout') } catch { /* ignore */ }
                  clearAuth()
                  setIsLoggedIn(false)
                }}
                type="button"
                role="menuitem"
              >
                <LogOut size={14} />
                <span>退出</span>
              </button>
            </div>
            <div
              className={`sidebar-user-card ${isAccountMenuOpen ? 'menu-open' : ''}`}
              title={collapsed ? `${userProfile.displayName}${(userProfile.alias || userProfile.wxid) ? `\n${userProfile.alias || userProfile.wxid}` : ''}` : undefined}
              onClick={() => setIsAccountMenuOpen(prev => !prev)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setIsAccountMenuOpen(prev => !prev)
                }
              }}
            >
              <div className="user-avatar">
                {userProfile.avatarUrl ? <img src={userProfile.avatarUrl} alt="" /> : <span>{getAvatarLetter(userProfile.displayName)}</span>}
              </div>
              <div className="user-meta">
                <div className="user-name">{userProfile.displayName}</div>
                <div className="user-wxid">{userProfile.alias || userProfile.wxid || 'wxid 未识别'}</div>
              </div>
              {!collapsed && (
                <span className={`user-menu-caret ${isAccountMenuOpen ? 'open' : ''}`}>
                  <ChevronUp size={14} />
                </span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {showChangePwdDialog && (
        <div className="sidebar-dialog-overlay" onClick={() => !changePwdLoading && setShowChangePwdDialog(false)}>
          <div className="sidebar-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>修改密码</h3>
            <p>当前账号：{authUsername}</p>
            <div className="change-pwd-form">
              <div className="change-pwd-field">
                <label>原密码</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="请输入原密码"
                  disabled={changePwdLoading}
                />
              </div>
              <div className="change-pwd-field">
                <label>新密码</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="请输入新密码（至少6位）"
                  disabled={changePwdLoading}
                />
              </div>
              <div className="change-pwd-field">
                <label>确认新密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入新密码"
                  disabled={changePwdLoading}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword() }}
                />
              </div>
              {changePwdError && <div className="change-pwd-error">{changePwdError}</div>}
            </div>
            <div className="sidebar-dialog-actions">
              <button type="button" onClick={() => setShowChangePwdDialog(false)} disabled={changePwdLoading}>取消</button>
              <button type="button" className="primary" onClick={handleChangePassword} disabled={changePwdLoading}>
                {changePwdLoading ? '提交中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSwitchAccountDialog && (
        <div className="sidebar-dialog-overlay" onClick={() => !isSwitchingAccount && setShowSwitchAccountDialog(false)}>
          <div className="sidebar-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>切换账号</h3>
            <p>选择要切换的微信账号</p>
            <div className="sidebar-wxid-list">
              {wxidOptions.map((option) => (
                <button
                  key={option.wxid}
                  className={`sidebar-wxid-item ${userProfile.wxid === option.wxid ? 'current' : ''}`}
                  onClick={() => handleSwitchAccount(option.wxid)}
                  disabled={isSwitchingAccount}
                  type="button"
                >
                  <div className="wxid-avatar">
                    {option.avatarUrl ? (
                        <img src={option.avatarUrl} alt="" />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', borderRadius: '6px', color: 'var(--text-tertiary)' }}>
                          <UserRound size={16} />
                        </div>
                    )}
                  </div>
                  <div className="wxid-info">
                    <div className="wxid-name">{option.displayName}</div>
                    {option.displayName !== option.wxid && <div className="wxid-id">{option.wxid}</div>}
                  </div>
                  {userProfile.wxid === option.wxid && <span className="current-badge">当前</span>}
                </button>
              ))}
            </div>
            <div className="sidebar-dialog-actions">
              <button type="button" onClick={() => setShowSwitchAccountDialog(false)} disabled={isSwitchingAccount}>取消</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Sidebar
