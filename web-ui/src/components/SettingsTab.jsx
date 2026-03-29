import { useState } from 'react'

export default function SettingsTab({
  protocols, activeProtocol, onSetProtocol,
  addresses, onAdd, onRemove, onUpdate, onToggleGraph,
}) {
  const currentProto = protocols.find(p => p.id === activeProtocol) || protocols[0]
  const filteredAddresses = addresses.filter(a => a.protocol === activeProtocol)

  const [device, setDevice] = useState(currentProto.devices[0])
  const [address, setAddress] = useState('')
  const [count, setCount] = useState('1')
  const [label, setLabel] = useState('')

  const handleProtocolChange = (protoId) => {
    onSetProtocol(protoId)
    const proto = protocols.find(p => p.id === protoId)
    if (proto) setDevice(proto.devices[0])
  }

  const handleAdd = (e) => {
    e.preventDefault()
    const addr = parseInt(address, 10)
    const cnt = parseInt(count, 10)
    if (isNaN(addr) || addr < 0 || isNaN(cnt) || cnt < 1) return

    onAdd(activeProtocol, device, addr, cnt, label)
    setAddress('')
    setCount('1')
    setLabel('')
  }

  return (
    <main className="main">
      {/* Protocol Selection */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Communication Protocol</span>
        </div>
        <div className="panel-body">
          <div className="protocol-grid">
            {protocols.map(p => (
              <label key={p.id} className={`protocol-card ${activeProtocol === p.id ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="protocol"
                  value={p.id}
                  checked={activeProtocol === p.id}
                  onChange={() => handleProtocolChange(p.id)}
                />
                <span className="protocol-name">{p.name}</span>
                <span className="protocol-devices">{p.devices.join(', ')}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Add Address Form */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Add Device Address</span>
          <span className="panel-badge">{currentProto.name}</span>
        </div>
        <div className="panel-body">
          <form className="settings-form-row" onSubmit={handleAdd}>
            <select
              className="settings-select"
              value={device}
              onChange={e => setDevice(e.target.value)}
            >
              {currentProto.devices.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <input
              className="settings-input"
              type="number"
              min="0"
              placeholder="Start Address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              required
              style={{ width: 130 }}
            />

            <input
              className="settings-input"
              type="number"
              min="1"
              placeholder="Count"
              value={count}
              onChange={e => setCount(e.target.value)}
              required
              style={{ width: 80 }}
            />

            <input
              className="settings-input"
              type="text"
              placeholder="Label (optional)"
              value={label}
              onChange={e => setLabel(e.target.value)}
              style={{ flex: 1, minWidth: 140 }}
            />

            <button className="btn-add" type="submit">Add</button>
          </form>

          <div className="settings-hint">
            Example: {currentProto.devices[0]}0, Count=10 reads {currentProto.devices[0]}0 ~ {currentProto.devices[0]}9
          </div>
        </div>
      </div>

      {/* Configured Addresses for active protocol */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Configured Addresses ({currentProto.name})</span>
          <span className="panel-badge">{filteredAddresses.length} entries</span>
        </div>
        <div className="panel-body">
          {filteredAddresses.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
              No addresses configured for {currentProto.name}. Add one above.
            </div>
          ) : (
            <table className="device-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Range</th>
                  <th>Count</th>
                  <th>Label</th>
                  <th>Graph</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAddresses.map(a => (
                  <tr key={a.id}>
                    <td>
                      <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
                        {a.device}
                      </span>
                    </td>
                    <td className="value">
                      {a.device}{a.address} ~ {a.device}{a.address + a.count - 1}
                    </td>
                    <td>{a.count}</td>
                    <td>
                      <input
                        className="settings-input settings-input-inline"
                        type="text"
                        value={a.label}
                        onChange={e => onUpdate(a.id, { label: e.target.value })}
                      />
                    </td>
                    <td>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={a.graphEnabled}
                          onChange={() => onToggleGraph(a.id)}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                    <td>
                      <button className="btn-remove" onClick={() => onRemove(a.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  )
}
