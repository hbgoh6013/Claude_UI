const tabs = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'settings', label: 'Settings' },
]

export default function TabBar({ activeTab, onTabChange, demoMode, onToggleDemo }) {
  return (
    <nav className="tab-bar">
      <div className="tab-bar-left">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-bar-right">
        <label className="demo-toggle">
          <input type="checkbox" checked={demoMode} onChange={onToggleDemo} />
          <span className="demo-label">Demo</span>
        </label>
      </div>
    </nav>
  )
}
