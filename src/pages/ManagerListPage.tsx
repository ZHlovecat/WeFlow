import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Upload,
  Alert, Space, message, Popconfirm, Tag, Avatar, Flex, Typography,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined,
  UserSwitchOutlined, ReloadOutlined, LinkOutlined,
  UploadOutlined, LoadingOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import './ManagerListPage.scss'

import { adminFetch, API_BASE } from '../utils/adminFetch'
import { uploadImageToOss } from '../utils/ossUpload'
import MiniUserPickerModal from '../components/MiniUserPickerModal'

// 将图片居中裁剪为正方形并缩放为指定尺寸（店长头像统一 200x200）
async function resizeAvatarToSquare(file: File, size: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 不可用'))
        return
      }
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
      const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg'
      const mime = isJpeg ? 'image/jpeg' : 'image/png'
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('图片处理失败'))
          return
        }
        const ext = isJpeg ? 'jpg' : 'png'
        resolve(new File([blob], `avatar_${Date.now()}.${ext}`, { type: mime }))
      }, mime, 0.92)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

interface ManagerItem {
  id: number
  name: string
  avatar: string | null
  phone: string | null
  shop_id: number | null
  status: number
  create_time: string | null
  gmt_last_login: string | null
  shop_name?: string
}

interface ShopOption {
  id: number
  name: string | null
}

interface PageResponse<T> {
  errno: number
  errmsg: string
  data: {
    count: number
    totalPages: number
    pageSize: number
    currentPage: number
    data: T[]
  }
}

function ManagerListPage() {
  const [managers, setManagers] = useState<ManagerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [filterShopId, setFilterShopId] = useState<number | undefined>(undefined)

  const [shops, setShops] = useState<ShopOption[]>([])

  // 新增/编辑弹窗
  const [showDialog, setShowDialog] = useState(false)
  const [editRecord, setEditRecord] = useState<ManagerItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()
  const [avatarUrl, setAvatarUrl] = useState<string>('')
  const [avatarUploading, setAvatarUploading] = useState(false)

  // 关联小程序权限弹窗
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkRecord, setLinkRecord] = useState<ManagerItem | null>(null)

  const isAddMode = !editRecord

  // ---- 加载门店列表 ----

  const fetchShops = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/shop/list?page=1&size=200`)
      const json = await res.json()
      if (json.errno === 0) {
        setShops((json.data.data || []).filter((s: any) => s.name))
      }
    } catch {
      // ignore
    }
  }, [])

  // ---- 加载店长数据（必须传 shop_id） ----

  const fetchManagers = useCallback(async (shopId: number, page: number = 1, size?: number) => {
    const actualSize = size || pageSize
    setLoading(true)
    setError('')
    try {
      const url = `${API_BASE}/admin/shop/managerList?page=${page}&size=${actualSize}&shop_id=${shopId}`
      const res = await adminFetch(url)
      const json: PageResponse<ManagerItem> = await res.json()
      if (json.errno === 0) {
        // 附加门店名称
        const shopNameMap: Record<number, string> = {}
        shops.forEach((s) => { if (s.name) shopNameMap[s.id] = s.name })
        const enriched = (json.data.data || []).map((item) => ({
          ...item,
          shop_name: shopNameMap[item.shop_id!] || undefined,
        }))
        setManagers(enriched)
        setTotal(json.data.count)
        setCurrentPage(json.data.currentPage)
      } else {
        setError(json.errmsg || '请求失败')
      }
    } catch (e: any) {
      setError(e.message || '网络请求失败')
    } finally {
      setLoading(false)
    }
  }, [pageSize, shops])

  // 初始化加载门店
  useEffect(() => {
    fetchShops()
  }, [fetchShops])

  // ---- 筛选门店 ----

  const handleFilterChange = (shopId: number | undefined) => {
    setFilterShopId(shopId)
    setManagers([])
    setTotal(0)
    setError('')
    if (!shopId) return
    setLoading(true)
    const url = `${API_BASE}/admin/shop/managerList?page=1&size=${pageSize}&shop_id=${shopId}`
    adminFetch(url)
      .then((res) => res.json())
      .then((json: PageResponse<ManagerItem>) => {
        if (json.errno === 0) {
          const shopNameMap: Record<number, string> = {}
          shops.forEach((s) => { if (s.name) shopNameMap[s.id] = s.name })
          const enriched = (json.data.data || []).map((item) => ({
            ...item,
            shop_name: shopNameMap[item.shop_id!] || undefined,
          }))
          setManagers(enriched)
          setTotal(json.data.count)
          setCurrentPage(json.data.currentPage)
        } else {
          setError(json.errmsg || '请求失败')
        }
      })
      .catch((e: any) => setError(e.message || '网络请求失败'))
      .finally(() => setLoading(false))
  }

  // ---- 新增/编辑 ----

  const openAdd = () => {
    setEditRecord(null)
    form.resetFields()
    setAvatarUrl('')
    // 新增时默认填入当前筛选的门店
    if (filterShopId) {
      form.setFieldsValue({ shop_id: filterShopId })
    }
    setShowDialog(true)
  }

  const openEdit = (record: ManagerItem) => {
    setEditRecord(record)
    setAvatarUrl(record.avatar || '')
    form.setFieldsValue({
      name: record.name || '',
      phone: record.phone || '',
      shop_id: record.shop_id || undefined,
    })
    setShowDialog(true)
  }

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片大小不能超过 5MB')
      return
    }
    setAvatarUploading(true)
    try {
      const resized = await resizeAvatarToSquare(file, 200)
      const url = await uploadImageToOss(resized, 'avatar')
      setAvatarUrl(url)
    } catch (err: any) {
      message.error('头像上传失败：' + (err.message || '未知错误'))
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const body = new FormData()
      body.append('name', values.name?.trim() || '')
      body.append('phone', values.phone?.trim() || '')
      body.append('shop_id', String(values.shop_id ?? ''))
      body.append('avatar', avatarUrl || '')
      if (editRecord) body.append('id', String(editRecord.id))

      const res = await adminFetch(`${API_BASE}/admin/shop/managerPut`, {
        method: 'POST',
        body,
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success(editRecord ? '编辑成功' : '新增成功')
        setShowDialog(false)
        if (filterShopId) {
          fetchManagers(filterShopId, currentPage)
        }
      } else {
        message.error(json.errmsg || '操作失败')
      }
    } catch {
      // validateFields 失败
    } finally {
      setSubmitting(false)
    }
  }

  // ---- 关联小程序权限 ----

  const openLink = (record: ManagerItem) => {
    setLinkRecord(record)
    setLinkOpen(true)
  }

  const handleLinkConfirm = async (userId: number) => {
    if (!linkRecord) return false
    try {
      const body = new FormData()
      body.append('id', String(linkRecord.id))
      body.append('user_id', String(userId))
      const res = await adminFetch(`${API_BASE}/admin/shop/setUserRole`, { method: 'POST', body })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('关联成功')
        return true
      }
      message.error(json.errmsg || '关联失败')
      return false
    } catch (e: any) {
      message.error(e?.message || '请求失败')
      return false
    }
  }

  // ---- 删除 ----

  const handleDelete = async (id: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/manager/del?id=${id}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        if (filterShopId) {
          fetchManagers(filterShopId, currentPage)
        }
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch {
      message.error('删除请求失败')
    }
  }

  // ---- 状态 Tag ----

  const statusTag = (status: number) => {
    if (status === 1) return <Tag color="green">启用</Tag>
    return <Tag color="default">禁用</Tag>
  }

  // ---- 表格列 ----

  const columns: ColumnsType<ManagerItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      align: 'center',
    },
    {
      title: '头像',
      dataIndex: 'avatar',
      key: 'avatar',
      width: 70,
      align: 'center',
      render: (v: string | null, record: ManagerItem) => (
        <Avatar src={v} icon={!v ? <UserOutlined /> : undefined} size={36}>
          {!v ? record.name?.[0] : undefined}
        </Avatar>
      ),
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (v: string | null) => v || <span style={{ color: '#999' }}>未填写</span>,
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
      render: (v: string | null) => v || '-',
    },
    {
      title: '所属门店',
      dataIndex: 'shop_name',
      key: 'shop_name',
      width: 160,
      render: (v: string | null) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (v: number) => statusTag(v),
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      key: 'create_time',
      width: 160,
      render: (v: string | null) => v || '-',
    },
    {
      title: '最后登录',
      dataIndex: 'gmt_last_login',
      key: 'gmt_last_login',
      width: 160,
      render: (v: string | null) => v || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 340,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record: ManagerItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openLink(record)}>
            关联小程序权限
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除此店长？" onConfirm={() => handleDelete(record.id)} okText="确认" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="manager-list-page">
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={10}>
          <UserSwitchOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>店长列表</Typography.Title>
        </Flex>
        <Space>
          <Select
            placeholder="请选择门店查看"
            allowClear
            style={{ width: 200 }}
            value={filterShopId}
            onChange={handleFilterChange}
            showSearch
            optionFilterProp="children"
          >
            {shops.map((s) => (
              <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
            ))}
          </Select>
          <Typography.Text type="secondary">共 {total} 名店长</Typography.Text>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openAdd}
            disabled={!filterShopId}
          >
            新增店长
          </Button>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => filterShopId && fetchManagers(filterShopId, currentPage)}
            disabled={loading || !filterShopId}
          >
            刷新
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />
      )}

      {!filterShopId ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
          <UserSwitchOutlined style={{ fontSize: 48, opacity: 0.3, marginBottom: 16, display: 'block' }} />
          <p>请先选择门店以查看店长列表</p>
        </div>
      ) : (
        <Table<ManagerItem>
          columns={columns}
          dataSource={managers}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1300 }}
          pagination={{
            current: currentPage,
            total,
            pageSize,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page, newPageSize) => {
              if (newPageSize !== pageSize) {
                setPageSize(newPageSize)
                fetchManagers(filterShopId!, 1, newPageSize)
              } else {
                fetchManagers(filterShopId!, page)
              }
            },
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50'],
          }}
          size="middle"
        />
      )}

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editRecord ? '编辑店长' : '新增店长'}
        open={showDialog}
        onCancel={() => setShowDialog(false)}
        onOk={handleSubmit}
        okText={editRecord ? '保存' : '确认新增'}
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnClose
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="头像">
            <Upload
              showUploadList={false}
              beforeUpload={(file) => { handleAvatarUpload(file); return false }}
              accept="image/*"
              disabled={avatarUploading}
            >
              <div className="manager-avatar-uploader">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="头像" className="manager-avatar-preview" />
                ) : (
                  <div className="manager-avatar-placeholder">
                    {avatarUploading ? <LoadingOutlined /> : <UploadOutlined />}
                    <div style={{ marginTop: 6, fontSize: 12 }}>
                      {avatarUploading ? '上传中' : '点击上传'}
                    </div>
                  </div>
                )}
              </div>
            </Upload>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>
              上传后自动裁剪为 200x200
            </div>
          </Form.Item>
          <Form.Item
            label="姓名"
            name="name"
            rules={isAddMode ? [{ required: true, message: '请输入姓名' }] : []}
          >
            <Input placeholder="请输入店长姓名" />
          </Form.Item>
          <Form.Item
            label="手机号"
            name="phone"
            rules={isAddMode ? [{ required: true, message: '请输入手机号' }] : []}
          >
            <Input placeholder="请输入手机号" maxLength={11} />
          </Form.Item>
          <Form.Item
            label="所属门店"
            name="shop_id"
            rules={isAddMode ? [{ required: true, message: '请选择所属门店' }] : []}
          >
            <Select placeholder="请选择所属门店" showSearch optionFilterProp="children">
              {shops.map((s) => (
                <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <MiniUserPickerModal
        open={linkOpen}
        title={linkRecord ? `为店长 ${linkRecord.name || linkRecord.id} 关联小程序权限` : '关联小程序权限'}
        onCancel={() => { setLinkOpen(false); setLinkRecord(null) }}
        onConfirm={handleLinkConfirm}
      />
    </div>
  )
}

export default ManagerListPage
