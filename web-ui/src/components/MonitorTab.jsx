import RealtimeChart from './RealtimeChart'

function getStatus(val, low, high) {
  if (val < low || val > high) return 'danger'
  if (val < low * 1.1 || val > high * 0.9) return 'warning'
  return 'normal'
}

const statusLabels = { normal: 'Normal', warning: 'Warning', danger: 'Alarm' }

export default function MonitorTab({ displayData, logs, chartData, lineKeys, lineLabels }) {
  const tempStatus = getStatus(Number(displayData.temperature), 20, 30)
  const pressStatus = getStatus(Number(displayData.pressure), 0.8, 1.4)
  const speedStatus = getStatus(displayData.motorSpeed, 1000, 1800)

  return (
    <main className="main">
      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Temperature</div>
          <div className="stat-value">{displayData.temperature}<span className="unit">&deg;C</span></div>
          <div className={`stat-status ${tempStatus}`}>{statusLabels[tempStatus]}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pressure</div>
          <div className="stat-value">{displayData.pressure}<span className="unit">MPa</span></div>
          <div className={`stat-status ${pressStatus}`}>{statusLabels[pressStatus]}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Motor Speed</div>
          <div className="stat-value">{displayData.motorSpeed}<span className="unit">RPM</span></div>
          <div className={`stat-status ${speedStatus}`}>{statusLabels[speedStatus]}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Product Count</div>
          <div className="stat-value">{displayData.productCount.toLocaleString()}</div>
          <div className="stat-status normal">Running</div>
        </div>
      </div>

      {/* Real-time Chart */}
      {lineKeys.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Real-time Trends</span>
            <span className="panel-badge">{lineKeys.length} signals</span>
          </div>
          <div className="panel-body chart-container">
            <RealtimeChart data={chartData} lineKeys={lineKeys} labels={lineLabels} />
          </div>
        </div>
      )}

      {/* Panels */}
      <div className="panels">
        {/* CC-Link Stations */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">CC-Link IE Stations</span>
            <span className="panel-badge">{displayData.devices.length} devices</span>
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
                {displayData.devices.map(d => (
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

        {/* Register Values */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Device Registers</span>
            <span className="panel-badge">{displayData.registers.length} registers</span>
          </div>
          <div className="panel-body">
            <div className="register-grid">
              {displayData.registers.map(r => (
                <div key={r.addr} className="register-item">
                  <div className="register-addr">{r.addr}</div>
                  <div className="register-val">{r.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Communication Log */}
        <div className="panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panel-header">
            <span className="panel-title">Communication Log</span>
            <span className="panel-badge">{logs.length} entries</span>
          </div>
          <div className="panel-body">
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
