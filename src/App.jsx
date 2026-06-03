import { useState, useEffect } from 'react'
import './App.css'

const BASE_URL = 'http://localhost:5000'
const API_URL = `${BASE_URL}/customers`
const RESTAURANT_ID = 'default'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [customers, setCustomers] = useState([])
  const [smsHistory, setSmsHistory] = useState([])
  const [filterStatus, setFilterStatus] = useState('All')
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    amount: ''
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // New States
  const [settings, setSettings] = useState({
    restaurantName: '',
    phone: '',
    address: '',
    defaultThanks: '',
    email: ''
  })
  const [templates, setTemplates] = useState({
    thankYou: '',
    reservation: '',
    promotional: ''
  })
  const [metrics, setMetrics] = useState({
    totalCustomers: 0,
    totalSent: 0,
    sentToday: 0,
    failed: 0,
    pending: 0
  })
  const [gatewayStatus, setGatewayStatus] = useState({
    status: 'Offline',
    lastSeen: null,
    batteryLevel: 0,
    appVersion: '---'
  })

  // Fetch data
  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 60000)
    return () => clearInterval(interval)
  }, [])

  const fetchAll = () => {
    fetchCustomers()
    fetchHistory()
    fetchSettings()
    fetchTemplates()
    fetchMetrics()
    fetchGatewayStatus()
  }

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`${API_URL}?restaurantId=${RESTAURANT_ID}`)
      if (!response.ok) throw new Error('Failed to fetch customers')
      const data = await response.json()
      setCustomers(data)
      setError(null)
    } catch (err) {
      setError('Could not connect to the server.')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${BASE_URL}/sms-queue/history?restaurantId=${RESTAURANT_ID}`)
      if (!response.ok) throw new Error('Failed to fetch history')
      const data = await response.json()
      setSmsHistory(data)
    } catch (err) { console.error('History fetch error', err) }
  }

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${BASE_URL}/settings?restaurantId=${RESTAURANT_ID}`)
      const data = await res.json()
      setSettings(data)
    } catch (err) { console.error('Settings fetch error', err) }
  }

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${BASE_URL}/templates?restaurantId=${RESTAURANT_ID}`)
      const data = await res.json()
      setTemplates(data)
    } catch (err) { console.error('Templates fetch error', err) }
  }

  const fetchMetrics = async () => {
    try {
      const res = await fetch(`${BASE_URL}/metrics?restaurantId=${RESTAURANT_ID}`)
      const data = await res.json()
      setMetrics(data)
    } catch (err) { console.error('Metrics fetch error', err) }
  }

  const fetchGatewayStatus = async () => {
    try {
      const res = await fetch(`${BASE_URL}/gateway/status`)
      const data = await res.json()
      setGatewayStatus(data)
    } catch (err) { console.error('Gateway status error', err) }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch(`${BASE_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, restaurantId: RESTAURANT_ID })
      })
      if (res.ok) alert('Settings saved successfully!')
    } catch (err) { alert('Save failed') }
  }

  const handleSaveTemplates = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch(`${BASE_URL}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...templates, restaurantId: RESTAURANT_ID })
      })
      if (res.ok) alert('Templates saved successfully!')
    } catch (err) { alert('Save failed') }
  }

  const handleResend = async (smsId) => {
    if (!window.confirm('Would you like to manually resend this message?')) return
    try {
      const response = await fetch(`${BASE_URL}/sms-queue/${smsId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Pending', restaurantId: RESTAURANT_ID })
      })
      if (response.ok) {
        fetchAll()
      }
    } catch (err) { alert('Resend failed') }
  }

  const filteredHistory = smsHistory.filter(sms => {
    const matchesSearch = (sms.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sms.phone || '').includes(searchTerm)
    const matchesFilter = filterStatus === 'All' || sms.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.phone || !formData.amount) return

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, restaurantId: RESTAURANT_ID })
      })

      if (!response.ok) throw new Error('Failed to add customer')

      await response.json()
      setFormData({ name: '', phone: '', amount: '' })
      fetchAll()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const deleteSmsRecord = async (id) => {
    if (!window.confirm('Delete this SMS record from history? This action cannot be undone.')) return
    try {
      const response = await fetch(`${BASE_URL}/sms-queue/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete record')
      fetchAll()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  return (
    <div className="root-container">
      <nav className="navbar">
        <div className="logo-area">
          <div className="logo-text">Mikrod<span>Tech</span></div>
          <div className="badge-logo">{settings.restaurantName || 'SaaS Dashboard'}</div>
        </div>
        <div className="nav-links">
          <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
          <button className={`nav-btn ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>Templates</button>
          <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
        </div>
      </nav>

      <main className="dashboard-content">
        {error && <div className="error-banner">{error}</div>}

        {activeTab === 'dashboard' && (
          <>
            <section className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Total Customers</span>
                <span className="stat-value">{metrics.totalCustomers}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Messages Today</span>
                <span className="stat-value" style={{ color: '#166534' }}>{metrics.sentToday}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Total Sent</span>
                <span className="stat-value" style={{ color: 'var(--primary)' }}>{metrics.totalSent}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Pending</span>
                <span className="stat-value" style={{ color: '#ea580c' }}>{metrics.pending}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Failed</span>
                <span className="stat-value" style={{ color: '#991b1b' }}>{metrics.failed}</span>
              </div>
              <div className={`stat-card gateway-card ${gatewayStatus.status === 'Online' ? 'status-online' : 'status-offline'}`}>
                <span className="stat-label">Gateway Status</span>
                <span className="stat-value status-indicator">
                  {gatewayStatus.status === 'Online' ? '🟢 Online' : '🔴 Offline'}
                </span>
                <div className="gateway-mini-stats">
                  <span>Battery: {gatewayStatus.batteryLevel}%</span>
                  <span>v{gatewayStatus.appVersion}</span>
                </div>
                <span className="last-seen-text">
                  Last Seen: {gatewayStatus.lastSeen ? new Date(gatewayStatus.lastSeen).toLocaleTimeString() : 'Never'}
                </span>
              </div>
            </section>

            <div className="main-grid">
              <aside className="card-section">
                <h2 className="section-title">Register Customer</h2>
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. John Doe" required />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="e.g. 0700 000 000" required />
                  </div>
                  <div className="form-group">
                    <label>Purchase Amount ($)</label>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} placeholder="0.00" step="0.01" required />
                  </div>
                  <button type="submit" className="primary-button" disabled={loading}>
                    {loading ? 'Processing...' : 'Register Entry'}
                  </button>
                </form>
              </aside>

              <section className="card-section">
                <div className="table-header">
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <h2 className="section-title" style={{ margin: 0 }}>SMS History Logs</h2>
                    <select
                      className="filter-select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="All">All Status</option>
                      <option value="Pending">Pending</option>
                      <option value="Sent">Sent</option>
                      <option value="Failed">Failed</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search name or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="table-container">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Created At</th>
                        <th>Customer Name</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Sent At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.length > 0 ? (
                        filteredHistory.map((sms) => (
                          <tr key={sms.id}>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sms.createdAt}</td>
                            <td style={{ fontWeight: '600' }}>{sms.customerName}</td>
                            <td>{sms.phone}</td>
                            <td>
                              <span className={`badge badge-${sms.status?.toLowerCase()}`}>
                                {sms.status}
                                {sms.status === 'Failed' && (
                                  <button
                                    onClick={() => handleResend(sms.id)}
                                    className="resend-mini-btn"
                                    title="Resend Now"
                                  >
                                    Resend
                                  </button>
                                )}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.8rem' }}>{sms.sentAt || '---'}</td>
                            <td>
                              <button onClick={() => deleteSmsRecord(sms.id)} className="icon-button delete-button">Delete</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>No history found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <section className="card-section max-width-form">
            <h2 className="section-title">Restaurant Settings</h2>
            <form onSubmit={handleSaveSettings}>
              <div className="form-grid-2">
                <div className="form-group">
                  <label>Restaurant Name</label>
                  <input type="text" value={settings.restaurantName} onChange={e => setSettings({ ...settings, restaurantName: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Business Phone</label>
                  <input type="tel" value={settings.phone} onChange={e => setSettings({ ...settings, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Business Address</label>
                <input type="text" value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} />
              </div>
              <div className="form-group">
                <label>System Email (Optional)</label>
                <input type="email" value={settings.email} onChange={e => setSettings({ ...settings, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Default Thank You Message (Fallback)</label>
                <textarea className="form-textarea" value={settings.defaultThanks} onChange={e => setSettings({ ...settings, defaultThanks: e.target.value })} rows="3"></textarea>
              </div>
              <button type="submit" className="primary-button">Save Settings</button>
            </form>
          </section>
        )}

        {activeTab === 'templates' && (
          <section className="card-section max-width-form">
            <h2 className="section-title">Message Templates</h2>
            <p className="helper-text">Use <code>{`{{name}}`}</code> and <code>{`{{restaurantName}}`}</code> as placeholders.</p>
            <form onSubmit={handleSaveTemplates}>
              <div className="form-group">
                <label>Thank You Message (Sent to New Customers)</label>
                <textarea className="form-textarea" value={templates.thankYou} onChange={e => setTemplates({ ...templates, thankYou: e.target.value })} rows="3"></textarea>
              </div>
              <div className="form-group">
                <label>Reservation Reminder</label>
                <textarea className="form-textarea" value={templates.reservation} onChange={e => setTemplates({ ...templates, reservation: e.target.value })} rows="3"></textarea>
              </div>
              <div className="form-group">
                <label>Promotional Message</label>
                <textarea className="form-textarea" value={templates.promotional} onChange={e => setTemplates({ ...templates, promotional: e.target.value })} rows="3"></textarea>
              </div>
              <button type="submit" className="primary-button">Save Templates</button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}

export default App

