import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Alert, Space, Tag, Avatar,
  Flex, Typography,
} from 'antd'
import {
  ReloadOutlined, CalendarOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { adminFetch, API_BASE } from '../utils/adminFetch'

interface ApplyItem {
  id: number
  name: string
  avatar: string | null
  gender: string
  age: number
  height: number
  weight: number
  exp: number
  cert: number
  sign: number
  time_type: string
  time_start: string
  time_end: string
  day: string
  store_id?: number
}

interface PageResponse {
  errno: number
  errmsg: string
  data: {
    count: number
    totalPages: number
    pageSize: number
    currentPage: number
    data: ApplyItem[]
  }
}

const GENDER_MAP: Record<string, string> = { male: '男', female: '女' }
const GENDER_COLORS: Record<string, string> = { male: 'blue', female: 'magenta' }
const TIME_TYPE_COLORS: Record<string, string> = { '上午': 'orange', '下午': 'cyan', '晚上': 'purple' }

function InterviewListPage() {
  const [list, setList] = useState<ApplyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_BASE}/admin/apply/list`)
      const json: PageResponse = await res.json()
      if (json.errno === 0) {
        setList(json.data.data || [])
        setTotal(json.data.count)
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

  const columns: ColumnsType<ApplyItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      fixed: 'left',
      align: 'center',
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      render: (v: string, record: ApplyItem) => (
        <Space>
          <Avatar size="small" src={record.avatar}>
            {v?.[0]}
          </Avatar>
          {v || '-'}
        </Space>
      ),
    },
    {
      title: '性别',
      dataIndex: 'gender',
      key: 'gender',
      width: 70,
      align: 'center',
      render: (v: string) => v ? <Tag color={GENDER_COLORS[v] || 'default'}>{GENDER_MAP[v] || v}</Tag> : '-',
    },
    {
      title: '年龄',
      dataIndex: 'age',
      key: 'age',
      width: 70,
      align: 'center',
      render: (v: number) => v || '-',
    },
    {
      title: '身高(cm)',
      dataIndex: 'height',
      key: 'height',
      width: 90,
      align: 'center',
      render: (v: number) => v || '-',
    },
    {
      title: '体重(kg)',
      dataIndex: 'weight',
      key: 'weight',
      width: 90,
      align: 'center',
      render: (v: number) => v || '-',
    },
    {
      title: '经验(年)',
      dataIndex: 'exp',
      key: 'exp',
      width: 90,
      align: 'center',
      render: (v: number) => v ?? '-',
    },
    {
      title: '证书',
      dataIndex: 'cert',
      key: 'cert',
      width: 70,
      align: 'center',
      render: (v: number) => v ? <Tag color="green">有</Tag> : <Tag>无</Tag>,
    },
    {
      title: '签到',
      dataIndex: 'sign',
      key: 'sign',
      width: 70,
      align: 'center',
      render: (v: number) => v ? <Tag color="green">已签</Tag> : <Tag color="default">未签</Tag>,
    },
    {
      title: '预约日期',
      dataIndex: 'day',
      key: 'day',
      width: 120,
      sorter: (a, b) => a.day.localeCompare(b.day),
      defaultSortOrder: 'descend',
    },
    {
      title: '时段',
      dataIndex: 'time_type',
      key: 'time_type',
      width: 80,
      align: 'center',
      render: (v: string) => v ? <Tag color={TIME_TYPE_COLORS[v] || 'default'}>{v}</Tag> : '-',
    },
    {
      title: '面试时间',
      key: 'time_range',
      width: 130,
      render: (_: unknown, record: ApplyItem) =>
        record.time_start && record.time_end
          ? `${record.time_start} - ${record.time_end}`
          : '-',
    },
    {
      title: '关联人员',
      dataIndex: 'store_id',
      key: 'store_id',
      width: 90,
      align: 'center',
      render: (v: number) => v ? <Tag color="blue">ID: {v}</Tag> : <Tag>未关联</Tag>,
    },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={10}>
          <CalendarOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>面试预约</Typography.Title>
        </Flex>
        <Space>
          <Typography.Text type="secondary">共 {total} 条记录</Typography.Text>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => fetchList()}
            disabled={loading}
          >
            刷新
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />
      )}

      <Table<ApplyItem>
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          total,
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50'],
        }}
        size="middle"
      />
    </div>
  )
}

export default InterviewListPage
