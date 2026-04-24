import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, Radio,
  Alert, Space, message, Tag, Flex, Typography, Row, Col, Tooltip, Divider,
} from 'antd'
import {
  PlusOutlined, EditOutlined, SolutionOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

import { adminFetch, API_BASE } from '../utils/adminFetch'
import './JobListPage.scss'

interface JobItem {
  id: number
  job_title: string
  job_cate: number | null
  shop_id: number | null
  /** cert/exp 是从字典项 value 回写的冗余字段（0/1 等），真正的字典 id 存在 cert_id/exp_id */
  cert: number | null
  cert_id: number | null
  exp: number | null
  exp_id: number | null
  gender: number | null
  lower_age: string | number | null
  upper_age: string | number | null
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

/**
 * 性别不再走字典，直接按接口规范写死：男=1，女=2，不限=0
 * 表单按钮文案按设计稿，表格列用精简文案
 */
const GENDER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '不限' },
  { value: 1, label: '只要男性' },
  { value: 2, label: '只要女性' },
]
const GENDER_CODE_TO_LABEL: Record<number, string> = {
  0: '不限',
  1: '男',
  2: '女',
}

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
  const [certDict, setCertDict] = useState<DictOption[]>([])
  const [expDict, setExpDict] = useState<DictOption[]>([])

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

  /**
   * 通过通用字典接口取二级字典项：
   *  1) /admin/dict/list 拿所有一级字典，按 type 找到 dictId
   *  2) /admin/dict/item?dictId=xxx 拿对应的二级字典项
   */
  const fetchAllDicts = useCallback(async () => {
    try {
      const listRes = await adminFetch(`${API_BASE}/admin/dict/list?page=1&size=500`)
      const listJson = await listRes.json()
      if (listJson.errno !== 0) return
      const allDicts: { id: number; type: string }[] = listJson.data?.data || []
      const findId = (type: string) => allDicts.find((d) => d.type === type)?.id

      const fetchItems = async (dictId?: number): Promise<DictOption[]> => {
        if (dictId == null) return []
        const res = await adminFetch(
          `${API_BASE}/admin/dict/item?page=1&size=500&dictId=${dictId}`,
        )
        const json = await res.json()
        if (json.errno === 0) return (json.data?.data || []) as DictOption[]
        return []
      }

      const [cert, exp] = await Promise.all([
        fetchItems(findId('cert')),
        fetchItems(findId('exp')),
      ])
      setCertDict(cert)
      setExpDict(exp)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchJobs(1)
    fetchCates()
    fetchShops()
    fetchAllDicts()
  }, [fetchJobs, fetchCates, fetchShops, fetchAllDicts])

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

  /** 表格里的字典 id → label 快查 */
  const certMap = useMemo(() => {
    const m: Record<number, string> = {}
    certDict.forEach((d) => { m[d.id] = d.label })
    return m
  }, [certDict])

  const expMap = useMemo(() => {
    const m: Record<number, string> = {}
    expDict.forEach((d) => { m[d.id] = d.label })
    return m
  }, [expDict])

  const openAdd = () => {
    setEditRecord(null)
    form.resetFields()
    setShowDialog(true)
  }

  const openEdit = (record: JobItem) => {
    setEditRecord(record)
    // cert/exp/gender 接口要求 integer，老数据里可能是中文字符串（如 "需要"/"男"），
    // 只保留能转成合法数字的值，否则置空让用户重选，避免提交非整数导致后端 500
    const toIntOrUndefined = (v: unknown): number | undefined => {
      if (v == null || v === '') return undefined
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    const toFormNumber = (v: unknown): number | undefined => {
      if (v == null || v === '') return undefined
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    form.setFieldsValue({
      job_title: record.job_title || '',
      job_cate: record.job_cate ?? undefined,
      shop_id: record.shop_id ?? undefined,
      // cert/exp 的 Radio.Group value 是字典项 id，回显用 cert_id/exp_id
      cert: toIntOrUndefined(record.cert_id),
      exp: toIntOrUndefined(record.exp_id),
      gender: toIntOrUndefined(record.gender),
      lower_age: toFormNumber(record.lower_age),
      upper_age: toFormNumber(record.upper_age),
      lower_limit: toFormNumber(record.lower_limit),
      upper_limit: toFormNumber(record.upper_limit),
      desc: record.desc || '',
    })
    setShowDialog(true)
  }

  const handleSubmit = async () => {
    let values: any
    try {
      values = await form.validateFields()
    } catch (err: any) {
      // 校验失败：把第一条错误抛到 toast，避免 noStyle 嵌套下看不到红字
      const firstMsg = err?.errorFields?.[0]?.errors?.[0]
      message.error(firstMsg || '请检查表单必填项')
      return
    }
    setSubmitting(true)
    try {
      // cert / exp / gender 必须是 int 类型，FormData 会把所有值变成 string，
      // 所以这里改成 application/json 发送，保证数字字段到后端是真正的 number
      const toInt = (v: unknown, fallback = 0): number => {
        if (v == null || v === '') return fallback
        const n = Number(v)
        return Number.isFinite(n) ? Math.trunc(n) : fallback
      }
      const body: Record<string, unknown> = {
        job_title: String(values.job_title || '').trim(),
        job_cate: String(values.job_cate ?? ''),
        shop_id: String(values.shop_id ?? ''),
        cert: toInt(values.cert),
        exp: toInt(values.exp),
        gender: toInt(values.gender),
        lower_age: values.lower_age != null ? String(values.lower_age) : '',
        upper_age: values.upper_age != null ? String(values.upper_age) : '',
        lower_limit: values.lower_limit != null ? String(values.lower_limit) : '',
        upper_limit: values.upper_limit != null ? String(values.upper_limit) : '',
        desc: String(values.desc || ''),
      }
      if (editRecord) body.id = editRecord.id

      const res = await adminFetch(`${API_BASE}/admin/jobs/put`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      let json: any = null
      try {
        json = JSON.parse(text)
      } catch {
        // 非 JSON（后端 5xx 错误页等）—— 把状态码和返回内容一起抛出来便于排查
        console.error('[JobListPage] /admin/jobs/put non-JSON response:', {
          status: res.status,
          statusText: res.statusText,
          body: text,
        })
        message.error(`服务端错误(${res.status})：${(text || res.statusText || '').slice(0, 120)}`)
        return
      }
      if (json.errno === 0) {
        message.success(editRecord ? '编辑成功' : '新增成功')
        setShowDialog(false)
        fetchJobs(currentPage)
      } else {
        message.error(json.errmsg || '操作失败')
      }
    } catch (e: any) {
      console.error('[JobListPage] submit error:', e)
      message.error(e?.message || '网络请求失败')
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
    {
      title: '健康证',
      dataIndex: 'cert_id',
      key: 'cert_id',
      width: 110,
      render: (v: number | null) => (v != null ? (certMap[v] || '-') : '-'),
    },
    {
      title: '经验',
      dataIndex: 'exp_id',
      key: 'exp_id',
      width: 110,
      render: (v: number | null) => (v != null ? (expMap[v] || '-') : '-'),
    },
    {
      title: '性别',
      dataIndex: 'gender',
      key: 'gender',
      width: 80,
      render: (v: number | null) => {
        if (v == null) return '-'
        return GENDER_CODE_TO_LABEL[v] ?? '-'
      },
    },
    {
      title: '年龄范围',
      key: 'age_range',
      width: 120,
      render: (_: unknown, record) => {
        const lo = record.lower_age
        const hi = record.upper_age
        const hasLo = lo != null && lo !== ''
        const hasHi = hi != null && hi !== ''
        if (!hasLo && !hasHi) return '-'
        return `${hasLo ? lo : '-'} ~ ${hasHi ? hi : '-'}`
      },
    },
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
    <div className="job-list-page">
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
          {/* 基础信息 */}
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

          <Form.Item
            label="职位名称"
            name="job_title"
            rules={[{ required: true, message: '请输入职位名称' }]}
          >
            <Input placeholder="请输入职位名称" maxLength={64} />
          </Form.Item>

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

          <Form.Item label="薪资区间" required style={{ marginBottom: 24 }}>
            <Row gutter={12} align="middle">
              <Col flex="1 1 0">
                <Form.Item
                  name="lower_limit"
                  noStyle
                  rules={[{ required: true, message: '请输入薪资下限' }]}
                >
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="下限，如 3000" />
                </Form.Item>
              </Col>
              <Col flex="0 0 auto" style={{ textAlign: 'center', color: 'var(--text-secondary, #999)' }}>—</Col>
              <Col flex="1 1 0">
                <Form.Item
                  name="upper_limit"
                  noStyle
                  rules={[
                    { required: true, message: '请输入薪资上限' },
                    {
                      validator: (_, v) => {
                        if (v == null || v === '') return Promise.resolve()
                        const lower = form.getFieldValue('lower_limit')
                        if (lower != null && lower !== '' && Number(v) < Number(lower)) {
                          return Promise.reject(new Error('薪资上限不能小于下限'))
                        }
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="上限，如 6000" />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          <Form.Item label="岗位描述" name="desc">
            <Input.TextArea
              placeholder="选填，填写岗位职责与任职要求"
              rows={5}
              maxLength={4000}
              showCount
            />
          </Form.Item>

          <Divider style={{ margin: '8px 0 20px' }} />

          {/* 要求信息 */}
          <Form.Item
            label="经验要求"
            name="exp"
            rules={[{ required: true, message: '请选择经验要求' }]}
            extra={expDict.length === 0 ? '请先到「系统配置维护 → 通用字典」中添加 type=exp 的字典项' : undefined}
          >
            <Radio.Group
              optionType="button"
              options={expDict.map((d) => ({ value: d.id, label: d.label }))}
            />
          </Form.Item>

          <Form.Item label="性别要求" name="gender">
            <Radio.Group
              optionType="button"
              options={GENDER_OPTIONS}
            />
          </Form.Item>

          <Form.Item label="年龄要求" required style={{ marginBottom: 24 }}>
            <Row gutter={12} align="middle">
              <Col flex="1 1 0">
                <Form.Item
                  name="lower_age"
                  noStyle
                  rules={[
                    { required: true, message: '请输入年龄下限' },
                    {
                      validator: (_, v) => {
                        if (v == null || v === '') return Promise.resolve()
                        const upper = form.getFieldValue('upper_age')
                        if (upper != null && upper !== '' && Number(v) > Number(upper)) {
                          return Promise.reject(new Error('年龄下限不能大于上限'))
                        }
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <InputNumber min={16} max={65} style={{ width: '100%' }} placeholder="16" />
                </Form.Item>
              </Col>
              <Col flex="0 0 auto" style={{ textAlign: 'center', color: 'var(--text-secondary, #999)' }}>—</Col>
              <Col flex="1 1 0">
                <Form.Item
                  name="upper_age"
                  noStyle
                  rules={[{ required: true, message: '请输入年龄上限' }]}
                >
                  <InputNumber min={16} max={65} style={{ width: '100%' }} placeholder="65" />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          <Form.Item
            label="健康证要求"
            name="cert"
            rules={[{ required: true, message: '请选择健康证要求' }]}
            extra={certDict.length === 0 ? '请先到「系统配置维护 → 通用字典」中添加 type=cert 的字典项' : undefined}
          >
            <Radio.Group
              optionType="button"
              options={certDict.map((d) => ({ value: d.id, label: d.label }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default JobListPage
