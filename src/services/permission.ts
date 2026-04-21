import { adminFetch, API_BASE } from '../utils/adminFetch'
import { useAppStore } from '../stores/appStore'

interface MenuNode {
  id: number
  children?: MenuNode[]
}

interface RoleItem {
  id: number
  roleCode: string | null
  roles: string | null
}

interface AdminItem {
  id: number
  username: string
  role_type: number | null
}

const collectTreeIds = (nodes: MenuNode[]): number[] => {
  const ids: number[] = []
  for (const n of nodes) {
    ids.push(n.id)
    if (n.children?.length) ids.push(...collectTreeIds(n.children))
  }
  return ids
}

/**
 * 拉取当前账号在后端的最新菜单权限并写入 store。
 * 超管（ROLE_ALL）取菜单树全部 id；其他角色取 role.roles 配置；
 * 失败时不清空已有 allowedMenuIds，避免离线/瞬时网络错把菜单清空。
 */
export async function refreshUserPermissions(): Promise<void> {
  const { authUserId, authUsername, authToken } = useAppStore.getState()
  if (!authToken) return

  try {
    const [adminRes, roleRes, treeRes] = await Promise.all([
      adminFetch(`${API_BASE}/admin/admin/list?page=1&size=200`),
      adminFetch(`${API_BASE}/admin/role/list?page=1&size=200`),
      adminFetch(`${API_BASE}/admin/menu/tree`),
    ])
    const adminJson = await adminRes.json()
    const roleJson = await roleRes.json()
    const treeJson = await treeRes.json()

    const roles: RoleItem[] = roleJson.data?.data || []
    const admins: AdminItem[] = adminJson.data?.data || []
    const allTreeIds = collectTreeIds(treeJson.data || [])

    const setAllowedMenuIds = useAppStore.getState().setAllowedMenuIds
    const currentAdmin = admins.find(
      (a) => a.id === authUserId || a.username === authUsername
    )
    if (currentAdmin?.role_type) {
      const role = roles.find((r) => r.id === currentAdmin.role_type)
      if (role) {
        if (role.roleCode === 'ROLE_ALL') {
          setAllowedMenuIds(allTreeIds)
        } else if (role.roles) {
          const ids = role.roles.split(',').filter(Boolean).map(Number)
          setAllowedMenuIds(ids)
        } else {
          setAllowedMenuIds([])
        }
        return
      }
    }

    // 内置管理员或匹配不到角色 → 授予全部权限
    setAllowedMenuIds(allTreeIds)
  } catch (e) {
    console.warn('刷新菜单权限失败，沿用本地缓存:', e)
  }
}
