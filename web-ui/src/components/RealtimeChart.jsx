import { useState, useRef } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

const PALETTE = [
  { name: 'Blue',    color: '#60a5fa' },
  { name: 'Green',   color: '#22c55e' },
  { name: 'Orange',  color: '#f59e0b' },
  { name: 'Purple',  color: '#a78bfa' },
  { name: 'Pink',    color: '#f472b6' },
  { name: 'Teal',    color: '#34d399' },
  { name: 'Amber',   color: '#fb923c' },
  { name: 'Cyan',    color: '#38bdf8' },
  { name: 'Red',     color: '#ef4444' },
  { name: 'Lime',    color: '#a3e635' },
  { name: 'Indigo',  color: '#818cf8' },
  { name: 'Rose',    color: '#fb7185' },
  { name: 'Sky',     color: '#7dd3fc' },
  { name: 'Yellow',  color: '#facc15' },
  { name: 'White',   color: '#e5e7eb' },
]

export default function RealtimeChart({ data, lineKeys, labels = {}, height = 350 }) {
  // 각 키별 색상 상태
  const [colorMap, setColorMap] = useState({})
  // 현재 색상 피커가 열린 키
  const [pickerKey, setPickerKey] = useState(null)
  const pickerRef = useRef(null)

  function getColor(key, index) {
    return colorMap[key] || PALETTE[index % PALETTE.length].color
  }

  function handleColorChange(key, color) {
    setColorMap(prev => ({ ...prev, [key]: color }))
    setPickerKey(null)
  }

  if (!data || data.length === 0 || lineKeys.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
        Waiting for data...
      </div>
    )
  }

  return (
    <div className="chart-with-controls">
      {/* Color selector bar */}
      <div className="chart-color-bar">
        {lineKeys.map((key, i) => (
          <div key={key} className="chart-color-item" ref={pickerKey === key ? pickerRef : null}>
            <button
              className="chart-color-swatch"
              style={{ backgroundColor: getColor(key, i) }}
              onClick={() => setPickerKey(pickerKey === key ? null : key)}
              title={`Change color for ${labels[key] || key}`}
            />
            <span className="chart-color-label">{labels[key] || key}</span>

            {/* Color picker dropdown */}
            {pickerKey === key && (
              <div className="chart-color-picker">
                {PALETTE.map(p => (
                  <button
                    key={p.color}
                    className={`chart-color-option ${getColor(key, i) === p.color ? 'active' : ''}`}
                    style={{ backgroundColor: p.color }}
                    onClick={() => handleColorChange(key, p.color)}
                    title={p.name}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="time"
            stroke="#9ca3af"
            tick={{ fontSize: 11, fill: '#d1d5db' }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke="#9ca3af"
            tick={{ fontSize: 11, fill: '#d1d5db' }}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontSize: '12px',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: 'var(--text-secondary)' }}
          />
          {lineKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={labels[key] || key}
              stroke={getColor(key, i)}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
