"use client";

import { Component, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { CalendarDays, ClipboardList, House, Inbox, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTenantProvisioning } from "./tenant-bootstrap";

const navigation = [["/", "Översikt", House], ["/inbox", "Inkorg", Inbox], ["/requests", "Förfrågningar", ClipboardList], ["/calendar", "Kalender", CalendarDays], ["/customers", "Kunder", Users], ["/settings", "Inställningar", Settings]] as const;
class WorkspaceError extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? <div role="alert" className="space-y-4"><h1>Vyn kunde inte laddas</h1><p>Ladda om sidan och försök igen.</p><Button onClick={() => window.location.reload()}>Ladda om</Button></div> : this.props.children; }
}
function Navigation() {
  const path = usePathname();
  const { setOpenMobile } = useSidebar();
  return <nav aria-label="Huvudnavigation"><SidebarMenu>{navigation.map(([href, label, Icon]) => {
    const active = href === "/" ? path === href : path.startsWith(href);
    return <SidebarMenuItem key={href}><SidebarMenuButton asChild isActive={active} className="min-h-11 px-3 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"><Link href={href} onClick={() => setOpenMobile(false)} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span></Link></SidebarMenuButton></SidebarMenuItem>;
  })}</SidebarMenu></nav>;
}
export function ProductShell({ children, development = false }: { children: ReactNode; development?: boolean }) {
  const path = usePathname();
  const { orgId, userId } = useAuth();
  const { isReady, error } = useTenantProvisioning();
  return <>
    <Authenticated>
      <a href="#workspace" className="sr-only focus:not-sr-only focus:p-4">Till innehållet</a>
      <TooltipProvider>
      <SidebarProvider style={{ "--sidebar-width": "220px" } as CSSProperties}>
        <Sidebar>
          <SidebarHeader className="p-5"><Link href="/" className="flex min-h-11 items-center px-3 text-sm font-semibold tracking-tight">AI Service Desk</Link></SidebarHeader>
          <SidebarContent className="px-5"><Navigation /></SidebarContent>
          <SidebarFooter className="p-5"><p className="px-3 text-xs leading-relaxed text-muted-foreground">Mer tid för kunderna.<br />Mindre att hålla reda på.</p></SidebarFooter>
        </Sidebar>
        <div className="min-w-0 flex-1">
          <header className="flex min-h-20 min-w-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 sm:px-8">
            <div className="flex items-center gap-3"><Tooltip><TooltipTrigger asChild><SidebarTrigger size="icon" aria-label="Visa eller dölj meny" /></TooltipTrigger><TooltipContent>Visa eller dölj meny</TooltipContent></Tooltip><span className="text-sm font-medium">{development ? "Utvecklingsverktyg" : "Din arbetsyta"}</span></div>
            <div className="flex min-w-0 max-w-full items-center gap-3"><div className="max-w-[190px]"><OrganizationSwitcher /></div><UserButton /></div>
          </header>
          <main id="workspace" className="mx-auto max-w-[1440px] p-4 py-6 sm:p-8 lg:p-10">
            {!orgId ? <div className="rounded-xl border bg-card p-6"><h1 className="text-xl font-semibold">Välj ditt företag</h1><p className="mt-2 text-muted-foreground">Välj eller skapa en organisation i menyn ovan för att öppna arbetsytan.</p></div> : !isReady ? <p role={error ? "alert" : "status"}>{error ? "Arbetsytan kunde inte förberedas. Ladda om och försök igen." : "Förbereder arbetsytan…"}</p> : <WorkspaceError key={`${orgId}:${userId}:${path}`}><div key={`${orgId}:${userId}`} className="min-w-0">{children}</div></WorkspaceError>}
          </main>
        </div>
      </SidebarProvider>
      </TooltipProvider>
    </Authenticated>
    <Unauthenticated><main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-5 p-6"><p className="text-sm font-semibold text-muted-foreground">AI Service Desk</p><h1 className="text-3xl font-semibold tracking-tight">En enklare arbetsdag.</h1><p className="text-muted-foreground">Se vad som behöver din hjälp och ta nästa steg med kunden.</p><SignInButton><Button>Logga in</Button></SignInButton></main></Unauthenticated>
    <AuthLoading><p role="status" className="p-8">Laddar arbetsytan…</p></AuthLoading>
  </>;
}
