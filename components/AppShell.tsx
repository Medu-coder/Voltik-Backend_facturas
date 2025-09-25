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

const NAV_ITEMS: Array<{ key: NavKey; href: string; label: string }> = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard' },
  { key: 'invoices', href: '/invoices', label: 'Facturas' },
  { key: 'customers', href: '/customers', label: 'Clientes' },
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
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="sidebar-section">
          <span className="sidebar-title">Acciones</span>
          <nav aria-label="Acciones rápidas">
            <Link className="nav-item" href="/upload">Subir facturas</Link>
            <a className="nav-item" href={exportUrl}>Exportar a CSV</a>
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
