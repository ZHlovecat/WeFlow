import { create } from 'zustand'
import type { UpdateAvailablePayload, DownloadProgressPayload } from '../types/electron'

export interface AppState {
  // 数据库状态
  isDbConnected: boolean
  dbPath: string | null
  myWxid: string | null

  // 加载状态
  isLoading: boolean
  loadingText: string

  // 更新状态
  updateInfo: UpdateAvailablePayload | null
  isDownloading: boolean
  isDownloaded: boolean
  downloadProgress: DownloadProgressPayload | null
  showUpdateDialog: boolean
  updateError: string | null

  // 操作
  setDbConnected: (connected: boolean, path?: string) => void
  setMyWxid: (wxid: string) => void
  setLoading: (loading: boolean, text?: string) => void

  // 更新操作
  setUpdateInfo: (info: UpdateAvailablePayload | null) => void
  setIsDownloading: (isDownloading: boolean) => void
  setIsDownloaded: (isDownloaded: boolean) => void
  setDownloadProgress: (progress: DownloadProgressPayload | null) => void
  setShowUpdateDialog: (show: boolean) => void
  setUpdateError: (error: string | null) => void

  // 锁定状态
  isLocked: boolean
  setLocked: (locked: boolean) => void

  // 登录状态
  isLoggedIn: boolean
  setIsLoggedIn: (loggedIn: boolean) => void

  // 认证信息
  authToken: string | null
  authUsername: string | null
  authUserId: number | null
  allowedMenuIds: number[]
  setAuth: (token: string, username: string, userId: number) => void
  setAllowedMenuIds: (ids: number[]) => void
  clearAuth: () => void

  // 平台状态
  isMacPlatform: boolean
  setIsMacPlatform: (isMac: boolean) => void

  reset: () => void
}

export const useAppStore = create<AppState>((set) => ({
  isDbConnected: localStorage.getItem('weflow_db_connected') === 'true',
  dbPath: localStorage.getItem('weflow_db_path') || null,
  myWxid: null,
  isLoading: false,
  loadingText: '',
  isLocked: false,
  isLoggedIn: localStorage.getItem('weflow_logged_in') === 'true',

  // 认证信息
  authToken: localStorage.getItem('weflow_auth_token'),
  authUsername: localStorage.getItem('weflow_auth_username'),
  authUserId: (() => { const v = localStorage.getItem('weflow_auth_user_id'); return v ? Number(v) : null })(),
  allowedMenuIds: (() => { try { return JSON.parse(localStorage.getItem('weflow_menu_ids') || '[]') } catch { return [] } })(),

  // 更新状态初始化
  updateInfo: null,
  isDownloading: false,
  isDownloaded: false,
  downloadProgress: null,
  showUpdateDialog: false,
  updateError: null,

  setDbConnected: (connected, path) => {
    localStorage.setItem('weflow_db_connected', connected ? 'true' : 'false')
    if (path) {
      localStorage.setItem('weflow_db_path', path)
    } else if (!connected) {
      localStorage.removeItem('weflow_db_path')
    }
    set({
      isDbConnected: connected,
      dbPath: path ?? null
    })
  },

  setMyWxid: (wxid) => set({ myWxid: wxid }),

  setLoading: (loading, text) => set({
    isLoading: loading,
    loadingText: text ?? ''
  }),

  setLocked: (locked) => set({ isLocked: locked }),

  setIsLoggedIn: (loggedIn) => {
    localStorage.setItem('weflow_logged_in', loggedIn ? 'true' : 'false')
    set({ isLoggedIn: loggedIn })
  },

  setAuth: (token, username, userId) => {
    localStorage.setItem('weflow_auth_token', token)
    localStorage.setItem('weflow_auth_username', username)
    localStorage.setItem('weflow_auth_user_id', String(userId))
    set({ authToken: token, authUsername: username, authUserId: userId })
  },

  setAllowedMenuIds: (ids) => {
    localStorage.setItem('weflow_menu_ids', JSON.stringify(ids))
    set({ allowedMenuIds: ids })
  },

  clearAuth: () => {
    localStorage.removeItem('weflow_auth_token')
    localStorage.removeItem('weflow_auth_username')
    localStorage.removeItem('weflow_auth_user_id')
    localStorage.removeItem('weflow_menu_ids')
    set({ authToken: null, authUsername: null, authUserId: null, allowedMenuIds: [] })
  },

  isMacPlatform: navigator.userAgent.toLowerCase().includes('mac'),
  setIsMacPlatform: (isMac) => set({ isMacPlatform: isMac }),

  setUpdateInfo: (info) => set({ updateInfo: info, updateError: null }),
  setIsDownloading: (isDownloading) => set({ isDownloading }),
  setIsDownloaded: (isDownloaded) => set({ isDownloaded }),
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),
  setShowUpdateDialog: (show) => set({ showUpdateDialog: show }),
  setUpdateError: (error) => set({ updateError: error }),

  reset: () => {
    localStorage.removeItem('weflow_db_connected')
    localStorage.removeItem('weflow_db_path')
    localStorage.removeItem('weflow_logged_in')
    set({
      isDbConnected: false,
      dbPath: null,
      myWxid: null,
      isLoading: false,
      loadingText: '',
      isLocked: false,
      isLoggedIn: false,
      updateInfo: null,
      isDownloading: false,
      isDownloaded: false,
      downloadProgress: null,
      showUpdateDialog: false,
      updateError: null
    })
  }
}))
