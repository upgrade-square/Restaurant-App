import { useState, useEffect } from 'react'
import './App.css'
import API_URL from './config/api'

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [smsHistory, setSmsHistory] = useState([])
  const [customers, setCustomers] = useState([])
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
  const [onboardingStep, setOnboardingStep] = useState(1)
  const [signupData, setSignupData] = useState({ restaurantName: '', ownerName: '', email: '', password: '', plan: 'Starter', duration: '1 Month' })

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
  const [toast, setToast] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const isAdmin = user?.email === 'admin@test.com' || user?.role === 'admin'
  const isDemoMode = restaurant?.onboardingStatus === 'demo_active'
  const [showAdvanced, setShowAdvanced] = useState(false)

  const fetchWithAuth = async (endpoint, options = {}) => {
    const headers = { ...options.headers, 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    try {
      const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers })
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
        fetchWithAuth('/customers'),
        fetchWithAuth('/settings'),
        fetchWithAuth('/templates'),
        fetchWithAuth('/metrics'),
        fetchWithAuth('/gateway/status'),
        fetchWithAuth('/subscription/history')
      ])

      setSmsHistory(results[0])
      setCustomers(results[1])
      setSettings(results[2])
      setTemplates(results[3])
      setMetrics(results[4])
      setGatewayStatus(results[5])
      setSubscriptionHistory(results[6])

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
          <p className="tagline" style={{ marginBottom: '32px' }}>Customer Appreciation Platform for Every Business</p>

          {toast && (
            <div style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              backgroundColor: toast.type === 'danger' ? 'var(--danger)' : 'var(--success)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              zIndex: 3000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              animation: 'slideInRight 0.3s ease-out'
            }}>
              {toast.message}
            </div>
          )}

          {authMode === 'login' ? (
            <>
              <h2>Account Login</h2>
              {error && <div className="error-banner">{error}</div>}
              <form className="auth-form" onSubmit={e => {
                e.preventDefault(); handleLogin(e.target.email.value, e.target.password.value)
              }}>
                <div className="form-group"><label>Email</label><input className="form-control" name="email" type="email" required /></div>
                <div className="form-group"><label>Password</label><input className="form-control" name="password" type="password" required /></div>
                <button className="login-btn" type="submit">Login</button>
              </form>
              <div className="auth-switch">
                <span>Need an account?</span>
                <button className="secondary-btn" style={{ width: '100%' }} onClick={() => { setAuthMode('register'); setOnboardingStep(1); }}>Create Account</button>
              </div>
            </>
          ) : (
            <div className="onboarding-flow">
              <div className="progress-stepper">
                <div className={`step ${onboardingStep >= 1 ? 'active' : ''}`}>1. Create Account</div>
                <div className={`step ${onboardingStep >= 2 ? 'active' : ''}`}>2. Explore Demo</div>
              </div>

              {onboardingStep === 1 && (
                <>
                  <h2>Get Started with MikrodCAP</h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Enter your details to create your business account.</p>
                  <form className="auth-form" onSubmit={e => {
                    e.preventDefault();
                    setSignupData({
                      ...signupData,
                      restaurantName: e.target.resName.value,
                      ownerName: e.target.ownerName.value,
                      email: e.target.email.value,
                      password: e.target.password.value,
                      plan: null // Ensure plan is null for simplified onboarding
                    });
                    setOnboardingStep(2);
                  }}>
                    <div className="form-group"><label>Business Name</label><input className="form-control" name="resName" placeholder="e.g. Acme Retail Shop" defaultValue={signupData.restaurantName} required /></div>
                    <div className="form-group"><label>Owner Name</label><input className="form-control" name="ownerName" placeholder="Your full name" defaultValue={signupData.ownerName} required /></div>
                    <div className="form-group"><label>Email Address</label><input className="form-control" name="email" type="email" placeholder="owner@business.com" defaultValue={signupData.email} required /></div>
                    <div className="form-group"><label>Password</label><input className="form-control" name="password" type="password" placeholder="Min. 8 characters" defaultValue={signupData.password} required /></div>
                    <button className="login-btn" type="submit">Continue</button>
                  </form>
                  <div className="auth-switch">
                    <span>Already have an account?</span>
                    <button className="secondary-btn" style={{ width: '100%' }} onClick={() => setAuthMode('login')}>Sign In</button>
                  </div>
                </>
              )}

              {onboardingStep === 2 && (
                <>
                  <h2>Ready to Explore?</h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>We've prepared a demo environment so you can explore how automatic customer appreciation works before configuring your business.</p>

                  <div className="activation-card card" style={{ textAlign: 'center', background: '#F0F9FF', border: '1px dashed var(--primary-blue)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🚀</div>
                    <h4 style={{ marginBottom: '12px', color: 'var(--primary-blue)' }}>Demo Environment Ready</h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      We will pre-populate your dashboard with sample data:
                      <br />• Demo customers & payment records
                      <br />• Sample appreciation messages
                      <br />• Real-world performance metrics
                    </p>
                  </div>

                  <button className="login-btn" style={{ width: '100%', marginTop: '24px' }} onClick={() => handleRegister(signupData)} disabled={loading}>
                    {loading ? 'Generating Demo Data...' : 'Start Exploring MikrodCAP'}
                  </button>
                  <button className="admin-action-btn" style={{ width: '100%', marginTop: '12px' }} onClick={() => setOnboardingStep(1)}>Back to Account info</button>
                </>
              )}
            </div>

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

  const getRelativeTime = (timestamp) => {
    if (!timestamp) return "---";
    const now = new Date();
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "---";

    const diffInSeconds = Math.floor((now - date) / 1000);

    // Timezone specific formatting helpers
    const nairobiOptions = { timeZone: "Africa/Nairobi" };
    const formatDate = (d, options) => d.toLocaleString("en-KE", { ...nairobiOptions, ...options });

    // Immediate relative buckets
    if (diffInSeconds < 0) return formatDate(date, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }); // Future
    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} mins ago`;

    // Calendar day checks
    const nowParts = formatDate(now, { year: 'numeric', month: 'numeric', day: 'numeric' });
    const targetParts = formatDate(date, { year: 'numeric', month: 'numeric', day: 'numeric' });

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayParts = formatDate(yesterday, { year: 'numeric', month: 'numeric', day: 'numeric' });

    const timeString = formatDate(date, { hour: '2-digit', minute: '2-digit', hour12: false });

    if (nowParts === targetParts) return `Today ${timeString}`;
    if (yesterdayParts === targetParts) return `Yesterday ${timeString}`;

    // Fallback
    return formatDate(date, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  };

  const formatDateTime = (timestamp) => {
    return getRelativeTime(timestamp);
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo-area" style={{ flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
          <button className="menu-toggle mobile-only" onClick={() => setMenuOpen(!menuOpen)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-main)', padding: '0' }}>
            {menuOpen ? '✕' : '☰'}
          </button>
          <div className="brand">
            <span className="brand-mikrod">Mikrod</span>
            <span className="brand-cap">CAP</span>
          </div>
        </div>
        <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); setMenuOpen(false); }}>Dashboard</button>
          <button className={`nav-btn ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => { setActiveTab('customers'); setMenuOpen(false); }}>Customers</button>
          {!isDemoMode && <button className={`nav-btn ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => { setActiveTab('templates'); setMenuOpen(false); }}>Templates</button>}
          <button className={`nav-btn ${activeTab === 'subscription' ? 'active' : ''}`} onClick={() => { setActiveTab('subscription'); setMenuOpen(false); }}>Subscription</button>
          <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); setMenuOpen(false); }}>Settings</button>
          {isAdmin && <button className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => { setActiveTab('admin'); setMenuOpen(false); }}>Admin</button>}

          <div className="business-info">
            <div className="desktop-only">
              <div className="business-name">{restaurant?.name}</div>
              <div className="sub-status">{restaurant?.plan} / {restaurant?.subscriptionStatus}</div>
            </div>
            <button className="nav-btn logout-btn" style={{ color: 'var(--danger)' }} onClick={() => { handleLogout(); setMenuOpen(false); }}>Logout</button>
          </div>
        </div>
        {menuOpen && <div className="menu-overlay mobile-only" onClick={() => setMenuOpen(false)}></div>}
      </nav>

      <main className="main-content">
        {activeTab === 'dashboard' && (
          <div className="section">
            {isDemoMode && (
              <div className="card welcome-banner" style={{ background: 'linear-gradient(135deg, var(--primary-blue), #0056b3)', color: 'white', marginBottom: '24px', padding: '24px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <h2 style={{ margin: 0, marginBottom: '8px' }}>Welcome to MikrodCAP {user?.name}! 👋</h2>
                  <p style={{ margin: 0, opacity: 0.9, maxWidth: '800px' }}>
                    We've prepared a demo environment so you can explore how automatic customer appreciation works before configuring your business.
                    <br /><strong>Explore the dashboard to see how MikrodCAP turns every payment into a thank you.</strong>
                  </p>
                </div>
                <div style={{ position: 'absolute', right: '-20px', bottom: '-20px', fontSize: '10rem', opacity: 0.1, zIndex: 1 }}>🚀</div>
              </div>
            )}
            <div className="dashboard-header">
              <h1>{isDemoMode ? 'Demo Dashboard' : 'Business Overview'}</h1>
              <p className="tagline">Automatic Customer Appreciation Tracking</p>
            </div>

            <div className="kpi-grid">
              <div className="card kpi-card">
                <div className="kpi-label">Total Customers</div>
                <div className="kpi-value">{customers.length}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Messages Sent</div>
                <div className="kpi-value">{metrics.totalSent}</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Active Subscription</div>
                <div className="kpi-value" style={{ textTransform: 'capitalize', color: 'var(--success)', fontSize: '1.25rem' }}>{restaurant?.plan || 'Free Trial'}</div>
              </div>

              <div className="card kpi-card">
                <div className="kpi-label">Customer Appreciation Strategy</div>
                <div className="kpi-value" style={{ fontSize: '1rem' }}>Automated</div>
              </div>
              <div className="card kpi-card">
                <div className="kpi-label">Gateway Status</div>
                <div className="kpi-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.25rem', color: isDemoMode || gatewayStatus.status === 'Online' ? 'var(--success)' : 'var(--danger)' }}>
                      {isDemoMode ? 'Demo Online' : gatewayStatus.status}
                    </span>
                    {!isDemoMode && gatewayStatus.status === 'Online' && (
                      <span className={`battery-pill ${gatewayStatus.batteryLevel < 30 ? 'critical' : gatewayStatus.batteryLevel < 80 ? 'warning' : 'healthy'}`}>
                        {gatewayStatus.isCharging && <span className="charging-icon">⚡</span>}
                        {gatewayStatus.batteryLevel}%
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                    {isDemoMode ? 'Virtual Demo Node' : gatewayStatus.deviceName}
                  </div>
                </div>
              </div>
            </div>

            <div className="activity-section">
              <div className="card">
                <h3>Customer Engagement Activity</h3>
                <div className="table-container" style={{ marginTop: '16px' }}>
                  <table className="activity-table" style={{ width: '100%', tableLayout: 'fixed', minWidth: '800px' }}>
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
                          <td title={formatDateTime(msg.createdAt)}>{formatDateTime(msg.createdAt)}</td>
                          <td style={{ fontWeight: 700 }} title={msg.customerName}>{msg.customerName}</td>
                          <td title={msg.phone}>{msg.phone}</td>
                          <td title={formatDateTime(msg.sentAt)}>{formatDateTime(msg.sentAt)}</td>
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
              <h3>Manual Appreciation Entry</h3>
              <form onSubmit={e => {
                e.preventDefault();
                fetchWithAuth('/customers', { method: 'POST', body: JSON.stringify(formData) })
                  .then((data) => {
                    setFormData({ name: '', phone: '', amount: '' });
                    setCustomers(prev => [...prev, data]);
                    setMetrics(prev => ({ ...prev, totalCustomers: prev.totalCustomers + 1 }));
                    showToast('Appreciation Sent');
                    refreshData(true);
                  });
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
                <table className="activity-table" style={{ tableLayout: 'fixed', minWidth: '800px' }}>
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
                        <td title={formatDateTime(sms.createdAt)}>{formatDateTime(sms.createdAt)}</td>
                        <td style={{ fontWeight: 700 }} title={sms.customerName}>{sms.customerName}</td>
                        <td title={sms.phone}>{sms.phone}</td>
                        <td><StatusBadge status={sms.status} /></td>
                        <td className="actions">
                          {sms.status === 'Failed' && <button className="resend-btn" onClick={() => handleResend(sms.id)}>Retry</button>}
                          <button
                            style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: '12px' }}
                            onClick={async () => {
                              try {
                                await fetchWithAuth(`/customers/${sms.customerId}`, { method: 'DELETE' });
                                await fetchWithAuth(`/sms-queue/${sms.id}`, { method: 'DELETE' });
                                setCustomers(prev => prev.filter(c => c.id !== sms.customerId));
                                setSmsHistory(prev => prev.filter(s => s.id !== sms.id));
                                setMetrics(prev => ({ ...prev, totalCustomers: Math.max(0, prev.totalCustomers - 1) }));
                                showToast('Customer deleted successfully');
                                refreshData(true);
                              } catch (err) {
                                showToast(err.message, 'danger');
                              }
                            }}
                          >
                            Delete
                          </button>
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
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Use <code>{`{{name}}`}</code> for customer name and <code>{`{{businessName}}`}</code> for business name.</p>
            <div className="form-group">
              <textarea className="form-control" style={{ height: '150px' }} value={templates.thankYou} onChange={e => setTemplates({ ...templates, thankYou: e.target.value })} />
            </div>
            <button className="login-btn" style={{ width: '200px' }} onClick={() => fetchWithAuth('/templates', { method: 'POST', body: JSON.stringify(templates) }).then(() => showToast('Templates saved'))}>Save Changes</button>
          </div>
        )}

        {activeTab === 'subscription' && (
          <div className="section">
            <div className="card" style={{ marginBottom: '24px' }}>
              <h3>Current Subscription Status</h3>
              <div className="kpi-grid" style={{ marginTop: '16px' }}>
                <div className="card"><div className="kpi-label">Current Plan</div><div className="kpi-value" style={{ fontSize: '1.5rem' }}>{restaurant?.plan || 'Free Trial'}</div></div>
                <div className="card"><div className="kpi-label">Status</div><div className="kpi-value" style={{ color: 'var(--success)' }}>{restaurant?.subscriptionStatus}</div></div>
                <div className="card"><div className="kpi-label">Expiry</div><div className="kpi-value" style={{ fontSize: '1.25rem' }}>{restaurant?.subscriptionExpiry ? formatDateTime(restaurant.subscriptionExpiry) : 'N/A'}</div></div>
                <div className="card"><div className="kpi-label">Days Remaining</div><div className="kpi-value">{getDaysRemaining(restaurant?.subscriptionExpiry)}</div></div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
              <h3>Business Subscription Plans</h3>
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
                        <td title={formatDateTime(pay.date)}>{formatDateTime(pay.date)}</td>
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
          <div className="section">
            <div className="card">
              <h3>Configuration</h3>
              <p className="tagline">Basic business details and contact information.</p>
              <form onSubmit={e => { e.preventDefault(); fetchWithAuth('/settings', { method: 'POST', body: JSON.stringify(settings) }).then(() => showToast('Settings saved')) }} style={{ marginTop: '16px' }}>
                <div className="form-group"><label>Business Name</label><input className="form-control" value={settings.restaurantName} onChange={e => setSettings({ ...settings, restaurantName: e.target.value })} required /></div>
                <div className="form-group"><label>Contact Phone</label><input className="form-control" type="tel" value={settings.phone} onChange={e => setSettings({ ...settings, phone: e.target.value })} /></div>
                <div className="form-group"><label>Official Email</label><input className="form-control" type="email" value={settings.email} onChange={e => setSettings({ ...settings, email: e.target.value })} /></div>
                <div className="form-group"><label>Operating Address</label><input className="form-control" value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} /></div>
                <button className="login-btn" style={{ width: '200px' }} type="submit">Save Changes</button>
              </form>
            </div>

            <div className="card" style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3>Advanced Configuration</h3>
                  <p className="tagline">Technical settings, API keys, and system nodes.</p>
                </div>
                <button className={`admin-action-btn ${showAdvanced ? 'active' : ''}`} onClick={() => setShowAdvanced(!showAdvanced)}>
                  {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
                </button>
              </div>

              {showAdvanced ? (
                <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                  <div className="modal-grid">
                    <div className="modal-field">
                      <label>API Configuration</label>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status: {isDemoMode ? 'Demo Restricted' : 'Active'}</p>
                    </div>
                    <div className="modal-field">
                      <label>Gateway Node ID</label>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isDemoMode ? 'NODE-DEMO-001' : gatewayStatus.deviceId || 'No hardware paired'}</p>
                    </div>
                    <div className="modal-field">
                      <label>Automation Rules</label>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>M-Pesa Trigger: {isDemoMode ? 'Simulated' : 'Active'}</p>
                    </div>
                    <div className="modal-field">
                      <label>Message Templates</label>
                      <button className="admin-action-btn" onClick={() => setActiveTab('templates')}>Manage Templates</button>
                    </div>
                  </div>

                  {isDemoMode && (
                    <div className="error-banner" style={{ marginTop: '16px' }}>
                      Notice: You are currently in Demo Mode. Advanced technical settings are locked until you switch to your real environment in the Dashboard.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: '16px', padding: '16px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Advanced technical settings are hidden to keep your experience simple. Tap "Show Advanced" if you need to configure gateway nodes or API integrations.
                </div>
              )}
            </div>
          </div>
        )}

        {
          activeTab === 'admin' && isAdmin && (
            <div className="section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <h1 style={{ margin: 0 }}>MikrodCAP Platform Management</h1>
                  <p className="tagline">Subscription & Node Control Center</p>
                </div>
                <button className="login-btn" style={{ width: 'auto', padding: '10px 20px' }} onClick={() => refreshData()}>
                  Sync Live Data
                </button>
              </div>

              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
                  <h3>Registered Businesses</h3>
                  <input
                    className="form-control"
                    style={{ width: '300px' }}
                    placeholder="Search businesses..."
                    value={adminSearch}
                    onChange={e => setAdminSearch(e.target.value)}
                  />
                </div>

                <div className="table-container">
                  <table className="activity-table" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '20%' }}>Business Name</th>
                        <th style={{ width: '15%' }}>Business ID</th>
                        <th style={{ width: '10%' }}>Plan</th>
                        <th style={{ width: '10%' }}>Status</th>
                        <th style={{ width: '15%' }}>Expiry Date</th>
                        <th style={{ width: '15%' }}>Created Date</th>
                        <th style={{ width: '15%' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminRestaurants.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No registered businesses found.</td></tr>
                      ) : adminRestaurants
                        .filter(r =>
                          r.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
                          r.id.toLowerCase().includes(adminSearch.toLowerCase())
                        ).length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No matching businesses found.</td></tr>
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
                              <td>{res.subscriptionExpiryDate ? formatDateTime(res.subscriptionExpiryDate) : 'N/A'}</td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDateTime(res.createdAt)}</td>
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
                <Modal title="Account Details" onClose={() => setModalType(null)}>
                  <div className="modal-grid">
                    <div className="modal-field"><label>Business Name</label><p>{selectedRes.name}</p></div>
                    <div className="modal-field"><label>Business ID</label><p>{selectedRes.id}</p></div>
                    <div className="modal-field"><label>Created Date</label><p>{formatDateTime(selectedRes.createdAt)}</p></div>
                    <div className="modal-field"><label>Plan</label><p>{selectedRes.subscriptionPlan}</p></div>
                    <div className="modal-field"><label>Status</label><p><StatusBadge status={selectedRes.subscriptionStatus} /></p></div>
                    <div className="modal-field"><label>Expiry Date</label><p>{formatDateTime(selectedRes.subscriptionExpiryDate)}</p></div>
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
