import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Modal, Form, Input, InputNumber, Select,
  Alert, Space, message, Popconfirm, Tag, Flex, Typography,
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  AppstoreOutlined, ReloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { adminFetch, API_BASE } from '../utils/adminFetch'

interface JobCateItem {
  id: number
  label: string
  sort: number
  /** 0 显示 / 1 隐藏 */
  status: number
}

function JobCateListPage() {
  const [list, setList] = useState<JobCateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showDialog, setShowDialog] = useState(false)
  const [editRecord, setEditRecord] = useState<JobCateItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_BASE}/admin/jobs/cateList`)
      const json = await res.json()
      if (json.errno === 0) {
        const data = (json.data || []) as JobCateItem[]
        const sorted = [...data].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        setList(sorted)
      } else {
        setError(json.errmsg || '请求失败')
      }
    } catch (e: any) {
      setError(e.message || '网络请求失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const openAdd = () => {
    setEditRecord(null)
    form.resetFields()
    form.setFieldsValue({ sort: 0, status: 0 })
    setShowDialog(true)
  }

  const openEdit = (record: JobCateItem) => {
    setEditRecord(record)
    form.setFieldsValue({
      label: record.label,
      sort: record.sort ?? 0,
      status: record.status ?? 0,
    })
    setShowDialog(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const body = new FormData()
      body.append('label', String(values.label || '').trim())
      body.append('sort', String(values.sort ?? 0))
      body.append('status', String(values.status ?? 0))
      if (editRecord) body.append('id', String(editRecord.id))

      const res = await adminFetch(`${API_BASE}/admin/jobs/catePut`, {
        method: 'POST',
        body,
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success(editRecord ? '编辑成功' : '新增成功')
        setShowDialog(false)
        fetchList()
      } else {
        message.error(json.errmsg || '操作失败')
      }
    } catch {
      // validateFields 失败
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/jobs/cateDel?id=${id}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        fetchList()
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch {
      message.error('删除请求失败')
    }
  }

  const columns: ColumnsType<JobCateItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80, align: 'center' },
    {
      title: '名称',
      dataIndex: 'label',
      key: 'label',
      render: (v: string) => v || '-',
    },
    {
      title: '排序',
      dataIndex: 'sort',
      key: 'sort',
      width: 100,
      align: 'center',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (v: number) =>
        v === 0 ? <Tag color="green">显示</Tag> : <Tag color="default">隐藏</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      align: 'center',
      render: (_: unknown, record: JobCateItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该职位大类？"
            onConfirm={() => handleDelete(record.id)}
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={10}>
          <AppstoreOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>职位大类</Typography.Title>
        </Flex>
        <Space>
          <Typography.Text type="secondary">共 {list.length} 个大类</Typography.Text>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            新增大类
          </Button>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={fetchList}
            disabled={loading}
          >
            刷新
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />
      )}

      <Table<JobCateItem>
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
      />

      <Modal
        title={editRecord ? '编辑职位大类' : '新增职位大类'}
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
          <Form.Item
            label="名称"
            name="label"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="请输入职位大类名称，如：店长" maxLength={64} />
          </Form.Item>
          <Form.Item label="排序" name="sort" initialValue={0}>
            <InputNumber min={0} style={{ width: '100%' }} placeholder="数值越小越靠前" />
          </Form.Item>
          <Form.Item label="状态" name="status" initialValue={0}>
            <Select
              options={[
                { value: 0, label: '显示' },
                { value: 1, label: '隐藏' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default JobCateListPage
