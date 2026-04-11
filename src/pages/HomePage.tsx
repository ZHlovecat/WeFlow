import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, Statistic, Spin, Typography, Space } from 'antd'
import {
  TeamOutlined, BankOutlined, ShopOutlined, CalendarOutlined,
  UserOutlined, TagsOutlined,
} from '@ant-design/icons'
import * as echarts from 'echarts'
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

  const genderRef = useRef<HTMLDivElement>(null)
  const tagRef = useRef<HTMLDivElement>(null)
  const interviewBarRef = useRef<HTMLDivElement>(null)
  const interviewPieRef = useRef<HTMLDivElement>(null)
  const chartsRef = useRef<echarts.ECharts[]>([])

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

  useEffect(() => {
    if (!data) return

    const instances: echarts.ECharts[] = []

    if (genderRef.current) {
      const chart = echarts.init(genderRef.current)
      instances.push(chart)
      const genderLabels: Record<string, string> = { '男': '男', '女': '女', '未知': '未知' }
      const genderColors: Record<string, string> = { '男': '#4096ff', '女': '#ff85c0', '未知': '#bfbfbf' }
      chart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c}人 ({d}%)' },
        legend: { bottom: 0, textStyle: { color: '#999' } },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}\n{c}人' },
          data: Object.entries(data.genderDist).map(([k, v]) => ({
            name: genderLabels[k] || k,
            value: v,
            itemStyle: { color: genderColors[k] || '#8c8c8c' },
          })),
        }],
      })
    }

    if (tagRef.current) {
      const chart = echarts.init(tagRef.current)
      instances.push(chart)
      const tagColors = ['#4096ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2']
      const entries = Object.entries(data.tagDist)
      chart.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 20, right: 20, top: 20, bottom: 30, containLabel: true },
        xAxis: {
          type: 'category',
          data: entries.map(([k]) => k),
          axisLabel: { color: '#999' },
          axisLine: { lineStyle: { color: '#e8e8e8' } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: '#999' },
          splitLine: { lineStyle: { color: '#f0f0f0' } },
        },
        series: [{
          type: 'bar',
          data: entries.map(([, v], i) => ({
            value: v,
            itemStyle: { color: tagColors[i % tagColors.length], borderRadius: [4, 4, 0, 0] },
          })),
          barWidth: 36,
        }],
      })
    }

    if (interviewBarRef.current) {
      const chart = echarts.init(interviewBarRef.current)
      instances.push(chart)
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 20, right: 20, top: 30, bottom: 30, containLabel: true },
        xAxis: {
          type: 'category',
          data: data.interviewDays.map(d => d.day.slice(5)),
          axisLabel: { color: '#999', rotate: 30 },
          axisLine: { lineStyle: { color: '#e8e8e8' } },
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: { color: '#999' },
          splitLine: { lineStyle: { color: '#f0f0f0' } },
        },
        series: [{
          type: 'bar',
          data: data.interviewDays.map(d => d.count),
          barWidth: 24,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#4096ff' },
              { offset: 1, color: '#69b1ff' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        }],
      })
    }

    if (interviewPieRef.current) {
      const chart = echarts.init(interviewPieRef.current)
      instances.push(chart)
      const typeColors: Record<string, string> = { '上午': '#faad14', '下午': '#13c2c2', '晚上': '#722ed1' }
      chart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c}次 ({d}%)' },
        legend: { bottom: 0, textStyle: { color: '#999' } },
        series: [{
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '45%'],
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}\n{c}次' },
          data: Object.entries(data.interviewTimeTypes).map(([k, v]) => ({
            name: k,
            value: v,
            itemStyle: { color: typeColors[k] || '#8c8c8c' },
          })),
        }],
      })
    }

    chartsRef.current = instances

    const handleResize = () => instances.forEach(c => c.resize())
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      instances.forEach(c => c.dispose())
      chartsRef.current = []
    }
  }, [data])

  if (loading) {
    return (
      <div className="home-page home-loading">
        <Spin size="large" tip="加载数据中..." />
      </div>
    )
  }

  return (
    <div className="home-page home-dashboard">
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

      <div className="chart-row">
        <Card
          className="chart-card"
          title={<Space><TeamOutlined />人员性别分布</Space>}
          bordered={false}
        >
          <div ref={genderRef} className="chart-container" />
        </Card>
        <Card
          className="chart-card"
          title={<Space><TagsOutlined />标签使用统计</Space>}
          bordered={false}
        >
          <div ref={tagRef} className="chart-container" />
        </Card>
      </div>

      <div className="chart-row">
        <Card
          className="chart-card"
          title={<Space><CalendarOutlined />面试预约日期分布</Space>}
          bordered={false}
        >
          <div ref={interviewBarRef} className="chart-container" />
        </Card>
        <Card
          className="chart-card"
          title={<Space><CalendarOutlined />面试时段分布</Space>}
          bordered={false}
        >
          <div ref={interviewPieRef} className="chart-container" />
        </Card>
      </div>
    </div>
  )
}

export default HomePage
