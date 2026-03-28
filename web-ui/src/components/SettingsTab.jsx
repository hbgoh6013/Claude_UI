import { useState } from 'react'

const DEVICE_TYPES = ['D', 'M', 'Y', 'X']

export default function SettingsTab({ addresses, onAdd, onRemove, onUpdate, onToggleGraph }) {
  const [device, setDevice] = useState('D')
  const [address, setAddress] = useState('')
  const [count, setCount] = useState('1')
  const [label, setLabel] = useState('')

  const handleAdd = (e) => {
    e.preventDefault()
    const addr = parseInt(address, 10)
    const cnt = parseInt(count, 10)
    if (isNaN(addr) || addr < 0 || isNaN(cnt) || cnt < 1) return

    onAdd(device, addr, cnt, label)
    setAddress('')
    setCount('1')
    setLabel('')
  }

  return (
    <main className="main">
      {/* Add Address Form */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Add Device Address</span>
        </div>
        <div className="panel-body">
          <form className="settings-form-row" onSubmit={handleAdd}>
            <select
              className="settings-select"
              value={device}
              onChange={e => setDevice(e.target.value)}
            >
              {DEVICE_TYPES.map(d => (
                <option key={d} value={d}>{d} Register</option>
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
            Example: Device=D, Address=0, Count=10 reads D0 ~ D9
          </div>
        </div>
      </div>

      {/* Configured Addresses */}
      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Configured Addresses</span>
          <span className="panel-badge">{addresses.length} entries</span>
        </div>
        <div className="panel-body">
          {addresses.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
              No addresses configured. Add one above.
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
                {addresses.map(a => (
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
                      <button
                        className="btn-remove"
                        onClick={() => onRemove(a.id)}
                      >
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
