import { useState, useEffect, useRef, useMemo } from 'react'
import RealtimeChart from './RealtimeChart'
import SystemMonitor from './SystemMonitor'

// 사용자가 등록한 주소를 기반으로 데모 데이터 생성
function generateDemoPoint(allKeys, prevBuffer) {
  const now = new Date()
  const time = now.toTimeString().slice(0, 8)
  const point = { time }
  const prev = prevBuffer.length > 0 ? prevBuffer[prevBuffer.length - 1] : null

  for (const key of allKeys) {
    const isbit = key.startsWith('M') || key.startsWith('X') || key.startsWith('Y')
      || key.startsWith('CO') || key.startsWith('DI')
      || key.startsWith('I') || key.startsWith('Q')

    if (isbit) {
      // 비트 디바이스: 0 또는 1, 가끔 토글
      point[key] = prev && prev[key] !== undefined
        ? (Math.random() > 0.95 ? (prev[key] === 0 ? 1 : 0) : prev[key])
        : Math.round(Math.random())
    } else {
      // 워드 디바이스: 랜덤 워크
      const base = 5000 + Math.abs(hashCode(key) % 25000)
      const prevVal = prev && prev[key] !== undefined ? prev[key] : base
      point[key] = Math.round(Math.max(0, Math.min(65535, prevVal + (Math.random() - 0.5) * 200)))
    }
  }

  return point
}

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

// 등록된 주소에서 모든 개별 키 추출
function expandKeys(addresses) {
  const keys = []
  for (const addr of addresses) {
    for (let i = 0; i < addr.count; i++) {
      keys.push(`${addr.device}${addr.address + i}`)
    }
  }
  return keys
}

const DEMO_DEVICES = [
  { station: 1, name: 'Formation Charger #1', type: 'Remote Device', status: 'RUN', value: 85 },
  { station: 2, name: 'Formation Charger #2', type: 'Remote Device', status: 'RUN', value: 72 },
  { station: 3, name: 'Aging Chamber', type: 'Remote I/O', status: 'RUN', value: 45 },
  { station: 4, name: 'Inspection Unit', type: 'Remote Device', status: 'RUN', value: 98 },
  { station: 5, name: 'Stacking Machine', type: 'Remote I/O', status: 'RUN', value: 63 },
]

export default function MonitorTab({
  displayData, logs, chartData,
  overlaidKeys, overlaidLabels,
  individualKeys, individualLabels,
  allAddresses,
  demoMode, connected,
}) {
  const [demoBuffer, setDemoBuffer] = useState([])
  const [demoRegisters, setDemoRegisters] = useState([])
  const demoBufferRef = useRef([])

  // 등록된 모든 키
  const allKeys = useMemo(() => expandKeys(allAddresses), [allAddresses])

  // demo용 overlaid/individual 키 계산
  const demoOverlaidKeys = useMemo(() => {
    const keys = []
    for (const addr of allAddresses.filter(a => a.graphEnabled)) {
      for (let i = 0; i < addr.count; i++) keys.push(`${addr.device}${addr.address + i}`)
    }
    return keys
  }, [allAddresses])

  const demoIndividualKeys = useMemo(() => {
    const keys = []
    for (const addr of allAddresses.filter(a => !a.graphEnabled)) {
      for (let i = 0; i < addr.count; i++) keys.push(`${addr.device}${addr.address + i}`)
    }
    return keys
  }, [allAddresses])

  // 라벨 매핑
  const allLabelsMap = useMemo(() => {
    const m = {}
    for (const addr of allAddresses) {
      for (let i = 0; i < addr.count; i++) {
        const key = `${addr.device}${addr.address + i}`
        m[key] = addr.label && addr.count === 1
          ? addr.label
          : addr.label ? `${addr.label} [${key}]` : key
      }
    }
    return m
  }, [allAddresses])

  useEffect(() => {
    if (demoMode && allKeys.length > 0) {
      demoBufferRef.current = []
      const timer = setInterval(() => {
        const point = generateDemoPoint(allKeys, demoBufferRef.current)
        demoBufferRef.current = [...demoBufferRef.current, point].slice(-60)
        setDemoBuffer([...demoBufferRef.current])
        setDemoRegisters(allKeys.map(key => ({ addr: key, value: point[key] })))
      }, 1000)
      return () => clearInterval(timer)
    } else {
      demoBufferRef.current = []
      setDemoBuffer([])
      setDemoRegisters([])
    }
  }, [demoMode, allKeys.join(',')])

  const activeChartData = demoMode ? demoBuffer : chartData
  const activeOverlaidKeys = demoMode ? demoOverlaidKeys : overlaidKeys
  const activeOverlaidLabels = demoMode ? allLabelsMap : overlaidLabels
  const activeIndividualKeys = demoMode ? demoIndividualKeys : individualKeys
  const activeIndividualLabels = demoMode ? allLabelsMap : individualLabels
  const activeDevices = demoMode ? DEMO_DEVICES : displayData.devices
  const activeRegisters = demoMode ? demoRegisters : displayData.registers
  const isConnected = demoMode ? true : connected
  const hasAnyCharts = activeOverlaidKeys.length > 0 || activeIndividualKeys.length > 0

  return (
    <main className="main">
      {/* Chart Trends Divider */}
      <div className="section-divider">
        <span className="section-divider-label">Chart Trends</span>
      </div>

      {/* Charts Grid - Combined + Individual 동일 크기 */}
      {hasAnyCharts && (
        <div className="individual-charts-grid">
          {/* Combined Chart */}
          {activeOverlaidKeys.length > 0 && (
            <div className="panel chart-panel-small">
              <div className="panel-header">
                <span className="panel-title">Combined Trends</span>
                <span className="panel-badge">{activeOverlaidKeys.length} signals</span>
              </div>
              <div className="panel-body chart-container-small">
                <RealtimeChart data={activeChartData} lineKeys={activeOverlaidKeys} labels={activeOverlaidLabels} height={200} />
              </div>
            </div>
          )}

          {/* Individual Charts */}
          {activeIndividualKeys.map(key => (
            <div key={key} className="panel chart-panel-small">
              <div className="panel-header">
                <span className="panel-title">{activeIndividualLabels[key] || key}</span>
                <span className="panel-badge">{key}</span>
              </div>
              <div className="panel-body chart-container-small">
                <RealtimeChart data={activeChartData} lineKeys={[key]} labels={activeIndividualLabels} height={200} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 차트 없을 때 */}
      {!hasAnyCharts && (
        <div className="panel chart-panel">
          <div className="panel-header">
            <span className="panel-title">Real-time Data Trends</span>
            <span className="panel-badge">No signals</span>
          </div>
          <div className="panel-body chart-container-large">
            <div className="chart-empty">
              {isConnected
                ? 'Go to Settings tab and add addresses to monitor.'
                : 'Waiting for connection to C++ backend...'}
            </div>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="section-divider">
        <span className="section-divider-label">Device Details</span>
      </div>

      {/* Panels */}
      <div className="panels">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">CC-Link IE Stations</span>
            <span className="panel-badge">{activeDevices.length} devices</span>
          </div>
          <div className="panel-body">
            <table className="device-table">
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Device Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {activeDevices.map(d => (
                  <tr key={d.station}>
                    <td>#{d.station}</td>
                    <td>{d.name}</td>
                    <td>{d.type}</td>
                    <td>
                      <span style={{
                        color: d.status === 'RUN' ? 'var(--success)' :
                               d.status === 'ERR' ? 'var(--danger)' : 'var(--warning)'
                      }}>
                        {d.status}
                      </span>
                    </td>
                    <td className="value">{d.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Device Registers</span>
            <span className="panel-badge">{activeRegisters.length} registers</span>
          </div>
          <div className="panel-body">
            <div className="register-grid">
              {activeRegisters.map(r => (
                <div key={r.addr} className="register-item">
                  <div className="register-addr">{r.addr}</div>
                  <div className="register-val">{r.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* System Monitor */}
        <div className="panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-header">
            <span className="panel-title">System Resources</span>
          </div>
          <div className="panel-body">
            <SystemMonitor demoMode={demoMode} />
          </div>
        </div>

        {/* Communication Log */}
        <div className="panel log-panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-header">
            <span className="panel-title">Communication Log</span>
            <span className="panel-badge">{logs.length} entries</span>
          </div>
          <div className="panel-body log-body">
            <div className="log-list">
              {logs.map((log, i) => (
                <div key={i} className={`log-entry ${log.type}`}>
                  <span className="log-time">{log.time}</span>
                  <span className="log-msg">{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
