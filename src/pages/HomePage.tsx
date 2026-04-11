import { useState, useEffect, useCallback } from 'react'
import { Card, Statistic, Spin, Typography, Space } from 'antd'
import {
  TeamOutlined, BankOutlined, ShopOutlined, CalendarOutlined,
  UserOutlined, TagsOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import { adminFetch, API_BASE } from '../utils/adminFetch'
import './HomePage.scss'

interface DashboardData {
  storeCount: number
  companyCount: number
  shopCount: number
  interviewCount: number
  adminCount: number
  roleCount: number
  genderDist: Record<string, number>
  tagDist: Record<string, number>
  interviewDays: { day: string; count: number }[]
  interviewTimeTypes: Record<string, number>
}

function HomePage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const [storeRes, companyRes, shopRes, applyRes, adminRes, roleRes] = await Promise.all([
        adminFetch(`${API_BASE}/admin/store/list?page=1&size=200`),
        adminFetch(`${API_BASE}/admin/company/list?page=1&size=1`),
        adminFetch(`${API_BASE}/admin/shop/list?page=1&size=1`),
        adminFetch(`${API_BASE}/admin/apply/list`),
        adminFetch(`${API_BASE}/admin/admin/list?page=1&size=1`),
        adminFetch(`${API_BASE}/admin/role/list?page=1&size=200`),
      ])

      const [storeJson, companyJson, shopJson, applyJson, adminJson, roleJson] = await Promise.all([
        storeRes.json(), companyRes.json(), shopRes.json(),
        applyRes.json(), adminRes.json(), roleRes.json(),
      ])

      const storeData = storeJson.data?.data || []
      const applyData = applyJson.data?.data || []

      const genderDist: Record<string, number> = {}
      storeData.forEach((s: any) => {
        const g = s.gender || '未知'
        genderDist[g] = (genderDist[g] || 0) + 1
      })

      const tagDist: Record<string, number> = {}
      storeData.forEach((s: any) => {
        (s.tags || []).forEach((cat: any) => {
          tagDist[cat.category] = (tagDist[cat.category] || 0) + cat.labels.length
        })
      })

      const dayMap: Record<string, number> = {}
      applyData.forEach((a: any) => {
        dayMap[a.day] = (dayMap[a.day] || 0) + 1
      })
      const interviewDays = Object.entries(dayMap)
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day))

      const interviewTimeTypes: Record<string, number> = {}
      applyData.forEach((a: any) => {
        const tt = a.time_type || '未知'
        interviewTimeTypes[tt] = (interviewTimeTypes[tt] || 0) + 1
      })

      setData({
        storeCount: storeJson.data?.count || 0,
        companyCount: companyJson.data?.count || 0,
        shopCount: shopJson.data?.count || 0,
        interviewCount: applyJson.data?.count || 0,
        adminCount: adminJson.data?.count || 0,
        roleCount: roleJson.data?.data?.length || 0,
        genderDist,
        tagDist,
        interviewDays,
        interviewTimeTypes,
      })
    } catch (e) {
      console.error('Dashboard fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const genderColors: Record<string, string> = { '男': '#4096ff', '女': '#ff85c0', '未知': '#bfbfbf' }
  const tagColors = ['#4096ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2']
  const typeColors: Record<string, string> = { '上午': '#faad14', '下午': '#13c2c2', '晚上': '#722ed1' }

  const genderOption = data ? {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c}人 ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#999' } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}人' },
      data: Object.entries(data.genderDist).map(([k, v]) => ({
        name: k, value: v,
        itemStyle: { color: genderColors[k] || '#8c8c8c' },
      })),
    }],
  } : {}

  const tagEntries = data ? Object.entries(data.tagDist) : []
  const tagOption = data ? {
    tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
    grid: { left: 20, right: 20, top: 20, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: tagEntries.map(([k]) => k),
      axisLabel: { color: '#999' },
      axisLine: { lineStyle: { color: '#e8e8e8' } },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#999' },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [{
      type: 'bar',
      data: tagEntries.map(([, v], i) => ({
        value: v,
        itemStyle: { color: tagColors[i % tagColors.length], borderRadius: [4, 4, 0, 0] },
      })),
      barWidth: 36,
    }],
  } : {}

  const interviewBarOption = data ? {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 20, right: 20, top: 30, bottom: 30, containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: data.interviewDays.map(d => d.day.slice(5)),
      axisLabel: { color: '#999', rotate: 30 },
      axisLine: { lineStyle: { color: '#e8e8e8' } },
    },
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      axisLabel: { color: '#999' },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [{
      type: 'bar',
      data: data.interviewDays.map(d => d.count),
      barWidth: 24,
      itemStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: '#4096ff' },
            { offset: 1, color: '#69b1ff' },
          ],
        },
        borderRadius: [4, 4, 0, 0],
      },
    }],
  } : {}

  const interviewPieOption = data ? {
    tooltip: { trigger: 'item' as const, formatter: '{b}: {c}次 ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#999' } },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}次' },
      data: Object.entries(data.interviewTimeTypes).map(([k, v]) => ({
        name: k, value: v,
        itemStyle: { color: typeColors[k] || '#8c8c8c' },
      })),
    }],
  } : {}

  return (
    <div className="home-page home-dashboard">
      {loading && (
        <div className="dashboard-loading-overlay">
          <Spin size="large" />
        </div>
      )}

      <div className="dashboard-header">
        <Typography.Title level={4} style={{ margin: 0 }}>数据看板</Typography.Title>
        <Typography.Text type="secondary">系统运营数据概览</Typography.Text>
      </div>

      <div className="stat-cards">
        <Card className="stat-card stat-card-talent" bordered={false}>
          <Statistic title="人力仓总数" value={data?.storeCount || 0} prefix={<TeamOutlined />} />
        </Card>
        <Card className="stat-card stat-card-company" bordered={false}>
          <Statistic title="企业总数" value={data?.companyCount || 0} prefix={<BankOutlined />} />
        </Card>
        <Card className="stat-card stat-card-shop" bordered={false}>
          <Statistic title="门店总数" value={data?.shopCount || 0} prefix={<ShopOutlined />} />
        </Card>
        <Card className="stat-card stat-card-interview" bordered={false}>
          <Statistic title="面试预约" value={data?.interviewCount || 0} prefix={<CalendarOutlined />} />
        </Card>
        <Card className="stat-card stat-card-admin" bordered={false}>
          <Statistic title="系统账号" value={data?.adminCount || 0} prefix={<UserOutlined />} />
        </Card>
        <Card className="stat-card stat-card-tag" bordered={false}>
          <Statistic title="角色数量" value={data?.roleCount || 0} prefix={<TagsOutlined />} />
        </Card>
      </div>

      {data && (
        <>
          <div className="chart-row">
            <Card className="chart-card" title={<Space><TeamOutlined />人员性别分布</Space>} bordered={false}>
              <ReactECharts option={genderOption} style={{ height: 280 }} />
            </Card>
            <Card className="chart-card" title={<Space><TagsOutlined />标签使用统计</Space>} bordered={false}>
              <ReactECharts option={tagOption} style={{ height: 280 }} />
            </Card>
          </div>
          <div className="chart-row">
            <Card className="chart-card" title={<Space><CalendarOutlined />面试预约日期分布</Space>} bordered={false}>
              <ReactECharts option={interviewBarOption} style={{ height: 280 }} />
            </Card>
            <Card className="chart-card" title={<Space><CalendarOutlined />面试时段分布</Space>} bordered={false}>
              <ReactECharts option={interviewPieOption} style={{ height: 280 }} />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

export default HomePage
