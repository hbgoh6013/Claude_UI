import { useState, useEffect } from 'react'

// 3D 디스크 SVG 컴포넌트
function Disk3D({ label, usedPercent, usedGB, totalGB }) {
  const angle = (usedPercent / 100) * 360
  const color = usedPercent > 90 ? '#ef4444' : usedPercent > 70 ? '#f59e0b' : '#3b82f6'
  const bgColor = '#2e3346'

  // 타원 기반 3D 디스크
  const cx = 60, cy = 50
  const rx = 50, ry = 18
  const depth = 30

  // 사용량 호 계산 (상단 타원 위)
  const startAngle = -90
  const endAngle = startAngle + (usedPercent / 100) * 360

  function ellipsePoint(angleDeg, yOffset = 0) {
    const rad = (angleDeg * Math.PI) / 180
    return {
      x: cx + rx * Math.cos(rad),
      y: cy + ry * Math.sin(rad) + yOffset,
    }
  }

  // 사용량 호 path
  function arcPath(startDeg, endDeg, yOffset = 0) {
    if (endDeg - startDeg >= 360) {
      // 전체 타원
      const p1 = ellipsePoint(0, yOffset)
      const p2 = ellipsePoint(180, yOffset)
      return `M ${p1.x} ${p1.y} A ${rx} ${ry} 0 1 1 ${p2.x} ${p2.y} A ${rx} ${ry} 0 1 1 ${p1.x} ${p1.y}`
    }
    const start = ellipsePoint(startDeg, yOffset)
    const end = ellipsePoint(endDeg, yOffset)
    const largeArc = endDeg - startDeg > 180 ? 1 : 0
    return `M ${cx} ${cy + yOffset} L ${start.x} ${start.y} A ${rx} ${ry} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
  }

  return (
    <div className="disk-3d-wrapper">
      <svg viewBox="0 0 120 110" className="disk-3d-svg">
        {/* 측면 (3D depth) */}
        <ellipse cx={cx} cy={cy + depth} rx={rx} ry={ry} fill="#1a1d27" stroke={bgColor} strokeWidth="1" />
        <rect x={cx - rx} y={cy} width={rx * 2} height={depth} fill="#1a1d27" />
        <line x1={cx - rx} y1={cy} x2={cx - rx} y2={cy + depth} stroke={bgColor} strokeWidth="1" />
        <line x1={cx + rx} y1={cy} x2={cx + rx} y2={cy + depth} stroke={bgColor} strokeWidth="1" />

        {/* 상단 디스크 - 배경 */}
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#1a1d27" stroke={bgColor} strokeWidth="1.5" />

        {/* 상단 디스크 - 사용량 */}
        {usedPercent > 0 && (
          <path d={arcPath(startAngle, endAngle)} fill={color} opacity="0.7" />
        )}

        {/* 상단 디스크 - 테두리 */}
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" />

        {/* 퍼센트 텍스트 */}
        <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize="14" fontWeight="600">
          {usedPercent}%
        </text>
      </svg>
      <div className="disk-3d-label">{label}</div>
      <div className="disk-3d-detail">{usedGB} / {totalGB} GB</div>
    </div>
  )
}

// 원형 게이지 컴포넌트
function CircleGauge({ label, value, unit, color }) {
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const gaugeColor = value > 90 ? '#ef4444' : value > 70 ? '#f59e0b' : color

  return (
    <div className="gauge-wrapper">
      <svg viewBox="0 0 90 90" className="gauge-svg">
        {/* 배경 원 */}
        <circle cx="45" cy="45" r={radius} fill="none" stroke="#2e3346" strokeWidth="6" />
        {/* 값 원 */}
        <circle
          cx="45" cy="45" r={radius}
          fill="none" stroke={gaugeColor} strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 45 45)"
          style={{ transition: 'stroke-dashoffset 0.5s' }}
        />
        {/* 값 텍스트 */}
        <text x="45" y="42" textAnchor="middle" fill="white" fontSize="16" fontWeight="600">
          {value}%
        </text>
        <text x="45" y="56" textAnchor="middle" fill="#8b8fa3" fontSize="9">
          {unit}
        </text>
      </svg>
      <div className="gauge-label">{label}</div>
    </div>
  )
}

export default function SystemMonitor({ demoMode }) {
  const [stats, setStats] = useState({
    cpu: 0,
    memory: 0,
    diskC: { used: 0, total: 0, percent: 0 },
    diskD: { used: 0, total: 0, percent: 0 },
  })

  useEffect(() => {
    function updateStats() {
      if (demoMode) {
        // 데모 데이터
        setStats(prev => ({
          cpu: Math.min(100, Math.max(0, (prev.cpu || 35) + (Math.random() - 0.5) * 10)),
          memory: Math.min(100, Math.max(0, (prev.memory || 62) + (Math.random() - 0.5) * 3)),
          diskC: { used: 186, total: 256, percent: 73 },
          diskD: { used: 420, total: 1024, percent: 41 },
        }))
        setStats(prev => ({
          ...prev,
          cpu: Math.round(prev.cpu),
          memory: Math.round(prev.memory),
        }))
      }
      // 실제 연결 시에는 C++ 백엔드에서 시스템 정보를 전송받음
    }

    updateStats()
    const timer = setInterval(updateStats, 2000)
    return () => clearInterval(timer)
  }, [demoMode])

  return (
    <div className="system-monitor">
      <div className="system-monitor-gauges">
        <CircleGauge label="CPU" value={stats.cpu} unit="Usage" color="#3b82f6" />
        <CircleGauge label="Memory" value={stats.memory} unit="Usage" color="#a78bfa" />
      </div>
      <div className="system-monitor-disks">
        <Disk3D label="C:" usedPercent={stats.diskC.percent} usedGB={stats.diskC.used} totalGB={stats.diskC.total} />
        <Disk3D label="D:" usedPercent={stats.diskD.percent} usedGB={stats.diskD.used} totalGB={stats.diskD.total} />
      </div>
    </div>
  )
}
