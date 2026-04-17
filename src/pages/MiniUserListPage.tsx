import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Alert, Space, Tag, Input, Select,
  Flex, Typography,
} from 'antd'
import {
  ReloadOutlined, UsergroupAddOutlined, SearchOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { adminFetch, API_BASE } from '../utils/adminFetch'

interface MiniUserItem {
  id: number
  create_time: string
  role_type: number | null
}

interface PageResponse {
  errno: number
  errmsg: string
  data: {
    count: number
    totalPages: number
    pageSize: number
    currentPage: number
    data: MiniUserItem[]
  }
}

const ROLE_OPTIONS = [
  { value: 1, label: '用户', color: 'blue' },
  { value: 2, label: '店长', color: 'purple' },
  { value: 3, label: '管理员', color: 'gold' },
] as const

const ROLE_MAP: Record<number, { label: string; color: string }> = ROLE_OPTIONS.reduce((acc, cur) => {
  acc[cur.value] = { label: cur.label, color: cur.color }
  return acc
}, {} as Record<number, { label: string; color: string }>)

function MiniUserListPage() {
  const [list, setList] = useState<MiniUserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)

  const [filterId, setFilterId] = useState('')
  const [filterRoleType, setFilterRoleType] = useState<number | undefined>(undefined)
  const [searchId, setSearchId] = useState('')

  const fetchList = useCallback(async (page = 1, size?: number, overrides?: { id?: string; role_type?: number }) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.append('page', String(page))
      params.append('size', String(size || pageSize))
      const idVal = overrides?.id ?? searchId
      const roleVal = overrides?.role_type ?? filterRoleType
      if (idVal) params.append('id', idVal.trim())
      if (roleVal) params.append('role_type', String(roleVal))

      const res = await adminFetch(`${API_BASE}/admin/user/list?${params.toString()}`)
      const json: PageResponse = await res.json()
      if (json.errno === 0) {
        setList(json.data.data || [])
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
  }, [pageSize, searchId, filterRoleType])

  useEffect(() => {
    fetchList(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = () => {
    setSearchId(filterId.trim())
    fetchList(1, pageSize, { id: filterId.trim(), role_type: filterRoleType })
  }

  const handleReset = () => {
    setFilterId('')
    setFilterRoleType(undefined)
    setSearchId('')
    fetchList(1, pageSize, { id: '', role_type: undefined })
  }

  const columns: ColumnsType<MiniUserItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 100, align: 'center' },
    {
      title: '角色类型', dataIndex: 'role_type', key: 'role_type', width: 120, align: 'center',
      render: (v: number | null) => {
        if (!v) return '-'
        const role = ROLE_MAP[v]
        return role ? <Tag color={role.color}>{role.label}</Tag> : <Tag>{v}</Tag>
      },
    },
    { title: '创建时间', dataIndex: 'create_time', key: 'create_time', width: 180, render: v => v || '-' },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={10}>
          <UsergroupAddOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>小程序用户管理</Typography.Title>
        </Flex>
        <Space>
          <Button icon={<ReloadOutlined spin={loading} />} onClick={() => fetchList(currentPage)} disabled={loading}>刷新</Button>
        </Space>
      </Flex>

      <Flex gap={12} wrap style={{ marginBottom: 16 }}>
        <Input
          allowClear
          placeholder="输入用户 ID"
          value={filterId}
          onChange={(e) => setFilterId(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 200 }}
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        />
        <Select
          allowClear
          placeholder="全部角色"
          value={filterRoleType}
          onChange={(v) => setFilterRoleType(v)}
          style={{ width: 160 }}
          options={ROLE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
        <Button onClick={handleReset}>重置</Button>
      </Flex>

      {error && <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />}

      <Table<MiniUserItem>
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{
          current: currentPage,
          total,
          pageSize,
          showTotal: t => `共 ${t} 条`,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, newSize) => {
            if (newSize !== pageSize) {
              setPageSize(newSize)
              fetchList(1, newSize)
            } else {
              fetchList(page)
            }
          },
        }}
      />
    </div>
  )
}

export default MiniUserListPage
