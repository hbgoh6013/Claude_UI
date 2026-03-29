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

// 다크 테마에 어울리는 차트 색상 팔레트
const COLORS = [
  '#60a5fa', '#22c55e', '#f59e0b', '#a78bfa',
  '#f472b6', '#34d399', '#fb923c', '#38bdf8',
]

/**
 * 실시간 시계열 차트
 *
 * @param {array} data - [{ time: "12:00:01", D0: 1234, D10: 500, ... }, ...]
 * @param {array} lineKeys - 그래프에 표시할 키 목록 ["D0", "D10", "M100", ...]
 * @param {object} labels - 키별 라벨 매핑 { D0: "Temperature", D10: "Pressure" }
 */
export default function RealtimeChart({ data, lineKeys, labels = {}, height = 350 }) {
  if (!data || data.length === 0 || lineKeys.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
        Waiting for data...
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="time"
          stroke="var(--text-muted)"
          tick={{ fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="var(--text-muted)"
          tick={{ fontSize: 11 }}
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
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
