import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Cascader,
  Alert, Space, message, Popconfirm, Tag, Upload, Image, Flex, Typography,
  Divider,
} from 'antd'
import type { InputRef } from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  LoadingOutlined, EnvironmentOutlined, ShopOutlined, ReloadOutlined,
  CheckCircleFilled, EyeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { uploadImageToOss } from '../utils/ossUpload'
import './ShopListPage.scss'

import { adminFetch, API_BASE } from '../utils/adminFetch'
const TENCENT_MAP_KEY = 'MMTBZ-FFMCL-SY6PC-E5SVR-BNGDH-7VFLU'

// 店长头像裁剪至指定正方形尺寸
async function resizeAvatarToSquare(file: File, size: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 不可用'))
        return
      }
      const side = Math.min(img.width, img.height)
      const sx = (img.width - side) / 2
      const sy = (img.height - side) / 2
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
      const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg'
      const mime = isJpeg ? 'image/jpeg' : 'image/png'
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('图片处理失败'))
          return
        }
        const ext = isJpeg ? 'jpg' : 'png'
        resolve(new File([blob], `avatar_${Date.now()}.${ext}`, { type: mime }))
      }, mime, 0.92)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

// ---- JSONP 工具 ----
function jsonp(url: string, params: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(params).toString()
    const callbackName = `jsonp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const script = document.createElement('script')
    const fullUrl = `${url}?${qs}&callback=${callbackName}`

    const cleanup = () => {
      delete (window as any)[callbackName]
      script.remove()
    }

    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('请求超时'))
    }, 10000)

    ;(window as any)[callbackName] = (data: any) => {
      clearTimeout(timer)
      cleanup()
      resolve(data)
    }

    script.src = fullUrl
    script.onerror = () => {
      clearTimeout(timer)
      cleanup()
      reject(new Error('JSONP 请求失败'))
    }
    document.head.appendChild(script)
  })
}

// ---- 腾讯地图地点搜索（返回候选列表）----
interface MapSuggestion {
  title: string
  address: string
  location: { lat: number; lng: number }
  province: string
  city: string
  district: string
}

async function searchPlaceSuggestions(keyword: string): Promise<MapSuggestion[]> {
  const qs = new URLSearchParams({
    keyword,
    key: TENCENT_MAP_KEY,
    output: 'json',
  }).toString()
  const res = await fetch(`https://apis.map.qq.com/ws/place/v1/suggestion?${qs}`)
  const data = await res.json()
  if (data.status !== 0) {
    throw new Error(data.message || '搜索失败')
  }
  return (data.data || []).map((item: any) => ({
    title: item.title,
    address: item.address,
    location: item.location,
    province: item.province,
    city: item.city,
    district: item.district,
  }))
}

// ---- 数据类型 ----
interface ShopItem {
  id: number
  company_id: number | null
  name: string | null
  address: string | null
  lng: number | null
  lat: number | null
  city: number | null
  status: number
  manager_id: number | null
  time: string | null
  create_time: string | null
  company_name: string | null
  manager_name: string | null
  district_id: number[] | null
  district_name: string[] | null
}

interface ShopImg {
  id: number
  shop_id: number
  url: string
  sort: number
  create_time: string | null
}

interface BenefitItem {
  id: number
  label: string
  sort: number
  shop_id: number
}

interface CompanyBenefit {
  id: number
  label: string
  sort?: number
  company_id?: number
}

interface TimeItem {
  id: number
  label: string
  sort: number
  type: number
  selected?: boolean
}

interface CompanyItem {
  id: number
  name: string | null
  name_short: string | null
}

interface CascaderOption {
  id: number
  label: string
  children?: CascaderOption[]
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

interface ManagerItem {
  id: number
  name: string | null
  avatar: string | null
  phone: string | null
  shop_id: number | null
}

const STATUS_MAP: Record<number, { text: string; color: string }> = {
  0: { text: '启用', color: 'green' },
  1: { text: '已关闭', color: 'red' },
}

function ShopListPage() {
  const [shops, setShops] = useState<ShopItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  // 下拉数据源
  const [companies, setCompanies] = useState<CompanyItem[]>([])
  const [cascaderOptions, setCascaderOptions] = useState<CascaderOption[]>([])
  const [allTimes, setAllTimes] = useState<TimeItem[]>([])

  // 编辑/新增弹窗
  const [showEdit, setShowEdit] = useState(false)
  const [editRecord, setEditRecord] = useState<ShopItem | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [editForm] = Form.useForm()

  // 店长（关联店长列表数据）
  const [editManager, setEditManager] = useState<ManagerItem | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // 相关照片（内联）
  const [shopImages, setShopImages] = useState<ShopImg[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageDeletingId, setImageDeletingId] = useState<number | null>(null)

  // 门店福利 + 企业福利（只读提示）
  const [shopBenefits, setShopBenefits] = useState<BenefitItem[]>([])
  const [benefitsLoading, setBenefitsLoading] = useState(false)
  const [benefitAdding, setBenefitAdding] = useState(false)
  const [benefitInputVisible, setBenefitInputVisible] = useState(false)
  const [benefitInputValue, setBenefitInputValue] = useState('')
  const benefitInputRef = useRef<InputRef>(null)
  const [companyBenefits, setCompanyBenefits] = useState<CompanyBenefit[]>([])

  // 面试时间（内联）
  const [selectedTimes, setSelectedTimes] = useState<number[]>([])

  const isAddMode = !editRecord

  // ---- 加载数据 ----

  const fetchShops = useCallback(async (page: number = 1, size?: number) => {
    const actualSize = size || pageSize
    setLoading(true)
    setError('')
    try {
      const res = await adminFetch(`${API_BASE}/admin/shop/list?page=${page}&size=${actualSize}`)
      const json: PageResponse<ShopItem> = await res.json()
      if (json.errno === 0) {
        setShops(json.data.data || [])
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
      const [companyRes, cascaderRes, timeRes] = await Promise.all([
        adminFetch(`${API_BASE}/admin/company/list?page=1&size=200`),
        adminFetch(`${API_BASE}/admin/city/cascader`),
        adminFetch(`${API_BASE}/admin/time/list`),
      ])
      const companyJson = await companyRes.json()
      if (companyJson.errno === 0) {
        setCompanies(companyJson.data.data || [])
      }
      const cascaderJson = await cascaderRes.json()
      if (cascaderJson.errno === 0) {
        setCascaderOptions(cascaderJson.data || [])
      }
      const timeJson = await timeRes.json()
      if (timeJson.errno === 0) {
        setAllTimes(timeJson.data || [])
      }
    } catch (e) {
      console.error('加载下拉数据失败:', e)
    }
  }, [])

  useEffect(() => {
    fetchShops(1)
    loadDropdownData()
  }, [fetchShops, loadDropdownData])

  // ---- 子项加载（编辑模式） ----

  const loadShopManager = async (shopId: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/shop/managerList?shop_id=${shopId}&page=1&size=10`)
      const json: PageResponse<ManagerItem> = await res.json()
      if (json.errno === 0) {
        const manager = (json.data?.data || [])[0] || null
        setEditManager(manager)
        editForm.setFieldsValue({
          manager_name: manager?.name || '',
          manager_phone: manager?.phone || '',
        })
      }
    } catch {
      // ignore
    }
  }

  const loadShopImages = async (shopId: number) => {
    setImagesLoading(true)
    try {
      const res = await adminFetch(`${API_BASE}/admin/shop/imgList?shop_id=${shopId}`)
      const json = await res.json()
      if (json.errno === 0) {
        const list: ShopImg[] = Array.isArray(json.data)
          ? json.data
          : (json.data?.data || [])
        list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        setShopImages(list)
      }
    } catch {
      // ignore
    } finally {
      setImagesLoading(false)
    }
  }

  const loadShopBenefits = async (shopId: number) => {
    setBenefitsLoading(true)
    try {
      const res = await adminFetch(`${API_BASE}/admin/benefits/list?shop_id=${shopId}`)
      const json = await res.json()
      if (json.errno === 0) {
        const list: BenefitItem[] = Array.isArray(json.data)
          ? json.data
          : (json.data?.data || [])
        list.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        setShopBenefits(list)
      }
    } catch {
      // ignore
    } finally {
      setBenefitsLoading(false)
    }
  }

  const loadShopTime = async (shopId: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/time/shopTime?shop_id=${shopId}`)
      const json = await res.json()
      if (json.errno === 0) {
        const selected = (json.data || [])
          .filter((t: TimeItem) => t.selected)
          .map((t: TimeItem) => t.id)
        setSelectedTimes(selected)
      }
    } catch {
      // ignore
    }
  }

  const loadCompanyBenefits = async (companyId: number) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/benefits/listCompany?company_id=${companyId}`)
      const json = await res.json()
      if (json.errno === 0) {
        const list: CompanyBenefit[] = Array.isArray(json.data)
          ? json.data
          : (json.data?.data || [])
        setCompanyBenefits(list)
      }
    } catch {
      // ignore
    }
  }

  // ---- 打开/关闭弹窗 ----

  const openEdit = (record: ShopItem) => {
    setEditRecord(record)
    editForm.setFieldsValue({
      name: record.name || '',
      company_id: record.company_id || undefined,
      address: record.address || '',
      lng: record.lng,
      lat: record.lat,
      district_id: (record.district_id && record.district_id.length > 0) ? record.district_id : undefined,
      status: record.status ?? 0,
      manager_name: '',
      manager_phone: '',
    })
    setShowEdit(true)
    if (record.id) {
      loadShopManager(record.id)
      loadShopImages(record.id)
      loadShopBenefits(record.id)
      loadShopTime(record.id)
    }
    if (record.company_id) {
      loadCompanyBenefits(record.company_id)
    }
  }

  const openAdd = () => {
    setEditRecord(null)
    editForm.resetFields()
    editForm.setFieldsValue({ status: 0 })
    setEditManager(null)
    setShopImages([])
    setShopBenefits([])
    setCompanyBenefits([])
    setSelectedTimes([])
    setShowEdit(true)
  }

  const closeEdit = () => {
    setShowEdit(false)
    setEditRecord(null)
    setEditManager(null)
    setShopImages([])
    setShopBenefits([])
    setCompanyBenefits([])
    setSelectedTimes([])
    setBenefitInputVisible(false)
    setBenefitInputValue('')
  }

  // ---- 保存 ----

  const saveShopBasic = async (values: any): Promise<number | null> => {
    const body: any = {
      name: values.name?.trim(),
      company_id: values.company_id,
      address: values.address?.trim() || null,
      lng: values.lng ?? null,
      lat: values.lat ?? null,
      district: values.district_id?.length ? values.district_id : null,
      status: values.status ?? 0,
      time: selectedTimes.length ? selectedTimes.join(',') : null,
    }
    if (editRecord) body.id = editRecord.id

    const res = await adminFetch(`${API_BASE}/admin/shop/put`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.errno !== 0) {
      throw new Error(json.errmsg || '保存门店失败')
    }
    if (editRecord) return editRecord.id
    const newId = json.data?.id ?? json.data?.data?.id ?? null
    return typeof newId === 'number' ? newId : null
  }

  const saveManager = async (shopId: number, values: any) => {
    const name = (values.manager_name || '').trim()
    const phone = (values.manager_phone || '').trim()
    const avatar = editManager?.avatar || ''
    // 无任何店长信息时跳过保存
    if (!name && !phone && !avatar && !editManager?.id) return

    const body = new FormData()
    body.append('name', name)
    body.append('phone', phone)
    body.append('shop_id', String(shopId))
    body.append('avatar', avatar)
    if (editManager?.id) body.append('id', String(editManager.id))

    const res = await adminFetch(`${API_BASE}/admin/shop/managerPut`, {
      method: 'POST',
      body,
    })
    const json = await res.json()
    if (json.errno !== 0) {
      throw new Error(json.errmsg || '保存店长失败')
    }
  }

  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields()
      setEditLoading(true)
      const shopId = await saveShopBasic(values)
      if (shopId) {
        try {
          await saveManager(shopId, values)
        } catch (e: any) {
          message.warning('门店已保存，但店长信息保存失败：' + (e?.message || '未知错误'))
          closeEdit()
          fetchShops(currentPage)
          return
        }
      }
      message.success(editRecord ? '保存成功' : '新增成功')
      closeEdit()
      fetchShops(currentPage)
    } catch (e: any) {
      if (e?.errorFields) return // validateFields 失败
      message.error(e?.message || '保存失败')
    } finally {
      setEditLoading(false)
    }
  }

  // ---- 头像上传 ----

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片大小不能超过 5MB')
      return
    }
    setAvatarUploading(true)
    try {
      const resized = await resizeAvatarToSquare(file, 200)
      const url = await uploadImageToOss(resized, 'avatar')
      setEditManager((prev) =>
        prev
          ? { ...prev, avatar: url }
          : { id: 0, name: null, avatar: url, phone: null, shop_id: null }
      )
    } catch (err: any) {
      message.error('头像上传失败：' + (err.message || '未知错误'))
    } finally {
      setAvatarUploading(false)
    }
  }

  // ---- 门店状态关闭二次确认 ----

  const handleStatusChange = (v: number) => {
    if (v === 1) {
      Modal.confirm({
        title: '确认关闭门店？',
        content: '关闭后该门店将无法在小程序端被查询到，确定继续？',
        okText: '确认关闭',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => editForm.setFieldsValue({ status: 1 }),
        onCancel: () => editForm.setFieldsValue({ status: 0 }),
      })
    } else {
      editForm.setFieldsValue({ status: v })
    }
  }

  // ---- 相关照片（内联操作） ----

  const handleShopImageUpload = async (file: File) => {
    if (!editRecord) return
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片大小不能超过 5MB')
      return
    }
    if (shopImages.length >= 16) {
      message.error('最多只能上传 16 张照片')
      return
    }
    setImageUploading(true)
    try {
      const url = await uploadImageToOss(file, 'shop')
      const res = await adminFetch(`${API_BASE}/admin/shop/imgPut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: editRecord.id, url }),
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('上传成功')
        loadShopImages(editRecord.id)
      } else {
        message.error(json.errmsg || '保存失败')
      }
    } catch (err: any) {
      message.error('上传失败：' + (err.message || '未知错误'))
    } finally {
      setImageUploading(false)
    }
  }

  const handleShopImageDelete = async (imgId: number) => {
    if (!editRecord) return
    setImageDeletingId(imgId)
    try {
      const res = await adminFetch(`${API_BASE}/admin/shop/imgDel?id=${imgId}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        loadShopImages(editRecord.id)
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch {
      message.error('删除请求失败')
    } finally {
      setImageDeletingId(null)
    }
  }

  // ---- 门店福利（内联操作） ----

  const handleAddShopBenefit = async () => {
    if (!editRecord) return
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
    if (shopBenefits.length >= 8) {
      message.error('最多只能添加 8 个福利标签')
      setBenefitInputVisible(false)
      setBenefitInputValue('')
      return
    }
    setBenefitAdding(true)
    try {
      const res = await adminFetch(`${API_BASE}/admin/benefits/put`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: editRecord.id,
          label,
          sort: shopBenefits.length,
        }),
      })
      const json = await res.json()
      if (json.errno === 0) {
        message.success('添加成功')
        setBenefitInputVisible(false)
        setBenefitInputValue('')
        loadShopBenefits(editRecord.id)
      } else {
        message.error(json.errmsg || '添加失败')
      }
    } catch (e: any) {
      message.error(e?.message || '网络请求失败')
    } finally {
      setBenefitAdding(false)
    }
  }

  const handleDeleteShopBenefit = async (id: number) => {
    if (!editRecord) return
    try {
      const res = await adminFetch(`${API_BASE}/admin/benefits/del?id=${id}`)
      const json = await res.json()
      if (json.errno === 0) {
        message.success('删除成功')
        loadShopBenefits(editRecord.id)
      } else {
        message.error(json.errmsg || '删除失败')
      }
    } catch {
      message.error('删除请求失败')
    }
  }

  // ---- 腾讯地图选点 ----
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const [pickedLng, setPickedLng] = useState<number | null>(null)
  const [pickedLat, setPickedLat] = useState<number | null>(null)

  const loadTencentMap = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if ((window as any).TMap) {
        resolve()
        return
      }
      const script = document.createElement('script')
      script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${TENCENT_MAP_KEY}`
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('地图 SDK 加载失败'))
      document.head.appendChild(script)
    })
  }, [])

  const openMapPicker = async () => {
    const curLng = editForm.getFieldValue('lng')
    const curLat = editForm.getFieldValue('lat')
    setPickedLng(curLng ?? null)
    setPickedLat(curLat ?? null)
    setShowMapPicker(true)

    try {
      await loadTencentMap()
      setMapReady(true)
      setTimeout(() => {
        if (!mapRef.current || !(window as any).TMap) return
        const TMap = (window as any).TMap
        const center = curLng && curLat
          ? new TMap.LatLng(curLat, curLng)
          : new TMap.LatLng(39.984104, 116.307503)
        const map = new TMap.Map(mapRef.current, {
          center,
          zoom: 13,
        })
        mapInstanceRef.current = map

        if (curLng && curLat) {
          const marker = new TMap.MultiMarker({
            map,
            geometries: [{
              id: 'picked',
              position: new TMap.LatLng(curLat, curLng),
            }],
          })
          markerRef.current = marker
        }

        map.on('click', (evt: any) => {
          const { lat, lng } = evt.latLng
          setPickedLat(lat)
          setPickedLng(lng)
          if (markerRef.current) {
            markerRef.current.setGeometries([{
              id: 'picked',
              position: new TMap.LatLng(lat, lng),
            }])
          } else {
            markerRef.current = new TMap.MultiMarker({
              map,
              geometries: [{
                id: 'picked',
                position: new TMap.LatLng(lat, lng),
              }],
            })
          }
        })
      }, 200)
    } catch (err: any) {
      message.error('地图加载失败：' + (err.message || '未知错误'))
    }
  }

  const confirmMapPick = () => {
    if (pickedLng !== null && pickedLat !== null) {
      editForm.setFieldsValue({ lng: pickedLng, lat: pickedLat })
      message.success(`已选坐标：${pickedLng}, ${pickedLat}`)
    }
    setShowMapPicker(false)
    setMapReady(false)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy()
      mapInstanceRef.current = null
    }
    markerRef.current = null
  }

  const cancelMapPick = () => {
    setShowMapPicker(false)
    setMapReady(false)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy()
      mapInstanceRef.current = null
    }
    markerRef.current = null
  }

  // 地图搜索 - 实时联想
  const [mapSearchText, setMapSearchText] = useState('')
  const [suggestions, setSuggestions] = useState<MapSuggestion[]>([])
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMapInputChange = (value: string) => {
    setMapSearchText(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!value.trim()) {
      setSuggestions([])
      return
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const list = await searchPlaceSuggestions(value.trim())
        setSuggestions(list.slice(0, 8))
      } catch {
        setSuggestions([])
      }
    }, 300)
  }

  const handleSelectSuggestion = (item: MapSuggestion) => {
    const { lng, lat } = item.location
    setPickedLng(lng)
    setPickedLat(lat)
    setSuggestions([])
    setMapSearchText(item.title)
    if (mapInstanceRef.current && (window as any).TMap) {
      const TMap = (window as any).TMap
      mapInstanceRef.current.setCenter(new TMap.LatLng(lat, lng))
      mapInstanceRef.current.setZoom(16)
      if (markerRef.current) {
        markerRef.current.setGeometries([{
          id: 'picked',
          position: new TMap.LatLng(lat, lng),
        }])
      } else {
        markerRef.current = new TMap.MultiMarker({
          map: mapInstanceRef.current,
          geometries: [{
            id: 'picked',
            position: new TMap.LatLng(lat, lng),
          }],
        })
      }
    }
  }

  // ---- 表格列 ----

  const cascaderData = cascaderOptions.map((city) => ({
    value: city.id,
    label: city.label,
    children: (city.children || []).map((child) => ({
      value: child.id,
      label: child.label,
    })),
  }))

  const columns: ColumnsType<ShopItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      fixed: 'left',
      align: 'center',
    },
    {
      title: '门店名称',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (v: string | null) => v || <span style={{ color: '#999' }}>未填写</span>,
    },
    {
      title: '所属企业',
      dataIndex: 'company_name',
      key: 'company_name',
      width: 160,
      render: (v: string | null) => v || '-',
    },
    {
      title: '商圈',
      dataIndex: 'district_name',
      key: 'district_name',
      width: 140,
      render: (v: string[] | null) => v ? v.join(' / ') : '-',
    },
    {
      title: '地址',
      dataIndex: 'address',
      key: 'address',
      width: 140,
      render: (v: string | null) => v || '-',
    },
    {
      title: '店长',
      dataIndex: 'manager_name',
      key: 'manager_name',
      width: 90,
      render: (v: string | null) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (v: number) => {
        const info = STATUS_MAP[v] || { text: '未知', color: 'default' }
        return <Tag color={info.color}>{info.text}</Tag>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'create_time',
      key: 'create_time',
      width: 160,
      render: (v: string | null) => v || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      align: 'center',
      render: (_: unknown, record: ShopItem) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
          编辑
        </Button>
      ),
    },
  ]

  const timeGroups = [
    { type: 1, label: '上午', times: allTimes.filter((t) => t.type === 1) },
    { type: 2, label: '下午', times: allTimes.filter((t) => t.type === 2) },
    { type: 3, label: '晚上', times: allTimes.filter((t) => t.type === 3) },
  ]

  // ---- 内联 UI 片段 ----

  const renderAvatarLabel = () => (
    <Space size={10} align="center">
      <span>店长头像</span>
      <Upload
        showUploadList={false}
        beforeUpload={(file) => { handleAvatarUpload(file); return false }}
        accept="image/*"
        disabled={avatarUploading}
      >
        <a className={avatarUploading ? 'shop-upload-link disabled' : 'shop-upload-link'}>
          {avatarUploading ? <><LoadingOutlined /> 上传中</> : '上传'}
        </a>
      </Upload>
    </Space>
  )

  const renderAvatarBox = () => (
    <div className="shop-avatar-box">
      {editManager?.avatar ? (
        <Image
          src={editManager.avatar}
          alt="店长头像"
          preview={{
            mask: <span><EyeOutlined style={{ marginInlineEnd: 4 }} /> 预览</span>,
          }}
        />
      ) : (
        <div className="shop-avatar-empty" />
      )}
    </div>
  )

  const renderBenefitsLabel = () => (
    <Flex align="center" gap={12} wrap="wrap">
      <span>门店福利标签</span>
      {companyBenefits.length > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          已有企业福利：{companyBenefits.map((b) => b.label).join('、')}
        </Typography.Text>
      )}
    </Flex>
  )

  const renderBenefitsArea = () => (
    <div className="shop-benefits-area">
      <Space size={[8, 8]} wrap>
        {shopBenefits.map((b) => (
          <Tag
            key={b.id}
            closable
            onClose={(e) => {
              e.preventDefault()
              handleDeleteShopBenefit(b.id)
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
            onBlur={handleAddShopBenefit}
            onPressEnter={handleAddShopBenefit}
            disabled={benefitAdding}
            placeholder="2-8 字符"
          />
        ) : shopBenefits.length < 8 ? (
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
      <div className="shop-field-hint">
        {benefitsLoading ? '加载中...' : `已添加 ${shopBenefits.length} / 8，单个标签 2-8 字符`}
      </div>
    </div>
  )

  const renderImagesLabel = () => (
    <Space size={10} align="center">
      <span>相关照片</span>
      {!!editRecord && shopImages.length < 16 && (
        <Upload
          showUploadList={false}
          beforeUpload={(file) => { handleShopImageUpload(file); return false }}
          accept="image/*"
          disabled={imageUploading}
        >
          <a className={imageUploading ? 'shop-upload-link disabled' : 'shop-upload-link'}>
            {imageUploading ? <><LoadingOutlined /> 上传中</> : '上传'}
          </a>
        </Upload>
      )}
    </Space>
  )

  const renderImagesArea = () => (
    <div className="shop-images-area">
      <Image.PreviewGroup>
        <div className="shop-images-grid">
          {shopImages.map((img) => (
            <div className="shop-image-item" key={img.id}>
              <Image
                src={img.url}
                alt="门店照片"
                preview={{
                  mask: <span><EyeOutlined style={{ marginInlineEnd: 4 }} /> 预览</span>,
                }}
              />
              <Popconfirm
                title="删除该照片？"
                onConfirm={() => handleShopImageDelete(img.id)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true, loading: imageDeletingId === img.id }}
              >
                <Button
                  className="shop-image-delete-btn"
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
          {shopImages.length === 0 && (
            <>
              <div className="shop-image-placeholder" />
              <div className="shop-image-placeholder" />
              <div className="shop-image-placeholder" />
            </>
          )}
        </div>
      </Image.PreviewGroup>
      <div className={`shop-field-hint ${!imagesLoading && shopImages.length < 2 ? 'warning' : ''}`}>
        {imagesLoading ? '加载中...' : `已上传 ${shopImages.length} 张（要求 2-16 张），单张不超过 5MB`}
      </div>
    </div>
  )

  const renderTimeConfig = () => (
    <div className="shop-time-config">
      {timeGroups.map((group) => (
        <div key={group.type} className="shop-time-group">
          <div className="shop-time-group-title">{group.label}</div>
          <div className="shop-time-tags">
            {group.times.map((t) => {
              const isSelected = selectedTimes.includes(t.id)
              return (
                <Tag.CheckableTag
                  key={t.id}
                  checked={isSelected}
                  onChange={() => {
                    setSelectedTimes((prev) =>
                      isSelected ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                    )
                  }}
                >
                  {t.label}
                </Tag.CheckableTag>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )

  const lngLatValue = Form.useWatch(['lng'], editForm)
  const latValue = Form.useWatch(['lat'], editForm)
  const hasCoords = lngLatValue != null && latValue != null

  return (
    <div className="shop-list-page">
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Flex align="center" gap={10}>
          <ShopOutlined style={{ fontSize: 22 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>门店列表</Typography.Title>
        </Flex>
        <Space>
          <Typography.Text type="secondary">共 {total} 家门店</Typography.Text>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            新增门店
          </Button>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => fetchShops(currentPage)}
            disabled={loading}
          >
            刷新
          </Button>
        </Space>
      </Flex>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError('')} style={{ marginBottom: 16 }} />
      )}

      <Table<ShopItem>
        columns={columns}
        dataSource={shops}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: currentPage,
          total,
          pageSize,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (page, newPageSize) => {
            if (newPageSize !== pageSize) {
              setPageSize(newPageSize)
              fetchShops(1, newPageSize)
            } else {
              fetchShops(page)
            }
          },
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50'],
        }}
        size="middle"
      />

      {/* 新增/编辑门店弹窗 */}
      <Modal
        title={editRecord ? '编辑门店' : '新增门店'}
        open={showEdit}
        onCancel={closeEdit}
        onOk={handleEditSubmit}
        okText={editRecord ? '保存' : '确认新增'}
        cancelText="取消"
        confirmLoading={editLoading}
        destroyOnClose
        width={560}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="所属企业"
            name="company_id"
            rules={[{ required: true, message: '请选择所属企业' }]}
          >
            <Select placeholder="请选择所属企业" showSearch optionFilterProp="children">
              {companies.filter((c) => c.name).map((c) => (
                <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="门店名称"
            name="name"
            rules={[
              { required: true, message: '请输入门店名称' },
              { min: 1, max: 12, message: '长度 1-12 个字符' },
            ]}
          >
            <Input placeholder="请输入" maxLength={12} showCount />
          </Form.Item>
          <Form.Item label="门店状态" name="status">
            <Select onChange={handleStatusChange}>
              <Select.Option value={0}>启用</Select.Option>
              <Select.Option value={1}>已关闭</Select.Option>
            </Select>
          </Form.Item>

          <Divider dashed style={{ margin: '12px 0 20px' }} />

          <Form.Item
            label="店长称呼"
            name="manager_name"
            rules={[
              {
                validator: (_, v) => {
                  if (!v) return Promise.resolve()
                  if (v.length >= 1 && v.length <= 8) return Promise.resolve()
                  return Promise.reject(new Error('长度 1-8 个字符'))
                },
              },
            ]}
          >
            <Input placeholder="请输入店长称呼" maxLength={8} showCount />
          </Form.Item>
          <Form.Item
            label="店长手机号"
            name="manager_phone"
            rules={[
              {
                validator: (_, v) => {
                  if (!v) return Promise.resolve()
                  if (/^\d{11}$/.test(v)) return Promise.resolve()
                  return Promise.reject(new Error('手机号为 11 位数字'))
                },
              },
            ]}
          >
            <Input placeholder="请输入手机号" maxLength={11} />
          </Form.Item>
          <Form.Item label={renderAvatarLabel()}>
            {renderAvatarBox()}
            <div className="shop-field-hint">自动裁剪为 200×200</div>
          </Form.Item>

          <Divider dashed style={{ margin: '12px 0 20px' }} />

          <Form.Item
            label="城市商圈"
            name="district_id"
            rules={[{ required: true, message: '请选择所在商圈' }]}
          >
            <Cascader
              options={cascaderData}
              placeholder="请选择商圈（区域 / 商圈）"
              changeOnSelect
            />
          </Form.Item>
          <Form.Item
            label="详细地址"
            name="address"
            rules={[
              { required: true, message: '请输入详细地址' },
              { min: 1, max: 36, message: '长度 1-36 个字符' },
            ]}
          >
            <Input placeholder="请输入详细地址" maxLength={36} showCount />
          </Form.Item>
          <Form.Item label="经纬度" required>
            <Form.Item name="lng" noStyle hidden><Input /></Form.Item>
            <Form.Item name="lat" noStyle hidden><Input /></Form.Item>
            <Flex align="center" gap={12}>
              <div className={`shop-coord-tip ${hasCoords ? 'selected' : ''}`}>
                {hasCoords ? (
                  <><CheckCircleFilled style={{ color: '#52c41a' }} /> 已选择</>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)' }}>未选择</span>
                )}
              </div>
              <Button
                size="small"
                icon={<EnvironmentOutlined />}
                onClick={openMapPicker}
              >
                {hasCoords ? '重新选点' : '地图选点'}
              </Button>
            </Flex>
          </Form.Item>

          {!isAddMode && (
            <>
              <Divider dashed style={{ margin: '12px 0 20px' }} />

              <Form.Item label={renderBenefitsLabel()}>
                {renderBenefitsArea()}
              </Form.Item>
              <Form.Item label={renderImagesLabel()}>
                {renderImagesArea()}
              </Form.Item>

              <Divider dashed style={{ margin: '12px 0 20px' }} />

              <Form.Item label="可面试时间配置">
                {renderTimeConfig()}
              </Form.Item>
            </>
          )}

          <Form.Item label="面试提醒">
            <Input disabled placeholder="后端接口暂未对接" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 地图选点弹窗 */}
      <Modal
        title="地图选点 - 点击地图获取经纬度"
        open={showMapPicker}
        onCancel={cancelMapPick}
        onOk={confirmMapPick}
        okText="确认选点"
        cancelText="取消"
        width={700}
        zIndex={1100}
        okButtonProps={{ disabled: pickedLng === null || pickedLat === null }}
      >
        <div style={{ marginBottom: 12, position: 'relative' }}>
          <Input
            placeholder="输入地点关键词搜索，如：三里屯"
            value={mapSearchText}
            onChange={(e) => handleMapInputChange(e.target.value)}
            onFocus={() => mapSearchText.trim() && suggestions.length === 0 && handleMapInputChange(mapSearchText)}
            allowClear
            onClear={() => setSuggestions([])}
          />
          {suggestions.length > 0 && (
            <div
              className="map-suggestion-list"
              onMouseDown={(e) => e.preventDefault()}
            >
              {suggestions.map((item, idx) => (
                <div
                  key={idx}
                  className="map-suggestion-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelectSuggestion(item)
                  }}
                >
                  <div className="suggestion-title">{item.title}</div>
                  <div className="suggestion-address">{item.province}{item.city}{item.district} {item.address}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div
          ref={mapRef}
          style={{
            width: '100%',
            height: 450,
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            background: '#f5f5f5',
          }}
        />
        {pickedLng !== null && pickedLat !== null && (
          <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
            已选坐标：经度 {pickedLng}，纬度 {pickedLat}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default ShopListPage
