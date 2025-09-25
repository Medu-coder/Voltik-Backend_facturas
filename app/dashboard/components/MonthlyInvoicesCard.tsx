import '../charts.css'
import type { MonthlyComparison } from '@/lib/invoices/dashboard'

// NOTE: Data originates from lib/invoices/dashboard.ts (fetchDashboardData > monthlyComparisons).
const numberFormatter = new Intl.NumberFormat('es-ES')
// NOTE: Using Intl.NumberFormat ensures locale-aware formatting consistent with the existing dashboard.

type MonthlyInvoicesCardProps = {
  comparisons: MonthlyComparison[]
  total: number
}

type BarRenderConfig = {
  currentX: number
  previousX: number
  barWidth: number
  labelX: number
}

export default function MonthlyInvoicesCard({ comparisons, total }: MonthlyInvoicesCardProps) {
  const sectionId = 'monthly-invoices-card-title'
  const descriptionId = 'monthly-invoices-card-description'
  const chartTitleId = 'monthly-invoices-chart-title'

  const effectiveComparisons = comparisons.length > 0 ? comparisons : fallbackComparison()

  const maxValue = Math.max(
    1,
    ...effectiveComparisons.flatMap((month) => [month.current.count, month.previous.count])
  )

  const groupCount = Math.max(1, effectiveComparisons.length)
  const chartTop = 40
  const chartBottom = 220
  const chartHeight = chartBottom - chartTop
  const leftPadding = 60
  const rightPadding = 48
  const groupWidth = 92
  const barGap = 12
  const chartWidth = leftPadding + groupCount * groupWidth + rightPadding
  const viewBoxHeight = 260

  const chartDescription = effectiveComparisons
    .map((month) => {
      const current = `${numberFormatter.format(month.current.count)} facturas (${month.current.rangeLabel})`
      const previous = `${numberFormatter.format(month.previous.count)} facturas (${month.previous.rangeLabel})`
      return `${month.title}: ${current}. Mismo mes año anterior: ${previous}.`
    })
    .join(' ')

  return (
    <section className="card chart-card" aria-labelledby={sectionId} aria-describedby={descriptionId}>
      <header className="chart-card__header">
        <div>
          <h2 id={sectionId} className="card-title">Facturas registradas por mes</h2>
          <p id={descriptionId} className="muted">
            Comparativa mensual del rango seleccionado frente al mismo subrango del año anterior.
          </p>
        </div>
        <div className="chart-card__kpi" aria-live="polite">
          <span className="chart-card__kpi-label">Total</span>
          <span className="chart-card__kpi-value">{numberFormatter.format(total)}</span>
        </div>
      </header>

      <div className="chart-area chart-area--grouped" role="presentation">
        <svg
          role="img"
          aria-labelledby={chartTitleId}
          viewBox={`0 0 ${chartWidth} ${viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <title id={chartTitleId}>
            {`Comparativa mensual de facturas creadas en el rango seleccionado.`}
          </title>
          <desc>{chartDescription}</desc>
          <line className="chart-bar__baseline" x1={leftPadding - 24} x2={chartWidth - rightPadding + 24} y1={chartBottom} y2={chartBottom} />
          {effectiveComparisons.map((month, index) => {
            const groupStart = leftPadding + index * groupWidth
            const { currentX, previousX, barWidth, labelX } = computeBarLayout(groupStart, groupWidth, barGap)

            const bars = [
              {
                key: `${month.key}-current`,
                x: currentX,
                count: month.current.count,
                rectClass: 'chart-bar__rect chart-bar__rect--current',
                tooltip: `${month.label} ${month.current.year}: ${numberFormatter.format(month.current.count)} facturas (${month.current.rangeLabel})`,
              },
              {
                key: `${month.key}-previous`,
                x: previousX,
                count: month.previous.count,
                rectClass: 'chart-bar__rect chart-bar__rect--previous',
                tooltip: `${month.label} ${month.previous.year}: ${numberFormatter.format(month.previous.count)} facturas (${month.previous.rangeLabel})`,
              },
            ]

            return (
              <g key={month.key}>
                {bars.map((bar) => {
                  const scaledHeight = Math.round((bar.count / maxValue) * chartHeight)
                  const barHeight = bar.count === 0 ? 0 : Math.max(4, scaledHeight)
                  const barY = bar.count === 0 ? chartBottom - 2 : chartBottom - barHeight
                  const valueY = bar.count === 0 ? chartBottom - 6 : Math.max(chartTop + 16, barY - 8)

                  return (
                    <g key={bar.key}>
                      <rect
                        className={bar.rectClass}
                        x={bar.x}
                        y={barY}
                        width={barWidth}
                        height={barHeight === 0 ? 2 : barHeight}
                        rx={8}
                        ry={8}
                      >
                        <title>{bar.tooltip}</title>
                      </rect>
                      <text className="chart-bar__value" x={bar.x + barWidth / 2} y={valueY} textAnchor="middle">
                        {numberFormatter.format(bar.count)}
                      </text>
                    </g>
                  )
                })}

                <text className="chart-bar__axis-label" x={labelX} y={chartBottom + 24} textAnchor="middle">
                  {month.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      <footer className="chart-legend" aria-label="Detalle por mes">
        <ul role="list" className="chart-legend__list chart-legend__list--months">
          {effectiveComparisons.map((month) => (
            <li key={month.key} className="chart-legend__item chart-legend__item--multi">
              <span className="chart-legend__meta">
                <span className="chart-legend__label">{month.label}</span>
                <span className="chart-legend__range">{month.current.rangeLabel}</span>
              </span>
              <div className="chart-legend__values">
                <span className="chart-legend__value-pair">
                  <span className="chart-legend__swatch chart-legend__swatch--current" aria-hidden="true" />
                  <span className="chart-legend__value-text">
                    {month.current.year}: {numberFormatter.format(month.current.count)} facturas
                  </span>
                </span>
                <span className="chart-legend__value-pair">
                  <span className="chart-legend__swatch chart-legend__swatch--previous" aria-hidden="true" />
                  <span className="chart-legend__value-text">
                    {month.previous.year}: {numberFormatter.format(month.previous.count)} facturas
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </footer>
    </section>
  )
}

function computeBarLayout(groupStart: number, groupWidth: number, barGap: number): BarRenderConfig {
  const barWidth = 26
  const center = groupStart + groupWidth / 2
  const currentX = center - barGap / 2 - barWidth
  const previousX = center + barGap / 2
  const labelX = center

  return {
    currentX,
    previousX,
    barWidth,
    labelX,
  }
}

function fallbackComparison(): MonthlyComparison[] {
  const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const placeholder: MonthlyComparison = {
    key: 'placeholder',
    label: 'N/A',
    title: 'Sin datos',
    current: {
      year: today.getUTCFullYear(),
      count: 0,
      from: 'N/A',
      to: 'N/A',
      rangeLabel: 'Sin datos disponibles',
    },
    previous: {
      year: today.getUTCFullYear() - 1,
      count: 0,
      from: 'N/A',
      to: 'N/A',
      rangeLabel: 'Sin datos disponibles',
    },
  }
  return [placeholder]
}
