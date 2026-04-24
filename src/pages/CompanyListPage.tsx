import { useState, useEffect, useRef } from 'react'
import {
  Table, Button, Modal, Form, Input, Upload, Alert, Space, message, Flex, Typography, Image, Popconfirm,
  Divider, Select, Checkbox, Tag,
} from 'antd'
import type { InputRef } from 'antd'
import {
  PlusOutlined, EyeOutlined, LoadingOutlined,
  EditOutlined, BankOutlined, ReloadOutlined, DeleteOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { uploadImageToOss } from '../utils/ossUpload'
import './CompanyListPage.scss'

interface CompanyItem {
  id: number
  name: string
  logo: string
  introduction: string | null
  name_short: string | null
  desc_short: string | null
  remark: string | null
}

interface CompanyBenefit {
  id: number
  label: string
  sort: number
  company_id: number
}

interface CompanyListResponse {
  errno: number
  errmsg: string
  data: {
    count: number
    totalPages: number
    pageSize: number
    currentPage: number
    data: CompanyItem[]
  }
}

interface CompanyImageItem {
  id: number
  company_id: number
  url: string
  sort: number
}

import { adminFetch, API_BASE } from '../utils/adminFetch'

function CompanyListPage() {
  const [companies, setCompanies] = useState<CompanyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const [detailContent, setDetailContent] = useState<{ title: string; content: string } | null>(null)

  // 新增企业
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addForm] = Form.useForm()
  const [addLogoUrl, setAddLogoUrl] = useState('')
  const [addUploading, setAddUploading] = useState(false)

  // 编辑企业
  const [editRecord, setEditRecord] = useState<CompanyItem | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editForm] = Form.useForm()
  const [editLogoUrl, setEditLogoUrl] = useState('')
  const [editUploading, setEditUploading] = useState(false)

  // 企业形象图片（仅编辑场景，依赖已有 company_id）
  const [companyImages, setCompanyImages] = useState<CompanyImageItem[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageDeletingId, setImageDeletingId] = useState<number | null>(null)

  // 企业通用福利标签（仅编辑场景，依赖已有 company_id）
  const [companyBenefits, setCompanyBenefits] = useState<CompanyBenefit[]>([])
  const [benefitsLoading, setBenefitsLoading] = useState(false)
  const [benefitAdding, setBenefitAdding] = useState(false)
  const [benefitInputVisible, setBenefitInputVisible] = useState(false)
  const [benefitInputValue, setBenefitInputValue] = useState('')
  const benefitInputRef = useRef<InputRef>(null)

  const fetchCompanies = async (page: number = 1, size?: number) => {
    const actualSize = size || pageSize
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_BASE}/admin/company/list?page=${page}&size=${actualSize}`)
      const json: CompanyListResponse = await res.json()
      if (json.errno === 0) {
        setCompanies(json.data.data || [])
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
  }

  useEffect(() => {
    fetchCompanies(1)
  }, [])

  // ---- 新增 ----

  const handleAddSuccess = () => {
    setShowAddDialog(false)
    addForm.resetFields()
    setAddLogoUrl('')
    fetchCompanies(1)
  }

  const handleAddLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片大小不能超过 5MB')
      return
    }
    setAddUploading(true)
    try {
      const url = await uploadImageToOss(file, 'company')
      setAddLogoUrl(url)
    } catch (err: any) {
      message.error('Logo 上传失败：' + (err.message || '未知错误'))
    } finally {
      setAddUploading(false)
    }
  }

  const handleAddSubmit = async () => {
    try {
      const values = await addForm.validateFields()
      if (!addLogoUrl) {
        message.error('请上传企业 Logo')
        return
      }
      setAddLoading(true)
      const res = await adminFetch(`${API_BASE}/admin/company/put`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name?.trim(),
          name_short: values.name_short?.trim(),
          desc_short: values.desc_short?.trim() || null,
          logo: addLogoUrl,
          introduction: values.introduction?.trim() || null,
        }),
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('新增成功')
        handleAddSuccess()
      } else {
        message.error(json.errmsg || '新增失败')
      }
    } catch {
      // validateFields 失败
    } finally {
      setAddLoading(false)
    }
  }

  // ---- 企业形象图片（编辑场景） ----

  const fetchCompanyImages = async (companyId: number) => {
    setImagesLoading(true)
    try {
      const res = await adminFetch(`${API_BASE}/admin/company/imgList?company_id=${companyId}`)
      const json = await res.json()
      if (json.errno === 0) {
        // 兼容两种返回格式：data 直接是数组 / data.data 是数组
        const list: CompanyImageItem[] = Array.isArray(json.data)
          ? json.data
          : Array.isArray(json.data?.data)
            ? json.data.data
            : []
        list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        setCompanyImages(list)
      } else {
        message.error(json.errmsg || '加载企业形象失败')
      }
    } catch (e: any) {
      message.error(e.message || '网络请求失败')
    } finally {
      setImagesLoading(false)
    }
  }

  const handleCompanyImageUpload = async (file: File, companyId: number) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片大小不能超过 5MB')
      return
    }
    if (companyImages.length >= 16) {
      message.error('最多只能上传 16 张通用照片')
      return
    }
    setImageUploading(true)
    try {
      const url = await uploadImageToOss(file, 'company')
      const formData = new FormData()
      formData.append('company_id', String(companyId))
      formData.append('url', url)
      formData.append('sort', String(companyImages.length + 1))
      const res = await adminFetch(`${API_BASE}/admin/company/imgPut`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('上传成功')
        await fetchCompanyImages(companyId)
      } else {
        message.error(json.errmsg || '保存企业形象失败')
      }
    } catch (e: any) {
      message.error('上传失败：' + (e.message || '未知错误'))
    } finally {
      setImageUploading(false)
    }
  }

  // ---- 企业通用福利标签 ----

  const fetchCompanyBenefits = async (companyId: number) => {
    setBenefitsLoading(true)
    try {
      const res = await adminFetch(`${API_BASE}/admin/benefits/listCompany?company_id=${companyId}`)
      const json = await res.json()
      if (json.errno === 0) {
        const list: CompanyBenefit[] = Array.isArray(json.data)
          ? json.data
          : Array.isArray(json.data?.data)
            ? json.data.data
            : []
        list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        setCompanyBenefits(list)
      } else {
        message.error(json.errmsg || '加载福利标签失败')
      }
    } catch (e: any) {
      message.error(e.message || '网络请求失败')
    } finally {
      setBenefitsLoading(false)
    }
  }

  const handleAddCompanyBenefit = async (companyId: number) => {
    const label = benefitInputValue.trim()
    if (!label) {
      setBenefitInputVisible(false)
      setBenefitInputValue('')
      return
    }
    if (label.length < 2 || label.length > 8) {
      message.error('标签长度 2-8 个字符')
      return
    }
    if (companyBenefits.length >= 8) {
      message.error('最多只能添加 8 个福利标签')
      setBenefitInputVisible(false)
      setBenefitInputValue('')
      return
    }
    setBenefitAdding(true)
    try {
      const res = await adminFetch(`${API_BASE}/admin/benefits/putCompany`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          label,
          sort: companyBenefits.length,
        }),
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('添加成功')
        setBenefitInputVisible(false)
        setBenefitInputValue('')
        await fetchCompanyBenefits(companyId)
      } else {
        message.error(json.errmsg || '添加失败')
      }
    } catch (e: any) {
      message.error(e.message || '网络请求失败')
    } finally {
      setBenefitAdding(false)
    }
  }

  const handleDeleteCompanyBenefit = async (id: number, companyId: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/benefits/delCompany?id=${id}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        await fetchCompanyBenefits(companyId)
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch (e: any) {
      message.error(e.message || '网络请求失败')
    }
  }

  const handleCompanyImageDelete = async (id: number, companyId: number) => {
    setImageDeletingId(id)
    try {
      const res = await adminFetch(`${API_BASE}/admin/company/imgDel?id=${id}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        await fetchCompanyImages(companyId)
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch (e: any) {
      message.error(e.message || '网络请求失败')
    } finally {
      setImageDeletingId(null)
    }
  }

  // ---- 编辑 ----

  const openEditDialog = (record: CompanyItem) => {
    setEditRecord(record)
    setEditLogoUrl(record.logo || '')
    editForm.setFieldsValue({
      name: record.name,
      name_short: record.name_short || '',
      desc_short: record.desc_short || '',
      introduction: record.introduction || '',
    })
    fetchCompanyImages(record.id)
    fetchCompanyBenefits(record.id)
  }

  const closeEditDialog = () => {
    setEditRecord(null)
    editForm.resetFields()
    setEditLogoUrl('')
    setCompanyImages([])
    setCompanyBenefits([])
    setBenefitInputVisible(false)
    setBenefitInputValue('')
  }

  const handleEditLogoUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片大小不能超过 5MB')
      return
    }
    setEditUploading(true)
    try {
      const url = await uploadImageToOss(file, 'company')
      setEditLogoUrl(url)
    } catch (err: any) {
      message.error('Logo 上传失败：' + (err.message || '未知错误'))
    } finally {
      setEditUploading(false)
    }
  }

  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields()
      setEditLoading(true)
      const res = await adminFetch(`${API_BASE}/admin/company/put`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editRecord!.id,
          name: values.name?.trim(),
          name_short: values.name_short?.trim(),
          desc_short: values.desc_short?.trim() || null,
          logo: editLogoUrl,
          introduction: values.introduction?.trim() || null,
        }),
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('编辑成功')
        closeEditDialog()
        fetchCompanies(currentPage)
      } else {
        message.error(json.errmsg || '编辑失败')
      }
    } catch {
      // validateFields 失败
    } finally {
      setEditLoading(false)
    }
  }

  // ---- 表格列 ----

  const columns: ColumnsType<CompanyItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70,
      fixed: 'left',
      align: 'center',
    },
    {
      title: 'Logo',
      dataIndex: 'logo',
      key: 'logo',
      width: 70,
      align: 'center',
      render: (logo: string) =>
        logo ? (
          <img src={logo} alt="logo" className="company-logo-img" />
        ) : (
          <span style={{ color: '#999' }}>-</span>
        ),
    },
    {
      title: '企业名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string) => (
        <a onClick={() => setDetailContent({ title: '企业名称', content: name })}>{name}</a>
      ),
    },
    {
      title: '企业简称',
      dataIndex: 'name_short',
      key: 'name_short',
      width: 120,
      render: (v: string | null) => v || '-',
    },
    {
      title: '短简介',
      dataIndex: 'desc_short',
      key: 'desc_short',
      width: 180,
      render: (v: string | null) =>
        v ? (
          <a onClick={() => setDetailContent({ title: '短简介', content: v })}>
            {v.length > 20 ? v.slice(0, 20) + '...' : v}
          </a>
        ) : (
          '-'
        ),
    },
    {
      title: '企业介绍',
      dataIndex: 'introduction',
      key: 'introduction',
      width: 120,
      render: (v: string | null) =>
        v ? (
          <a onClick={() => setDetailContent({ title: '企业介绍', content: v })}>
            <EyeOutlined /> 查看介绍
          </a>
        ) : (
          '-'
        ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150,
      render: (v: string | null) =>
        v ? (
          <a onClick={() => setDetailContent({ title: '备注', content: v })}>
            {v.length > 20 ? v.slice(0, 20) + '...' : v}
          </a>
        ) : (
          '-'
        ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      align: 'center',
      render: (_: unknown, record: CompanyItem) => (
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => openEditDialog(record)}
        >
          编辑
        </Button>
      ),
    },
  ]

  // ---- Logo 上传 UI（新增 & 编辑共用） ----

  const renderLogoLabel = (
    uploading: boolean,
    onUpload: (file: File) => void,
  ) => (
    <Space size={10} align="center">
      <span>品牌Logo</span>
      <Upload
        showUploadList={false}
        beforeUpload={(file) => { onUpload(file); return false }}
        accept="image/*"
        disabled={uploading}
      >
        <a className={uploading ? 'brand-logo-upload-link disabled' : 'brand-logo-upload-link'}>
          {uploading ? <><LoadingOutlined /> 上传中</> : '上传'}
        </a>
      </Upload>
    </Space>
  )

  const renderLogoPreviewBox = (logoUrl: string) => (
    <div className="brand-logo-box">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt="品牌Logo"
          preview={{
            mask: (
              <span>
                <EyeOutlined style={{ marginInlineEnd: 4 }} />
                预览
              </span>
            ),
          }}
        />
      ) : (
        <div className="brand-logo-empty" />
      )}
    </div>
  )

  // ---- 企业通用福利标签 UI ----

  const renderBenefitsArea = (companyId: number) => (
    <div className="company-benefits-area">
      {benefitsLoading && companyBenefits.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>加载中...</Typography.Text>
      ) : (
        <Space size={[8, 8]} wrap>
          {companyBenefits.map((b) => (
            <Tag
              key={b.id}
              closable
              onClose={(e) => {
                e.preventDefault()
                handleDeleteCompanyBenefit(b.id, companyId)
              }}
              style={{ padding: '4px 10px', fontSize: 13, margin: 0 }}
            >
              {b.label}
            </Tag>
          ))}
          {benefitInputVisible ? (
            <Input
              ref={benefitInputRef}
              type="text"
              size="small"
              style={{ width: 120 }}
              value={benefitInputValue}
              maxLength={8}
              onChange={(e) => setBenefitInputValue(e.target.value)}
              onBlur={() => handleAddCompanyBenefit(companyId)}
              onPressEnter={() => handleAddCompanyBenefit(companyId)}
              disabled={benefitAdding}
              placeholder="2-8 字符"
            />
          ) : companyBenefits.length < 8 ? (
            <Tag
              onClick={() => {
                setBenefitInputVisible(true)
                setTimeout(() => benefitInputRef.current?.focus(), 0)
              }}
              style={{
                cursor: 'pointer',
                padding: '4px 10px',
                fontSize: 13,
                borderStyle: 'dashed',
                background: 'transparent',
                margin: 0,
              }}
            >
              <PlusOutlined /> 新增
            </Tag>
          ) : null}
        </Space>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-tertiary, #999)', marginTop: 6 }}>
        已添加 {companyBenefits.length} / 8，单个标签 2-8 字符
      </div>
    </div>
  )

  // ---- 企业形象图片 UI（仅编辑场景） ----

  const renderCompanyImagesArea = (companyId: number) => (
    <div className="company-images-area">
      <Image.PreviewGroup>
        <div className="company-images-grid">
          {companyImages.map((img) => (
            <div className="company-image-item" key={img.id}>
              <Image
                src={img.url}
                alt={`企业形象 #${img.sort}`}
                preview={{
                  mask: (
                    <span>
                      <EyeOutlined style={{ marginInlineEnd: 4 }} />
                      预览
                    </span>
                  ),
                }}
              />
              <Popconfirm
                title="删除该图片？"
                description="删除后不可恢复"
                onConfirm={() => handleCompanyImageDelete(img.id, companyId)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true, loading: imageDeletingId === img.id }}
              >
                <Button
                  className="company-image-delete-btn"
                  size="small"
                  danger
                  type="primary"
                  shape="circle"
                  icon={<DeleteOutlined />}
                  loading={imageDeletingId === img.id}
                />
              </Popconfirm>
            </div>
          ))}
          {companyImages.length < 16 && (
            <Upload
              showUploadList={false}
              beforeUpload={(file) => { handleCompanyImageUpload(file, companyId); return false }}
              accept="image/*"
              disabled={imageUploading}
            >
              <button
                type="button"
                className="company-image-add"
                disabled={imageUploading}
                style={{ cursor: imageUploading ? 'not-allowed' : 'pointer' }}
              >
                {imageUploading ? (
                  <>
                    <LoadingOutlined style={{ fontSize: 22 }} />
                    <span>上传中...</span>
                  </>
                ) : (
                  <>
                    <PlusOutlined style={{ fontSize: 22 }} />
                    <span>添加图片</span>
                  </>
                )}
              </button>
            </Upload>
          )}
        </div>
      </Image.PreviewGroup>
      <Typography.Text
        type={!imagesLoading && companyImages.length < 2 ? 'warning' : 'secondary'}
        className="company-images-tip"
      >
        {imagesLoading
          ? '加载中...'
          : `已上传 ${companyImages.length} 张（要求 2-16 张），单张不超过 5MB`}
      </Typography.Text>
    </div>
  )

  return (
    <div className="company-list-page">
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={10}>
          <BankOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>企业列表</Typography.Title>
        </Flex>
        <Space>
          <Typography.Text type="secondary">共 {total} 家企业</Typography.Text>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setShowAddDialog(true)}
          >
            新增企业
          </Button>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => fetchCompanies(currentPage)}
            disabled={loading}
          >
            刷新
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert
          type="error"
          message={error}
          closable
          onClose={() => setError('')}
          style={{ marginBottom: 16 }}
        />
      )}

      <Table<CompanyItem>
        columns={columns}
        dataSource={companies}
        rowKey="id"
        loading={loading}
        scroll={{ x: 800 }}
        pagination={{
          current: currentPage,
          total,
          pageSize,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, newPageSize) => {
            if (newPageSize !== pageSize) {
              setPageSize(newPageSize)
              fetchCompanies(1, newPageSize)
            } else {
              fetchCompanies(page)
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
        title={detailContent?.title}
        open={!!detailContent}
        onCancel={() => setDetailContent(null)}
        footer={null}
        width={480}
      >
        <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.8 }}>
          {detailContent?.content}
        </p>
      </Modal>

      {/* 新增企业/品牌弹窗 */}
      <Modal
        title="新增企业/品牌"
        open={showAddDialog}
        onCancel={() => {
          setShowAddDialog(false)
          addForm.resetFields()
          setAddLogoUrl('')
        }}
        onOk={handleAddSubmit}
        okText="确认新增"
        cancelText="取消"
        confirmLoading={addLoading}
        okButtonProps={{ disabled: !addLogoUrl || addUploading }}
        width={560}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="企业/品牌全称"
            name="name"
            rules={[
              { required: true, message: '请输入企业/品牌全称' },
              { min: 1, max: 36, message: '长度 1-36 个字符' },
            ]}
          >
            <Input placeholder="请输入企业/品牌全称" maxLength={36} showCount />
          </Form.Item>
          <Form.Item
            label="对外品牌名"
            name="name_short"
            rules={[
              { required: true, message: '请输入对外品牌名' },
              { min: 1, max: 12, message: '长度 1-12 个字符' },
            ]}
          >
            <Input placeholder="请输入对外品牌名" maxLength={12} showCount />
          </Form.Item>
          <Form.Item label={renderLogoLabel(addUploading, handleAddLogoUpload)} required>
            {renderLogoPreviewBox(addLogoUrl)}
          </Form.Item>
          <Form.Item label="品牌状态">
            <Select value={1} disabled options={[{ value: 1, label: '启用' }]} />
          </Form.Item>

          <Divider dashed style={{ margin: '12px 0 20px' }} />

          <Form.Item label="企业标签">
            <Space size={12} style={{ display: 'flex' }}>
              <Checkbox disabled style={{ flex: 1 }}>知名品牌</Checkbox>
              <Checkbox disabled defaultChecked style={{ flex: 1 }}>已认证</Checkbox>
            </Space>
          </Form.Item>
          <Form.Item
            label="企业介绍"
            name="introduction"
            rules={[
              { required: true, message: '请输入企业介绍' },
              { min: 1, max: 400, message: '长度 1-400 个字符' },
            ]}
          >
            <Input.TextArea placeholder="请输入企业介绍" rows={4} maxLength={400} showCount />
          </Form.Item>
          <Form.Item
            label="短简介"
            name="desc_short"
            rules={[
              { required: true, message: '请输入短简介' },
              { min: 1, max: 16, message: '长度 1-16 个字符' },
            ]}
          >
            <Input.TextArea placeholder="请输入企业短简介" rows={2} maxLength={16} showCount />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑企业/品牌弹窗 */}
      <Modal
        title="编辑企业/品牌"
        open={!!editRecord}
        onCancel={closeEditDialog}
        onOk={handleEditSubmit}
        okText="保存修改"
        cancelText="取消"
        confirmLoading={editLoading}
        okButtonProps={{ disabled: editUploading }}
        width={560}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="企业/品牌全称"
            name="name"
            rules={[
              { required: true, message: '请输入企业/品牌全称' },
              { min: 1, max: 36, message: '长度 1-36 个字符' },
            ]}
          >
            <Input placeholder="请输入企业/品牌全称" maxLength={36} showCount />
          </Form.Item>
          <Form.Item
            label="对外品牌名"
            name="name_short"
            rules={[
              { required: true, message: '请输入对外品牌名' },
              { min: 1, max: 12, message: '长度 1-12 个字符' },
            ]}
          >
            <Input placeholder="请输入对外品牌名" maxLength={12} showCount />
          </Form.Item>
          <Form.Item label={renderLogoLabel(editUploading, handleEditLogoUpload)}>
            {renderLogoPreviewBox(editLogoUrl)}
          </Form.Item>
          <Form.Item label="品牌状态">
            <Select value={1} disabled options={[{ value: 1, label: '启用' }]} />
          </Form.Item>

          <Divider dashed style={{ margin: '12px 0 20px' }} />

          <Form.Item label="企业标签">
            <Space size={12} style={{ display: 'flex' }}>
              <Checkbox disabled style={{ flex: 1 }}>知名品牌</Checkbox>
              <Checkbox disabled defaultChecked style={{ flex: 1 }}>已认证</Checkbox>
            </Space>
          </Form.Item>
          <Form.Item
            label="企业介绍"
            name="introduction"
            rules={[
              { required: true, message: '请输入企业介绍' },
              { min: 1, max: 400, message: '长度 1-400 个字符' },
            ]}
          >
            <Input.TextArea placeholder="请输入企业介绍" rows={4} maxLength={400} showCount />
          </Form.Item>
          <Form.Item
            label="短简介"
            name="desc_short"
            rules={[
              { required: true, message: '请输入短简介' },
              { min: 1, max: 16, message: '长度 1-16 个字符' },
            ]}
          >
            <Input.TextArea placeholder="请输入企业短简介" rows={2} maxLength={16} showCount />
          </Form.Item>

          <Divider dashed style={{ margin: '12px 0 20px' }} />

          <Form.Item label="企业通用福利标签">
            {editRecord && renderBenefitsArea(editRecord.id)}
          </Form.Item>
          <Form.Item
            label={
              <Space size={10} align="center">
                <span>通用照片</span>
              </Space>
            }
          >
            {editRecord && renderCompanyImagesArea(editRecord.id)}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CompanyListPage
