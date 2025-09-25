import '../charts.css'
import type { MonthlyComparison } from '@/lib/invoices/dashboard'

// NOTE: Data originates from lib/invoices/dashboard.ts (fetchDashboardData > monthlyComparison).
const numberFormatter = new Intl.NumberFormat('es-ES')
// NOTE: Using Intl.NumberFormat ensures locale-aware formatting consistent with the existing dashboard.

type MonthlyInvoicesCardProps = {
  comparison: MonthlyComparison
  total: number
}

type BarDatum = {
  key: 'current' | 'previous'
  axisLabel: string
  legendLabel: string
  rangeLabel: string
  count: number
  rectClass: string
  swatchClass: string
  tooltip: string
}

export default function MonthlyInvoicesCard({ comparison, total }: MonthlyInvoicesCardProps) {
  const sectionId = 'monthly-invoices-card-title'
  const descriptionId = 'monthly-invoices-card-description'
  const chartTitleId = 'monthly-invoices-chart-title'

  const bars: BarDatum[] = [
    {
      key: 'current',
      axisLabel: 'Mes actual',
      legendLabel: `Mes actual ${comparison.current.year}`,
      rangeLabel: comparison.current.rangeLabel,
      count: comparison.current.count,
      rectClass: 'chart-bar__rect chart-bar__rect--current',
      swatchClass: 'chart-legend__swatch chart-legend__swatch--current',
      tooltip: `Mes actual ${comparison.current.year}: ${numberFormatter.format(comparison.current.count)} facturas (${comparison.current.rangeLabel})`,
    },
    {
      key: 'previous',
      axisLabel: 'Año anterior',
      legendLabel: `Mismo mes ${comparison.previous.year}`,
      rangeLabel: comparison.previous.rangeLabel,
      count: comparison.previous.count,
      rectClass: 'chart-bar__rect chart-bar__rect--previous',
      swatchClass: 'chart-legend__swatch chart-legend__swatch--previous',
      tooltip: `Mismo mes ${comparison.previous.year}: ${numberFormatter.format(comparison.previous.count)} facturas (${comparison.previous.rangeLabel})`,
    },
  ]

  const chartWidth = 320
  const chartTop = 40
  const chartBottom = 200
  const chartHeight = chartBottom - chartTop
  const leftPadding = 48
  const rightPadding = 48
  const centersStep = (chartWidth - leftPadding - rightPadding) / (bars.length + 1)
  const barWidth = 60
  const maxValue = Math.max(1, ...bars.map((bar) => bar.count))

  return (
    <section className="card chart-card" aria-labelledby={sectionId} aria-describedby={descriptionId}>
      <header className="chart-card__header">
        <div>
          <h2 id={sectionId} className="card-title">Facturas registradas por mes</h2>
          <p id={descriptionId} className="muted">
            Mes visible: {comparison.monthTitle}. Rangos {comparison.current.rangeLabel} vs {comparison.previous.rangeLabel}.
          </p>
        </div>
        <div className="chart-card__kpi" aria-live="polite">
          <span className="chart-card__kpi-label">Total</span>
          <span className="chart-card__kpi-value">{numberFormatter.format(total)}</span>
        </div>
      </header>

      <div className="chart-area" role="presentation">
        <svg
          role="img"
          aria-labelledby={chartTitleId}
          viewBox={`0 0 ${chartWidth} 240`}
          preserveAspectRatio="xMidYMid meet"
        >
          <title id={chartTitleId}>
            {`Comparativa de facturas registradas en ${comparison.monthTitle} frente al mismo mes de ${comparison.previous.year}.`}
          </title>
          <desc>{`Mes actual: ${numberFormatter.format(comparison.current.count)} facturas. Año anterior: ${numberFormatter.format(comparison.previous.count)} facturas.`}</desc>
          <line className="chart-bar__baseline" x1={leftPadding - 20} x2={chartWidth - rightPadding + 20} y1={chartBottom} y2={chartBottom} />
          {bars.map((bar, index) => {
            const centerX = leftPadding + centersStep * (index + 1)
            const scaledHeight = Math.round((bar.count / maxValue) * chartHeight)
            const barHeight = bar.count === 0 ? 0 : Math.max(4, scaledHeight)
            const rectHeight = bar.count === 0 ? 0 : barHeight
            const barY = bar.count === 0 ? chartBottom - 2 : chartBottom - rectHeight
            const labelY = Math.max(chartTop + 16, barY - 8)
            return (
              <g key={bar.key}>
                {bar.count > 0 ? (
                  <rect
                    className={bar.rectClass}
                    x={centerX - barWidth / 2}
                    y={barY}
                    width={barWidth}
                    height={rectHeight}
                    rx={10}
                    ry={10}
                  >
                    <title>{bar.tooltip}</title>
                  </rect>
                ) : (
                  <g>
                    <rect
                      className={bar.rectClass}
                      x={centerX - barWidth / 2}
                      y={chartBottom - 2}
                      width={barWidth}
                      height={2}
                      rx={1}
                      ry={1}
                    >
                      <title>{bar.tooltip}</title>
                    </rect>
                  </g>
                )}
                <text className="chart-bar__value" x={centerX} y={labelY} textAnchor="middle">
                  {numberFormatter.format(bar.count)}
                </text>
                <text className="chart-bar__axis-label" x={centerX} y={chartBottom + 20} textAnchor="middle">
                  {bar.axisLabel}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <footer className="chart-legend" aria-label="Leyenda comparativa">
        <ul role="list" className="chart-legend__list">
          {bars.map((bar) => (
            <li key={bar.key} className="chart-legend__item">
              <span className={bar.swatchClass} aria-hidden="true" />
              <span className="chart-legend__meta">
                <span className="chart-legend__label">{bar.legendLabel}</span>
                <span className="chart-legend__range">{bar.rangeLabel}</span>
              </span>
              <span className="chart-legend__value">{numberFormatter.format(bar.count)}</span>
            </li>
          ))}
        </ul>
      </footer>
    </section>
  )
}
