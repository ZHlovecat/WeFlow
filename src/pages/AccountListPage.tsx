import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Alert, Space, message,
  Flex, Typography, Tag, Popconfirm,
} from 'antd'
import {
  PlusOutlined, EditOutlined, ReloadOutlined, DeleteOutlined,
  UserOutlined, KeyOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { adminFetch, API_BASE } from '../utils/adminFetch'

interface AdminItem {
  id: number
  username: string
  password: string
  create_time: string
  gmt_last_login: string | null
  role_type: number | null
  status: number
  name: string | null
  phone: string | null
}

interface RoleItem {
  id: number
  roleName: string
  roleDesc: string
  roleCode: string
}

function AccountListPage() {
  const [admins, setAdmins] = useState<AdminItem[]>([])
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addForm] = Form.useForm()

  const fetchAdmins = useCallback(async (page = 1, size?: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_BASE}/admin/admin/list?page=${page}&size=${size || pageSize}`)
      const json = await res.json()
      if (json.errno === 0) {
        setAdmins(json.data.data || [])
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
  }, [pageSize])

  const fetchRoles = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/role/list?page=1&size=200`)
      const json = await res.json()
      if (json.errno === 0) setRoles(json.data.data || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchAdmins(1)
    fetchRoles()
  }, [fetchAdmins, fetchRoles])

  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields()
      setAddLoading(true)
      const form = new URLSearchParams()
      form.append('username', values.username.trim())
      if (values.role_type) form.append('role_type', String(values.role_type))
      const res = await adminFetch(`${API_BASE}/admin/admin/put`, { method: 'POST', body: form })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('添加成功，默认密码为 123456')
        setAddOpen(false)
        addForm.resetFields()
        fetchAdmins(currentPage)
      } else {
        message.error(json.errmsg || '添加失败')
      }
    } catch { /* validation */ } finally {
      setAddLoading(false)
    }
  }

  const handleResetPassword = async (id: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/admin/resetPassword?id=${id}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('密码已重置为 123456')
      } else {
        message.error(json.errmsg || '重置失败')
      }
    } catch {
      message.error('请求失败')
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/admin/delete?id=${id}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        fetchAdmins(currentPage)
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch {
      message.error('请求失败')
    }
  }

  const getRoleName = (roleType: number | null) => {
    if (!roleType) return '-'
    const role = roles.find(r => r.id === roleType)
    return role ? role.roleName : '-'
  }

  const columns: ColumnsType<AdminItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60, align: 'center' },
    { title: '账号', dataIndex: 'username', key: 'username', width: 150 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 120, render: v => v || '-' },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130, render: v => v || '-' },
    {
      title: '角色', dataIndex: 'role_type', key: 'role_type', width: 130,
      render: (v: number | null) => {
        const name = getRoleName(v)
        return name !== '-' ? <Tag color="blue">{name}</Tag> : '-'
      }
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80, align: 'center',
      render: (v: number) => <Tag color={v === 0 ? 'green' : 'red'}>{v === 0 ? '正常' : '禁用'}</Tag>
    },
    { title: '创建时间', dataIndex: 'create_time', key: 'create_time', width: 170 },
    {
      title: '操作', key: 'action', width: 200, align: 'center',
      render: (_: unknown, record: AdminItem) => (
        <Space size="small">
          <Popconfirm title="确认重置密码为 123456？" onConfirm={() => handleResetPassword(record.id)} okText="确认" cancelText="取消">
            <Button type="link" size="small" icon={<KeyOutlined />}>重置密码</Button>
          </Popconfirm>
          <Popconfirm title="确认删除该账号？" onConfirm={() => handleDelete(record.id)} okText="确认" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={10}>
          <UserOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>账号管理</Typography.Title>
        </Flex>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>新增账号</Button>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={() => fetchAdmins(currentPage)} disabled={loading}>刷新</Button>
        </Space>
      </Flex>

      {error && <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />}

      <Table<AdminItem>
        columns={columns}
        dataSource={admins}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{
          current: currentPage, total, pageSize, showTotal: t => `共 ${t} 条`,
          onChange: (page, newSize) => { if (newSize !== pageSize) { setPageSize(newSize); fetchAdmins(1, newSize) } else { fetchAdmins(page) } },
          showSizeChanger: true, showQuickJumper: true,
        }}
      />

      <Modal title="新增账号" open={addOpen} onCancel={() => setAddOpen(false)} onOk={handleAdd}
        okText="确认" cancelText="取消" confirmLoading={addLoading} destroyOnClose width={480}>
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="账号" name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input placeholder="请输入账号" />
          </Form.Item>
          <Form.Item label="角色" name="role_type">
            <Select placeholder="请选择角色" allowClear>
              {roles.map(r => <Select.Option key={r.id} value={r.id}>{r.roleName}</Select.Option>)}
            </Select>
          </Form.Item>
        </Form>
        <Alert type="info" message="新增账号默认密码为 123456" showIcon style={{ marginTop: 8 }} />
      </Modal>
    </div>
  )
}

export default AccountListPage
