import {
  BellRingIcon, CalendarDaysIcon, ChevronsUpDownIcon, ClockIcon, ClipboardCheckIcon, DatabaseIcon, GaugeIcon,
  LayoutDashboardIcon, LogOutIcon, TrendingUpIcon, UsersIcon,
} from 'lucide-react'
import { useApp, type Page } from '@/state'
import { activeAlerts, hourAlerts } from '@/data/alerts'
import { ROLE_LABEL } from '@/data/permissions'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar'

export const NAV: { group: string; items: { page: Page; title: string; icon: typeof ClockIcon }[] }[] = [
  {
    group: 'Planning',
    items: [
      { page: 'dashboard', title: 'Dashboard', icon: LayoutDashboardIcon },
      { page: 'forecast', title: 'Sales forecast', icon: TrendingUpIcon },
      { page: 'schedule', title: 'Schedule', icon: CalendarDaysIcon },
      { page: 'splh', title: 'SPLH report', icon: GaugeIcon },
    ],
  },
  {
    group: 'Review',
    items: [
      { page: 'overrides', title: 'Override requests', icon: ClipboardCheckIcon },
      { page: 'alerts', title: 'Hour alerts', icon: BellRingIcon },
    ],
  },
  {
    group: 'Administration',
    items: [
      { page: 'data', title: 'Data & sources', icon: DatabaseIcon },
      { page: 'users', title: 'Users & access', icon: UsersIcon },
    ],
  },
]

export const pageTitle = (page: Page) => NAV.flatMap((g) => g.items).find((i) => i.page === page)?.title ?? ''

const initials = (name: string) => name.split(' ').map((p) => p[0]).join('')

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { page, setPage, canOpen, user, signOut, db, myLocations, allowed, date } = useApp()
  const { isMobile, setOpenMobile } = useSidebar()
  const mine = myLocations.map((l) => l.id)

  const badges: Partial<Record<Page, number>> = {
    overrides: db.overrides.filter((o) => o.status === 'pending' && mine.includes(o.locationId) && (allowed('override.review') || o.requesterId === user!.id)).length,
    alerts: allowed('alerts.view') ? activeAlerts(hourAlerts(db.employees, db.labor, date, mine)).length : 0,
    data: db.discrepancies.filter((d) => d.status === 'open').length,
  }

  const go = (p: Page) => {
    setPage(p)
    setOpenMobile(false)
  }
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => canOpen(i.page)) })).filter((g) => g.items.length)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => go(groups[0].items[0].page)}>
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">PW</div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="font-semibold">Pita Way</span>
                <span className="text-xs text-muted-foreground">Labor forecasting & scheduling</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.group}>
            <SidebarGroupLabel>{g.group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton tooltip={item.title} isActive={page === item.page} onClick={() => go(item.page)}>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {!!badges[item.page] && <SidebarMenuBadge>{badges[item.page]}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}>
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{initials(user!.name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user!.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user!.role]}</span>
                </div>
                <ChevronsUpDownIcon className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-56" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="font-medium text-foreground">{user!.signInReference}</div>
                    <div>{myLocations.length} location{myLocations.length === 1 ? '' : 's'} assigned</div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuItem onClick={signOut}>
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
