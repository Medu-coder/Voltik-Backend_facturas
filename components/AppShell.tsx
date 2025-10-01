import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'

type NavKey = 'dashboard' | 'invoices' | 'customers'

type AppShellProps = {
  children: ReactNode
  active: NavKey
  topbar?: ReactNode
  exportHref?: string
}

const NAV_ITEMS: Array<{ key: NavKey; href: string; label: string; icon: ReactNode }> = [
  { 
    key: 'dashboard', 
    href: '/dashboard', 
    label: 'Dashboard', 
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
      </svg>
    )
  },
  { 
    key: 'invoices', 
    href: '/invoices', 
    label: 'Facturas', 
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>
    )
  },
  { 
    key: 'customers', 
    href: '/customers', 
    label: 'Clientes', 
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    )
  },
]

const ACTION_ITEMS: Array<{ href: string; label: string; icon: ReactNode; external?: boolean }> = [
  { 
    href: '/upload', 
    label: 'Subir facturas', 
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17,8 12,3 7,8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    )
  },
  { 
    href: '/api/invoices/export.csv', 
    label: 'Exportar a CSV', 
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7,10 12,15 17,10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    ), 
    external: true 
  },
]

export default function AppShell({ children, active, topbar, exportHref }: AppShellProps) {
  const exportUrl = exportHref ?? '/api/invoices/export.csv'

  return (
    <div className="layout">
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="sidebar-logo" aria-label="Voltik">
          <Link href="/dashboard" className="sidebar-logo__link" aria-label="Ir al dashboard">
            <Image src="/voltik-logo-web_873x229.svg" alt="Voltik" width={160} height={42} priority />
          </Link>
        </div>
        <div className="sidebar-section">
          <span className="sidebar-title">Menú</span>
          <nav aria-label="Secciones">
            {NAV_ITEMS.map((item) => {
              const isActive = active === item.key
              return (
                <Link
                  key={item.key}
                  className={`nav-item${isActive ? ' nav-item--active' : ''}`}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="nav-item__icon">{item.icon}</span>
                  <span className="nav-item__label">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="sidebar-section">
          <span className="sidebar-title">Acciones</span>
          <nav aria-label="Acciones rápidas">
            {ACTION_ITEMS.map((item, index) => {
              const isExport = item.external
              const href = isExport ? exportUrl : item.href
              const Component = isExport ? 'a' : Link
              return (
                <Component
                  key={index}
                  className="nav-item"
                  href={href}
                  {...(isExport ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  <span className="nav-item__icon">{item.icon}</span>
                  <span className="nav-item__label">{item.label}</span>
                </Component>
              )
            })}
          </nav>
        </div>
      </aside>
      <div className="layout-main">
        {topbar ? (
          <header className="topbar" aria-label="Barra superior">
            {topbar}
          </header>
        ) : null}
        <main className="content">
          {children}
        </main>
      </div>
    </div>
  )
}
