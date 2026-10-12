import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

// Тонкая обёртка над ECharts: инициализация, перерисовка при смене option,
// подстройка под размер контейнера, уборка при размонтировании.
export default function EChart({ option, height, onClick, label }) {
  const nodeRef = useRef(null)
  const chartRef = useRef(null)
  const clickRef = useRef(onClick)
  clickRef.current = onClick

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return undefined
    const chart = echarts.init(node, null, { renderer: 'canvas' })
    chartRef.current = chart
    chart.on('click', (params) => clickRef.current?.(params))
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => chart.resize())
    observer?.observe(node)
    return () => {
      observer?.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true, lazyUpdate: true })
  }, [option])

  useEffect(() => {
    chartRef.current?.resize()
  }, [height])

  return <div ref={nodeRef} className="echart" style={{ height }} role="img" aria-label={label} />
}
