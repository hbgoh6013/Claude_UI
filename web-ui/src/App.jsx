import { useState, useEffect, useMemo } from 'react'
import useWebSocket from './useWebSocket'
import useSettings from './useSettings'
import useChartHistory from './useChartHistory'
import TabBar from './components/TabBar'
import MonitorTab from './components/MonitorTab'
import SettingsTab from './components/SettingsTab'
import './App.css'

const emptyData = {
  temperature: '--',
  pressure: '--',
  motorSpeed: 0,
  productCount: 0,
  devices: [],
  registers: [],
}

function App() {
  const { data, connected, logs, send } = useWebSocket('ws://localhost:8080')
  const settings = useSettings(send, connected)
  const [activeTab, setActiveTab] = useState('monitor')
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const displayData = data || emptyData

  useEffect(() => {
    if (data) setLastUpdate(new Date())
  }, [data])

  // 그래프 활성화된 주소 목록
  const graphAddresses = useMemo(() =>
    settings.addresses.filter(a => a.graphEnabled),
    [settings.addresses]
  )

  // 차트에 표시할 라인 키와 라벨 계산
  const { lineKeys, lineLabels } = useMemo(() => {
    const keys = []
    const labels = {}
    for (const addr of graphAddresses) {
      for (let i = 0; i < addr.count; i++) {
        const key = `${addr.device}${addr.address + i}`
        keys.push(key)
        labels[key] = addr.label && addr.count === 1
          ? addr.label
          : addr.label
            ? `${addr.label} [${key}]`
            : key
      }
    }
    return { lineKeys: keys, lineLabels: labels }
  }, [graphAddresses])

  // 차트 히스토리 데이터
  const chartData = useChartHistory(data, graphAddresses)

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">
            PLC <span>Monitor</span>
          </div>
          <span className="header-badge" style={{
            background: connected ? 'var(--success-bg)' : 'var(--danger-bg)',
            color: connected ? 'var(--success)' : 'var(--danger)',
          }}>
            CC-Link IE Field
          </span>
        </div>
        <div className="header-right">
          <div className="status-indicator">
            <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
            <span>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <span>Mitsubishi Q Series</span>
          <span>Updated: {lastUpdate.toTimeString().slice(0, 8)}</span>
        </div>
      </header>

      {/* Tab Bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === 'monitor' ? (
        <MonitorTab
          displayData={displayData}
          logs={logs}
          chartData={chartData}
          lineKeys={lineKeys}
          lineLabels={lineLabels}
        />
      ) : (
        <SettingsTab
          addresses={settings.addresses}
          onAdd={settings.addAddress}
          onRemove={settings.removeAddress}
          onUpdate={settings.updateAddress}
          onToggleGraph={settings.toggleGraph}
        />
      )}
    </div>
  )
}

export default App
