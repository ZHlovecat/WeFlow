import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Table, Button, Modal, Form, Input, InputNumber, Select,
  Alert, Space, message, Tag, Flex, Typography, Row, Col, Tooltip,
} from 'antd'
import {
  PlusOutlined, EditOutlined, SolutionOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { adminFetch, API_BASE } from '../utils/adminFetch'

interface JobItem {
  id: number
  job_title: string
  job_cate: number | null
  shop_id: number | null
  edu: string | null
  exp: string | null
  gender: string | null
  age: string | null
  lower_limit: string | null
  upper_limit: string | null
  desc: string | null
  status: number
  create_time: string | null
  shop_name?: string | null
  job_cate_name?: string | null
}

interface JobCateOption {
  id: number
  label: string
  status: number
}

interface ShopOption {
  id: number
  name: string | null
}

interface DictOption {
  id: number
  label: string
  value: string
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

/** gender 字典在后端可能为空，提供本地兜底，保持下拉可用 */
const GENDER_FALLBACK: DictOption[] = [
  { id: -1, label: '不限', value: '不限' },
  { id: -2, label: '男', value: '男' },
  { id: -3, label: '女', value: '女' },
]

function JobListPage() {
  const [jobs, setJobs] = useState<JobItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  // 联调数据
  const [cates, setCates] = useState<JobCateOption[]>([])
  const [shops, setShops] = useState<ShopOption[]>([])
  const [eduDict, setEduDict] = useState<DictOption[]>([])
  const [expDict, setExpDict] = useState<DictOption[]>([])
  const [genderDict, setGenderDict] = useState<DictOption[]>(GENDER_FALLBACK)
  const [ageDict, setAgeDict] = useState<DictOption[]>([])

  const [showDialog, setShowDialog] = useState(false)
  const [editRecord, setEditRecord] = useState<JobItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  // ---- 列表 ----

  const fetchJobs = useCallback(async (page = 1, size?: number) => {
    const actualSize = size || pageSize
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_BASE}/admin/jobs/list?page=${page}&size=${actualSize}`)
      const json: PageResponse<JobItem> = await res.json()
      if (json.errno === 0) {
        setJobs(json.data.data || [])
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

  // ---- 联调：职位大类、门店、字典 ----

  const fetchCates = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/jobs/cateList`)
      const json = await res.json()
      if (json.errno === 0) {
        const data = (json.data || []) as JobCateOption[]
        setCates(data)
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchShops = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/shop/list?page=1&size=200`)
      const json = await res.json()
      if (json.errno === 0) {
        setShops((json.data?.data || []).filter((s: any) => s?.name))
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchDict = useCallback(async (type: string): Promise<DictOption[]> => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/dict/find?type=${encodeURIComponent(type)}`)
      const json = await res.json()
      if (json.errno === 0) return (json.data || []) as DictOption[]
    } catch {
      // ignore
    }
    return []
  }, [])

  useEffect(() => {
    fetchJobs(1)
    fetchCates()
    fetchShops()
    ;(async () => {
      const [edu, exp, gender, age] = await Promise.all([
        fetchDict('edu'),
        fetchDict('exp'),
        fetchDict('gender'),
        fetchDict('age'),
      ])
      setEduDict(edu)
      setExpDict(exp)
      // gender 字典若为空，使用本地兜底，避免下拉无值
      setGenderDict(gender.length ? gender : GENDER_FALLBACK)
      setAgeDict(age)
    })()
  }, [fetchJobs, fetchCates, fetchShops, fetchDict])

  // ---- 新增/编辑 ----

  const cateMap = useMemo(() => {
    const m: Record<number, string> = {}
    cates.forEach((c) => { m[c.id] = c.label })
    return m
  }, [cates])

  const shopMap = useMemo(() => {
    const m: Record<number, string> = {}
    shops.forEach((s) => { if (s.name) m[s.id] = s.name })
    return m
  }, [shops])

  const openAdd = () => {
    setEditRecord(null)
    form.resetFields()
    setShowDialog(true)
  }

  const openEdit = (record: JobItem) => {
    setEditRecord(record)
    form.setFieldsValue({
      job_title: record.job_title || '',
      job_cate: record.job_cate ?? undefined,
      shop_id: record.shop_id ?? undefined,
      edu: record.edu || undefined,
      exp: record.exp || undefined,
      gender: record.gender || undefined,
      age: record.age || undefined,
      lower_limit: record.lower_limit ? Number(record.lower_limit) : undefined,
      upper_limit: record.upper_limit ? Number(record.upper_limit) : undefined,
      desc: record.desc || '',
    })
    setShowDialog(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const body = new FormData()
      body.append('job_title', String(values.job_title || '').trim())
      body.append('job_cate', String(values.job_cate ?? ''))
      body.append('shop_id', String(values.shop_id ?? ''))
      body.append('edu', String(values.edu || ''))
      body.append('exp', String(values.exp || ''))
      body.append('gender', String(values.gender || ''))
      body.append('age', String(values.age || ''))
      body.append('lower_limit', values.lower_limit != null ? String(values.lower_limit) : '')
      body.append('upper_limit', values.upper_limit != null ? String(values.upper_limit) : '')
      body.append('desc', String(values.desc || ''))
      if (editRecord) body.append('id', String(editRecord.id))

      const res = await adminFetch(`${API_BASE}/admin/jobs/put`, {
        method: 'POST',
        body,
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success(editRecord ? '编辑成功' : '新增成功')
        setShowDialog(false)
        fetchJobs(currentPage)
      } else {
        message.error(json.errmsg || '操作失败')
      }
    } catch {
      // validateFields 失败
    } finally {
      setSubmitting(false)
    }
  }

  // ---- 表格列 ----

  const columns: ColumnsType<JobItem> = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 70, align: 'center' },
    {
      title: '职位名称',
      dataIndex: 'job_title',
      key: 'job_title',
      width: 200,
      render: (v: string) => v || '-',
    },
    {
      title: '职位大类',
      dataIndex: 'job_cate',
      key: 'job_cate',
      width: 120,
      render: (v: number | null, record) => {
        const name = record.job_cate_name || (v != null ? cateMap[v] : '')
        return name ? <Tag color="geekblue">{name}</Tag> : '-'
      },
    },
    {
      title: '所属门店',
      dataIndex: 'shop_id',
      key: 'shop_id',
      width: 160,
      render: (v: number | null, record) => record.shop_name || (v != null ? shopMap[v] : '') || '-',
    },
    { title: '学历', dataIndex: 'edu', key: 'edu', width: 80, render: (v) => v || '-' },
    { title: '经验', dataIndex: 'exp', key: 'exp', width: 100, render: (v) => v || '-' },
    { title: '性别', dataIndex: 'gender', key: 'gender', width: 80, render: (v) => v || '-' },
    { title: '年龄', dataIndex: 'age', key: 'age', width: 100, render: (v) => v || '-' },
    {
      title: '薪资范围',
      key: 'salary',
      width: 130,
      render: (_: unknown, record) => {
        const lo = record.lower_limit
        const hi = record.upper_limit
        if (!lo && !hi) return '-'
        return `${lo || '-'} ~ ${hi || '-'}`
      },
    },
    {
      title: '描述',
      dataIndex: 'desc',
      key: 'desc',
      width: 200,
      render: (v: string | null) => {
        if (!v) return '-'
        const oneLine = v.length > 30 ? `${v.slice(0, 30)}…` : v
        return (
          <Tooltip title={<div style={{ whiteSpace: 'pre-wrap', maxWidth: 360 }}>{v}</div>}>
            <span>{oneLine}</span>
          </Tooltip>
        )
      },
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      key: 'create_time',
      width: 170,
      render: (v: string | null) => v || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      align: 'center',
      fixed: 'right',
      render: (_: unknown, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={10}>
          <SolutionOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>职位列表</Typography.Title>
        </Flex>
        <Space>
          <Typography.Text type="secondary">共 {total} 个职位</Typography.Text>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            新增职位
          </Button>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => fetchJobs(currentPage)}
            disabled={loading}
          >
            刷新
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />
      )}

      <Table<JobItem>
        columns={columns}
        dataSource={jobs}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={{
          current: currentPage,
          total,
          pageSize,
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50'],
          onChange: (page, newSize) => {
            if (newSize !== pageSize) {
              setPageSize(newSize)
              fetchJobs(1, newSize)
            } else {
              fetchJobs(page)
            }
          },
        }}
        size="middle"
      />

      <Modal
        title={editRecord ? '编辑职位' : '新增职位'}
        open={showDialog}
        onCancel={() => setShowDialog(false)}
        onOk={handleSubmit}
        okText={editRecord ? '保存' : '确认新增'}
        cancelText="取消"
        confirmLoading={submitting}
        destroyOnClose
        width={720}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="职位名称"
                name="job_title"
                rules={[{ required: true, message: '请输入职位名称' }]}
              >
                <Input placeholder="请输入职位名称" maxLength={64} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="职位大类"
                name="job_cate"
                rules={[{ required: true, message: '请选择职位大类' }]}
                extra={cates.length === 0 ? '请先到「系统配置维护 → 职位大类」中添加' : undefined}
              >
                <Select
                  placeholder="请选择职位大类"
                  showSearch
                  optionFilterProp="label"
                  options={cates
                    .filter((c) => c.status === 0)
                    .map((c) => ({ value: c.id, label: c.label }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="所属门店"
                name="shop_id"
                rules={[{ required: true, message: '请选择所属门店' }]}
              >
                <Select
                  placeholder="请选择所属门店"
                  showSearch
                  optionFilterProp="label"
                  options={shops.map((s) => ({ value: s.id, label: s.name || `门店 ${s.id}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="学历" name="edu">
                <Select
                  placeholder="请选择学历"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={eduDict.map((d) => ({ value: d.label, label: d.label }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="经验" name="exp">
                <Select
                  placeholder="请选择经验要求"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={expDict.map((d) => ({ value: d.label, label: d.label }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="性别" name="gender">
                <Select
                  placeholder="请选择性别"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={genderDict.map((d) => ({ value: d.label, label: d.label }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="年龄" name="age">
                <Select
                  placeholder="请选择年龄"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={ageDict.map((d) => ({ value: d.label, label: d.label }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="薪资下限" name="lower_limit">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="如 3000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="薪资上限" name="upper_limit">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="如 6000" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="职位描述" name="desc">
            <Input.TextArea
              placeholder="可选，填写岗位职责与任职要求"
              rows={6}
              maxLength={4000}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default JobListPage
