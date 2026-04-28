import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Steps, Form, Input, Button, Select, Switch, Alert, Progress,
  Result, Modal, Row, Col, Space, Avatar, Typography
} from 'antd'
import {
  FolderOpenOutlined, FileSearchOutlined, ReloadOutlined,
  SafetyCertificateOutlined, CheckCircleFilled,
  ArrowLeftOutlined, ArrowRightOutlined, MinusOutlined, CloseOutlined,
  UserOutlined, RocketOutlined
} from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import { dialog } from '../services/ipc'
import * as configService from '../services/config'
import './WelcomePage.scss'

const { Text, Title, Paragraph } = Typography

const isMac = navigator.userAgent.toLowerCase().includes('mac')
const isLinux = navigator.userAgent.toLowerCase().includes('linux')
const isWindows = !isMac && !isLinux

const dbDirName = isMac ? '2.0b4.0.9 目录' : 'xwechat_files 目录'
const DB_PATH_CHINESE_ERROR = '路径包含中文字符，迁移至全英文目录后再试'
const dbPathPlaceholder = isMac
    ? '例如: ~/Library/Containers/com.tencent.xinWeChat/Data/Library/Application Support/com.tencent.xinWeChat/2.0b4.0.9'
    : isLinux
        ? '例如: ~/.local/share/WeChat/xwechat_files 或者 ~/Documents/xwechat_files'
        : '例如: C:\\Users\\xxx\\Documents\\xwechat_files'

const steps = [
  { id: 'intro', title: '欢迎', desc: '准备开始你的本地数据探索' },
  { id: 'db', title: '数据库目录', desc: `定位 ${dbDirName}` },
  { id: 'cache', title: '缓存目录', desc: '设置本地缓存存储位置（可选）' },
  { id: 'key', title: '解密密钥', desc: '获取密钥与自动识别账号' },
  { id: 'image', title: '图片密钥', desc: '获取 XOR 与 AES 密钥' },
  { id: 'security', title: '安全防护', desc: '保护你的数据' }
]

interface WelcomePageProps {
  standalone?: boolean
}

interface WxidOption {
  avatarUrl?: string
  nickname?: string
  wxid: string
  modifiedTime: number
}

const formatDbKeyFailureMessage = (error?: string, logs?: string[]): string => {
  const base = String(error || '自动获取密钥失败').trim()
  const tailLogs = Array.isArray(logs)
    ? logs.map(item => String(item || '').trim()).filter(Boolean).slice(-6)
    : []
  if (tailLogs.length === 0) return base
  return `${base}；最近状态：${tailLogs.join(' | ')}`
}

const normalizeDbKeyStatusMessage = (message: string): string => {
  if (isWindows && message.includes('Hook安装成功')) {
    return '已准备就绪，现在登录微信或退出登录后重新登录微信'
  }
  return message
}

const isDbKeyReadyMessage = (message: string): boolean => (
  message.includes('现在可以登录')
  || message.includes('Hook安装成功')
  || message.includes('已准备就绪，现在登录微信或退出登录后重新登录微信')
)

function WelcomePage({ standalone = false }: WelcomePageProps) {
  const navigate = useNavigate()
  const { isDbConnected, setDbConnected, setLoading } = useAppStore()

  const [stepIndex, setStepIndex] = useState(0)
  const [dbPath, setDbPath] = useState('')
  const [decryptKey, setDecryptKey] = useState('')
  const [imageXorKey, setImageXorKey] = useState('')
  const [imageAesKey, setImageAesKey] = useState('')
  const [cachePath, setCachePath] = useState('')
  const [wxid, setWxid] = useState('')
  const [wxidOptions, setWxidOptions] = useState<WxidOption[]>([])
  const [error, setError] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDetectingPath, setIsDetectingPath] = useState(false)
  const [isScanningWxid, setIsScanningWxid] = useState(false)
  const [isFetchingDbKey, setIsFetchingDbKey] = useState(false)
  const [isFetchingImageKey, setIsFetchingImageKey] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [dbKeyStatus, setDbKeyStatus] = useState('')
  const [imageKeyStatus, setImageKeyStatus] = useState('')
  const [isManualStartPrompt, setIsManualStartPrompt] = useState(false)
  const [imageKeyPercent, setImageKeyPercent] = useState<number | null>(null)
  const [showDbKeyConfirm, setShowDbKeyConfirm] = useState(false)

  const [enableAuth, setEnableAuth] = useState(false)
  const [authPassword, setAuthPassword] = useState('')
  const [authConfirmPassword, setAuthConfirmPassword] = useState('')
  const [enableHello, setEnableHello] = useState(false)
  const [helloAvailable, setHelloAvailable] = useState(false)
  const [isSettingHello, setIsSettingHello] = useState(false)

  useEffect(() => {
    setHelloAvailable(isWindows)
  }, [])

  async function sha256(message: string) {
    const msgBuffer = new TextEncoder().encode(message)
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const handleSetupHello = async () => {
    if (!isWindows) {
      setError('当前系统不支持 Windows Hello')
      return
    }
    if (!authPassword || authPassword !== authConfirmPassword) {
      setError('请先设置并确认应用密码，再开启 Windows Hello')
      return
    }
    setIsSettingHello(true)
    try {
      const result = await window.electronAPI.auth.hello('请验证您的身份以开启 Windows Hello')
      if (!result.success) {
        setError(`Windows Hello 设置失败: ${result.error || '验证失败'}`)
        return
      }
      setEnableHello(true)
      setError('')
    } catch (e: any) {
      setError(`Windows Hello 设置失败: ${e?.message || String(e)}`)
    } finally {
      setIsSettingHello(false)
    }
  }

  useEffect(() => {
    const removeDb = window.electronAPI.key.onDbKeyStatus((payload: { message: string; level: number }) => {
      const normalizedMessage = normalizeDbKeyStatusMessage(payload.message)
      setDbKeyStatus(normalizedMessage)
      if (isDbKeyReadyMessage(normalizedMessage)) {
        window.electronAPI.notification?.show({
          title: '浅雨科技人力仓系统 准备就绪',
          content: '现在可以登录微信了',
          avatarUrl: './logo.png',
          sessionId: 'weflow-system'
        })
      }
    })
    const removeImage = window.electronAPI.key.onImageKeyStatus((payload: { message: string, percent?: number }) => {
      let msg = payload.message
      let pct = payload.percent
      if (pct === undefined) {
        const match = msg.match(/\(([\d.]+)%\)/)
        if (match) {
          pct = parseFloat(match[1])
          msg = msg.replace(/\s*\([\d.]+%\)/, '')
        }
      }
      setImageKeyStatus(msg)
      if (pct !== undefined) {
        setImageKeyPercent(pct)
      } else if (msg.includes('启动多核') || msg.includes('定位') || msg.includes('准备')) {
        setImageKeyPercent(0)
      }
    })
    return () => {
      removeDb?.()
      removeImage?.()
    }
  }, [])

  useEffect(() => {
    if (isDbConnected && !standalone) {
      navigate('/home')
    }
  }, [isDbConnected, standalone, navigate])

  useEffect(() => {
    setWxidOptions([])
    setWxid('')
  }, [dbPath])

  const currentStep = steps[stepIndex]
  const rootClassName = `welcome-page${isClosing ? ' is-closing' : ''}${standalone ? ' is-standalone' : ''}`
  const showWindowControls = standalone

  const handleMinimize = () => window.electronAPI.window.minimize()
  const handleCloseWindow = () => window.electronAPI.window.close()

  const validatePath = (path: string): string | null => {
    if (!path) return null
    if (/[一-龥]/.test(path)) return DB_PATH_CHINESE_ERROR
    return null
  }
  const dbPathValidationError = validatePath(dbPath)

  const handleDbPathChange = (value: string) => {
    setDbPath(value)
    const validationError = validatePath(value)
    if (validationError) {
      setError(validationError)
      return
    }
    if (error === DB_PATH_CHINESE_ERROR) {
      setError('')
    }
  }

  const handleSelectPath = async () => {
    try {
      const result = await dialog.openFile({
        title: '选择微信数据库目录',
        properties: ['openDirectory']
      })
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0]
        const validationError = validatePath(selectedPath)
        setDbPath(selectedPath)
        if (validationError) setError(validationError)
        else setError('')
      }
    } catch {
      setError('选择目录失败')
    }
  }

  const handleAutoDetectPath = async () => {
    if (isDetectingPath) return
    setIsDetectingPath(true)
    setError('')
    try {
      const result = await window.electronAPI.dbPath.autoDetect()
      if (result.success && result.path) {
        const validationError = validatePath(result.path)
        setDbPath(result.path)
        if (validationError) setError(validationError)
        else setError('')
      } else {
        setError(result.error || '未能检测到数据库目录')
      }
    } catch (e) {
      setError(`自动检测失败: ${e}`)
    } finally {
      setIsDetectingPath(false)
    }
  }

  const handleSelectCachePath = async () => {
    try {
      const result = await dialog.openFile({
        title: '选择缓存目录',
        properties: ['openDirectory']
      })
      if (!result.canceled && result.filePaths.length > 0) {
        setCachePath(result.filePaths[0])
        setError('')
      }
    } catch {
      setError('选择缓存目录失败')
    }
  }

  const handleScanWxid = async (silent = false) => {
    if (!dbPath) {
      if (!silent) setError('请先选择数据库目录')
      return
    }
    if (isScanningWxid) return
    setIsScanningWxid(true)
    if (!silent) setError('')
    try {
      const wxids = await window.electronAPI.dbPath.scanWxids(dbPath)
      setWxidOptions(wxids)
      if (wxids.length > 0) {
        setWxid(wxids[0].wxid)
        if (!silent) setError('')
      } else if (!silent) {
        setError('未检测到账号目录，请检查路径')
      }
    } catch (e) {
      if (!silent) setError(`扫描失败: ${e}`)
    } finally {
      setIsScanningWxid(false)
    }
  }

  const handleScanWxidCandidates = async () => {
    if (!dbPath) {
      setError('请先选择数据库目录')
      return
    }
    if (isScanningWxid) return
    setIsScanningWxid(true)
    setError('')
    try {
      const wxids = await window.electronAPI.dbPath.scanWxidCandidates(dbPath)
      setWxidOptions(wxids)
      if (!wxids.length) {
        setError('未检测到可用的账号目录，请检查路径')
      }
    } catch (e) {
      setError(`扫描失败: ${e}`)
    } finally {
      setIsScanningWxid(false)
    }
  }

  const handleAutoGetDbKey = async () => {
    if (isFetchingDbKey) return
    setShowDbKeyConfirm(true)
  }

  const handleDbKeyConfirm = async () => {
    setShowDbKeyConfirm(false)
    setIsFetchingDbKey(true)
    setError('')
    setIsManualStartPrompt(false)
    setDbKeyStatus('正在连接微信进程...')
    try {
      const result = await window.electronAPI.key.autoGetDbKey()
      if (result.success && result.key) {
        setDecryptKey(result.key)
        setDbKeyStatus('密钥获取成功')
        setError('')
        await handleScanWxid(true)
      } else {
        if (result.error?.includes('未找到微信安装路径') || result.error?.includes('启动微信失败')) {
          setIsManualStartPrompt(true)
          setDbKeyStatus('需要手动启动微信')
        } else {
          if (result.error?.includes('尚未完成登录')) {
            setDbKeyStatus('请先在微信完成登录后重试')
          }
          setError(formatDbKeyFailureMessage(result.error, result.logs))
        }
      }
    } catch (e) {
      setError(`自动获取密钥失败: ${e}`)
    } finally {
      setIsFetchingDbKey(false)
    }
  }

  const handleManualConfirm = async () => {
    setIsManualStartPrompt(false)
    handleAutoGetDbKey()
  }

  const handleAutoGetImageKey = async () => {
    if (isFetchingImageKey) return
    if (!dbPath) { setError('请先选择数据库目录'); return }
    setIsFetchingImageKey(true)
    setError('')
    setImageKeyPercent(0)
    setImageKeyStatus('正在准备获取图片密钥...')
    try {
      const accountPath = wxid ? `${dbPath}/${wxid}` : dbPath
      const result = await window.electronAPI.key.autoGetImageKey(accountPath, wxid)
      if (result.success && result.aesKey) {
        if (typeof result.xorKey === 'number') setImageXorKey(`0x${result.xorKey.toString(16).toUpperCase().padStart(2, '0')}`)
        setImageAesKey(result.aesKey)
        setImageKeyStatus('已获取图片密钥')
      } else {
        setError(result.error || '自动获取图片密钥失败')
      }
    } catch (e) {
      setError(`自动获取图片密钥失败: ${e}`)
    } finally {
      setIsFetchingImageKey(false)
    }
  }

  const handleScanImageKeyFromMemory = async () => {
    if (isFetchingImageKey) return
    if (!dbPath) { setError('请先选择数据库目录'); return }
    setIsFetchingImageKey(true)
    setError('')
    setImageKeyPercent(0)
    setImageKeyStatus('正在扫描内存...')
    try {
      const accountPath = wxid ? `${dbPath}/${wxid}` : dbPath
      const result = await window.electronAPI.key.scanImageKeyFromMemory(accountPath)
      if (result.success && result.aesKey) {
        if (typeof result.xorKey === 'number') setImageXorKey(`0x${result.xorKey.toString(16).toUpperCase().padStart(2, '0')}`)
        setImageAesKey(result.aesKey)
        setImageKeyStatus('内存扫描成功，已获取图片密钥')
      } else {
        setError(result.error || '内存扫描获取图片密钥失败')
      }
    } catch (e) {
      setError(`内存扫描失败: ${e}`)
    } finally {
      setIsFetchingImageKey(false)
    }
  }

  const canGoNext = () => {
    if (currentStep.id === 'intro') return true
    if (currentStep.id === 'db') return Boolean(dbPath) && !dbPathValidationError
    if (currentStep.id === 'cache') return true
    if (currentStep.id === 'key') return decryptKey.length === 64 && Boolean(wxid)
    if (currentStep.id === 'image') return true
    if (currentStep.id === 'security') {
      if (enableAuth) {
        return authPassword.length > 0 && authPassword === authConfirmPassword
      }
      return true
    }
    return false
  }

  const handleNext = () => {
    if (!canGoNext()) {
      if (currentStep.id === 'db' && !dbPath) setError('请先选择数据库目录')
      else if (currentStep.id === 'db' && dbPathValidationError) setError(dbPathValidationError)
      if (currentStep.id === 'key') {
        if (decryptKey.length !== 64) setError('密钥长度必须为 64 个字符')
        else if (!wxid) setError('未能自动识别 wxid，请尝试重新获取或检查目录')
      }
      return
    }
    setError('')
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const handleBack = () => {
    setError('')
    setStepIndex((prev) => Math.max(prev - 1, 0))
  }

  const handleConnect = async () => {
    if (!dbPath) { setError('请先选择数据库目录'); return }
    if (!wxid) { setError('请填写微信ID'); return }
    if (!decryptKey || decryptKey.length !== 64) { setError('请填写 64 位解密密钥'); return }

    setIsConnecting(true)
    setError('')
    setLoading(true, '正在连接数据库...')

    try {
      const result = await window.electronAPI.wcdb.testConnection(dbPath, decryptKey, wxid)
      if (!result.success) {
        setError(result.error || 'WCDB 连接失败')
        setLoading(false)
        return
      }

      await configService.setDbPath(dbPath)
      await configService.setDecryptKey(decryptKey)
      await configService.setMyWxid(wxid)
      await configService.setCachePath(cachePath)
      const parsedXorKey = imageXorKey ? parseInt(imageXorKey.replace(/^0x/i, ''), 16) : null
      await configService.setImageXorKey(typeof parsedXorKey === 'number' && !Number.isNaN(parsedXorKey) ? parsedXorKey : 0)
      await configService.setImageAesKey(imageAesKey || '')
      await configService.setWxidConfig(wxid, {
        decryptKey,
        imageXorKey: typeof parsedXorKey === 'number' && !Number.isNaN(parsedXorKey) ? parsedXorKey : 0,
        imageAesKey
      })

      if (enableAuth && authPassword) {
        const hash = await sha256(authPassword)
        await configService.setAuthEnabled(true)
        await configService.setAuthPassword(hash)
        if (enableHello) {
          const helloResult = await window.electronAPI.auth.setHelloSecret(authPassword)
          if (!helloResult.success) {
            setError('Windows Hello 配置保存失败')
            setLoading(false)
            return
          }
        } else {
          await window.electronAPI.auth.clearHelloSecret()
          await configService.setAuthUseHello(false)
        }
      }

      await configService.setOnboardingDone(true)

      setDbConnected(true, dbPath)
      setLoading(false)

      if (standalone) {
        setIsClosing(true)
        setTimeout(() => {
          window.electronAPI.window.completeOnboarding()
        }, 450)
      } else {
        navigate('/home')
      }
    } catch (e) {
      setError(`连接失败: ${e}`)
      setLoading(false)
    } finally {
      setIsConnecting(false)
    }
  }

  const formatModifiedTime = (time: number) => {
    if (!time) return '未知时间'
    const date = new Date(time)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  const renderWindowControls = () => showWindowControls && (
    <div className="window-controls">
      <button type="button" className="window-btn" onClick={handleMinimize} aria-label="最小化">
        <MinusOutlined style={{ fontSize: 12 }} />
      </button>
      <button type="button" className="window-btn is-close" onClick={handleCloseWindow} aria-label="关闭">
        <CloseOutlined style={{ fontSize: 12 }} />
      </button>
    </div>
  )

  const renderSidebar = (mode: 'setup' | 'connected') => (
    <div className="welcome-sidebar">
      <div className="sidebar-header">
        <img src="./logo.png" alt="浅雨科技人力仓系统" className="sidebar-logo" />
        <div className="sidebar-brand">
          <span className="brand-name">浅雨科技人力仓系统</span>
          <span className="brand-tag">{mode === 'connected' ? 'Connected' : 'Setup'}</span>
        </div>
      </div>
      {mode === 'setup' ? (
        <div className="sidebar-steps">
          <Steps
            direction="vertical"
            current={stepIndex}
            size="small"
            items={steps.map(s => ({ title: s.title, description: s.desc }))}
          />
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}
      <div className="sidebar-footer">
        <SafetyCertificateOutlined />
        <span>{mode === 'connected' ? '本地安全存储' : '数据仅在本地处理，不上传服务器'}</span>
      </div>
    </div>
  )

  if (isDbConnected) {
    return (
      <div className={rootClassName}>
        <div className="welcome-container">
          {renderWindowControls()}
          {renderSidebar('connected')}
          <div className="welcome-content success-content">
            <Result
              status="success"
              title="配置已完成"
              subTitle="数据库已连接，你可以直接进入首页使用全部功能。"
              extra={
                <Button
                  type="primary"
                  size="large"
                  icon={<ArrowRightOutlined />}
                  iconPosition="end"
                  onClick={() => {
                    if (standalone) {
                      setIsClosing(true)
                      setTimeout(() => {
                        window.electronAPI.window.completeOnboarding()
                      }, 450)
                    } else {
                      navigate('/home')
                    }
                  }}
                >
                  进入首页
                </Button>
              }
            />
          </div>
        </div>
      </div>
    )
  }

  const renderWxidOption = (opt: WxidOption) => (
    <div className="wxid-option-row">
      <div className="wxid-option-left">
        {opt.avatarUrl ? (
          <Avatar size={32} src={opt.avatarUrl} shape="square" />
        ) : (
          <Avatar size={32} icon={<UserOutlined />} shape="square" />
        )}
        <div className="wxid-option-info">
          <span className="wxid-option-nickname">{opt.nickname || opt.wxid}</span>
          {opt.nickname && <span className="wxid-option-sub">{opt.wxid}</span>}
        </div>
      </div>
      <span className="wxid-option-time">{formatModifiedTime(opt.modifiedTime)}</span>
    </div>
  )

  return (
    <div className={rootClassName}>
      <div className="welcome-container">
        {renderWindowControls()}
        {renderSidebar('setup')}

        <div className="welcome-content">
          <div className="content-header">
            <Title level={3} style={{ margin: 0 }}>{currentStep.title}</Title>
            <Text type="secondary">{currentStep.desc}</Text>
          </div>

          <div className="content-body">
            {currentStep.id === 'intro' && (
              <div className="intro-block">
                <div className="intro-illustration">
                  <RocketOutlined style={{ fontSize: 48 }} />
                </div>
                <Title level={4} style={{ margin: '0 0 12px' }}>欢迎使用浅雨科技人力仓系统</Title>
                <Paragraph type="secondary" style={{ maxWidth: 400, margin: 0 }}>
                  接下来的几个步骤将引导你连接本地微信数据库。<br />
                  浅雨科技人力仓系统 需要访问你的本地数据文件以提供分析与导出功能。
                </Paragraph>
              </div>
            )}

            {currentStep.id === 'db' && (
              <Form layout="vertical" requiredMark={false}>
                <Form.Item
                  label="数据库根目录"
                  validateStatus={dbPathValidationError ? 'error' : undefined}
                  help={dbPathValidationError || '请选择微信-设置-存储位置对应的目录'}
                >
                  <Input
                    placeholder={dbPathPlaceholder}
                    value={dbPath}
                    onChange={(e) => handleDbPathChange(e.target.value)}
                    size="large"
                    allowClear
                  />
                </Form.Item>
                <Space>
                  <Button
                    icon={<FileSearchOutlined />}
                    onClick={handleAutoDetectPath}
                    loading={isDetectingPath}
                  >
                    {isDetectingPath ? '检测中' : '自动检测'}
                  </Button>
                  <Button icon={<FolderOpenOutlined />} onClick={handleSelectPath}>浏览…</Button>
                </Space>
              </Form>
            )}

            {currentStep.id === 'cache' && (
              <Form layout="vertical" requiredMark={false}>
                <Form.Item label="缓存目录" help="用于头像、表情与图片缓存">
                  <Input
                    placeholder="留空即使用默认目录"
                    value={cachePath}
                    onChange={(e) => setCachePath(e.target.value)}
                    size="large"
                    allowClear
                  />
                </Form.Item>
                <Space>
                  <Button icon={<FolderOpenOutlined />} onClick={handleSelectCachePath}>浏览</Button>
                  <Button icon={<ReloadOutlined />} onClick={() => setCachePath('')}>重置默认</Button>
                </Space>
              </Form>
            )}

            {currentStep.id === 'key' && (
              <Form layout="vertical" requiredMark={false}>
                <Form.Item label="微信账号 (Wxid)">
                  <Select
                    size="large"
                    placeholder="点击选择..."
                    value={wxid || undefined}
                    onChange={setWxid}
                    onDropdownVisibleChange={(open) => {
                      if (open) handleScanWxidCandidates()
                    }}
                    loading={isScanningWxid}
                    optionLabelProp="label"
                    notFoundContent={isScanningWxid ? '扫描中…' : '未检测到账号目录'}
                    popupMatchSelectWidth
                  >
                    {wxidOptions.map(opt => (
                      <Select.Option key={opt.wxid} value={opt.wxid} label={opt.nickname || opt.wxid}>
                        {renderWxidOption(opt)}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item label="解密密钥">
                  <Input.Password
                    size="large"
                    placeholder="64 位十六进制密钥"
                    value={decryptKey}
                    onChange={(e) => setDecryptKey(e.target.value.trim())}
                  />
                </Form.Item>

                {isManualStartPrompt ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="未能自动启动微信"
                    description={
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text>请手动启动并登录微信后继续。</Text>
                        <Button type="primary" onClick={handleManualConfirm}>我已登录，继续</Button>
                      </Space>
                    }
                  />
                ) : (
                  <Button
                    type="primary"
                    block
                    onClick={handleAutoGetDbKey}
                    loading={isFetchingDbKey}
                  >
                    {isFetchingDbKey ? '正在获取' : '自动获取密钥'}
                  </Button>
                )}

                {dbKeyStatus && (
                  <Alert
                    style={{ marginTop: 12 }}
                    type={isDbKeyReadyMessage(dbKeyStatus) ? 'success' : 'info'}
                    showIcon
                    message={dbKeyStatus}
                  />
                )}
              </Form>
            )}

            {currentStep.id === 'image' && (
              <Form layout="vertical" requiredMark={false}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item label="图片 XOR 密钥">
                      <Input
                        size="large"
                        placeholder="0x..."
                        value={imageXorKey}
                        onChange={(e) => setImageXorKey(e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="图片 AES 密钥">
                      <Input
                        size="large"
                        placeholder="16位密钥"
                        value={imageAesKey}
                        onChange={(e) => setImageAesKey(e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={8}>
                  <Col span={12}>
                    <Button
                      type="primary"
                      block
                      onClick={handleAutoGetImageKey}
                      loading={isFetchingImageKey}
                      title="从本地缓存快速计算"
                    >
                      {isFetchingImageKey ? '获取中' : '缓存计算（推荐）'}
                    </Button>
                  </Col>
                  <Col span={12}>
                    <Button
                      block
                      onClick={handleScanImageKeyFromMemory}
                      loading={isFetchingImageKey}
                      title="扫描微信进程内存"
                    >
                      {isFetchingImageKey ? '扫描中' : '内存扫描'}
                    </Button>
                  </Col>
                </Row>

                {isFetchingImageKey ? (
                  <div style={{ marginTop: 16 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      {imageKeyStatus || '正在启动...'}
                    </Text>
                    <Progress percent={Math.round(imageKeyPercent ?? 0)} status="active" />
                  </div>
                ) : (
                  imageKeyStatus && (
                    <Alert style={{ marginTop: 12 }} type="info" showIcon message={imageKeyStatus} />
                  )
                )}

                <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                  优先推荐缓存计算方案。若图片无法解密，可使用内存扫描（需微信运行并打开 2-3 张图片大图）
                </Text>
              </Form>
            )}

            {currentStep.id === 'security' && (
              <Form layout="vertical" requiredMark={false}>
                <div className="security-toggle-row">
                  <div>
                    <div className="security-toggle-title">启用应用锁</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>每次启动应用时需要验证密码</Text>
                  </div>
                  <Switch checked={enableAuth} onChange={setEnableAuth} />
                </div>

                {enableAuth && (
                  <div className="security-settings-card">
                    <Form.Item label="应用密码">
                      <Input.Password
                        size="large"
                        placeholder="请输入密码"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                      />
                    </Form.Item>
                    <Form.Item
                      label="确认密码"
                      validateStatus={authPassword && authConfirmPassword && authPassword !== authConfirmPassword ? 'error' : undefined}
                      help={authPassword && authConfirmPassword && authPassword !== authConfirmPassword ? '两次密码不一致' : undefined}
                    >
                      <Input.Password
                        size="large"
                        placeholder="请再次输入密码"
                        value={authConfirmPassword}
                        onChange={(e) => setAuthConfirmPassword(e.target.value)}
                      />
                    </Form.Item>

                    <div className="security-toggle-row" style={{ marginTop: 8 }}>
                      <div>
                        <div className="security-toggle-title">Windows Hello</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>使用面容、指纹或 PIN 码快速解锁</Text>
                      </div>
                      {enableHello ? (
                        <Space>
                          <Text type="success"><CheckCircleFilled /> 已开启</Text>
                          <Button size="small" onClick={() => setEnableHello(false)}>关闭</Button>
                        </Space>
                      ) : (
                        <Button
                          size="small"
                          disabled={!helloAvailable || isSettingHello}
                          loading={isSettingHello}
                          onClick={handleSetupHello}
                        >
                          {helloAvailable ? '点击开启' : '不可用'}
                        </Button>
                      )}
                    </div>
                    {!helloAvailable && (
                      <Alert
                        style={{ marginTop: 12 }}
                        type="warning"
                        showIcon
                        message="当前设备不支持 Windows Hello 或未设置 PIN 码"
                      />
                    )}
                  </div>
                )}
              </Form>
            )}
          </div>

          {error && (
            <Alert
              style={{ marginTop: 16 }}
              type="error"
              showIcon
              closable
              message={error}
              onClose={() => setError('')}
            />
          )}

          <div className="content-actions">
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={handleBack}
              disabled={stepIndex === 0}
            >
              上一步
            </Button>

            {stepIndex < steps.length - 1 ? (
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                iconPosition="end"
                onClick={handleNext}
                disabled={!canGoNext()}
              >
                下一步
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                iconPosition="end"
                onClick={handleConnect}
                loading={isConnecting}
                disabled={!canGoNext()}
              >
                {isConnecting ? '连接中' : '完成配置'}
              </Button>
            )}
          </div>
        </div>

        <Modal
          open={showDbKeyConfirm}
          title="开始获取数据库密钥"
          okText="开始获取"
          cancelText="取消"
          onOk={handleDbKeyConfirm}
          onCancel={() => setShowDbKeyConfirm(false)}
          maskClosable={false}
        >
          <Paragraph style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>
            {`当开始获取后 浅雨科技人力仓系统 将会执行准备操作。
${isLinux ? `
【⚠️ Linux 用户特别注意】
如果您在微信里勾选了"自动登录"，请务必先关闭自动登录，然后再点击下方确认！
（因为授权弹窗输入密码需要时间，若自动登录太快会导致获取失败）
` : ''}
当 浅雨科技人力仓系统 内的提示条变为绿色显示允许登录或看到来自 浅雨科技人力仓系统 的登录通知时，请在手机上确认登录微信。`}
          </Paragraph>
        </Modal>
      </div>
    </div>
  )
}

export default WelcomePage
