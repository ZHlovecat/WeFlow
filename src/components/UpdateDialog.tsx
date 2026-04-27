import React, { useMemo, useState } from 'react'
import { Modal, Button, Progress, Typography, Space, Alert, message } from 'antd'
import { Download, AlertTriangle, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { UpdateAvailablePayload, DownloadProgressPayload } from '../types/electron'

interface UpdateDialogProps {
  open: boolean
  updateInfo: UpdateAvailablePayload | null
  onClose: () => void
  onDownload: () => void
  onIgnore: () => void
  onInstall: () => void
  isDownloading: boolean
  isDownloaded: boolean
  progress: DownloadProgressPayload | null
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatSpeed(bps?: number): string {
  if (!bps || !Number.isFinite(bps) || bps <= 0) return '-'
  return `${formatBytes(bps)}/s`
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({
  open,
  updateInfo,
  onClose,
  onDownload,
  onIgnore,
  onInstall,
  isDownloading,
  isDownloaded,
  progress,
}) => {
  const [confirmingIgnore, setConfirmingIgnore] = useState(false)

  const percent = useMemo(() => {
    if (isDownloaded) return 100
    if (!progress) return 0
    return Math.min(100, Math.max(0, Number(progress.percent || 0)))
  }, [progress, isDownloaded])

  if (!open || !updateInfo) return null

  const versionText = updateInfo.version || '新版本'
  const sizeText = updateInfo.assetSize ? formatBytes(updateInfo.assetSize) : ''
  const publishedText = updateInfo.publishedAt
    ? new Date(updateInfo.publishedAt).toLocaleString('zh-CN', { hour12: false })
    : ''

  const handleIgnoreClick = () => {
    setConfirmingIgnore(true)
  }

  const handleConfirmIgnore = () => {
    setConfirmingIgnore(false)
    onIgnore()
  }

  const handleOpenReleaseUrl = async () => {
    if (!updateInfo.releaseUrl) return
    try {
      await window.electronAPI?.shell?.openExternal?.(updateInfo.releaseUrl)
    } catch {
      message.error('无法打开浏览器')
    }
  }

  return (
    <>
      <Modal
        open={open}
        onCancel={() => {
          if (isDownloading) return
          onClose()
        }}
        footer={null}
        title={
          <Space size={8} align="center">
            <Download size={18} />
            <span>发现新版本 {versionText}</span>
          </Space>
        }
        width={560}
        maskClosable={!isDownloading}
        closable={!isDownloading}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Space size={12} wrap>
            {publishedText && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                发布时间：{publishedText}
              </Typography.Text>
            )}
            {sizeText && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                安装包大小：{sizeText}
              </Typography.Text>
            )}
            {updateInfo.assetName && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {updateInfo.assetName}
              </Typography.Text>
            )}
          </Space>

          <div
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.03)',
              border: '1px solid rgba(0,0,0,0.06)',
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {updateInfo.releaseNotes ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {updateInfo.releaseNotes}
              </ReactMarkdown>
            ) : (
              <Typography.Text type="secondary">本次更新修复了一些已知问题，提升了稳定性。</Typography.Text>
            )}
          </div>

          {(isDownloading || isDownloaded) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Progress
                percent={Number(percent.toFixed(1))}
                status={isDownloaded ? 'success' : 'active'}
                strokeColor={{ from: '#1677ff', to: '#69b1ff' }}
              />
              <Space size={16}>
                {progress?.total ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {formatBytes(progress.transferred || 0)} / {formatBytes(progress.total)}
                  </Typography.Text>
                ) : null}
                {!isDownloaded && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    速度：{formatSpeed(progress?.bytesPerSecond)}
                  </Typography.Text>
                )}
                {isDownloaded && (
                  <Typography.Text type="success" style={{ fontSize: 12 }}>
                    下载完成，准备安装…
                  </Typography.Text>
                )}
              </Space>
            </div>
          )}

          {updateInfo.releaseUrl && (
            <Button
              type="link"
              size="small"
              icon={<ExternalLink size={14} />}
              style={{ alignSelf: 'flex-start', padding: 0 }}
              onClick={handleOpenReleaseUrl}
            >
              在浏览器中查看完整 Release
            </Button>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            {!isDownloading && !isDownloaded && (
              <>
                <Button onClick={handleIgnoreClick}>忽略本次更新</Button>
                <Button type="primary" icon={<Download size={14} />} onClick={onDownload}>
                  下载更新
                </Button>
              </>
            )}
            {isDownloading && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                下载中，请勿关闭窗口…
              </Typography.Text>
            )}
            {isDownloaded && !isDownloading && (
              <Button type="primary" onClick={onInstall}>
                立即安装并重启
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* 二次确认：忽略风险提示 */}
      <Modal
        open={confirmingIgnore}
        onCancel={() => setConfirmingIgnore(false)}
        onOk={handleConfirmIgnore}
        okText="仍然忽略"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        title={
          <Space size={8}>
            <AlertTriangle size={18} color="#faad14" />
            <span>忽略本次更新可能存在风险</span>
          </Space>
        }
        width={460}
        zIndex={2000}
      >
        <Alert
          type="warning"
          showIcon
          message="忽略本次更新可能导致："
          description={
            <ul style={{ paddingLeft: 18, margin: '6px 0 0' }}>
              <li>缺失新功能与体验改进</li>
              <li>已知 bug 无法修复，影响日常使用稳定性</li>
              <li>错过安全相关补丁，存在数据/账号风险</li>
              <li>与最新后端接口不兼容，可能导致部分模块不可用</li>
            </ul>
          }
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }}>
          忽略后，下次启动不会再就该版本提示。可在左下角账号菜单中点击「检查更新」重新查看。
        </Typography.Paragraph>
      </Modal>
    </>
  )
}

export default UpdateDialog
