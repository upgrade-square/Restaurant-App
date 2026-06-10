import { useState, useEffect } from 'react'
import './App.css'
import API_BASE from './config/api'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [smsHistory, setSmsHistory] = useState([])
  const [filterStatus, setFilterStatus] = useState('All')
  const [formData, setFormData] = useState({ name: '', phone: '', amount: '' })
  const [transactionCode, setTransactionCode] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('Professional')
  const [subscriptionHistory, setSubscriptionHistory] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Auth & Core State
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'))
  const [restaurant, setRestaurant] = useState(JSON.parse(localStorage.getItem('restaurant') || 'null'))
  const [authMode, setAuthMode] = useState('login')

  const [settings, setSettings] = useState({ restaurantName: '', phone: '', address: '', email: '' })
  const [templates, setTemplates] = useState({ thankYou: '' })
  const [metrics, setMetrics] = useState({ totalCustomers: 0, totalSent: 0, sentToday: 0, pending: 0, failed: 0 })
  const [gatewayStatus, setGatewayStatus] = useState({ status: 'Offline', lastSeen: null, batteryLevel: 0, isCharging: false, deviceName: 'N/A' })

  // Admin State
  const [adminMetrics, setAdminMetrics] = useState(null)
  const [adminRestaurants, setAdminRestaurants] = useState([])
  const [adminSearch, setAdminSearch] = useState('')
  const [selectedRes, setSelectedRes] = useState(null)
  const [resPayments, setResPayments] = useState([])
  const [modalType, setModalType] = useState(null) // 'view', 'activate', 'trial', 'payments'

  const isAdmin = user?.email === 'admin@test.com' || user?.role === 'admin'

  const fetchWithAuth = async (endpoint, options = {}) => {
    const headers = { ...options.headers, 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers })
      if (response.status === 401) { handleLogout(); throw new Error('Session expired') }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Error ${response.status}`)
      }
      return await response.json()
    } catch (err) { throw err }
  }

  const handleLogin = async (email, password) => {
    const data = await fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    localStorage.setItem('restaurant', JSON.stringify(data.restaurant))
    setToken(data.token)
    setUser(data.user)
    setRestaurant(data.restaurant)
  }

  const handleRegister = async (registrationData) => {
    const data = await fetchWithAuth('/onboarding/register', {
      method: 'POST',
      body: JSON.stringify(registrationData)
    })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    localStorage.setItem('restaurant', JSON.stringify(data.restaurant))
    setToken(data.token)
    setUser(data.user)
    setRestaurant(data.restaurant)
  }

  const handleLogout = () => {
    localStorage.clear()
    setToken(null); setUser(null); setRestaurant(null);
  }

  const refreshData = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true)
      const results = await Promise.all([
        fetchWithAuth('/sms-queue/history'),
        fetchWithAuth('/settings'),
        fetchWithAuth('/templates'),
        fetchWithAuth('/metrics'),
        fetchWithAuth('/gateway/status'),
        fetchWithAuth('/subscription/history')
      ])

      setSmsHistory(results[0])
      setSettings(results[1])
      setTemplates(results[2])
      setMetrics(results[3])
      setGatewayStatus(results[4])
      setSubscriptionHistory(results[5])

      if (isAdmin) {
        const aMetrics = await fetchWithAuth('/admin/metrics')
        const aRes = await fetchWithAuth('/admin/restaurants')
        setAdminMetrics(aMetrics)
        setAdminRestaurants(aRes)
      }
      setError(null)
    } catch (err) {
      if (!isBackground) setError(err.message)
    } finally {
      if (!isBackground) setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      refreshData()
      const interval = setInterval(() => refreshData(true), 15000)
      return () => clearInterval(interval)
    } else {
      setLoading(false)
    }
  }, [token])

  const handleResend = async (id) => {
    try {
      await fetchWithAuth(`/sms-queue/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'Pending' }) })
      refreshData()
    } catch (err) { alert(err.message) }
  }

  const handleVerifyPayment = async (e) => {
    e.preventDefault()
    const data = await fetchWithAuth('/subscription/verify', {
      method: 'POST',
      body: JSON.stringify({ transactionCode, plan: selectedPlan })
    })
    localStorage.setItem('restaurant', JSON.stringify(data.restaurant))
    setRestaurant(data.restaurant)
    setTransactionCode('')
    alert('Subscription Updated!')
    refreshData()
  }

  // Admin Handlers
  const fetchResDetails = async (id) => {
    const data = await fetchWithAuth(`/admin/restaurants/${id}`)
    setSelectedRes(data)
    setModalType('view')
  }

  const fetchResPayments = async (id) => {
    const data = await fetchWithAuth(`/admin/restaurants/${id}/payments`)
    setResPayments(data)
    setModalType('payments')
  }

  const handleAdminAction = async (endpoint, body = {}) => {
    try {
      const data = await fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify(body) })

      // Snappy UI update: Update the specific restaurant in the list immediately
      if (data.restaurant) {
        setAdminRestaurants(prev => prev.map(res =>
          res.id === data.restaurant.id
            ? { ...res, subscriptionStatus: data.restaurant.subscriptionStatus, subscriptionExpiryDate: data.restaurant.subscriptionExpiry }
            : res
        ))
      }

      alert(data.message || 'Action completed successfully')
      setModalType(null)
      refreshData(true) // Background refresh to sync everything
    } catch (err) { alert(err.message) }
  }


  const Modal = ({ title, onClose, children }) => (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="close-modal" onClick={onClose}>&times;</button>
        </div>
        {children}
      </div>
    </div>
  )

  if (!token) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <div className="brand">
            <span className="brand-mikrod">Mikrod</span>
            <span className="brand-cap">CAP</span>
          </div>
          <p className="tagline" style={{ marginBottom: '32px' }}>Turn Every Payment Into a Thank You</p>

          {authMode === 'login' ? (
            <>
              <h2>Restaurant Login</h2>
              {error && <div className="error-banner">{error}</div>}
              <form className="auth-form" onSubmit={e => { e.preventDefault(); handleLogin(e.target.email.value, e.target.password.value) }}>
                <div className="form-group"><label>Email</label><input className="form-control" name="email" type="email" required /></div>
                <div className="form-group"><label>Password</label><input className="form-control" name="password" type="password" required /></div>
                <button className="login-btn" type="submit">Login</button>
              </form>
              <div className="auth-switch">Need an account? <button onClick={() => setAuthMode('register')}>Provision Node</button></div>
            </>
          ) : (
            <>
              <h2>Provision Node</h2>
              <form className="auth-form" onSubmit={e => {
                e.preventDefault(); handleRegister({
                  restaurantName: e.target.resName.value, ownerName: e.target.ownerName.value, email: e.target.email.value, password: e.target.password.value
                })
              }}>
                <div className="form-group"><label>Restaurant Name</label><input className="form-control" name="resName" required /></div>
                <div className="form-group"><label>Owner Name</label><input className="form-control" name="ownerName" required /></div>
                <div className="form-group"><label>Email</label><input className="form-control" name="email" type="email" required /></div>
                <div className="form-group"><label>Password</label><input className="form-control" name="password" type="password" required /></div>
                <button className="login-btn" type="submit">Onboard</button>
              </form>
              <div className="auth-switch">Already onboarded? <button onClick={() => setAuthMode('login')}>Sign In</button></div>
            </>
          )}
        </div>
      </div>
    )
  }

  const StatusBadge = ({ status }) => {
    let s = status?.toLowerCase() || 'pending'
    if (s === 'suspended') s = 'inactive'
    const displayStatus = s.charAt(0).toUpperCase() + s.slice(1)
    return <span className={`badge badge-${s}`}>{displayStatus}</span>
  }

  const getDaysRemaining = (expiry) => {
    if (!expiry) return '---'
    const days = Math.ceil((new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24))
    return Math.max(0, days)
  }

  const formatAmount = (amt) => {
    if (!amt || amt === '-' || amt === 'M-Pesa') return '-'
    const num = parseFloat(amt)
    if (isNaN(num)) return amt
    return `KES ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo-area">
          <div className="brand">
            <span className="brand-mikrod">Mikrod</span>
            <span className="brand-cap">CAP</span>
          </div>
        </div>
        <div className="nav-links">
          <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
          <button className={`nav-btn ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => setActiveTab('customers')}>Customers</button>
          <button className={`nav-btn ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>Templates</button>
          <button className={`nav-btn ${activeTab === 'subscription' ? 'active' : ''}`} onClick={() => setActiveTab('subscription')}>Subscription</button>
          <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</button>
          {isAdmin && <button className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setActiveTab('admin')}>Admin</button>}

          <div className="restaurant-info">
            <div>
              <div className="res-name">{restaurant?.name}</div>
              <div className="sub-status">{restaurant?.plan} / {restaurant?.subscriptionStatus}</div>
            </div>
            <button className="nav-btn logout-btn" style={{ color: 'var(--danger)' }} onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <div className="section">
            <div className="dashboard-header">
              <h1>Dashboard</h1>
              <p className="tagline">Turn Every Payment Into a Thank You</p>
            </div>

            <div className="kpi-grid">
              <div className="card kpi-card">
                <div className="kpi-label">Customers Appreciated Today</div>
                <div className="kpi-value">{metrics.sentToday}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Messages Sent Today</div>
                <div className="kpi-value">{metrics.totalSent}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Pending Messages</div>
                <div className="kpi-value" style={{ color: 'var(--warning)' }}>{metrics.pending || 0}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Failed Messages</div>
                <div className="kpi-value" style={{ color: 'var(--danger)' }}>{metrics.failed || 0}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Total Customers</div>
                <div className="kpi-value">{metrics.totalCustomers}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Gateway Status</div>
                <div className="kpi-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem', color: gatewayStatus.status === 'Online' ? 'var(--success)' : 'var(--danger)' }}>
                      {gatewayStatus.status}
                    </span>
                    {gatewayStatus.status === 'Online' && (
                      <span className={`battery-pill ${gatewayStatus.batteryLevel < 30 ? 'critical' : gatewayStatus.batteryLevel < 80 ? 'warning' : 'healthy'}`}>
                        {gatewayStatus.isCharging && <span className="charging-icon">⚡</span>}
                        {gatewayStatus.batteryLevel}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    {gatewayStatus.deviceName}
                  </div>
                  {gatewayStatus.batteryLevel < 20 && gatewayStatus.status === 'Online' && !gatewayStatus.isCharging && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--danger)', marginTop: '4px', textAlign: 'center', lineHeight: '1.2' }}>
                      Gateway battery is low.<br />SMS may be interrupted.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="activity-section">
              <div className="card">
                <h3>Recent Message Activity</h3>
                <div className="table-container" style={{ marginTop: '16px' }}>
                  <table className="activity-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '20%' }}>Created Date</th>
                        <th style={{ width: '25%' }}>Customer Name</th>
                        <th style={{ width: '15%' }}>Phone Number</th>
                        <th style={{ width: '20%' }}>SMS Sent Time</th>
                        <th style={{ width: '10%' }}>Status</th>
                        <th style={{ width: '10%' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smsHistory.slice(0, 10).map(msg => (
                        <tr key={msg.id}>
                          <td title={msg.createdAt}>{msg.createdAt}</td>
                          <td style={{ fontWeight: 700 }} title={msg.customerName}>{msg.customerName}</td>
                          <td title={msg.phone}>{msg.phone}</td>
                          <td title={msg.sentAt || '---'}>{msg.sentAt || '---'}</td>
                          <td><StatusBadge status={msg.status} /></td>
                          <td>
                            {msg.status === 'Failed' && (
                              <button className="resend-btn" onClick={() => handleResend(msg.id)}>Resend</button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {smsHistory.length === 0 && (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>No recent activity</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div className="section">
            <div className="card">
              <h3>Bulk Appreciation Entry</h3>
              <form onSubmit={e => {
                e.preventDefault();
                fetchWithAuth('/customers', { method: 'POST', body: JSON.stringify(formData) })
                  .then(() => { setFormData({ name: '', phone: '', amount: '' }); refreshData(); alert('Appreciation Sent'); });
              }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
                <div className="form-group"><label>Customer Name</label><input className="form-control" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required /></div>
                <div className="form-group"><label>Phone Number</label><input className="form-control" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required /></div>
                <div className="form-group"><label>Bill Amount (KES)</label><input className="form-control" type="number" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} required /></div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="login-btn" style={{ width: '100%', marginTop: 0 }} type="submit">Submit Entry</button></div>
              </form>
            </div>

            <div className="card" style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                <h3>Customer Directory</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="form-control" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: '200px' }} />
                  <select className="form-control" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: '150px' }}>
                    <option value="All">All Status</option>
                    <option value="Sent">Appreciated</option>
                    <option value="Pending">Scheduled</option>
                    <option value="Failed">Failed</option>
                  </select>
                </div>
              </div>
              <div className="table-container">
                <table className="activity-table" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '20%' }}>Created Date</th>
                      <th style={{ width: '35%' }}>Customer</th>
                      <th style={{ width: '15%' }}>Phone</th>
                      <th style={{ width: '10%' }}>Status</th>
                      <th style={{ width: '20%' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smsHistory.filter(s => (s.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || s.phone.includes(searchTerm)) && (filterStatus === 'All' || s.status === filterStatus)).map(sms => (
                      <tr key={sms.id}>
                        <td title={sms.createdAt}>{sms.createdAt}</td>
                        <td style={{ fontWeight: 700 }} title={sms.customerName}>{sms.customerName}</td>
                        <td title={sms.phone}>{sms.phone}</td>
                        <td><StatusBadge status={sms.status} /></td>
                        <td className="actions">
                          {sms.status === 'Failed' && <button className="resend-btn" onClick={() => handleResend(sms.id)}>Retry</button>}
                          <button style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: '12px' }} onClick={() => fetchWithAuth(`/sms-queue/${sms.id}`, { method: 'DELETE' }).then(() => refreshData())}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="section card">
            <h3>Appreciation Template</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Use <code>{`{{name}}`}</code> for customer name and <code>{`{{restaurantName}}`}</code> for business name.</p>
            <div className="form-group">
              <textarea className="form-control" style={{ height: '150px' }} value={templates.thankYou} onChange={e => setTemplates({ ...templates, thankYou: e.target.value })} />
            </div>
            <button className="login-btn" style={{ width: '200px' }} onClick={() => fetchWithAuth('/templates', { method: 'POST', body: JSON.stringify(templates) }).then(() => alert('Saved'))}>Save Changes</button>
          </div>
        )}

        {activeTab === 'subscription' && (
          <div className="section">
            <div className="card" style={{ marginBottom: '24px' }}>
              <h3>Current Subscription Status</h3>
              <div className="kpi-grid" style={{ marginTop: '16px' }}>
                <div className="card"><div className="kpi-label">Current Plan</div><div className="kpi-value">{restaurant?.plan}</div></div>
                <div className="card"><div className="kpi-label">Status</div><div className="kpi-value" style={{ color: 'var(--success)' }}>{restaurant?.subscriptionStatus}</div></div>
                <div className="card"><div className="kpi-label">Expiry</div><div className="kpi-value" style={{ fontSize: '1.25rem' }}>{restaurant?.subscriptionExpiry ? new Date(restaurant.subscriptionExpiry).toLocaleDateString() : 'N/A'}</div></div>
                <div className="card"><div className="kpi-label">Days Remaining</div><div className="kpi-value">{getDaysRemaining(restaurant?.subscriptionExpiry)}</div></div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
              <h3>Plan Comparison</h3>
              <div className="kpi-grid" style={{ marginTop: '16px' }}>
                <div className="card" style={{ borderColor: selectedPlan === 'Starter' ? 'var(--primary-orange)' : '' }} onClick={() => setSelectedPlan('Starter')}>
                  <h4>Starter</h4>
                  <div className="price" style={{ fontSize: '1.5rem', fontWeight: 800, margin: '10px 0' }}>KES 2,500/mo</div>
                  <button className="nav-btn" style={{ width: '100%', background: selectedPlan === 'Starter' ? 'var(--primary-blue)' : '#f1f5f9', color: selectedPlan === 'Starter' ? 'white' : '' }}>Select</button>
                </div>
                <div className="card" style={{ borderColor: selectedPlan === 'Professional' ? 'var(--primary-orange)' : '' }} onClick={() => setSelectedPlan('Professional')}>
                  <h4 style={{ color: 'var(--primary-orange)' }}>Professional</h4>
                  <div className="price" style={{ fontSize: '1.5rem', fontWeight: 800, margin: '10px 0' }}>KES 5,000/mo</div>
                  <button className="nav-btn" style={{ width: '100%', background: selectedPlan === 'Professional' ? 'var(--primary-blue)' : '#f1f5f9', color: selectedPlan === 'Professional' ? 'white' : '' }}>Select</button>
                </div>
                <div className="card" style={{ borderColor: selectedPlan === 'Enterprise' ? 'var(--primary-orange)' : '' }} onClick={() => setSelectedPlan('Enterprise')}>
                  <h4>Enterprise</h4>
                  <div className="price" style={{ fontSize: '1.5rem', fontWeight: 800, margin: '10px 0' }}>KES 10,000/mo</div>
                  <button className="nav-btn" style={{ width: '100%', background: selectedPlan === 'Enterprise' ? 'var(--primary-blue)' : '#f1f5f9', color: selectedPlan === 'Enterprise' ? 'white' : '' }}>Select</button>
                </div>
              </div>

              <div style={{ marginTop: '32px' }}>
                <h4>Payment Instructions (Paybill 400200 / Account {restaurant?.id})</h4>
                <form onSubmit={handleVerifyPayment} style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                  <input className="form-control" style={{ flex: 1 }} placeholder="Enter Transaction Code" value={transactionCode} onChange={e => setTransactionCode(e.target.value)} required />
                  <button className="login-btn" style={{ marginTop: 0, padding: '0 32px' }} type="submit">Verify</button>
                </form>
              </div>
            </div>

            <div className="card">
              <h3>Payment History</h3>
              <div className="table-container" style={{ marginTop: '16px' }}>
                <table className="activity-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Transaction Code</th>
                      <th style={{ width: '20%' }}>Plan Purchased</th>
                      <th style={{ width: '15%' }}>Amount</th>
                      <th style={{ width: '15%' }}>Duration</th>
                      <th style={{ width: '15%' }}>Date</th>
                      <th style={{ width: '10%' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptionHistory.map(pay => (
                      <tr key={pay.id}>
                        <td style={{ fontWeight: 700 }} title={pay.transactionCode}>{pay.transactionCode}</td>
                        <td title={pay.plan}>{pay.plan}</td>
                        <td>KES {pay.amount?.toLocaleString()}</td>
                        <td>1 Month</td>
                        <td title={new Date(pay.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}>{new Date(pay.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td><span className="badge badge-sent">Processed</span></td>
                      </tr>
                    ))}
                    {subscriptionHistory.length === 0 && (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '60px' }}>
                          <div style={{ color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '16px' }}>💳</div>
                            <p>No subscription payments found yet.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="section card">
            <h3>Configuration</h3>
            <form onSubmit={e => { e.preventDefault(); fetchWithAuth('/settings', { method: 'POST', body: JSON.stringify(settings) }).then(() => alert('Saved')) }} style={{ marginTop: '16px' }}>
              <div className="form-group"><label>Business Identifier</label><input className="form-control" value={settings.restaurantName} onChange={e => setSettings({ ...settings, restaurantName: e.target.value })} required /></div>
              <div className="form-group"><label>Contact Phone</label><input className="form-control" type="tel" value={settings.phone} onChange={e => setSettings({ ...settings, phone: e.target.value })} /></div>
              <div className="form-group"><label>Official Email</label><input className="form-control" type="email" value={settings.email} onChange={e => setSettings({ ...settings, email: e.target.value })} /></div>
              <div className="form-group"><label>Operating Address</label><input className="form-control" value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} /></div>
              <button className="login-btn" style={{ width: '200px' }} type="submit">Commit Changes</button>
            </form>
          </div>
        )}

        {
          activeTab === 'admin' && isAdmin && (
            <div className="section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h1 style={{ margin: 0 }}>MikrodCAP Platform Management</h1>
                  <p className="tagline">Restaurant Subscription & Node Control Center</p>
                </div>
                <button className="login-btn" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => refreshData()}>
                  Sync Live Data
                </button>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
                  <h3>Registered Restaurants</h3>
                  <input
                    className="form-control"
                    style={{ width: '300px' }}
                    placeholder="Search restaurants..."
                    value={adminSearch}
                    onChange={e => setAdminSearch(e.target.value)}
                  />
                </div>

                <div className="table-container">
                  <table className="activity-table" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '20%' }}>Restaurant Name</th>
                        <th style={{ width: '15%' }}>Restaurant ID</th>
                        <th style={{ width: '10%' }}>Plan</th>
                        <th style={{ width: '10%' }}>Status</th>
                        <th style={{ width: '15%' }}>Expiry Date</th>
                        <th style={{ width: '15%' }}>Created Date</th>
                        <th style={{ width: '15%' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminRestaurants.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No registered restaurants found.</td></tr>
                      ) : adminRestaurants
                        .filter(r =>
                          r.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
                          r.id.toLowerCase().includes(adminSearch.toLowerCase())
                        ).length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No matching restaurants found.</td></tr>
                      ) : (
                        adminRestaurants
                          .filter(r =>
                            r.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
                            r.id.toLowerCase().includes(adminSearch.toLowerCase())
                          )
                          .map(res => (
                            <tr key={res.id}>
                              <td style={{ fontWeight: 700 }}>{res.name}</td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{res.id}</td>
                              <td>{res.subscriptionPlan}</td>
                              <td><StatusBadge status={res.subscriptionStatus} /></td>
                              <td>{res.subscriptionExpiryDate ? new Date(res.subscriptionExpiryDate).toLocaleDateString() : 'N/A'}</td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(res.createdAt).toLocaleDateString()}</td>
                              <td className="actions">
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <button className="admin-action-btn" onClick={() => fetchResDetails(res.id)}>View Details</button>

                                  {res.subscriptionStatus?.toLowerCase() === 'active' ? (
                                    <button className="admin-action-btn danger" onClick={() => handleAdminAction(`/admin/restaurants/${res.id}/suspend`)}>Deactivate</button>
                                  ) : res.subscriptionStatus?.toLowerCase() === 'trial' ? (
                                    <button className="admin-action-btn primary" onClick={() => handleAdminAction(`/admin/restaurants/${res.id}/activate`)}>Activate Full Access</button>
                                  ) : (
                                    <button className="admin-action-btn success" onClick={() => handleAdminAction(`/admin/restaurants/${res.id}/activate`)}>Activate</button>
                                  )}

                                  <button className="admin-action-btn" onClick={() => { setSelectedRes(res); setModalType('trial'); }}>Grant Trial</button>
                                </div>
                              </td>
                            </tr>
                          )))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modals */}
              {modalType === 'view' && selectedRes && (
                <Modal title="Restaurant Details" onClose={() => setModalType(null)}>
                  <div className="modal-grid">
                    <div className="modal-field"><label>Restaurant Name</label><p>{selectedRes.name}</p></div>
                    <div className="modal-field"><label>Restaurant ID</label><p>{selectedRes.id}</p></div>
                    <div className="modal-field"><label>Created Date</label><p>{new Date(selectedRes.createdAt).toLocaleString()}</p></div>
                    <div className="modal-field"><label>Plan</label><p>{selectedRes.subscriptionPlan}</p></div>
                    <div className="modal-field"><label>Status</label><p><StatusBadge status={selectedRes.subscriptionStatus} /></p></div>
                    <div className="modal-field"><label>Expiry Date</label><p>{new Date(selectedRes.subscriptionExpiryDate).toLocaleString()}</p></div>
                  </div>
                </Modal>
              )}

              {modalType === 'trial' && selectedRes && (
                <Modal title={`Grant Trial: ${selectedRes.name}`} onClose={() => setModalType(null)}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button className="admin-action-btn" onClick={() => handleAdminAction(`/admin/restaurants/${selectedRes.id}/trial`, { days: 7 })}>7 Days</button>
                    <button className="admin-action-btn" onClick={() => handleAdminAction(`/admin/restaurants/${selectedRes.id}/trial`, { days: 14 })}>14 Days</button>
                    <button className="admin-action-btn" onClick={() => handleAdminAction(`/admin/restaurants/${selectedRes.id}/trial`, { days: 30 })}>30 Days</button>
                    <button className="admin-action-btn" onClick={() => handleAdminAction(`/admin/restaurants/${selectedRes.id}/trial`, { days: 60 })}>60 Days</button>
                  </div>
                </Modal>
              )}
            </div>
          )
        }

      </main >

      <footer style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
        © 2026 MikrodCAP | MikrodTech Customer Appreciation Platform
      </footer>
    </div >
  )
}

export default App
