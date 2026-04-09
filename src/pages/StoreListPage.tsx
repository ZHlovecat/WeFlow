import { useState, useEffect, useCallback } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Alert, Space, message,
  Flex, Typography, Tag, Descriptions, Spin, Divider,
} from 'antd'
import {
  EditOutlined, ReloadOutlined, TagsOutlined,
  TeamOutlined, EyeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import './StoreListPage.scss'

const API_BASE = 'https://store.quikms.com'

interface TagLabel {
  id: number
  label: string
}

interface TagCategory {
  category: string
  labels: TagLabel[]
}

interface StoreItem {
  id: number
  name: string
  age: string
  edu: string
  postion_name: string
  weixin: string
  work_year: string
  gender: string
  remark: string
  friend_status: string
  create_time: string
  company_id: number | null
  shop_id: number | null
  tags: TagCategory[]
}

interface CompanyOption {
  id: number
  name: string | null
}

interface ShopOption {
  id: number
  name: string | null
}

interface TagDictItem {
  id: number
  label: string
  sort: number
}

interface TagDictCategory {
  id: number
  label: string
  children: TagDictItem[]
}

interface PageResponse {
  errno: number
  errmsg: string
  data: {
    count: number
    totalPages: number
    pageSize: number
    currentPage: number
    data: StoreItem[]
  }
}

const GENDER_COLORS: Record<string, string> = { '男': 'blue', '女': 'magenta' }
const STATUS_COLORS: Record<string, string> = {
  '已添加': 'green', '未添加': 'default', '待通过': 'orange',
}

function StoreListPage() {
  const [stores, setStores] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [shops, setShops] = useState<ShopOption[]>([])
  const [tagDict, setTagDict] = useState<TagDictCategory[]>([])

  // 编辑弹窗
  const [editRecord, setEditRecord] = useState<StoreItem | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editForm] = Form.useForm()

  // 标签管理弹窗
  const [tagRecord, setTagRecord] = useState<StoreItem | null>(null)
  const [tagLoading, setTagLoading] = useState(false)

  // 详情弹窗
  const [detailRecord, setDetailRecord] = useState<StoreItem | null>(null)

  const fetchStores = useCallback(async (page: number = 1, size?: number) => {
    const actualSize = size || pageSize
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/admin/store/list?page=${page}&size=${actualSize}`)
      const json: PageResponse = await res.json()
      if (json.errno === 0) {
        setStores(json.data.data || [])
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

  const loadDropdownData = useCallback(async () => {
    try {
      const [companyRes, shopRes, tagRes] = await Promise.all([
        fetch(`${API_BASE}/admin/company/list?page=1&size=200`),
        fetch(`${API_BASE}/admin/shop/list?page=1&size=200`),
        fetch(`${API_BASE}/admin/tag/list`),
      ])
      const companyJson = await companyRes.json()
      if (companyJson.errno === 0) {
        setCompanies(companyJson.data.data || [])
      }
      const shopJson = await shopRes.json()
      if (shopJson.errno === 0) {
        setShops(shopJson.data.data || [])
      }
      const tagJson = await tagRes.json()
      if (tagJson.errno === 0) {
        const categories: TagDictCategory[] = []
        for (const cat of tagJson.data || []) {
          const childRes = await fetch(`${API_BASE}/admin/tag/item?parent_id=${cat.id}`)
          const childJson = await childRes.json()
          categories.push({
            id: cat.id,
            label: cat.label,
            children: childJson.errno === 0 ? childJson.data || [] : [],
          })
        }
        setTagDict(categories)
      }
    } catch (e) {
      console.error('加载下拉数据失败:', e)
    }
  }, [])

  useEffect(() => {
    fetchStores(1)
    loadDropdownData()
  }, [fetchStores, loadDropdownData])

  // ---- 编辑 ----

  const openEdit = (record: StoreItem) => {
    setEditRecord(record)
    editForm.setFieldsValue({
      name: record.name || '',
      age: record.age || '',
      edu: record.edu || '',
      postion_name: record.postion_name || '',
      weixin: record.weixin || '',
      work_year: record.work_year || '',
      gender: record.gender || '',
      remark: record.remark || '',
      friend_status: record.friend_status || '',
      company_id: record.company_id || undefined,
      shop_id: record.shop_id || undefined,
    })
  }

  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields()
      setEditLoading(true)
      const res = await fetch(`${API_BASE}/admin/store/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editRecord!.id,
          name: values.name?.trim() || null,
          age: values.age?.trim() || null,
          edu: values.edu?.trim() || null,
          postion_name: values.postion_name?.trim() || null,
          weixin: values.weixin?.trim() || null,
          work_year: values.work_year?.trim() || null,
          gender: values.gender || null,
          remark: values.remark?.trim() || null,
          friend_status: values.friend_status || null,
          company_id: values.company_id || null,
          shop_id: values.shop_id || null,
        }),
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('编辑成功')
        setEditRecord(null)
        fetchStores(currentPage)
      } else {
        message.error(json.errmsg || '编辑失败')
      }
    } catch {
      // validateFields
    } finally {
      setEditLoading(false)
    }
  }

  // ---- 标签管理 ----

  const openTagManager = (record: StoreItem) => {
    setTagRecord(record)
  }

  const getRecordTagIdsByCategory = (record: StoreItem, category: string): number[] => {
    const cat = record.tags.find(c => c.category === category)
    return cat ? cat.labels.map(l => l.id) : []
  }

  const handleAddTag = async (storeId: number, tagId: number) => {
    setTagLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/store/addTag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: storeId, tag_id: tagId }),
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('标签添加成功')
        await refreshTagRecord(storeId)
      } else {
        message.error(json.errmsg || '添加标签失败')
      }
    } catch {
      message.error('添加标签请求失败')
    } finally {
      setTagLoading(false)
    }
  }

  const handleDeleteTag = async (storeId: number, tagId: number) => {
    setTagLoading(true)
    try {
      const res = await fetch(`${API_BASE}/admin/store/deleteTag?id=${storeId}&tag_id=${tagId}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('标签删除成功')
        await refreshTagRecord(storeId)
      } else {
        message.error(json.errmsg || '删除标签失败')
      }
    } catch {
      message.error('删除标签请求失败')
    } finally {
      setTagLoading(false)
    }
  }

  const refreshTagRecord = async (storeId: number) => {
    const res = await fetch(`${API_BASE}/admin/store/list?page=1&size=200`)
    const json = await res.json()
    if (json.errno === 0) {
      const updated = (json.data.data || []).find((s: StoreItem) => s.id === storeId)
      if (updated) {
        setTagRecord(updated)
        setStores(prev => prev.map(s => s.id === storeId ? updated : s))
      }
    }
  }

  const SINGLE_SELECT_CATEGORIES = ['城市', '候选人状态']

  const handleTagMultiChange = (storeId: number, category: string, newIds: number[]) => {
    if (!tagRecord) return
    const oldIds = getRecordTagIdsByCategory(tagRecord, category)
    const toAdd = newIds.filter(id => !oldIds.includes(id))
    const toRemove = oldIds.filter(id => !newIds.includes(id))
    for (const id of toAdd) handleAddTag(storeId, id)
    for (const id of toRemove) handleDeleteTag(storeId, id)
  }

  const handleTagSingleChange = async (storeId: number, category: string, newId: number | undefined) => {
    if (!tagRecord) return
    const oldIds = getRecordTagIdsByCategory(tagRecord, category)
    for (const id of oldIds) {
      if (id !== newId) await handleDeleteTag(storeId, id)
    }
    if (newId !== undefined && !oldIds.includes(newId)) {
      await handleAddTag(storeId, newId)
    }
  }

  // ---- 查找关联名称 ----

  const getCompanyName = (id: number | null) => {
    if (!id) return '-'
    return companies.find(c => c.id === id)?.name || '-'
  }

  const getShopName = (id: number | null) => {
    if (!id) return '-'
    return shops.find(s => s.id === id)?.name || '-'
  }

  // ---- 表格列 ----

  const columns: ColumnsType<StoreItem> = [
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
      width: 90,
      fixed: 'left',
      render: (v: string) => v || <span style={{ color: '#999' }}>-</span>,
    },
    {
      title: '性别',
      dataIndex: 'gender',
      key: 'gender',
      width: 60,
      align: 'center',
      render: (v: string) => v ? <Tag color={GENDER_COLORS[v] || 'default'}>{v}</Tag> : '-',
    },
    {
      title: '年龄',
      dataIndex: 'age',
      key: 'age',
      width: 70,
      render: (v: string) => v || '-',
    },
    {
      title: '学历',
      dataIndex: 'edu',
      key: 'edu',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '岗位',
      dataIndex: 'postion_name',
      key: 'postion_name',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '微信',
      dataIndex: 'weixin',
      key: 'weixin',
      width: 130,
      render: (v: string) => v || '-',
    },
    {
      title: '工作年限',
      dataIndex: 'work_year',
      key: 'work_year',
      width: 100,
      render: (v: string) => v || '-',
    },
    {
      title: '所属企业',
      dataIndex: 'company_id',
      key: 'company_id',
      width: 120,
      render: (v: number | null) => getCompanyName(v),
    },
    {
      title: '所属门店',
      dataIndex: 'shop_id',
      key: 'shop_id',
      width: 120,
      render: (v: number | null) => getShopName(v),
    },
    {
      title: '好友状态',
      dataIndex: 'friend_status',
      key: 'friend_status',
      width: 90,
      align: 'center',
      render: (v: string) => v ? <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag> : '-',
    },
    {
      title: '标签',
      key: 'tags',
      width: 200,
      render: (_: unknown, record: StoreItem) => {
        const allLabels = record.tags.flatMap(c => c.labels)
        if (allLabels.length === 0) return <span style={{ color: '#999' }}>暂无标签</span>
        return (
          <Space size={[4, 4]} wrap>
            {allLabels.slice(0, 4).map(l => (
              <Tag key={l.id} color="processing" style={{ margin: 0 }}>{l.label}</Tag>
            ))}
            {allLabels.length > 4 && (
              <Tag style={{ margin: 0 }}>+{allLabels.length - 4}</Tag>
            )}
          </Space>
        )
      },
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      key: 'create_time',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      align: 'center',
      render: (_: unknown, record: StoreItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)}>
            详情
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<TagsOutlined />} onClick={() => openTagManager(record)}>
            标签
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="store-list-page">
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={10}>
          <TeamOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>人力仓</Typography.Title>
        </Flex>
        <Space>
          <Typography.Text type="secondary">共 {total} 条记录</Typography.Text>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => fetchStores(currentPage)}
            disabled={loading}
          >
            刷新
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />
      )}

      <Table<StoreItem>
        columns={columns}
        dataSource={stores}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1800 }}
        pagination={{
          current: currentPage,
          total,
          pageSize,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, newPageSize) => {
            if (newPageSize !== pageSize) {
              setPageSize(newPageSize)
              fetchStores(1, newPageSize)
            } else {
              fetchStores(page)
            }
          },
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50'],
        }}
        size="middle"
      />

      {/* 详情弹窗 */}
      <Modal
        title={`人员详情 - ${detailRecord?.name || ''}`}
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        footer={null}
        width={640}
      >
        {detailRecord && (
          <>
            <Descriptions column={2} bordered size="small" style={{ marginTop: 16 }}>
              <Descriptions.Item label="姓名">{detailRecord.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="性别">{detailRecord.gender || '-'}</Descriptions.Item>
              <Descriptions.Item label="年龄">{detailRecord.age || '-'}</Descriptions.Item>
              <Descriptions.Item label="学历">{detailRecord.edu || '-'}</Descriptions.Item>
              <Descriptions.Item label="岗位">{detailRecord.postion_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="微信">{detailRecord.weixin || '-'}</Descriptions.Item>
              <Descriptions.Item label="工作年限">{detailRecord.work_year || '-'}</Descriptions.Item>
              <Descriptions.Item label="好友状态">{detailRecord.friend_status || '-'}</Descriptions.Item>
              <Descriptions.Item label="所属企业">{getCompanyName(detailRecord.company_id)}</Descriptions.Item>
              <Descriptions.Item label="所属门店">{getShopName(detailRecord.shop_id)}</Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>{detailRecord.create_time || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注" span={2}>{detailRecord.remark || '-'}</Descriptions.Item>
            </Descriptions>
            {/* @ts-ignore orientation type mismatch in antd */}
            <Divider orientation="left" style={{ fontSize: 14 }}>标签信息</Divider>
            {detailRecord.tags.map(cat => (
              <div key={cat.category} style={{ marginBottom: 12 }}>
                <Typography.Text strong style={{ marginRight: 8 }}>{cat.category}：</Typography.Text>
                {cat.labels.length === 0 ? (
                  <Typography.Text type="secondary">暂无</Typography.Text>
                ) : (
                  <Space size={[4, 4]} wrap>
                    {cat.labels.map(l => (
                      <Tag key={l.id} color="processing">{l.label}</Tag>
                    ))}
                  </Space>
                )}
              </div>
            ))}
          </>
        )}
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑人员信息"
        open={!!editRecord}
        onCancel={() => setEditRecord(null)}
        onOk={handleEditSubmit}
        okText="保存"
        cancelText="取消"
        confirmLoading={editLoading}
        destroyOnClose
        width={600}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Flex gap={16}>
            <Form.Item label="姓名" name="name" style={{ flex: 1 }}>
              <Input placeholder="请输入姓名" />
            </Form.Item>
            <Form.Item label="性别" name="gender" style={{ width: 120 }}>
              <Select placeholder="性别">
                <Select.Option value="男">男</Select.Option>
                <Select.Option value="女">女</Select.Option>
              </Select>
            </Form.Item>
          </Flex>
          <Flex gap={16}>
            <Form.Item label="年龄" name="age" style={{ flex: 1 }}>
              <Input placeholder="如：18岁" />
            </Form.Item>
            <Form.Item label="学历" name="edu" style={{ flex: 1 }}>
              <Input placeholder="如：大专" />
            </Form.Item>
          </Flex>
          <Flex gap={16}>
            <Form.Item label="岗位" name="postion_name" style={{ flex: 1 }}>
              <Input placeholder="如：服务员" />
            </Form.Item>
            <Form.Item label="工作年限" name="work_year" style={{ flex: 1 }}>
              <Input placeholder="如：1年以内" />
            </Form.Item>
          </Flex>
          <Flex gap={16}>
            <Form.Item label="微信" name="weixin" style={{ flex: 1 }}>
              <Input placeholder="请输入微信号" />
            </Form.Item>
            <Form.Item label="好友状态" name="friend_status" style={{ width: 140 }}>
              <Select placeholder="选择状态">
                <Select.Option value="已添加">已添加</Select.Option>
                <Select.Option value="未添加">未添加</Select.Option>
                <Select.Option value="待通过">待通过</Select.Option>
              </Select>
            </Form.Item>
          </Flex>
          <Flex gap={16}>
            <Form.Item label="所属企业" name="company_id" style={{ flex: 1 }}>
              <Select placeholder="请选择企业" allowClear showSearch optionFilterProp="children">
                {companies.filter(c => c.name).map(c => (
                  <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="所属门店" name="shop_id" style={{ flex: 1 }}>
              <Select placeholder="请选择门店" allowClear showSearch optionFilterProp="children">
                {shops.filter(s => s.name).map(s => (
                  <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Flex>
          <Form.Item label="备注" name="remark">
            <Input.TextArea placeholder="备注信息（选填）" rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 标签管理弹窗 */}
      <Modal
        title={`标签管理 - ${tagRecord?.name || ''}`}
        open={!!tagRecord}
        onCancel={() => { setTagRecord(null); fetchStores(currentPage) }}
        footer={null}
        width={640}
        destroyOnClose
      >
        {tagRecord && (
          <Spin spinning={tagLoading}>
            <div style={{ marginTop: 16 }}>
              {tagDict.map(cat => {
                const selectedIds = getRecordTagIdsByCategory(tagRecord, cat.label)
                const isSingle = SINGLE_SELECT_CATEGORIES.includes(cat.label)
                const options = cat.children.map(child => ({
                  value: child.id,
                  label: child.label,
                }))
                return (
                  <div key={cat.id} style={{ marginBottom: 20 }}>
                    <Typography.Text strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>
                      {cat.label}{isSingle ? '（单选）' : '（多选）'}
                    </Typography.Text>
                    {isSingle ? (
                      <Select
                        style={{ width: '100%' }}
                        placeholder={`请选择${cat.label}`}
                        value={selectedIds[0] ?? undefined}
                        onChange={(val: number | undefined) => handleTagSingleChange(tagRecord.id, cat.label, val)}
                        disabled={tagLoading}
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={options}
                      />
                    ) : (
                      <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder={`请选择${cat.label}`}
                        value={selectedIds}
                        onChange={(ids: number[]) => handleTagMultiChange(tagRecord.id, cat.label, ids)}
                        disabled={tagLoading}
                        optionFilterProp="label"
                        options={options}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </Spin>
        )}
      </Modal>
    </div>
  )
}

export default StoreListPage
