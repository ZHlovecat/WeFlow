import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Form, Modal, Typography, Space } from 'antd'
import { UserOutlined, LockOutlined, LoginOutlined, PoweroffOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import { adminFetch, API_BASE } from '../utils/adminFetch'

export default function LoginPage() {
  const navigate = useNavigate()
  const setIsLoggedIn = useAppStore(state => state.setIsLoggedIn)
  const setAuth = useAppStore(state => state.setAuth)
  const setAllowedMenuIds = useAppStore(state => state.setAllowedMenuIds)
  const [isLogging, setIsLogging] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const collectTreeIds = (nodes: any[]): number[] => {
    const ids: number[] = []
    for (const n of nodes) {
      ids.push(n.id)
      if (n.children?.length) ids.push(...collectTreeIds(n.children))
    }
    return ids
  }

  const fetchUserPermissions = async (token: string, userId: number, username: string) => {
    try {
      const [adminRes, roleRes, treeRes] = await Promise.all([
        adminFetch(`${API_BASE}/admin/admin/list?page=1&size=200`),
        adminFetch(`${API_BASE}/admin/role/list?page=1&size=200`),
        adminFetch(`${API_BASE}/admin/menu/tree`),
      ])
      const adminJson = await adminRes.json()
      const roleJson = await roleRes.json()
      const treeJson = await treeRes.json()

      const roles = roleJson.data?.data || []
      const admins = adminJson.data?.data || []
      const allTreeIds = collectTreeIds(treeJson.data || [])

      const currentAdmin = admins.find((a: any) => a.id === userId || a.username === username)
      if (currentAdmin?.role_type) {
        const role = roles.find((r: any) => r.id === currentAdmin.role_type)
        if (role) {
          if (role.roleCode === 'ROLE_ALL') {
            setAllowedMenuIds(allTreeIds)
          } else if (role.roles) {
            const ids = role.roles.split(',').filter(Boolean).map(Number)
            setAllowedMenuIds(ids)
          }
          return
        }
      }

      // 内置管理员或未找到角色 → 授予全部权限
      setAllowedMenuIds(allTreeIds)
    } catch (e) {
      console.error('获取权限失败:', e)
    }
  }

  const handleSubmit = async (values: { username: string; password: string }) => {
    setIsLogging(true)
    try {
      const form = new URLSearchParams()
      form.append('username', values.username)
      form.append('password', values.password)
      const res = await fetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        body: form,
      })
      const json = await res.json()
      if (json.errno === 0 && json.data?.access_token) {
        const { access_token, user_id, username } = json.data
        setAuth(access_token, username, user_id)
        await fetchUserPermissions(access_token, user_id, username)
        setIsSuccess(true)
        setTimeout(() => {
          navigate('/home', { replace: true })
          setIsLoggedIn(true)
        }, 600)
      } else {
        Modal.error({ title: '登录失败', content: json.errmsg || '账号或密码错误，请重试', zIndex: 10001 })
        setIsLogging(false)
      }
    } catch {
      Modal.error({ title: '登录失败', content: '网络请求失败，请检查网络连接', zIndex: 10001 })
      setIsLogging(false)
    }
  }

  const handleQuit = () => {
    try {
      window.electronAPI.window.respondCloseConfirm('quit')
    } catch {
      window.close()
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      zIndex: 9999,
      ...({ WebkitAppRegion: 'drag' } as any),
      opacity: isSuccess ? 0 : 1,
      transition: 'opacity 0.5s ease',
    }}>
      <div style={{
        width: 380,
        padding: '48px 40px 40px',
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 8px 40px rgba(0, 0, 0, 0.12)',
        ...({ WebkitAppRegion: 'no-drag' } as any),
        animation: 'loginCardFadeIn 0.5s ease',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <img
            src="https://www.quikms.com/favicon.ico"
            alt="Logo"
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              marginBottom: 20,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
            }}
          />
          <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>
            浅雨科技人力仓管理系统
          </Typography.Title>
          <Typography.Text type="secondary" style={{ marginTop: 8 }}>
            请输入账号密码以继续
          </Typography.Text>
        </div>

        <Form onFinish={handleSubmit} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="请输入账号" disabled={isLogging} autoFocus />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="请输入密码" disabled={isLogging} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Button type="primary" htmlType="submit" block loading={isLogging} icon={<LoginOutlined />}
                style={{ height: 44, borderRadius: 8, fontWeight: 500 }}>
                登录
              </Button>
              <Button block danger icon={<PoweroffOutlined />} onClick={handleQuit}
                style={{ height: 44, borderRadius: 8, fontWeight: 500 }}>
                退出软件
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      <style>{`
        @keyframes loginCardFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
