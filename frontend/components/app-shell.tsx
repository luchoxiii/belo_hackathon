'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarClock, ChartLine, MessageCircle, Repeat, Settings, Wallet, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Panel', icon: ChartLine },
  { href: '/chat', label: 'Chat IA', icon: MessageCircle },
  { href: '/gastos-fijos', label: 'Fijos', icon: Repeat },
  { href: '/eventos', label: 'Eventos', icon: CalendarClock },
  { href: '/configuracion', label: 'Ajustes', icon: Settings },
]

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 group">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#FF8A80] text-white shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
        <Wallet className="size-5" aria-hidden="true" />
      </span>
      <span className="font-heading font-semibold text-xl text-foreground">
        Ruculapp
      </span>
    </Link>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname.startsWith(href)

  return (
    <div className="flex h-dvh flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border bg-card p-5 md:flex">
        <Brand />

        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                isActive(href)
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Quick Stats in Sidebar */}
        <div className="mt-auto rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 p-4">
          <p className="text-xs text-muted-foreground mb-1">IPC Actual</p>
          <p className="text-2xl font-heading font-semibold text-accent">2.5%</p>
          <p className="text-xs text-muted-foreground mt-1">Fuente: INDEC</p>
        </div>

        {/* Back to Landing */}
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="size-4" />
          Volver al inicio
        </Link>
      </aside>

      {/* Mobile Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-accent/10 border border-accent/20 px-2.5 py-1 text-xs font-medium text-accent">
            IPC 2.5%
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-0 flex-1 overflow-y-auto bg-background">{children}</main>

      {/* Mobile Navigation */}
      <nav
        aria-label="Principal"
        className="grid shrink-0 grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
              isActive(href) ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
