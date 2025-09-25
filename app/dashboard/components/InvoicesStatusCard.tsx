import '../charts.css'
import type { StatusBreakdown } from '@/lib/invoices/dashboard'

// NOTE: Status data supplied by lib/invoices/dashboard.ts (fetchDashboardData > statusBreakdown).
const numberFormatter = new Intl.NumberFormat('es-ES')
// NOTE: Number formatting aligned with existing dashboard locale using Intl.NumberFormat('es-ES').

const SEGMENT_COLORS: Record<string, string> = {
  pending: 'var(--chart-pending-color)',
  processed: 'var(--chart-processed-color)',
  success: 'var(--chart-success-color)',
}

type InvoicesStatusCardProps = {
  breakdown: StatusBreakdown
  total: number
  summary: string
}

type SegmentDescriptor = {
  key: string
  label: string
  count: number
  percentage: number
  color: string
  dasharray: string
  dashoffset: number
}

export default function InvoicesStatusCard({ breakdown, total, summary }: InvoicesStatusCardProps) {
  const sectionId = 'invoices-status-card-title'
  const descriptionId = 'invoices-status-card-description'
  const chartTitleId = 'invoices-status-chart-title'
  const radius = 80
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const segments: SegmentDescriptor[] = breakdown.map((item) => {
    const safePercentage = total === 0 ? 0 : Math.max(0, Math.min(100, item.percentage))
    const segmentLength = (safePercentage / 100) * circumference
    const descriptor: SegmentDescriptor = {
      key: item.key,
      label: item.label,
      count: item.value,
      percentage: Math.round(safePercentage),
      color: SEGMENT_COLORS[item.key] ?? 'var(--chart-current-color)',
      dasharray: `${segmentLength} ${circumference - segmentLength}`,
      dashoffset: circumference - offset,
    }
    offset += segmentLength
    return descriptor
  })

  const hasData = total > 0 && segments.some((segment) => segment.count > 0)

  return (
    <section className="card chart-card" aria-labelledby={sectionId} aria-describedby={descriptionId}>
      <header className="chart-card__header">
        <div>
          <h2 id={sectionId} className="card-title">Estado facturas</h2>
          <p id={descriptionId} className="muted">{summary}</p>
        </div>
        <div className="chart-card__kpi" aria-live="polite">
          <span className="chart-card__kpi-label">Total</span>
          <span className="chart-card__kpi-value">{numberFormatter.format(total)}</span>
        </div>
      </header>

      <div className="chart-donut-layout">
        <div className="chart-donut" role="presentation">
          <svg
            role="img"
            aria-labelledby={chartTitleId}
            viewBox="0 0 200 200"
            preserveAspectRatio="xMidYMid meet"
          >
            <title id={chartTitleId}>
              {hasData
                ? `Distribución de estados: ${segments
                    .map((segment) => `${segment.label} ${segment.percentage}%`)
                    .join(', ')}.`
                : 'Estado de facturas sin datos disponibles en el rango seleccionado.'}
            </title>
            <desc>
              {hasData
                ? segments
                    .map(
                      (segment) =>
                        `${segment.label}: ${numberFormatter.format(segment.count)} facturas (${segment.percentage}%)`
                    )
                    .join('. ')
                : 'No hay facturas registradas durante el rango seleccionado.'}
            </desc>
            <g transform="rotate(-90 100 100)">
              <circle className="chart-donut__track" cx="100" cy="100" r={radius} />
              {segments.map((segment) => (
                <circle
                  key={segment.key}
                  className="chart-donut__segment"
                  cx="100"
                  cy="100"
                  r={radius}
                  stroke={segment.color}
                  strokeDasharray={segment.dasharray}
                  strokeDashoffset={segment.dashoffset}
                >
                  <title>{`${segment.label}: ${segment.percentage}% (${numberFormatter.format(segment.count)} facturas)`}</title>
                </circle>
              ))}
            </g>
          </svg>
          <div className="chart-donut__center" aria-hidden="true">
            <span className="chart-donut__total">{numberFormatter.format(total)}</span>
            <span className="chart-donut__label">facturas</span>
          </div>
        </div>

        <div className="chart-legend chart-legend--stack" aria-label="Detalle por estado">
          <div className="chart-legend__summary">
            <span className="chart-legend__summary-label">Total</span>
            <span>{numberFormatter.format(total)}</span>
          </div>
          <ul role="list" className="chart-legend__list">
            {segments.map((segment) => (
              <li key={segment.key} className="chart-legend__item">
                <span className={`chart-legend__swatch chart-legend__swatch--${segment.key}`} aria-hidden="true" />
                <span className="chart-legend__meta">
                  <span className="chart-legend__label">{segment.label}</span>
                  <span className="chart-legend__range">
                    {numberFormatter.format(segment.count)} facturas
                  </span>
                </span>
                <span className="chart-legend__value">{segment.percentage}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
