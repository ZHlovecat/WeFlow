import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Table, Button, Alert, Space, Tag, Avatar,
  Flex, Typography, Segmented, Modal, Form, Select, DatePicker, Input, Tooltip, message,
} from 'antd'
import {
  ReloadOutlined, CalendarOutlined, EditOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
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
  shop_id?: number
  status?: number
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

interface TimeItem {
  id: number
  label: string
  sort: number
  type: number
  selected?: boolean
}

interface TimeListResponse {
  errno: number
  errmsg: string
  data: TimeItem[]
}

const GENDER_MAP: Record<string, string> = { male: '男', female: '女' }
const GENDER_COLORS: Record<string, string> = { male: 'blue', female: 'magenta' }
const TIME_TYPE_COLORS: Record<string, string> = { '上午': 'orange', '下午': 'cyan', '晚上': 'purple' }
const TIME_TYPE_BY_NUM: Record<number, string> = { 1: '上午', 2: '下午', 3: '晚上' }

type StatusFilter = 'all' | '0' | '1' | '2'

const STATUS_OPTIONS: Array<{ label: string; value: StatusFilter }> = [
  { label: '全部', value: 'all' },
  { label: '未面试', value: '0' },
  { label: '已面试', value: '1' },
  { label: '入职/取消', value: '2' },
]

function parseTimeRange(label: string): { start: string; end: string } | null {
  if (!label) return null
  const m = label.match(/(\d{1,2}:\d{2})\s*[-~—–]\s*(\d{1,2}:\d{2})/)
  if (!m) return null
  return { start: m[1], end: m[2] }
}

function InterviewListPage() {
  const [list, setList] = useState<ApplyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [status, setStatus] = useState<StatusFilter>('all')

  // 基础时段
  const [timeOptions, setTimeOptions] = useState<TimeItem[]>([])
  const [timeLoading, setTimeLoading] = useState(false)

  // 编辑预约时间弹窗
  const [editOpen, setEditOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<ApplyItem | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editForm] = Form.useForm<{ type: number; timeId: number; day: Dayjs }>()
  const editTypeWatch = Form.useWatch('type', editForm)

  // 取消预约弹窗
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelRecord, setCancelRecord] = useState<ApplyItem | null>(null)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [cancelForm] = Form.useForm<{ reason?: string }>()

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('size', String(pageSize))
      if (status !== 'all') params.set('status', status)
      const res = await adminFetch(`${API_BASE}/admin/apply/list?${params.toString()}`)
      const json: PageResponse = await res.json()
      if (json.errno === 0) {
        setList(json.data?.data || [])
        setTotal(json.data?.count || 0)
      } else {
        setError(json.errmsg || '请求失败')
      }
    } catch (e: any) {
      setError(e.message || '网络请求失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, status])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const fetchShopTimeOptions = useCallback(async (shopId: number) => {
    setTimeLoading(true)
    try {
      const res = await adminFetch(`${API_BASE}/admin/time/shopTime?shop_id=${shopId}`)
      const json: TimeListResponse = await res.json()
      if (json.errno === 0) {
        setTimeOptions(json.data || [])
      } else {
        message.error(json.errmsg || '加载门店时间段失败')
        setTimeOptions([])
      }
    } catch (e: any) {
      message.error(e.message || '加载门店时间段失败')
      setTimeOptions([])
    } finally {
      setTimeLoading(false)
    }
  }, [])

  // ---- 操作：编辑预约时间 ----

  const openEdit = async (record: ApplyItem) => {
    if (!record.shop_id) {
      message.error('该预约缺少门店信息（shop_id），无法加载可预约时间')
      return
    }
    setEditRecord(record)
    setEditOpen(true)
    setTimeOptions([]) // 清空上一条记录的数据，避免短暂错位
    // 回填表单（先填 day/type，timeId 等门店时间加载完后兜底回填）
    const typeNum = Object.entries(TIME_TYPE_BY_NUM).find(([, v]) => v === record.time_type)?.[0]
    const initialType = typeNum ? Number(typeNum) : undefined
    editForm.setFieldsValue({
      type: initialType as number,
      timeId: undefined as unknown as number,
      day: record.day ? dayjs(record.day) : (undefined as unknown as Dayjs),
    })
    // 每次都重新拉，因 selected 会随预约情况变化
    await fetchShopTimeOptions(record.shop_id)
  }

  // 门店时间加载完成后回填 timeId（仅匹配当前记录已选，不强制 selected，便于看到原值）
  useEffect(() => {
    if (!editOpen || !editRecord || timeOptions.length === 0) return
    const cur = editForm.getFieldValue('timeId')
    if (cur) return
    const typeNum = Object.entries(TIME_TYPE_BY_NUM).find(([, v]) => v === editRecord.time_type)?.[0]
    if (!typeNum) return
    const matched = timeOptions.find(
      (t) =>
        t.type === Number(typeNum) &&
        parseTimeRange(t.label)?.start === editRecord.time_start &&
        parseTimeRange(t.label)?.end === editRecord.time_end,
    )
    if (matched) editForm.setFieldsValue({ timeId: matched.id })
  }, [editOpen, editRecord, timeOptions, editForm])

  const filteredTimeOptions = useMemo(() => {
    if (!editTypeWatch) return [] as TimeItem[]
    return timeOptions.filter((t) => t.type === editTypeWatch)
  }, [editTypeWatch, timeOptions])

  const handleEditSubmit = async () => {
    if (!editRecord) return
    try {
      const values = await editForm.validateFields()
      const time = timeOptions.find((t) => t.id === values.timeId)
      if (!time) {
        message.error('请选择时间段')
        return
      }
      if (time.selected !== true) {
        message.error('该时间段不可预约，请重新选择')
        return
      }
      const range = parseTimeRange(time.label)
      if (!range) {
        message.error('时间段格式异常，请联系管理员维护基础时间')
        return
      }
      const typeLabel = TIME_TYPE_BY_NUM[time.type] || time.type
      setEditSubmitting(true)
      const fd = new FormData()
      fd.append('id', String(editRecord.id))
      fd.append('time_type', String(typeLabel))
      fd.append('time_start', range.start)
      fd.append('time_end', range.end)
      fd.append('day', values.day.format('YYYY-MM-DD'))
      const res = await adminFetch(`${API_BASE}/admin/apply/editUserTime`, {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('修改成功')
        setEditOpen(false)
        setEditRecord(null)
        fetchList()
      } else {
        message.error(json.errmsg || '修改失败')
      }
    } catch (e: any) {
      if (e?.errorFields) return // antd validate 异常
      message.error(e?.message || '提交失败')
    } finally {
      setEditSubmitting(false)
    }
  }

  // ---- 操作：取消预约 ----

  const openCancel = (record: ApplyItem) => {
    setCancelRecord(record)
    cancelForm.resetFields()
    setCancelOpen(true)
  }

  const handleCancelSubmit = async () => {
    if (!cancelRecord) return
    const values = await cancelForm.validateFields().catch(() => null)
    if (!values) return
    setCancelSubmitting(true)
    try {
      const params = new URLSearchParams()
      params.set('id', String(cancelRecord.id))
      const reason = values.reason?.trim()
      if (reason) params.set('reason', reason)
      const res = await adminFetch(`${API_BASE}/admin/apply/cancelUser?${params.toString()}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('已取消预约')
        setCancelOpen(false)
        setCancelRecord(null)
        fetchList()
      } else {
        message.error(json.errmsg || '取消失败')
      }
    } catch (e: any) {
      message.error(e?.message || '取消失败')
    } finally {
      setCancelSubmitting(false)
    }
  }

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
      sorter: (a, b) => (a.day || '').localeCompare(b.day || ''),
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
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      align: 'center',
      render: (_: unknown, record: ApplyItem) => {
        // 仅"未面试"可取消：先看当前筛选，再看记录自身 status 字段；都没有信号时放行
        const cancelable = (() => {
          if (status === '0') return true
          if (status === '1' || status === '2') return false
          const s = record.status as unknown
          if (typeof s === 'number') return s === 0
          if (typeof s === 'string' && s !== '') return s === '0'
          return true
        })()
        const cancelTip = cancelable
          ? '取消该预约'
          : '仅未面试状态的预约可取消'
        return (
          <Space size={4} wrap={false}>
            <Tooltip title="编辑预约时间">
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(record)}
                style={{ padding: '0 4px' }}
              >
                编辑时间
              </Button>
            </Tooltip>
            <Tooltip title={cancelTip}>
              <Button
                type="link"
                size="small"
                danger
                disabled={!cancelable}
                icon={<CloseCircleOutlined />}
                onClick={() => openCancel(record)}
                style={{ padding: '0 4px' }}
              >
                取消
              </Button>
            </Tooltip>
          </Space>
        )
      },
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

      <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary">状态筛选：</Typography.Text>
        <Segmented<StatusFilter>
          options={STATUS_OPTIONS}
          value={status}
          onChange={(v) => {
            setStatus(v as StatusFilter)
            setPage(1)
          }}
        />
      </Flex>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />
      )}

      <Table<ApplyItem>
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          total,
          current: page,
          pageSize,
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50'],
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          },
        }}
        size="middle"
      />

      {/* 编辑预约时间 */}
      <Modal
        title="编辑预约时间"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          setEditRecord(null)
        }}
        onOk={handleEditSubmit}
        confirmLoading={editSubmitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={480}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="预约日期" name="day" rules={[{ required: true, message: '请选择预约日期' }]}>
            <DatePicker style={{ width: '100%' }} placeholder="选择日期" />
          </Form.Item>
          <Form.Item label="时段" name="type" rules={[{ required: true, message: '请选择时段' }]}>
            <Select
              placeholder="请选择时段"
              loading={timeLoading}
              onChange={() => editForm.setFieldsValue({ timeId: undefined as unknown as number })}
              options={[
                { label: '上午', value: 1 },
                { label: '下午', value: 2 },
                { label: '晚上', value: 3 },
              ]}
            />
          </Form.Item>
          <Form.Item label="时间段" name="timeId" rules={[{ required: true, message: '请选择时间段' }]}>
            <Select
              placeholder={editTypeWatch ? '请选择时间段' : '请先选择时段'}
              loading={timeLoading}
              disabled={!editTypeWatch}
              notFoundContent={editTypeWatch ? '该时段下暂无可用时间' : null}
              options={filteredTimeOptions.map((t) => ({
                label: t.selected === true ? t.label : `${t.label}（不可选）`,
                value: t.id,
                disabled: t.selected !== true,
              }))}
            />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            可选时间段来自该门店的预约配置，灰色项当前不可选。
          </Typography.Text>
        </Form>
      </Modal>

      {/* 取消预约 */}
      <Modal
        title="取消预约"
        open={cancelOpen}
        onCancel={() => {
          setCancelOpen(false)
          setCancelRecord(null)
        }}
        onOk={handleCancelSubmit}
        confirmLoading={cancelSubmitting}
        okText="确认取消"
        okButtonProps={{ danger: true }}
        cancelText="返回"
        destroyOnClose
        width={460}
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
          {cancelRecord
            ? `确认取消 ${cancelRecord.name || ''} 在 ${cancelRecord.day || '-'} ${cancelRecord.time_start || ''}-${cancelRecord.time_end || ''} 的预约？`
            : ''}
        </Typography.Paragraph>
        <Form form={cancelForm} layout="vertical">
          <Form.Item label="取消原因（选填）" name="reason">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="可填写取消原因，便于用户知晓" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default InterviewListPage
