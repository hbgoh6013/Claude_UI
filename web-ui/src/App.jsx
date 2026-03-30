import { useState, useEffect, useMemo, useRef } from 'react'
import useWebSocket from './useWebSocket'
import useSettings from './useSettings'
import useChartHistory from './useChartHistory'
import { splitByGraphEnabled } from './utils/addressUtils'
import ErrorBoundary from './components/ErrorBoundary'
import TabBar from './components/TabBar'
import MonitorTab from './components/MonitorTab'
import SettingsTab from './components/SettingsTab'
import './App.css'

const emptyData = {
  devices: [],
  registers: [],
}

function App() {
  // Use a ref to break the circular dependency between useWebSocket and useSettings
  const configSyncRef = useRef(null)
  const { data, connected, logs, send } = useWebSocket(undefined, {
    onConfigSync: (...args) => configSyncRef.current?.(...args),
  })
  const settings = useSettings(send)
  useEffect(() => {
    configSyncRef.current = settings.handleConfigSync
  }, [settings.handleConfigSync])
  const [activeTab, setActiveTab] = useState('monitor')
  const [demoMode, setDemoMode] = useState(false)

  const displayData = data || emptyData

  // Derive last update time from data changes (no state needed)
  const lastUpdateText = useMemo(() => {
    return new Date().toTimeString().slice(0, 8)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  // 라인 키와 라벨 계산 (선택/비선택 분리)
  const { overlaidKeys, overlaidLabels, individualKeys, individualLabels } = useMemo(
    () => splitByGraphEnabled(settings.addresses),
    [settings.addresses]
  )

  // 모든 주소의 차트 히스토리 데이터
  const chartData = useChartHistory(data, settings.addresses)

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">
            <span className="logo-samsung">SAMSUNG</span>
            <span className="logo-sdi">SDI</span>
          </div>
        </div>
        <div className="header-right">
          <div className="status-indicator">
            <div className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
            <span>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <span>Updated: {lastUpdateText}</span>
        </div>
      </header>

      {/* Tab Bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} demoMode={demoMode} onToggleDemo={() => setDemoMode(d => !d)} />

      {/* Tab Content */}
      <ErrorBoundary>
        {activeTab === 'monitor' ? (
          <MonitorTab
            displayData={displayData}
            logs={logs}
            chartData={chartData}
            overlaidKeys={overlaidKeys}
            overlaidLabels={overlaidLabels}
            individualKeys={individualKeys}
            individualLabels={individualLabels}
            allAddresses={settings.addresses}
            demoMode={demoMode}
            connected={connected}
          />
        ) : (
          <SettingsTab
            protocols={settings.protocols}
            activeProtocol={settings.activeProtocol}
            onSetProtocol={settings.setActiveProtocol}
            addresses={settings.addresses}
            onAdd={settings.addAddress}
            onRemove={settings.removeAddress}
            onUpdate={settings.updateAddress}
            onToggleGraph={settings.toggleGraph}
          />
        )}
      </ErrorBoundary>
    </div>
  )
}

export default App
