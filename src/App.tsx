import type { CSSProperties } from 'react'
import { AppProvider, useApp, type Page } from './state'
import { AppSidebar } from './components/app-sidebar'
import { SiteHeader } from './components/site-header'
import { SidebarInset, SidebarProvider } from './components/ui/sidebar'
import { TooltipProvider } from './components/ui/tooltip'
import { SignInView } from './views/sign-in'
import { DashboardView } from './views/dashboard'
import { ForecastView } from './views/forecast'
import { ScheduleView } from './views/schedule'
import { SplhView } from './views/splh'
import { OverridesView } from './views/overrides'
import { AlertsView } from './views/alerts'
import { DataView } from './views/data'
import { UsersView } from './views/users'

const VIEWS: Record<Page, () => React.JSX.Element> = {
  dashboard: DashboardView,
  forecast: ForecastView,
  schedule: ScheduleView,
  splh: SplhView,
  overrides: OverridesView,
  alerts: AlertsView,
  data: DataView,
  users: UsersView,
}

function Shell() {
  const { user, page } = useApp()
  if (!user) return <SignInView />
  const View = VIEWS[page]
  return (
    <SidebarProvider style={{ '--sidebar-width': 'calc(var(--spacing) * 64)', '--header-height': 'calc(var(--spacing) * 14)' } as CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset className="min-w-0">
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 lg:p-6">
          <View />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <AppProvider>
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </AppProvider>
  )
}
