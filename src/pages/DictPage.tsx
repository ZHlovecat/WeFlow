import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Modal, Form, Input, Alert, Space, message, Popconfirm, Tag, Flex, Typography,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined, BookOutlined, ReloadOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { adminFetch, API_BASE } from '../utils/adminFetch'

interface DictItem {
  id: number
  type: string
  description: string | null
  remarks: string | null
  create_time?: string | null
}

interface DictSubItem {
  id: number
  dictId: number
  label: string
  value: string
  create_time?: string | null
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

function DictPage() {
  // 一级
  const [dicts, setDicts] = useState<DictItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [activeDict, setActiveDict] = useState<DictItem | null>(null)

  // 二级
  const [items, setItems] = useState<DictSubItem[]>([])
  const [itemLoading, setItemLoading] = useState(false)
  const [itemError, setItemError] = useState('')
  const [itemCurrentPage, setItemCurrentPage] = useState(1)
  const [itemPageSize, setItemPageSize] = useState(10)
  const [itemTotal, setItemTotal] = useState(0)

  // 一级弹窗
  const [showDialog1, setShowDialog1] = useState(false)
  const [editRecord1, setEditRecord1] = useState<DictItem | null>(null)
  const [submitting1, setSubmitting1] = useState(false)
  const [form1] = Form.useForm()

  // 二级弹窗
  const [showDialog2, setShowDialog2] = useState(false)
  const [editRecord2, setEditRecord2] = useState<DictSubItem | null>(null)
  const [submitting2, setSubmitting2] = useState(false)
  const [form2] = Form.useForm()

  // ---- 一级列表 ----

  const fetchDicts = useCallback(async (page = 1, size?: number) => {
    const actualSize = size || pageSize
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_BASE}/admin/dict/list?page=${page}&size=${actualSize}`)
      const json: PageResponse<DictItem> = await res.json()
      if (json.errno === 0) {
        setDicts(json.data.data || [])
        setTotal(json.data.count || 0)
        setCurrentPage(json.data.currentPage || page)
      } else {
        setError(json.errmsg || '请求失败')
      }
    } catch (e: any) {
      setError(e.message || '网络请求失败')
    } finally {
      setLoading(false)
    }
  }, [pageSize])

  // ---- 二级列表 ----

  const fetchItems = useCallback(async (dictId: number, page = 1, size?: number) => {
    const actualSize = size || itemPageSize
    setItemLoading(true)
    setItemError('')
    try {
      const res = await adminFetch(`${API_BASE}/admin/dict/item?page=${page}&size=${actualSize}&dictId=${dictId}`)
      const json: PageResponse<DictSubItem> = await res.json()
      if (json.errno === 0) {
        setItems(json.data.data || [])
        setItemTotal(json.data.count || 0)
        setItemCurrentPage(json.data.currentPage || page)
      } else {
        setItemError(json.errmsg || '请求失败')
      }
    } catch (e: any) {
      setItemError(e.message || '网络请求失败')
    } finally {
      setItemLoading(false)
    }
  }, [itemPageSize])

  useEffect(() => {
    fetchDicts(1)
  }, [fetchDicts])

  const handleSelectDict = (record: DictItem) => {
    setActiveDict(record)
    setItemCurrentPage(1)
    fetchItems(record.id, 1, itemPageSize)
  }

  // ---- 一级 新增/编辑 ----

  const openAdd1 = () => {
    setEditRecord1(null)
    form1.resetFields()
    setShowDialog1(true)
  }

  const openEdit1 = (record: DictItem) => {
    setEditRecord1(record)
    form1.setFieldsValue({
      type: record.type,
      description: record.description || '',
      remarks: record.remarks || '',
    })
    setShowDialog1(true)
  }

  const handleSubmit1 = async () => {
    try {
      const values = await form1.validateFields()
      setSubmitting1(true)
      const body = new FormData()
      body.append('type', String(values.type || '').trim())
      body.append('description', String(values.description || '').trim())
      body.append('remarks', String(values.remarks || '').trim())
      if (editRecord1) body.append('id', String(editRecord1.id))

      const res = await adminFetch(`${API_BASE}/admin/dict/put`, { method: 'POST', body })
      const json = await res.json()
      if (json.errno === 0) {
        message.success(editRecord1 ? '编辑成功' : '新增成功')
        setShowDialog1(false)
        fetchDicts(currentPage)
      } else {
        message.error(json.errmsg || '操作失败')
      }
    } catch {
      /* validate */
    } finally {
      setSubmitting1(false)
    }
  }

  // ---- 二级 新增/编辑 ----

  const openAdd2 = () => {
    if (!activeDict) {
      message.warning('请先选择一级字典')
      return
    }
    setEditRecord2(null)
    form2.resetFields()
    setShowDialog2(true)
  }

  const openEdit2 = (record: DictSubItem) => {
    setEditRecord2(record)
    form2.setFieldsValue({
      label: record.label,
      value: record.value,
    })
    setShowDialog2(true)
  }

  const handleSubmit2 = async () => {
    if (!activeDict) return
    try {
      const values = await form2.validateFields()
      setSubmitting2(true)
      const body = new FormData()
      body.append('dictId', String(activeDict.id))
      body.append('label', String(values.label || '').trim())
      body.append('value', String(values.value || '').trim())
      if (editRecord2) body.append('id', String(editRecord2.id))

      const res = await adminFetch(`${API_BASE}/admin/dict/itemPut`, { method: 'POST', body })
      const json = await res.json()
      if (json.errno === 0) {
        message.success(editRecord2 ? '编辑成功' : '新增成功')
        setShowDialog2(false)
        fetchItems(activeDict.id, itemCurrentPage, itemPageSize)
      } else {
        message.error(json.errmsg || '操作失败')
      }
    } catch {
      /* validate */
    } finally {
      setSubmitting2(false)
    }
  }

  // ---- 删除 ----

  const handleDelete1 = async (id: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/dict/delete?id=${id}&type=list`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        if (activeDict?.id === id) {
          setActiveDict(null)
          setItems([])
          setItemTotal(0)
        }
        fetchDicts(currentPage)
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch {
      message.error('删除请求失败')
    }
  }

  const handleDelete2 = async (id: number) => {
    if (!activeDict) return
    try {
      const res = await adminFetch(`${API_BASE}/admin/dict/delete?id=${id}&type=item`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        fetchItems(activeDict.id, itemCurrentPage, itemPageSize)
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch {
      message.error('删除请求失败')
    }
  }

  // ---- 列 ----

  const columns1: ColumnsType<DictItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70, align: 'center' },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (v: string) => v ? <Tag color="geekblue">{v}</Tag> : '-',
    },
    { title: '描述', dataIndex: 'description', key: 'description', render: v => v || '-' },
    { title: '备注', dataIndex: 'remarks', key: 'remarks', render: v => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 240,
      align: 'center',
      render: (_: unknown, record: DictItem) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<AppstoreOutlined />}
            onClick={() => handleSelectDict(record)}
          >
            查看项
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit1(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除？删除后子项也会被清除"
            onConfirm={() => handleDelete1(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const columns2: ColumnsType<DictSubItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70, align: 'center' },
    { title: '名称 (label)', dataIndex: 'label', key: 'label', width: 200 },
    { title: '值 (value)', dataIndex: 'value', key: 'value' },
    {
      title: '操作',
      key: 'action',
      width: 180,
      align: 'center',
      render: (_: unknown, record: DictSubItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit2(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete2(record.id)} okText="确认" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Flex justify="space-between" align="center">
        <Flex align="center" gap={10}>
          <BookOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>通用字典</Typography.Title>
        </Flex>
        <Space>
          <Typography.Text type="secondary">共 {total} 个字典</Typography.Text>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd1}>新增字典</Button>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={() => fetchDicts(currentPage)} disabled={loading}>
            刷新
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError('')} />
      )}

      <Table<DictItem>
        columns={columns1}
        dataSource={dicts}
        rowKey="id"
        loading={loading}
        size="middle"
        rowClassName={(record) => activeDict?.id === record.id ? 'dict-row-active' : ''}
        onRow={(record) => ({
          onClick: () => handleSelectDict(record),
        })}
        pagination={{
          current: currentPage,
          total,
          pageSize,
          showTotal: t => `共 ${t} 条`,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50'],
          onChange: (page, newSize) => {
            if (newSize !== pageSize) {
              setPageSize(newSize)
              fetchDicts(1, newSize)
            } else {
              fetchDicts(page)
            }
          },
        }}
      />

      {/* 二级区域 */}
      <div style={{ marginTop: 8 }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
          <Flex align="center" gap={10}>
            <AppstoreOutlined style={{ fontSize: 18 }} />
            <Typography.Title level={5} style={{ margin: 0 }}>
              字典项 {activeDict && <Tag color="geekblue" style={{ marginLeft: 8 }}>{activeDict.type}</Tag>}
            </Typography.Title>
          </Flex>
          <Space>
            <Typography.Text type="secondary">{activeDict ? `共 ${itemTotal} 条` : '请选择一个一级字典'}</Typography.Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAdd2}
              disabled={!activeDict}
            >
              新增字典项
            </Button>
            <Button
              icon={<ReloadOutlined spin={itemLoading} />}
              onClick={() => activeDict && fetchItems(activeDict.id, itemCurrentPage, itemPageSize)}
              disabled={itemLoading || !activeDict}
            >
              刷新
            </Button>
          </Space>
        </Flex>

        {itemError && (
          <Alert type="error" message={itemError} closable onClose={() => setItemError('')} style={{ marginBottom: 12 }} />
        )}

        {!activeDict ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary, #999)' }}>
            请选择一个一级字典以查看字典项
          </div>
        ) : (
          <Table<DictSubItem>
            columns={columns2}
            dataSource={items}
            rowKey="id"
            loading={itemLoading}
            size="middle"
            pagination={{
              current: itemCurrentPage,
              total: itemTotal,
              pageSize: itemPageSize,
              showTotal: t => `共 ${t} 条`,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50'],
              onChange: (page, newSize) => {
                if (!activeDict) return
                if (newSize !== itemPageSize) {
                  setItemPageSize(newSize)
                  fetchItems(activeDict.id, 1, newSize)
                } else {
                  fetchItems(activeDict.id, page, itemPageSize)
                }
              },
            }}
          />
        )}
      </div>

      {/* 一级弹窗 */}
      <Modal
        title={editRecord1 ? '编辑字典' : '新增字典'}
        open={showDialog1}
        onCancel={() => setShowDialog1(false)}
        onOk={handleSubmit1}
        okText={editRecord1 ? '保存' : '确认新增'}
        cancelText="取消"
        confirmLoading={submitting1}
        destroyOnClose
        width={500}
      >
        <Form form={form1} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="类型" name="type" rules={[{ required: true, message: '请输入类型编码' }]}>
            <Input placeholder="请输入类型编码，如 gender" maxLength={64} />
          </Form.Item>
          <Form.Item label="描述" name="description" rules={[{ required: true, message: '请输入描述' }]}>
            <Input placeholder="请输入描述，如 性别" maxLength={128} />
          </Form.Item>
          <Form.Item label="备注" name="remarks">
            <Input.TextArea placeholder="可选" rows={3} maxLength={255} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 二级弹窗 */}
      <Modal
        title={editRecord2 ? `编辑字典项（${activeDict?.type || ''}）` : `新增字典项（${activeDict?.type || ''}）`}
        open={showDialog2}
        onCancel={() => setShowDialog2(false)}
        onOk={handleSubmit2}
        okText={editRecord2 ? '保存' : '确认新增'}
        cancelText="取消"
        confirmLoading={submitting2}
        destroyOnClose
        width={500}
      >
        <Form form={form2} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="名称 (label)" name="label" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="请输入名称，如 男" maxLength={64} />
          </Form.Item>
          <Form.Item label="值 (value)" name="value" rules={[{ required: true, message: '请输入值' }]}>
            <Input placeholder="请输入值，如 1" maxLength={64} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DictPage
