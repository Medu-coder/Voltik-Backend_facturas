import Link from 'next/link'
import type { ReactNode } from 'react'

export default function StatsCard({
  title,
  kpiLabel,
  kpiValue,
  delta,
  deltaDirection = 'flat',
  description,
  ctaLabel,
  ctaHref,
  children,
}: StatsCardProps) {
  const { indicator, indicatorClass } = buildDelta(delta, deltaDirection)

  return (
    <section className="card stats-card">
      <header className="stats-card__header">
        <h2 className="card-title">{title}</h2>
        <span className="muted stats-card__subtitle">{description}</span>
      </header>
      <div className="stats-card__body">
        <div>
          <span className="muted stats-card__kpi-label">{kpiLabel}</span>
          <p className="kpi-value">{Intl.NumberFormat('es-ES').format(kpiValue)}</p>
        </div>
        {indicator && <span className={indicatorClass}>{indicator}</span>}
      </div>
      <div className="stats-card__chart" aria-live="polite">
        {children}
      </div>
      <footer className="stats-card__footer">
        <Link className="btn btn-outline" href={ctaHref}>{ctaLabel}</Link>
      </footer>
    </section>
  )
}

type StatsCardProps = {
  title: string
  kpiLabel: string
  kpiValue: number
  delta?: number | null
  deltaDirection?: 'up' | 'down' | 'flat'
  description?: string
  ctaLabel: string
  ctaHref: string
  children: ReactNode
}

type DeltaDetails = {
  indicator: string | null
  indicatorClass: string
}

function buildDelta(delta: number | null | undefined, direction: 'up' | 'down' | 'flat'): DeltaDetails {
  if (delta == null) {
    return {
      indicator: null,
      indicatorClass: 'kpi-delta',
    }
  }
  const rounded = Math.round(delta * 10) / 10
  const symbol = direction === 'down' ? '↓' : direction === 'up' ? '↑' : '→'
  const label = `${symbol} ${rounded.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}% vs mes pasado`
  const modifier = direction === 'down' ? 'kpi-delta--neg' : direction === 'up' ? 'kpi-delta--pos' : 'kpi-delta--flat'
  return {
    indicator: label,
    indicatorClass: `kpi-delta ${modifier}`,
  }
}
