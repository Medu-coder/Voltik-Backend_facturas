'use client'

import { useMemo } from 'react'

type Props = {
  labels: string[]
  currentSeries: number[]
  previousSeries: number[]
  currentLabel: string
  previousLabel: string
}

export default function BarChart({ labels, currentSeries, previousSeries, currentLabel, previousLabel }: Props) {
  const { maxValue, series } = useMemo(() => {
    const merged = [...currentSeries, ...previousSeries]
    const max = merged.length === 0 ? 0 : Math.max(...merged)
    const safeMax = max === 0 ? 1 : max
    const data = labels.map((label, index) => ({
      label,
      current: currentSeries[index] ?? 0,
      previous: previousSeries[index] ?? 0,
    }))
    return {
      maxValue: safeMax,
      series: data,
    }
  }, [labels, currentSeries, previousSeries])

  const chartHeight = 160
  const groupWidth = 28
  const barWidth = 10
  const padding = 16
  const chartWidth = series.length * groupWidth + padding * 2

  return (
    <div className="chart chart--bar" aria-hidden={series.length === 0}>
      <svg
        className="chart__svg"
        viewBox={`0 0 ${chartWidth} ${chartHeight + 24}`}
        role="img"
        aria-label="Evolución de facturas registradas por día"
      >
        {series.map((point, index) => {
          const xGroup = padding + index * groupWidth
          const currentHeight = (point.current / maxValue) * chartHeight
          const previousHeight = (point.previous / maxValue) * chartHeight
          const xCurrent = xGroup
          const xPrevious = xGroup + barWidth + 4
          const yCurrent = chartHeight - currentHeight + 8
          const yPrevious = chartHeight - previousHeight + 8
          return (
            <g key={point.label}>
              <rect
                className="chart__bar chart__bar--current"
                x={xCurrent}
                y={yCurrent}
                width={barWidth}
                height={currentHeight}
                rx={2}
              />
              <rect
                className="chart__bar chart__bar--previous"
                x={xPrevious}
                y={yPrevious}
                width={barWidth}
                height={previousHeight}
                rx={2}
              />
              <text className="chart__label" x={xGroup + barWidth} y={chartHeight + 20} textAnchor="middle">
                {point.label}
              </text>
            </g>
          )
        })}
      </svg>
      <dl className="chart-legend">
        <div className="chart-legend__item">
          <span className="chart-legend__swatch chart-legend__swatch--current" aria-hidden="true" />
          <dt>{currentLabel}</dt>
          <dd>{sum(currentSeries)} facturas</dd>
        </div>
        <div className="chart-legend__item">
          <span className="chart-legend__swatch chart-legend__swatch--previous" aria-hidden="true" />
          <dt>{previousLabel}</dt>
          <dd>{sum(previousSeries)} facturas</dd>
        </div>
      </dl>
    </div>
  )
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}
