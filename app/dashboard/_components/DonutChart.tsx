'use client'

type DonutDatum = {
  key: string
  label: string
  value: number
  percentage: number
}

type Props = {
  data: DonutDatum[]
}

export default function DonutChart({ data }: Props) {
  const total = data.reduce((acc, item) => acc + item.value, 0)
  const radius = 36
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="chart chart--donut">
      <svg
        className="chart__svg"
        viewBox="0 0 120 120"
        role="img"
        aria-label="Distribución por estado"
      >
        <circle className="chart__donut-base" cx="60" cy="60" r={radius} />
        {data.map((item) => {
          const portion = total === 0 ? 0 : item.value / total
          const length = portion * circumference
          const strokeDasharray = `${length} ${circumference - length}`
          const circleOffset = offset
          offset += length
          return (
            <circle
              key={item.key}
              className={`chart__donut chart__donut--${item.key}`}
              cx="60"
              cy="60"
              r={radius}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={-circleOffset}
            >
              <title>{`${item.label}: ${item.percentage.toLocaleString('es-ES', { maximumFractionDigits: 1 })}% (${item.value})`}</title>
            </circle>
          )
        })}
        <g className="chart__donut-label">
          <text x="60" y="58" textAnchor="middle">
            {total}
          </text>
          <text x="60" y="74" textAnchor="middle" className="chart__donut-sub">
            facturas
          </text>
        </g>
      </svg>
      <dl className="chart-legend chart-legend--vertical">
        {data.map((item) => (
          <div key={item.key} className="chart-legend__item">
            <span className={`chart-legend__swatch chart-legend__swatch--${item.key}`} aria-hidden="true" />
            <dt>{item.label}</dt>
            <dd>{item.percentage.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
