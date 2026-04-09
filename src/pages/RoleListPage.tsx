import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Modal, Form, Input, Alert, Space, message,
  Flex, Typography, Tag, Tree, Popconfirm,
} from 'antd'
import {
  PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, SettingOutlined, DeleteOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { adminFetch, API_BASE } from '../utils/adminFetch'

interface RoleItem {
  id: number
  roleName: string
  roleDesc: string
  roleCode: string
  roles: string | null
  status: number
}

interface MenuTreeNode {
  id: number
  label: string
  name: string
  parentId: number
  path: string
  children: MenuTreeNode[]
}

interface AntTreeData {
  key: number
  title: string
  children: AntTreeData[]
}

function toAntTreeData(nodes: MenuTreeNode[]): AntTreeData[] {
  return nodes.map(n => ({
    key: n.id,
    title: n.label || n.name,
    children: toAntTreeData(n.children || []),
  }))
}

function getAllTreeKeys(nodes: AntTreeData[]): number[] {
  const keys: number[] = []
  for (const n of nodes) {
    keys.push(n.key)
    if (n.children?.length) keys.push(...getAllTreeKeys(n.children))
  }
  return keys
}

function RoleListPage() {
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [menuTree, setMenuTree] = useState<AntTreeData[]>([])

  const [addOpen, setAddOpen] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addForm] = Form.useForm()

  // 权限设置弹窗
  const [permRole, setPermRole] = useState<RoleItem | null>(null)
  const [permCheckedKeys, setPermCheckedKeys] = useState<number[]>([])
  const [permLoading, setPermLoading] = useState(false)

  const fetchRoles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_BASE}/admin/role/list?page=1&size=200`)
      const json = await res.json()
      if (json.errno === 0) {
        setRoles(json.data.data || [])
      } else {
        setError(json.errmsg || '请求失败')
      }
    } catch (e: any) {
      setError(e.message || '网络请求失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMenuTree = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/menu/tree`)
      const json = await res.json()
      if (json.errno === 0) {
        setMenuTree(toAntTreeData(json.data || []))
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchRoles()
    fetchMenuTree()
  }, [fetchRoles, fetchMenuTree])

  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields()
      setAddLoading(true)
      const res = await adminFetch(`${API_BASE}/admin/role/put`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleName: values.roleName.trim(),
          roleCode: values.roleCode.trim(),
          roleDesc: values.roleDesc?.trim() || '',
        }),
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('角色添加成功')
        setAddOpen(false)
        addForm.resetFields()
        fetchRoles()
      } else {
        message.error(json.errmsg || '添加失败')
      }
    } catch { /* validation */ } finally {
      setAddLoading(false)
    }
  }

  const handleDeleteRole = async (id: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/role/del?id=${id}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        fetchRoles()
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch {
      message.error('请求失败')
    }
  }

  const openPermission = (role: RoleItem) => {
    setPermRole(role)
    const ids = role.roles ? role.roles.split(',').filter(Boolean).map(Number) : []
    setPermCheckedKeys(ids)
  }

  const handlePermSave = async () => {
    if (!permRole) return
    setPermLoading(true)
    try {
      const form = new URLSearchParams()
      form.append('roleId', String(permRole.id))
      form.append('roles', permCheckedKeys.join(','))
      const res = await adminFetch(`${API_BASE}/admin/role/add`, { method: 'POST', body: form })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('权限保存成功')
        setPermRole(null)
        fetchRoles()
      } else {
        message.error(json.errmsg || '保存失败')
      }
    } catch {
      message.error('请求失败')
    } finally {
      setPermLoading(false)
    }
  }

  const columns: ColumnsType<RoleItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60, align: 'center' },
    { title: '角色名称', dataIndex: 'roleName', key: 'roleName', width: 150 },
    { title: '角色编码', dataIndex: 'roleCode', key: 'roleCode', width: 160 },
    { title: '角色描述', dataIndex: 'roleDesc', key: 'roleDesc', width: 200, render: v => v || '-' },
    {
      title: '权限菜单数', dataIndex: 'roles', key: 'roles', width: 120, align: 'center',
      render: (v: string | null) => {
        const count = v ? v.split(',').filter(Boolean).length : 0
        return <Tag color={count > 0 ? 'blue' : 'default'}>{count} 项</Tag>
      }
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80, align: 'center',
      render: (v: number) => <Tag color={v === 0 ? 'green' : 'red'}>{v === 0 ? '正常' : '禁用'}</Tag>
    },
    {
      title: '操作', key: 'action', width: 200, align: 'center',
      render: (_: unknown, record: RoleItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<SettingOutlined />} onClick={() => openPermission(record)}>
            设置权限
          </Button>
          <Popconfirm title="确认删除该角色？" onConfirm={() => handleDeleteRole(record.id)} okText="确认" cancelText="取消">
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
          <SafetyCertificateOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>角色管理</Typography.Title>
        </Flex>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>新增角色</Button>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={fetchRoles} disabled={loading}>刷新</Button>
        </Space>
      </Flex>

      {error && <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />}

      <Table<RoleItem>
        columns={columns}
        dataSource={roles}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={false}
      />

      {/* 新增角色 */}
      <Modal title="新增角色" open={addOpen} onCancel={() => setAddOpen(false)} onOk={handleAdd}
        okText="确认" cancelText="取消" confirmLoading={addLoading} destroyOnClose width={480}>
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="角色名称" name="roleName" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input placeholder="如：运营管理员" />
          </Form.Item>
          <Form.Item label="角色编码" name="roleCode" rules={[{ required: true, message: '请输入角色编码' }]}>
            <Input placeholder="如：ROLE_OPERATOR" />
          </Form.Item>
          <Form.Item label="角色描述" name="roleDesc">
            <Input placeholder="角色描述（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 权限设置 */}
      <Modal
        title={`设置权限 - ${permRole?.roleName || ''}`}
        open={!!permRole}
        onCancel={() => setPermRole(null)}
        onOk={handlePermSave}
        okText="保存"
        cancelText="取消"
        confirmLoading={permLoading}
        width={520}
      >
        {permRole && (
          <div style={{ marginTop: 16 }}>
            <Alert type="info" message="勾选角色可访问的菜单路由" showIcon style={{ marginBottom: 16 }} />
            <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
              <Tree
                checkable
                defaultExpandAll
                checkedKeys={permCheckedKeys}
                onCheck={(checked) => {
                  setPermCheckedKeys((checked as number[]))
                }}
                treeData={menuTree}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default RoleListPage
