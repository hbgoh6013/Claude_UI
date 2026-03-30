import RealtimeChart from './RealtimeChart'
import SystemMonitor from './SystemMonitor'
import useDemoMode from '../useDemoMode'

export default function MonitorTab({
  displayData, logs, chartData,
  overlaidKeys, overlaidLabels,
  individualKeys, individualLabels,
  allAddresses,
  demoMode, connected,
}) {
  const {
    demoBuffer, demoRegisters,
    demoOverlaidKeys, demoIndividualKeys,
    allLabelsMap, demoDevices,
  } = useDemoMode(demoMode, allAddresses)

  const activeChartData = demoMode ? demoBuffer : chartData
  const activeOverlaidKeys = demoMode ? demoOverlaidKeys : overlaidKeys
  const activeOverlaidLabels = demoMode ? allLabelsMap : overlaidLabels
  const activeIndividualKeys = demoMode ? demoIndividualKeys : individualKeys
  const activeIndividualLabels = demoMode ? allLabelsMap : individualLabels
  const activeDevices = demoMode ? demoDevices : displayData.devices
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
                      <span className={`status-text-${d.status === 'RUN' ? 'success' : d.status === 'ERR' ? 'danger' : 'warning'}`}>
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
        <div className="panel panel-full-width">
          <div className="panel-header">
            <span className="panel-title">System Resources</span>
          </div>
          <div className="panel-body">
            <SystemMonitor demoMode={demoMode} />
          </div>
        </div>

        {/* Communication Log */}
        <div className="panel log-panel panel-full-width">
          <div className="panel-header">
            <span className="panel-title">Communication Log</span>
            <span className="panel-badge">{logs.length} entries</span>
          </div>
          <div className="panel-body log-body">
            <div className="log-list">
              {logs.map((log, i) => (
                <div key={`${log.time}-${i}`} className={`log-entry ${log.type}`}>
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
