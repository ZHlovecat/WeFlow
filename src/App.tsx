import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation, type Location } from 'react-router-dom'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import RouteGuard from './components/RouteGuard'
import WelcomePage from './pages/WelcomePage'
import HomePage from './pages/HomePage'
import ChatPage from './pages/ChatPage'
import AnalyticsPage from './pages/AnalyticsPage'
import AnalyticsWelcomePage from './pages/AnalyticsWelcomePage'
import ChatAnalyticsHubPage from './pages/ChatAnalyticsHubPage'
import AnnualReportPage from './pages/AnnualReportPage'
import AnnualReportWindow from './pages/AnnualReportWindow'
import DualReportPage from './pages/DualReportPage'
import DualReportWindow from './pages/DualReportWindow'
import AgreementPage from './pages/AgreementPage'
import GroupAnalyticsPage from './pages/GroupAnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import ExportPage from './pages/ExportPage'
import VideoWindow from './pages/VideoWindow'
import ImageWindow from './pages/ImageWindow'
import SnsPage from './pages/SnsPage'
import BizPage from './pages/BizPage'
import ContactsPage from './pages/ContactsPage'
import ResourcesPage from './pages/ResourcesPage'
import ChatHistoryPage from './pages/ChatHistoryPage'
import NotificationWindow from './pages/NotificationWindow'
import LoginPage from './pages/LoginPage'
import CompanyListPage from './pages/CompanyListPage'
import ShopListPage from './pages/ShopListPage'
import CityListPage from './pages/CityListPage'
import TimeListPage from './pages/TimeListPage'
import TagDictPage from './pages/TagDictPage'
import ManagerListPage from './pages/ManagerListPage'
import StoreListPage from './pages/StoreListPage'
import InterviewListPage from './pages/InterviewListPage'
import AccountListPage from './pages/AccountListPage'
import RoleListPage from './pages/RoleListPage'
import MiniUserListPage from './pages/MiniUserListPage'
import DictPage from './pages/DictPage'
import JobListPage from './pages/JobListPage'
import JobCateListPage from './pages/JobCateListPage'

import { useAppStore } from './stores/appStore'
import { themes, useThemeStore, type ThemeId, type ThemeMode } from './stores/themeStore'
import * as configService from './services/config'
import * as cloudControl from './services/cloudControl'
import { refreshUserPermissions } from './services/permission'
import { Download, X, Shield } from 'lucide-react'
import './App.scss'

import UpdateDialog from './components/UpdateDialog'
import UpdateProgressCapsule from './components/UpdateProgressCapsule'
import LockScreen from './components/LockScreen'
import { GlobalSessionMonitor } from './components/GlobalSessionMonitor'
import { BatchTranscribeGlobal } from './components/BatchTranscribeGlobal'
import { BatchImageDecryptGlobal } from './components/BatchImageDecryptGlobal'
import WindowCloseDialog from './components/WindowCloseDialog'

function RouteStateRedirect({ to }: { to: string }) {
  const location = useLocation()

  return <Navigate to={to} replace state={location.state} />
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const settingsBackgroundRef = useRef<Location>({
    pathname: '/home',
    search: '',
    hash: '',
    state: null,
    key: 'settings-fallback'
  } as Location)

  const {
    setDbConnected,
    updateInfo,
    setUpdateInfo,
    isDownloading,
    setIsDownloading,
    isDownloaded,
    setIsDownloaded,
    downloadProgress,
    setDownloadProgress,
    showUpdateDialog,
    setShowUpdateDialog,
    setUpdateError,
    isLocked,
    setLocked
  } = useAppStore()

  const { currentTheme, themeMode, setTheme, setThemeMode } = useThemeStore()
  const isAgreementWindow = location.pathname === '/agreement-window'
  const isOnboardingWindow = location.pathname === '/onboarding-window'
  const isVideoPlayerWindow = location.pathname === '/video-player-window'
  const isChatHistoryWindow = location.pathname.startsWith('/chat-history/') || location.pathname.startsWith('/chat-history-inline/')
  const isStandaloneChatWindow = location.pathname === '/chat-window'
  const isNotificationWindow = location.pathname === '/notification-window'
  const isSettingsRoute = location.pathname === '/settings'
  const settingsRouteState = location.state as { backgroundLocation?: Location; initialTab?: unknown } | null
  const routeLocation = isSettingsRoute
    ? settingsRouteState?.backgroundLocation ?? settingsBackgroundRef.current
    : location
  const isExportRoute = routeLocation.pathname === '/export'
  const [themeHydrated, setThemeHydrated] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [canMinimizeToTray, setCanMinimizeToTray] = useState(false)

  // 锁定状态
  // const [isLocked, setIsLocked] = useState(false) // Moved to store
  const [lockAvatar, setLockAvatar] = useState<string | undefined>(
    localStorage.getItem('app_lock_avatar') || undefined
  )
  const [lockUseHello, setLockUseHello] = useState(false)

  // 协议加载锁：用于阻塞依赖加载完成才执行的副作用（如 Wayland 检查）
  const [agreementLoading, setAgreementLoading] = useState(true)

  // 数据收集同意状态（设置页可手动开关；启动不再弹窗）
  const [analyticsConsent, setAnalyticsConsent] = useState<boolean | null>(null)

  const [showWaylandWarning, setShowWaylandWarning] = useState(false)

  useEffect(() => {
    const checkWaylandStatus = async () => {
      try {
        // 防止在非客户端环境报错，先检查 API 是否存在
        if (!window.electronAPI?.app?.checkWayland) return

        // 通过 configService 检查是否已经弹过窗
        const hasWarned = await window.electronAPI.config.get('waylandWarningShown')

        if (!hasWarned) {
          const isWayland = await window.electronAPI.app.checkWayland()
          if (isWayland) {
            setShowWaylandWarning(true)
          }
        }
      } catch (e) {
        console.error('检查 Wayland 状态失败:', e)
      }
    }

    // 只有在协议同意之后并且已经进入主应用流程才检查
    if (!isAgreementWindow && !isOnboardingWindow && !agreementLoading) {
      checkWaylandStatus()
    }
  }, [isAgreementWindow, isOnboardingWindow, agreementLoading])

  const handleDismissWaylandWarning = async () => {
    try {
      // 记录到本地配置中，下次不再提示
      await window.electronAPI.config.set('waylandWarningShown', true)
    } catch (e) {
      console.error('保存 Wayland 提示状态失败:', e)
    }
    setShowWaylandWarning(false)
  }

  useEffect(() => {
    if (location.pathname !== '/settings') {
      settingsBackgroundRef.current = location
    }
  }, [location])

  useEffect(() => {
    const removeCloseConfirmListener = window.electronAPI.window.onCloseConfirmRequested((payload) => {
      setCanMinimizeToTray(Boolean(payload.canMinimizeToTray))
      setShowCloseDialog(true)
    })

    return () => removeCloseConfirmListener()
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const appRoot = document.getElementById('app')

    if (isOnboardingWindow || isNotificationWindow) {
      root.style.background = 'transparent'
      body.style.background = 'transparent'
      body.style.overflow = 'hidden'
      if (appRoot) {
        appRoot.style.background = 'transparent'
        appRoot.style.overflow = 'hidden'
      }
    } else {
      root.style.background = 'var(--bg-primary)'
      body.style.background = 'var(--bg-primary)'
      body.style.overflow = ''
      if (appRoot) {
        appRoot.style.background = ''
        appRoot.style.overflow = ''
      }
    }
  }, [isOnboardingWindow])

  // 应用主题
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const applyMode = (mode: ThemeMode, systemDark?: boolean) => {
      const effectiveMode = mode === 'system' ? (systemDark ?? mq.matches ? 'dark' : 'light') : mode
      document.documentElement.setAttribute('data-theme', currentTheme)
      document.documentElement.setAttribute('data-mode', effectiveMode)
    }

    applyMode(themeMode)

    // 监听系统主题变化
    const handler = (e: MediaQueryListEvent) => {
      if (useThemeStore.getState().themeMode === 'system') {
        applyMode('system', e.matches)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [currentTheme, themeMode, isOnboardingWindow, isNotificationWindow])

  // 读取已保存的主题设置
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const [savedThemeId, savedThemeMode] = await Promise.all([
          configService.getThemeId(),
          configService.getTheme()
        ])
        if (savedThemeId && themes.some((theme) => theme.id === savedThemeId)) {
          setTheme(savedThemeId as ThemeId)
        }
        if (savedThemeMode === 'light' || savedThemeMode === 'dark' || savedThemeMode === 'system') {
          setThemeMode(savedThemeMode)
        }
      } catch (e) {
        console.error('读取主题配置失败:', e)
      } finally {
        setThemeHydrated(true)
      }
    }
    loadTheme()
  }, [setTheme, setThemeMode])

  // 保存主题设置
  useEffect(() => {
    if (!themeHydrated) return
    const saveTheme = async () => {
      try {
        await Promise.all([
          configService.setThemeId(currentTheme),
          configService.setTheme(themeMode)
        ])
      } catch (e) {
        console.error('保存主题配置失败:', e)
      }
    }
    saveTheme()
  }, [currentTheme, themeMode, themeHydrated])

  // 启动时仅读取数据收集同意状态用于初始化 cloudControl，不再弹任何协议/数据收集弹窗
  useEffect(() => {
    const init = async () => {
      try {
        const consent = await configService.getAnalyticsConsent()
        setAnalyticsConsent(consent)
      } catch (e) {
        console.error('读取数据收集设置失败:', e)
      } finally {
        setAgreementLoading(false)
      }
    }
    init()
  }, [])

  // 初始化数据收集（仅在用户同意后）
  useEffect(() => {
    if (analyticsConsent === true) {
      cloudControl.initCloudControl()
    }
  }, [analyticsConsent])

  // 记录页面访问（仅在用户同意后）
  useEffect(() => {
    if (analyticsConsent !== true) return
    const path = location.pathname
    if (path && path !== '/') {
      cloudControl.recordPage(path)
    }
  }, [location.pathname, analyticsConsent])

  // 监听更新通知（GitHub Releases 自定义流程）
  useEffect(() => {
    if (isNotificationWindow) return

    const removeUpdateListener = window.electronAPI?.app?.onUpdateAvailable?.((info) => {
      if (info && info.hasUpdate) {
        setUpdateInfo(info)
        if (!useAppStore.getState().isLocked) {
          setShowUpdateDialog(true)
        }
      }
    })
    const removeProgressListener = window.electronAPI?.app?.onDownloadProgress?.((progress) => {
      setDownloadProgress(progress)
    })
    const removeDoneListener = window.electronAPI?.app?.onDownloadDone?.(() => {
      setIsDownloading(false)
      setIsDownloaded(true)
      // 自动安装并退出
      window.electronAPI?.app?.installAndQuit?.().catch((e: any) => {
        console.error('安装失败:', e)
        setUpdateError(e?.message || '安装启动失败')
      })
    })
    return () => {
      removeUpdateListener?.()
      removeProgressListener?.()
      removeDoneListener?.()
    }
  }, [setUpdateInfo, setDownloadProgress, setShowUpdateDialog, setIsDownloading, setIsDownloaded, setUpdateError, isNotificationWindow])

  // 解锁后显示暂存的更新弹窗
  useEffect(() => {
    if (!isLocked && updateInfo?.hasUpdate && !showUpdateDialog && !isDownloading) {
      setShowUpdateDialog(true)
    }
  }, [isLocked])

  const handleStartDownload = async () => {
    setIsDownloading(true)
    setIsDownloaded(false)
    setDownloadProgress({ transferred: 0, total: updateInfo?.assetSize || 0, percent: 0, bytesPerSecond: 0 })
    try {
      const res = await window.electronAPI.app.downloadUpdate()
      if (!res?.success) {
        setIsDownloading(false)
        setUpdateError(res?.error || '下载失败')
      }
      // 真正完成由 onDownloadDone 触发自动安装
    } catch (e: any) {
      console.error('下载更新失败:', e)
      setIsDownloading(false)
      setUpdateError(e?.message || '下载失败')
    }
  }

  const handleInstallNow = async () => {
    try {
      const res = await window.electronAPI.app.installAndQuit()
      if (!res?.success) {
        setUpdateError(res?.error || '安装失败')
      }
    } catch (e: any) {
      setUpdateError(e?.message || '安装失败')
    }
  }

  const handleIgnoreUpdate = async () => {
    if (!updateInfo || !updateInfo.publishedAt) {
      setShowUpdateDialog(false)
      setUpdateInfo(null)
      return
    }
    try {
      await window.electronAPI.app.ignoreUpdate(updateInfo.publishedAt)
    } catch (e: any) {
      console.error('忽略更新失败:', e)
    }
    setShowUpdateDialog(false)
    setUpdateInfo(null)
  }

  const dismissUpdate = () => {
    if (isDownloading) return
    setShowUpdateDialog(false)
  }

  const handleWindowCloseAction = async (
    action: 'tray' | 'quit' | 'cancel',
    rememberChoice = false
  ) => {
    setShowCloseDialog(false)
    if (rememberChoice && action !== 'cancel') {
      try {
        await configService.setWindowCloseBehavior(action)
      } catch (error) {
        console.error('保存关闭偏好失败:', error)
      }
    }

    try {
      await window.electronAPI.window.respondCloseConfirm(action)
    } catch (error) {
      console.error('处理关闭确认失败:', error)
    }
  }

  // 启动时自动检查配置并连接数据库
  useEffect(() => {
    if (isAgreementWindow || isOnboardingWindow) return

    const autoConnect = async () => {
      try {
        const dbPath = await configService.getDbPath()
        const decryptKey = await configService.getDecryptKey()
        const wxid = await configService.getMyWxid()
        const onboardingDone = await configService.getOnboardingDone()
        const wxidConfig = wxid ? await configService.getWxidConfig(wxid) : null
        const effectiveDecryptKey = wxidConfig?.decryptKey || decryptKey

        if (wxidConfig?.decryptKey && wxidConfig.decryptKey !== decryptKey) {
          await configService.setDecryptKey(wxidConfig.decryptKey)
        }

        // 如果配置完整，自动测试连接
        if (dbPath && effectiveDecryptKey && wxid) {
          if (!onboardingDone) {
            await configService.setOnboardingDone(true)
          }

          const result = await window.electronAPI.chat.connect()

          if (result.success) {

            setDbConnected(true, dbPath)
            // 如果当前在欢迎页，跳转到首页
            if (window.location.hash === '#/' || window.location.hash === '') {
              navigate('/home')
            }
          } else {

            // 如果错误信息包含 VC++ 或数据服务相关内容，不清除配置，只提示用户
            // 其他错误可能需要重新配置
            const errorMsg = result.error || ''
            if (errorMsg.includes('Visual C++') ||
              errorMsg.includes('DLL') ||
              errorMsg.includes('Worker') ||
              errorMsg.includes('126') ||
              errorMsg.includes('模块')) {
              console.warn('检测到可能的运行时依赖问题:', errorMsg)
              // 不清除配置，让用户安装 VC++ 后重试
            }
          }
        }
      } catch (e) {
        console.error('自动连接出错:', e)
        // 捕获异常但不清除配置，防止循环重新引导
      }
    }

    autoConnect()
  }, [isAgreementWindow, isOnboardingWindow, navigate, setDbConnected])

  // 已登录时静默刷新一次菜单权限，捕获后端新增/变更的菜单
  const isLoggedInForPerm = useAppStore(state => state.isLoggedIn)
  const authTokenForPerm = useAppStore(state => state.authToken)
  useEffect(() => {
    if (isAgreementWindow || isOnboardingWindow || isVideoPlayerWindow || isNotificationWindow) return
    if (!isLoggedInForPerm || !authTokenForPerm) return
    refreshUserPermissions()
  }, [isAgreementWindow, isOnboardingWindow, isVideoPlayerWindow, isNotificationWindow, isLoggedInForPerm, authTokenForPerm])

  // 检查应用锁
  useEffect(() => {
    if (isAgreementWindow || isOnboardingWindow || isVideoPlayerWindow) return

    const checkLock = async () => {
      // 并行获取配置，减少等待
      const [enabled, useHello] = await Promise.all([
        window.electronAPI.auth.verifyEnabled(),
        configService.getAuthUseHello()
      ])

      if (enabled) {
        setLockUseHello(useHello)
        setLocked(true)
        // 尝试获取头像
        try {
          const result = await window.electronAPI.chat.getMyAvatarUrl()
          if (result && result.success && result.avatarUrl) {
            setLockAvatar(result.avatarUrl)
            localStorage.setItem('app_lock_avatar', result.avatarUrl)
          }
        } catch (e) {
          console.error('获取锁屏头像失败', e)
        }
      }
    }
    checkLock()
  }, [isAgreementWindow, isOnboardingWindow, isVideoPlayerWindow])



  // 独立协议窗口
  if (isAgreementWindow) {
    return <AgreementPage />
  }

  if (isOnboardingWindow) {
    return <WelcomePage standalone />
  }

  // 独立视频播放窗口
  if (isVideoPlayerWindow) {
    return <VideoWindow />
  }

  // 独立图片查看窗口
  const isImageViewerWindow = location.pathname === '/image-viewer-window'
  if (isImageViewerWindow) {
    return <ImageWindow />
  }

  // 独立聊天记录窗口
  if (isChatHistoryWindow) {
    return <ChatHistoryPage />
  }

  // 独立会话聊天窗口（仅显示聊天内容区域）
  if (isStandaloneChatWindow) {
    const params = new URLSearchParams(location.search)
    const sessionId = params.get('sessionId') || ''
    const standaloneSource = params.get('source')
    const standaloneInitialDisplayName = params.get('initialDisplayName')
    const standaloneInitialAvatarUrl = params.get('initialAvatarUrl')
    const standaloneInitialContactType = params.get('initialContactType')
    return (
      <ChatPage
        standaloneSessionWindow
        initialSessionId={sessionId}
        standaloneSource={standaloneSource}
        standaloneInitialDisplayName={standaloneInitialDisplayName}
        standaloneInitialAvatarUrl={standaloneInitialAvatarUrl}
        standaloneInitialContactType={standaloneInitialContactType}
      />
    )
  }

  // 独立通知窗口
  if (isNotificationWindow) {
    return <NotificationWindow />
  }

  // 主窗口 - 登录检查
  const isLoggedIn = useAppStore(state => state.isLoggedIn)
  const isMacPlatform = useAppStore(state => state.isMacPlatform)
  const isDbConnectedValue = useAppStore(state => state.isDbConnected)
  if (!isLoggedIn) {
    return <LoginPage />
  }

  // 登录后：Mac 系统跳过配置页直接进后台；Windows 需要数据库已连接才进后台，否则走配置流程
  if (!isMacPlatform && !isDbConnectedValue) {
    return <WelcomePage />
  }

  // 主窗口 - 完整布局
  const handleCloseSettings = () => {
    const backgroundLocation = settingsRouteState?.backgroundLocation ?? settingsBackgroundRef.current
    if (backgroundLocation.pathname === '/settings') {
      navigate('/home', { replace: true })
      return
    }
    navigate(
      {
        pathname: backgroundLocation.pathname,
        search: backgroundLocation.search,
        hash: backgroundLocation.hash
      },
      {
        replace: true,
        state: backgroundLocation.state
      }
    )
  }

  return (
    <div className={`app-container${isMacPlatform ? ' app-mac' : ''}`}>
      <div className="window-drag-region" aria-hidden="true" />
      {isLocked && (
        <LockScreen
          onUnlock={() => setLocked(false)}
          avatar={lockAvatar}
          useHello={lockUseHello}
        />
      )}
      <TitleBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
      />

      {/* 全局悬浮进度胶囊 (处理：新版本提示、下载进度、错误提示) */}
      <UpdateProgressCapsule />

      {/* 全局会话监听与通知 */}
      <GlobalSessionMonitor />

      {/* 全局批量转写进度浮窗 */}
      <BatchTranscribeGlobal />
      <BatchImageDecryptGlobal />

      {/*{showWaylandWarning && (*/}
      {/*  <div className="agreement-overlay">*/}
      {/*    <div className="agreement-modal">*/}
      {/*      <div className="agreement-header">*/}
      {/*        <Shield size={32} />*/}
      {/*        <h2>环境兼容性提示 (Wayland)</h2>*/}
      {/*      </div>*/}
      {/*      <div className="agreement-content">*/}
      {/*        <div className="agreement-text">*/}
      {/*          <p>检测到您当前正在使用 <strong>Wayland</strong> 显示服务器。</p>*/}
      {/*          <p>在 Wayland 环境下，出于系统级的安全与设计机制，<strong>应用程序无法直接控制新弹出窗口的位置</strong>。</p>*/}
      {/*          <p>这可能导致某些独立窗口（如消息通知、图片查看器等）出现位置随机、或不受控制的情况。这是底层机制导致的，对此我们无能为力。</p>*/}
      {/*          <br />*/}
      {/*          <p>如果您觉得窗口位置异常严重影响了使用体验，建议尝试：</p>*/}
      {/*          <p>1. 在系统登录界面，将会话切换回 <strong>X11 (Xorg)</strong> 模式。</p>*/}
      {/*          <p>2. 修改您的桌面管理器 (WM/DE) 配置，强制指定该应用程序的窗口规则。</p>*/}
      {/*        </div>*/}
      {/*      </div>*/}
      {/*      <div className="agreement-footer">*/}
      {/*        <div className="agreement-actions">*/}
      {/*          <button className="btn btn-primary" onClick={handleDismissWaylandWarning}>我知道了，不再提示</button>*/}
      {/*        </div>*/}
      {/*      </div>*/}
      {/*    </div>*/}
      {/*  </div>*/}
      {/*)}*/}     

      {/* 更新提示对话框 */}
      <UpdateDialog
        open={showUpdateDialog}
        updateInfo={updateInfo}
        onClose={dismissUpdate}
        onDownload={handleStartDownload}
        onIgnore={handleIgnoreUpdate}
        onInstall={handleInstallNow}
        isDownloading={isDownloading}
        isDownloaded={isDownloaded}
        progress={downloadProgress}
      />

      <WindowCloseDialog
        open={showCloseDialog}
        canMinimizeToTray={canMinimizeToTray}
        onSelect={(action, rememberChoice) => handleWindowCloseAction(action, rememberChoice)}
        onCancel={() => handleWindowCloseAction('cancel')}
      />

      <div className="main-layout">
        <Sidebar collapsed={sidebarCollapsed} />
        <main className="content">
          <RouteGuard>
            <div className={`export-keepalive-page ${isExportRoute ? 'active' : 'hidden'}`} aria-hidden={!isExportRoute}>
              <ExportPage />
            </div>

            <Routes location={routeLocation}>
              <Route path="/" element={<HomePage />} />
              <Route path="/home" element={<HomePage />} />
              <Route path="/chat" element={<ChatPage />} />

              <Route path="/analytics" element={<ChatAnalyticsHubPage />} />
              <Route path="/analytics/private" element={<AnalyticsWelcomePage />} />
              <Route path="/analytics/private/view" element={<AnalyticsPage />} />
              <Route path="/analytics/group" element={<GroupAnalyticsPage />} />
              <Route path="/analytics/view" element={<RouteStateRedirect to="/analytics/private/view" />} />
              <Route path="/group-analytics" element={<RouteStateRedirect to="/analytics/group" />} />
              <Route path="/annual-report" element={<AnnualReportPage />} />
              <Route path="/annual-report/view" element={<AnnualReportWindow />} />
              <Route path="/dual-report" element={<DualReportPage />} />
              <Route path="/dual-report/view" element={<DualReportWindow />} />

              <Route path="/export" element={<div className="export-route-anchor" aria-hidden="true" />} />
              <Route path="/sns" element={<SnsPage />} />
              <Route path="/biz" element={<BizPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/resources" element={<ResourcesPage />} />
              <Route path="/company" element={<CompanyListPage />} />
              <Route path="/shop" element={<ShopListPage />} />
              <Route path="/manager" element={<ManagerListPage />} />
              <Route path="/city" element={<CityListPage />} />
              <Route path="/time" element={<TimeListPage />} />
              <Route path="/tag-dict" element={<TagDictPage />} />
              <Route path="/dict" element={<DictPage />} />
              <Route path="/store" element={<StoreListPage />} />
              <Route path="/jobs" element={<JobListPage />} />
              <Route path="/jobs-cate" element={<JobCateListPage />} />
              <Route path="/interview" element={<InterviewListPage />} />
              <Route path="/account" element={<AccountListPage />} />
              <Route path="/mini-user" element={<MiniUserListPage />} />
              <Route path="/role" element={<RoleListPage />} />
              <Route path="/chat-history/:sessionId/:messageId" element={<ChatHistoryPage />} />
              <Route path="/chat-history-inline/:payloadId" element={<ChatHistoryPage />} />
            </Routes>
          </RouteGuard>
        </main>
      </div>

      {isSettingsRoute && (
        <SettingsPage onClose={handleCloseSettings} />
      )}
    </div>
  )
}

export default App
