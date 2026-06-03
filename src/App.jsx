import { useState, useEffect } from 'react'
import './App.css'
import API_BASE from './config/api'

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

  // Auth State
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'))
  const [restaurant, setRestaurant] = useState(JSON.parse(localStorage.getItem('restaurant') || 'null'))
  const [authMode, setAuthMode] = useState('login') // 'login' or 'register'

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

  // API Wrapper with Auth
  const fetchWithAuth = async (endpoint, options = {}) => {
    const headers = {
      ...options.headers,
      'Content-Type': 'application/json',
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers })

      if (response.status === 401) {
        handleLogout()
        throw new Error('Session expired. Please login again.')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (err) {
      if (err.message.includes('Failed to fetch')) {
        throw new Error('Server unreachable. Please check your connection.')
      }
      throw err
    }
  }

  const handleLogin = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Login failed')

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('restaurant', JSON.stringify(data.restaurant))

      setToken(data.token)
      setUser(data.user)
      setRestaurant(data.restaurant)
      setError(null)
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const handleRegister = async (registrationData) => {
    try {
      const response = await fetch(`${API_BASE}/onboarding/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Onboarding failed')

      // Auto-login after successful registration
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('restaurant', JSON.stringify(data.restaurant))

      setToken(data.token)
      setUser(data.user)
      setRestaurant(data.restaurant)
      setError(null)
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('restaurant')
    setToken(null)
    setUser(null)
    setRestaurant(null)
  }

  useEffect(() => {
    if (token) {
      // Initial load
      refreshDashboard(false)

      // Automatic polling every 15 seconds
      const interval = setInterval(() => refreshDashboard(true), 15000)

      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [token])

  const refreshDashboard = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true)

      const [customersData, historyData, settingsData, templatesData, metricsData, statusData] = await Promise.all([
        fetchWithAuth('/customers'),
        fetchWithAuth('/sms-queue/history'),
        fetchWithAuth('/settings'),
        fetchWithAuth('/templates'),
        fetchWithAuth('/metrics'),
        fetchWithAuth('/gateway/status')
      ])

      // Only update state if data actually changed (React does this optimization automatically for simple values)
      setCustomers(customersData)
      setSmsHistory(historyData)
      setSettings(settingsData)
      setTemplates(templatesData)
      setMetrics(metricsData)
      setGatewayStatus(statusData)
      setError(null)
    } catch (err) {
      // Don't show technical errors for background sync unless it's a critical auth failure
      if (!isBackground) {
        setError(err.message)
      }
    } finally {
      if (!isBackground) setLoading(false)
    }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    try {
      await fetchWithAuth('/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      })
      alert('Settings saved successfully!')
    } catch (err) { alert('Save failed: ' + err.message) }
  }

  const handleSaveTemplates = async (e) => {
    e.preventDefault()
    try {
      await fetchWithAuth('/templates', {
        method: 'POST',
        body: JSON.stringify(templates)
      })
      alert('Templates saved successfully!')
    } catch (err) { alert('Save failed: ' + err.message) }
  }

  const handleResend = async (smsId) => {
    if (!window.confirm('Would you like to manually resend this message?')) return
    try {
      await fetchWithAuth(`/sms-queue/${smsId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Pending' })
      })
      fetchAll()
    } catch (err) { alert('Resend failed: ' + err.message) }
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
      await fetchWithAuth('/customers', {
        method: 'POST',
        body: JSON.stringify(formData)
      })
      setFormData({ name: '', phone: '', amount: '' })
      fetchAll()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const deleteSmsRecord = async (id) => {
    if (!window.confirm('Delete this SMS record from history? This action cannot be undone.')) return
    try {
      await fetchWithAuth(`/sms-queue/${id}`, { method: 'DELETE' })
      fetchAll()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  if (!token) {
    return authMode === 'login'
      ? <LoginPage onLogin={handleLogin} onToggleMode={() => setAuthMode('register')} error={error} />
      : <SignupPage onRegister={handleRegister} onToggleMode={() => setAuthMode('login')} error={error} />
  }

  return (
    <div className="root-container">
      <nav className="navbar">
        <div className="logo-area">
          <div className="logo-text">Mikrod<span>Tech</span></div>
          <div className="badge-logo">{restaurant?.name || 'SaaS Dashboard'}</div>
        </div>
        <div className="nav-links">
          <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
          <button className={`nav-btn ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>Templates</button>
          <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
          <button className="nav-btn logout-btn" onClick={handleLogout}>Logout</button>
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
              <div className={`stat-card gateway-card status-${gatewayStatus.status?.toLowerCase() || 'offline'}`}>
                <span className="stat-label">Gateway Status</span>
                <span className="stat-value status-indicator">
                  {gatewayStatus.status === 'Online' ? '🟢 Online' :
                    gatewayStatus.status === 'Unregistered' ? '⚪ Unregistered' : '🔴 Offline'}
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

const LoginPage = ({ onLogin, onToggleMode, error }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onLogin(email, password)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Login</h2>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button type="submit" disabled={loading}>{loading ? '...' : 'Sign In'}</button>
        </form>
        <div className="auth-switch">
          <p>New restaurant? <button onClick={onToggleMode}>Create Account</button></p>
        </div>
      </div>
    </div>
  )
}

const SignupPage = ({ onRegister, onToggleMode, error }) => {
  const [formData, setFormData] = useState({
    restaurantName: '',
    ownerName: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)

    if (formData.password !== formData.confirmPassword) {
      return setLocalError('Passwords do not match')
    }

    setLoading(true)
    try {
      const { confirmPassword, ...data } = formData
      await onRegister(data)
    } catch (err) {
      setLocalError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Register Restaurant</h2>
        {(error || localError) && <div className="error-banner">{localError || error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Restaurant Name"
            value={formData.restaurantName}
            onChange={e => setFormData({ ...formData, restaurantName: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Owner Name"
            value={formData.ownerName}
            onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={e => setFormData({ ...formData, password: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
            required
          />
          <button type="submit" disabled={loading}>{loading ? 'Registering...' : 'Create Account'}</button>
        </form>
        <div className="auth-switch">
          <p>Already have an account? <button onClick={onToggleMode}>Sign In</button></p>
        </div>
      </div>
    </div>
  )
}

export default App
