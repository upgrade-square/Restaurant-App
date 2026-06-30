import { useState, useEffect } from 'react'
import './App.css'
import API_URL from './config/api'
import ErrorBoundary from './components/ErrorBoundary'
import { io } from 'socket.io-client'
import { getRelativeTime, formatActivityDate, formatDateTime, calculateDaysRemaining } from './utils/dateUtils'

const DEFAULT_TEMPLATE = "Hello {name}, thank you for choosing {business_name}. We appreciate your support.";

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const EyeSlashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
)

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
  </svg>
)

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

const StatusBadge = ({ status }) => {
  const s = (status || 'Inactive').toLowerCase()
  const displayStatus = s === 'active' ? 'Active' : 'Inactive'
  const badgeClass = s === 'active' ? 'badge-active' : 'badge-failed'
  return <span className={`badge ${badgeClass}`}>{displayStatus}</span>
}


const formatAmount = (amt) => {
  if (!amt || amt === '-' || amt === 'M-Pesa') return '—'
  const num = parseFloat(amt)
  if (isNaN(num) || num === 0) return '—'
  return `KSh ${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const normalizePhone = (phone) => {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('254') && cleaned.length === 12) return '0' + cleaned.slice(3);
  if ((cleaned.startsWith('7') || cleaned.startsWith('1')) && cleaned.length === 9) return '0' + cleaned;
  if (cleaned.startsWith('0') && cleaned.length === 10) return cleaned;
  return cleaned;
};

const renderPreview = (template, customer = { name: 'Jane' }, business = { business_name: 'Business Account' }) => {
  if (!template) return "";
  let rendered = template;
  const placeholders = {
    name: customer.name || "Customer",
    business_name: business.business_name || "Business Account"
  };
  Object.keys(placeholders).forEach(key => {
    const regex = new RegExp(`{${key}}`, 'gi');
    rendered = rendered.replace(regex, placeholders[key]);
  });
  return rendered.replace(/\s+/g, ' ').trim();
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [smsHistory, setSmsHistory] = useState([])
  const [customers, setCustomers] = useState([])
  const [filterStatus, setFilterStatus] = useState('All')
  const [formData, setFormData] = useState({ name: '', phone: '', amount: '' })
  const [transactionCode, setTransactionCode] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('Standard')
  const [subscriptionHistory, setSubscriptionHistory] = useState([])
  const [showMpesaModal, setShowMpesaModal] = useState(false)
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [isProcessingMpesa, setIsProcessingMpesa] = useState(false)
  const [selectedCustomers, setSelectedCustomers] = useState([])
  const [selectedSms, setSelectedSms] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [token, setToken] = useState(localStorage.getItem('token'))
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'))
  const [restaurant, setRestaurant] = useState(JSON.parse(localStorage.getItem('restaurant') || 'null'))
  const [authMode, setAuthMode] = useState('login')
  const [onboardingStep, setOnboardingStep] = useState(1)
  const [signupData, setSignupData] = useState({ business_name: '', ownerName: '', email: '', password: '', plan: 'Standard', duration: '1 Month' })

  const [settings, setSettings] = useState({ business_name: '', phone: '', address: '', email: '' })
  const [templates, setTemplates] = useState({ thankYou: DEFAULT_TEMPLATE })
  const [metrics, setMetrics] = useState({ totalCustomers: 0, totalSent: 0, sentToday: 0, pending: 0, failed: 0 })
  const [revenueData, setRevenueData] = useState({ today: 0, week: 0, month: 0, currency: 'KES' })
  const [revenueRecords, setRevenueRecords] = useState({ records: [], total: 0, currentPage: 1, totalPages: 1 })
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [gatewayStatus, setGatewayStatus] = useState({ status: 'Offline', lastSeen: null, batteryLevel: 0, isCharging: false, deviceName: 'N/A' })

  const [adminMetrics, setAdminMetrics] = useState(null)
  const [adminRestaurants, setAdminRestaurants] = useState([])
  const [adminSearch, setAdminSearch] = useState('')
  const [selectedRes, setSelectedRes] = useState(null)
  const [resPayments, setResPayments] = useState([])
  const [modalType, setModalType] = useState(null)
  const [toast, setToast] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const isAdmin = user?.email === 'admin@test.com' || user?.role === 'admin'
  const isProfessional = true; // Phase 3: All features unlocked for standard plan subscribers
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | success | error
  const [isTemplateSaving, setIsTemplateSaving] = useState(false);
  const [templateSaveStatus, setTemplateSaveStatus] = useState('idle'); // idle | success | error

  const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
  const [resetData, setResetData] = useState({ password: '', confirmed: false });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [forgotStep, setForgotStep] = useState(1);
  const [isCustomerSubmitting, setIsCustomerSubmitting] = useState(false);

  // Template Normalization Utility
  const normalizeTemplate = (text) => {
    if (!text) return text;
    return text
      .replace(/\{\{name\}\}/gi, '{name}')
      .replace(/\{\{business_name\}\}/gi, '{business_name}')
      .replace(/\{\{businessName\}\}/gi, '{business_name}')
      .replace(/\{\{restaurantName\}\}/gi, '{business_name}')
      .replace(/\{restaurantName\}/gi, '{business_name}')
      .replace(/\{businessName\}/gi, '{business_name}')
      .replace(/\{\{name\}/gi, '{name}')
      .replace(/\{name\}\}/gi, '{name}')
      .replace(/\{\{business_name\}/gi, '{business_name}')
      .replace(/\{business_name\}\}/gi, '{business_name}');
  };
  const [forgotEmail, setForgotEmail] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);

  const [requestingOTP, setRequestingOTP] = useState(false);

  const [passwordOTP, setPasswordOTP] = useState('');
  const [passwordOtpSent, setPasswordOtpSent] = useState(false);
  const [passwordOtpCooldown, setPasswordOtpCooldown] = useState(0);
  const [passwordOtpExpiry, setPasswordOtpExpiry] = useState(0);

  useEffect(() => {
    console.log('%c MikrodCAP OS %c v1.0.1 - Alignment Patch 2 %c', 'background: #0072CE; color: white; padding: 4px; border-radius: 4px 0 0 4px;', 'background: #FF8C00; color: white; padding: 4px; border-radius: 0 4px 4px 0;', 'background: transparent;');
  }, []);

  const [factoryResetOTP, setFactoryResetOTP] = useState('');
  const [factoryResetOtpSent, setFactoryResetOtpSent] = useState(false);
  const [factoryResetOtpCooldown, setFactoryResetOtpCooldown] = useState(0);
  const [factoryResetOtpExpiry, setFactoryResetOtpExpiry] = useState(0);

  const [registrationOTP, setRegistrationOTP] = useState('');
  const [showOTPStep, setShowOTPStep] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpExpiry, setOtpExpiry] = useState(0);

  const fetchWithAuth = async (endpoint, options = {}) => {
    const headers = { ...options.headers, 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    try {
      const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers })

      if (response.status === 401 || response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        const isSecurityMismatch = errorData.error && errorData.error.includes('Session invalidated');
        const isInvalidToken = response.status === 403;

        handleLogout(isInvalidToken
          ? 'Your session has expired. Please sign in again.'
          : isSecurityMismatch
            ? 'Your session has expired because your account security settings changed. Please sign in again.'
            : 'Your session has expired. Please sign in again.'
        );
        throw new Error(errorData.error || 'Session expired');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Error ${response.status}`)
      }
      return await response.json()
    } catch (err) {
      console.error(`[API_ERROR] ${endpoint}:`, err.message);
      throw err;
    }
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

  const handlePasswordChange = async () => {
    try {
      if (passwordData.new !== passwordData.confirm) {
        showToast('New passwords do not match', 'danger');
        return;
      }
      if (passwordData.new.length < 6) {
        showToast('Password must be at least 6 characters', 'danger');
        return;
      }
      const data = await fetchWithAuth('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordData.current,
          newPassword: passwordData.new,
          confirmPassword: passwordData.confirm
        })
      });
      showToast(data.message);
      setPasswordData({ current: '', new: '', confirm: '' });
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const handleAccountReset = async () => {
    try {
      const data = await fetchWithAuth('/auth/reset-account', {
        method: 'POST',
        body: JSON.stringify({ otp: factoryResetOTP })
      });

      showToast('Factory reset completed successfully');
      setFactoryResetOTP('');
      setResetData({ password: '', confirmed: false });
      setShowResetConfirm(false);

      refreshData();
      setActiveTab('dashboard');
    } catch (err) {
      setFactoryResetOTP('');
      showToast(err.message, 'danger');
    }
  };

  useEffect(() => {
    let timer;
    if (passwordOtpCooldown > 0) {
      timer = setInterval(() => setPasswordOtpCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [passwordOtpCooldown]);

  useEffect(() => {
    let timer;
    if (passwordOtpExpiry > 0) {
      timer = setInterval(() => setPasswordOtpExpiry(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [passwordOtpExpiry]);

  useEffect(() => {
    let timer;
    if (factoryResetOtpCooldown > 0) {
      timer = setInterval(() => setFactoryResetOtpCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [factoryResetOtpCooldown]);

  useEffect(() => {
    let timer;
    if (factoryResetOtpExpiry > 0) {
      timer = setInterval(() => setFactoryResetOtpExpiry(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [factoryResetOtpExpiry]);

  const handleRequestOTP = async (email, flow = 'password') => {
    if (!email) {
      showToast('Email address is required', 'danger');
      return false;
    }
    console.log(`[OTP] Requesting code for: ${email} | Flow: ${flow}`);
    try {
      setRequestingOTP(true);
      const data = await fetchWithAuth('/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      console.log(`[OTP] Success: ${data.message}`);
      showToast('Verification code sent successfully. Please check your email inbox.');

      if (flow === 'factory-reset') {
        setFactoryResetOtpSent(true);
        setFactoryResetOtpCooldown(60);
        setFactoryResetOtpExpiry(300);
      } else {
        setPasswordOtpSent(true);
        setPasswordOtpCooldown(60);
        setPasswordOtpExpiry(300);
      }
      return true;
    } catch (err) {
      console.error(`[OTP] Failed: ${err.message}`);
      showToast(err.message || 'Unable to send verification code. Please try again.', 'danger');
      return false;
    } finally {
      setRequestingOTP(false);
    }
  };

  const handlePasswordChangeOTP = async () => {
    try {
      if (passwordData.new !== passwordData.confirm) {
        showToast('New passwords do not match', 'danger');
        return;
      }
      const data = await fetchWithAuth('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          otp: passwordOTP,
          password: passwordData.new,
          confirmPassword: passwordData.confirm
        })
      });
      showToast(data.message);
      setToken(null);
      setUser(null);
      setRestaurant(null);
      localStorage.clear();
      setAuthMode('login');
      setPasswordOTP('');
      setPasswordData({ current: '', new: '', confirm: '' });
      setPasswordOtpSent(false);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  const handleLogout = (reason = null) => {
    console.log('[AUTH] Logging out user...', reason ? `Reason: ${reason}` : '');
    localStorage.clear();
    setToken(null);
    setUser(null);
    setRestaurant(null);
    setActiveTab('dashboard');
    if (reason) {
      showToast(reason, 'danger');
    }
  };

  const handleForgotPassword = async (email) => {
    try {
      setLoading(true);
      const data = await fetchWithAuth('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      showToast(data.message);
      setForgotEmail(email);
      setForgotStep(2);
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyResetToken = async (email, token) => {
    try {
      setLoading(true);
      const data = await fetchWithAuth('/auth/verify-reset-token', {
        method: 'POST',
        body: JSON.stringify({ email, token })
      });
      showToast(data.message);
      setForgotStep(3);
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (email, token, newPassword) => {
    try {
      setLoading(true);
      const data = await fetchWithAuth('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, token, newPassword })
      });
      showToast(data.message);
      setAuthMode('login');
      setForgotStep(1);
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async (isBackground = false) => {
    if (isBackground && activeTab !== 'dashboard') return;

    try {
      if (!isBackground) setLoading(true)

      const isDashboardHeartbeat = isBackground && activeTab === 'dashboard';

      const baseEndpoints = [
        '/sms-queue/history',
        '/metrics',
        '/customers',
        '/gateway/status'
      ];


      const extraEndpoints = [
        '/settings',
        '/templates',
        '/subscription/history'
      ];

      const endpointsToFetch = isDashboardHeartbeat ? baseEndpoints : [...baseEndpoints, ...extraEndpoints];
      const results = await Promise.all(endpointsToFetch.map(endpoint => fetchWithAuth(endpoint)));

      setSmsHistory(results[0])
      setMetrics(results[1])
      setCustomers(results[2])
      const fetchedStatus = results[3];
      console.log(`[DEBUG_FRONTEND_STATUS] Frontend status received = ${JSON.stringify(fetchedStatus)}`);
      setGatewayStatus(fetchedStatus);

      if (!isDashboardHeartbeat) {
        const settingsRes = results[4];
        if (settingsRes) {
          settingsRes.business_name = settingsRes.business_name || settingsRes.restaurantName || restaurant?.business_name || "Business Account";
        }
        setSettings(settingsRes || { business_name: restaurant?.business_name || "Business Account" });

        const templatesRes = results[5];
        if (templatesRes) {
          templatesRes.thankYou = templatesRes.thankYou?.trim() ? templatesRes.thankYou : DEFAULT_TEMPLATE;
        }
        setTemplates(templatesRes || { thankYou: DEFAULT_TEMPLATE });

        setSubscriptionHistory(results[6]);

        // Sync restaurant state (subscription status, plan, etc)
        try {
          const me = await fetchWithAuth('/auth/me');
          if (me && me.restaurant) {
            setRestaurant(me.restaurant);
            localStorage.setItem('restaurant', JSON.stringify(me.restaurant));

            setSettings(prev => ({
              ...prev,
              business_name: prev.business_name || me.restaurant.business_name || "Business Account"
            }));

            // Fetch Revenue Analytics for active subscribers
            if (isProfessional) {
              fetchRevenueData();
            }
          }
        } catch (meError) {
          console.warn('Failed to sync profile', meError);
        }

        if (isAdmin) {
          const aMetrics = await fetchWithAuth('/admin/metrics')
          const aRes = await fetchWithAuth('/admin/restaurants')
          setAdminMetrics(aMetrics)
          setAdminRestaurants(aRes)
        }
      } else {
        // Even in heartbeat, refresh revenue if professional
        if (isProfessional) {
          fetchRevenueData(true);
        }
      }

      setError(null)
    } catch (err) {
      if (!isBackground) setError(err.message)
    } finally {
      if (!isBackground) setLoading(false)
    }
  }

  const fetchRevenueData = async (isBackground = false) => {
    if (!isProfessional) return;
    try {
      if (!isBackground) setRevenueLoading(true);
      const [analytics, records] = await Promise.all([
        fetchWithAuth('/revenue/analytics'),
        fetchWithAuth('/revenue/records?page=1&limit=10')
      ]);
      setRevenueData(analytics);
      setRevenueRecords(records);
    } catch (err) {
      console.warn('Revenue fetch failed', err);
    } finally {
      if (!isBackground) setRevenueLoading(false);
    }
  };

  const fetchRevenueRecords = async (page = 1) => {
    if (!isProfessional) return;
    try {
      const data = await fetchWithAuth(`/revenue/records?page=${page}&limit=10`);
      setRevenueRecords(data);
    } catch (err) {
      showToast('Failed to load transaction records', 'danger');
    }
  };

  useEffect(() => {
    if (token) {
      refreshData()
    } else {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    let interval;
    if (token && activeTab === 'dashboard') {
      refreshData(true);
      interval = setInterval(() => refreshData(true), 15000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [token, activeTab])

  // Socket.IO Real-time Gateway Updates
  useEffect(() => {
    if (!token || !restaurant) return;

    const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://app.mikrodtech.co.ke';
    const socket = io(API_BASE_URL);

    socket.on('connect', () => {
      console.log('[Socket] Dashboard connected, subscribing to:', restaurant.id);
      socket.emit('subscribe', restaurant.id);
    });

    socket.on('gateway-status', (data) => {
      console.log('[Socket] Status update received:', {
        deviceId: data.deviceId,
        isCharging: data.isCharging,
        type: typeof data.isCharging,
        status: data.status,
        timestamp: new Date().toISOString()
      });
      console.log(`[DEBUG_FRONTEND_STATUS] Frontend status received via gateway-status = ${JSON.stringify(data)}`);
      setGatewayStatus(prev => {
        if (prev.status !== data.status) {
          console.log(`[STATUS_TRANSITION] ${prev.status} -> ${data.status} for ${data.deviceId}`);
        }
        return data;
      });
    });

    socket.on('gateway_online', (data) => {
      console.log('[SOCKET_GATEWAY_ONLINE]', data);
      console.log(`[DEBUG_FRONTEND_STATUS] Frontend status received via gateway_online = ${JSON.stringify(data)}`);
      setGatewayStatus(data);
    });

    socket.on('gateway_offline', (data) => {
      console.log('[SOCKET_GATEWAY_OFFLINE]', data);
      console.log(`[DEBUG_FRONTEND_STATUS] Frontend status received via gateway_offline = ${JSON.stringify(data)}`);
      setGatewayStatus(data);
    });

    socket.on('gateway_status_changed', (data) => {
      console.log('[SOCKET_STATUS_CHANGED]', data);
      console.log(`[DEBUG_FRONTEND_STATUS] Frontend status received via gateway_status_changed = ${JSON.stringify(data)}`);
      setGatewayStatus(data);
    });

    socket.on('payment_created', (data) => {
      console.log('[SOCKET_PAYMENT_RECEIVED]', data);
      console.log('[DASHBOARD_REFRESHED] Triggered by payment_created');
      refreshData(true);
    });

    socket.on('revenue_updated', (data) => {
      console.log('[SOCKET_REVENUE_RECEIVED]', data);
      console.log('[DASHBOARD_REFRESHED] Triggered by revenue_updated');
      refreshData(true);
    });

    socket.on('customer_updated', (data) => {
      console.log('[SOCKET_CUSTOMER_RECEIVED]', data);
      console.log('[DASHBOARD_REFRESHED] Triggered by customer_updated');
      refreshData(true);
    });

    socket.on('sms_status_updated', (data) => {
      console.log('[SOCKET_SMS_RECEIVED]', data);
      console.log('[DASHBOARD_REFRESHED] Triggered by sms_status_updated');
      refreshData(true);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Dashboard disconnected');
    });

    return () => {
      socket.disconnect();
    };
  }, [token, restaurant]);


  const handleResend = async (id) => {
    try {
      await fetchWithAuth(`/sms-queue/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'Pending' }) })
      refreshData()
    } catch (err) { alert(err.message) }
  }

  const handleVerifyPayment = async (e) => {
    e.preventDefault()

    // Plan logic simplified for Standard plan only
    if (selectedPlan !== 'Standard') {
      setSelectedPlan('Standard');
    }

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

      if (data.restaurant) {
        setAdminRestaurants(prev => prev.map(res =>
          res.id === data.restaurant.id
            ? { ...res, subscriptionStatus: data.restaurant.subscriptionStatus, subscriptionExpiryDate: data.restaurant.subscriptionExpiry }
            : res
        ))
      }

      showToast(data.message || 'Action completed successfully')
      setModalType(null)
      refreshData(true)
    } catch (err) { showToast(err.message, 'error') }
  }

  const handleBulkDelete = async (type, ids) => {
    if (!ids.length) return;
    const deleteCount = ids.length;
    try {
      const endpoint = type === 'sms' ? '/sms-queue/delete-multiple' : '/customers/delete-multiple';
      await fetchWithAuth(endpoint, {
        method: 'POST',
        body: JSON.stringify({ ids: ids.map(id => Number(id)) })
      });

      if (type === 'sms') {
        setSmsHistory(prev => prev.filter(item => !ids.map(Number).includes(Number(item.id))));
        setSelectedSms([]);
      } else {
        setCustomers(prev => prev.filter(item => !ids.map(Number).includes(Number(item.id))));
        setSelectedCustomers([]);
      }

      showToast(`${deleteCount} ${type === 'sms' ? 'records' : 'customers'} deleted successfully`);
      refreshData(true);
    } catch (err) {
      showToast(err.message || 'Deletion failed', 'error');
    }
  };

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
                <div className="form-group">
                  <label>Password</label>
                  <div className="password-input-wrapper">
                    <input className="form-control" name="password" type={showLoginPassword ? 'text' : 'password'} required />
                    <button type="button" className="password-toggle" onClick={() => setShowLoginPassword(!showLoginPassword)} aria-label={showLoginPassword ? 'Hide password' : 'Show password'}>
                      {showLoginPassword ? <EyeSlashIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button type="button" className="link-btn" style={{ fontSize: '0.8rem' }} onClick={() => setAuthMode('forgot-password')}>Forgot Password?</button>
                  </div>
                </div>
                <button className="login-btn" type="submit">Login</button>
              </form>
              <div className="auth-switch">
                <span>Need an account?</span>
                <button className="secondary-btn" style={{ width: '100%' }} onClick={() => { setAuthMode('register'); setOnboardingStep(1); }}>Create Account</button>
              </div>
            </>
          ) : authMode === 'forgot-password' ? (
            <div className="onboarding-flow">
              {forgotStep === 1 && (
                <>
                  <h2>Reset Password</h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Enter your email address to receive a recovery code.</p>
                  <form className="auth-form" onSubmit={e => {
                    e.preventDefault(); handleForgotPassword(e.target.email.value);
                  }}>
                    <div className="form-group">
                      <label>Email Address</label>
                      <input className="form-control" name="email" type="email" placeholder="owner@business.com" required />
                    </div>
                    <button className="login-btn" type="submit" disabled={loading}>
                      {loading ? 'Sending Code...' : 'Send Recovery Code'}
                    </button>
                  </form>
                  <div className="auth-switch">
                    <button className="secondary-btn" style={{ width: '100%' }} onClick={() => setAuthMode('login')}>Back to Login</button>
                  </div>
                </>
              )}

              {forgotStep === 2 && (
                <>
                  <h2>Verify Recovery Code</h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Enter the 6-character code sent to {forgotEmail}.</p>
                  <form className="auth-form" onSubmit={e => {
                    e.preventDefault();
                    handleVerifyResetToken(forgotEmail, e.target.token.value);
                  }}>
                    <div className="form-group">
                      <label>Recovery Code</label>
                      <input className="form-control" name="token" id="reset-otp-input" style={{ letterSpacing: '4px', textAlign: 'center', fontWeight: 'bold' }} maxLength={6} placeholder="XXXXXX" required />
                    </div>
                    <button className="login-btn" type="submit" disabled={loading}>
                      {loading ? 'Verifying...' : 'Verify Code'}
                    </button>
                  </form>
                  <div className="auth-switch">
                    <button className="secondary-btn" style={{ width: '100%' }} onClick={() => setForgotStep(1)}>Back</button>
                  </div>
                </>
              )}

              {forgotStep === 3 && (
                <>
                  <h2>Secure Your Account</h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Verification successful. Please choose a strong new password.</p>
                  <form className="auth-form" onSubmit={e => {
                    e.preventDefault();
                    const token = document.getElementById('reset-otp-input').value;
                    handleResetPassword(forgotEmail, token, e.target.newPassword.value);
                  }}>
                    <div className="form-group">
                      <label>New Password</label>
                      <div className="password-input-wrapper">
                        <input className="form-control" name="newPassword" type={showRecoveryPassword ? 'text' : 'password'} placeholder="Min. 8 characters" required />
                        <button type="button" className="password-toggle" onClick={() => setShowRecoveryPassword(!showRecoveryPassword)}>
                          {showRecoveryPassword ? <EyeSlashIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </div>
                    <button className="login-btn" type="submit" disabled={loading}>
                      {loading ? 'Finalizing...' : 'Update Password'}
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : (
            <div className="onboarding-flow">
              <div className="progress-stepper">
                <div className={`step ${onboardingStep >= 1 ? 'active' : ''}`}>1. Create Account</div>
                <div className={`step ${onboardingStep >= 2 ? 'active' : ''}`}>2. Complete Registration</div>
              </div>

              {onboardingStep === 1 && !showOTPStep && (
                <>
                  <h2>Get Started with MikrodCAP</h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Enter your details to create your business account.</p>
                  <form className="auth-form" onSubmit={e => {
                    e.preventDefault();
                    if (e.target.password.value !== e.target.confirmPassword.value) {
                      showToast('Passwords do not match', 'danger');
                      return;
                    }
                    const email = e.target.email.value;
                    setSignupData({
                      ...signupData,
                      business_name: e.target.resName.value,
                      ownerName: e.target.ownerName.value,
                      email: email,
                      password: e.target.password.value,
                      plan: null
                    });
                    handleRequestOTP(email).then(success => {
                      if (success) setShowOTPStep(true);
                    });
                  }}>
                    <div className="form-group"><label>Business Name</label><input className="form-control" name="resName" placeholder="e.g. Acme Retail Shop" defaultValue={signupData.business_name} required /></div>
                    <div className="form-group"><label>Owner Name</label><input className="form-control" name="ownerName" placeholder="Your full name" defaultValue={signupData.ownerName} required /></div>
                    <div className="form-group"><label>Email Address</label><input className="form-control" name="email" type="email" placeholder="owner@business.com" defaultValue={signupData.email} required /></div>
                    <div className="form-group">
                      <label>Password</label>
                      <div className="password-input-wrapper">
                        <input className="form-control" name="password" type={showRegisterPassword ? 'text' : 'password'} placeholder="Min. 8 characters" defaultValue={signupData.password} required />
                        <button type="button" className="password-toggle" onClick={() => setShowRegisterPassword(!showRegisterPassword)} aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}>
                          {showRegisterPassword ? <EyeSlashIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Confirm Password</label>
                      <div className="password-input-wrapper">
                        <input className="form-control" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} placeholder="Repeat your password" required />
                        <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword(!showConfirmPassword)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                          {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </div>
                    <button className="login-btn" type="submit">Verify Email & Continue</button>
                  </form>
                  <div className="auth-switch">
                    <span>Already have an account?</span>
                    <button className="secondary-btn" style={{ width: '100%' }} onClick={() => setAuthMode('login')}>Sign In</button>
                  </div>
                </>
              )}

              {onboardingStep === 1 && showOTPStep && (
                <>
                  <h2>Verify Your Email</h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Enter the 6-digit code sent to <strong>{signupData.email}</strong> to activate your account.</p>
                  <form className="auth-form" onSubmit={e => {
                    e.preventDefault();
                    handleRegister({ ...signupData, otp: registrationOTP });
                  }}>
                    <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Code expires in: <span style={{ fontWeight: 600, color: otpExpiry < 60 ? 'var(--danger)' : 'inherit' }}>
                        {Math.floor(otpExpiry / 60)}:{(otpExpiry % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="form-group">
                      <label>Verification Code</label>
                      <input
                        className="form-control"
                        value={registrationOTP}
                        onChange={e => setRegistrationOTP(e.target.value)}
                        maxLength={6}
                        placeholder="XXXXXX"
                        style={{ textAlign: 'center', letterSpacing: '8px', fontWeight: 'bold', fontSize: '1.2rem' }}
                        required
                      />
                    </div>
                    <button className="login-btn" type="submit" disabled={loading}>
                      {loading ? 'Verifying...' : 'Verify & Create Account'}
                    </button>
                  </form>
                  <div className="auth-switch">
                    <button className="secondary-btn" style={{ width: '100%' }} onClick={() => { setShowOTPStep(false); setRegistrationOTP(''); }}>Back to Details</button>
                    <button
                      className="btn-security-primary"
                      style={{ marginTop: '16px', width: '100%' }}
                      onClick={() => handleRequestOTP(signupData.email)}
                      disabled={otpCooldown > 0 || requestingOTP}
                    >
                      {requestingOTP ? 'Sending code...' : otpCooldown > 0 ? `Resend code in ${otpCooldown}s` : 'Resend Verification Code'}
                    </button>
                  </div>
                </>
              )}

              {onboardingStep === 2 && (
                <>
                  <h2>Registration Complete</h2>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Your business account has been created. You can now access your dashboard and configure your SMS gateway.</p>

                  <div className="activation-card card" style={{ textAlign: 'center', background: '#F0F9FF', border: '1px dashed var(--primary-blue)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
                    <h4 style={{ marginBottom: '12px', color: 'var(--primary-blue)' }}>Welcome to MikrodCAP</h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      Get started by connecting your SMS gateway and creating your first customer.
                    </p>
                  </div>

                  <button className="login-btn" style={{ width: '100%', marginTop: '24px' }} onClick={() => handleRegister(signupData)} disabled={loading}>
                    {loading ? 'Finalizing Setup...' : 'Enter Dashboard'}
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

  return (
    <ErrorBoundary>
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
            <button className={`nav-btn ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => { setActiveTab('templates'); setMenuOpen(false); }}>Templates</button>
            <button className={`nav-btn ${activeTab === 'subscription' ? 'active' : ''}`} onClick={() => { setActiveTab('subscription'); setMenuOpen(false); }}>Subscription</button>
            <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); setMenuOpen(false); }}>Settings</button>
            {isAdmin && <button className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => { setActiveTab('admin'); setMenuOpen(false); }}>Admin</button>}

            <div className="business-info">
              <div className="desktop-only">
                <div className="business-name">{settings.business_name || restaurant?.business_name || 'Business Account'}</div>
              </div>
              <button className="nav-btn logout-btn" style={{ color: 'var(--danger)' }} onClick={() => { handleLogout(); setMenuOpen(false); }}>Logout</button>
            </div>
          </div>
          {menuOpen && <div className="menu-overlay mobile-only" onClick={() => setMenuOpen(false)}></div>}
        </nav>

        <main className="main-content">
          {activeTab === 'dashboard' && (
            <div className="section">
              <div className="dashboard-header">
                <h1>Business Overview</h1>
                <p className="tagline">Automatic Customer Appreciation Tracking</p>
              </div>

              <div className="kpi-grid">
                <div className="card kpi-card">
                  <div className="kpi-label">Customers Served This Week</div>
                  <div className="kpi-value">{metrics.weeklyCustomers || 0}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-label">Messages Sent Today</div>
                  <div className="kpi-value">{metrics.sentToday || 0}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-label">Pending Messages</div>
                  <div className="kpi-value">{metrics.pending || 0}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-label">Failed Today</div>
                  <div className="kpi-value" style={{ color: (metrics.failedToday || 0) > 0 ? 'var(--danger)' : 'inherit' }}>{metrics.failedToday || 0}</div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-label">Gateway Status</div>
                  <div className="kpi-value" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <span style={{
                        fontSize: '1.25rem',
                        color: gatewayStatus.status === 'ONLINE' ? 'var(--success)' : 'var(--danger)',
                        fontWeight: 'bold'
                      }}>
                        {gatewayStatus.status === 'ONLINE' ? '🟢 Online' : '🔴 Offline'}
                      </span>
                      {gatewayStatus.status === 'ONLINE' && gatewayStatus.deviceId && (
                        <span className={`battery-pill ${gatewayStatus.batteryLevel < 30 ? 'critical' : gatewayStatus.batteryLevel < 80 ? 'warning' : 'healthy'}`}>
                          <span>🔋</span>
                          {gatewayStatus.batteryLevel || 0}%
                        </span>
                      )}
                      {gatewayStatus.status === 'ONLINE' && gatewayStatus.deviceId && gatewayStatus.isCharging && (
                        <span className="battery-pill healthy" style={{ gap: '2px' }}>
                          <span className="charging-icon">⚡</span> Charging
                        </span>
                      )}
                    </div>
                    {gatewayStatus.deviceId && (
                      <div style={{ textAlign: 'center', marginTop: '4px' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600 }}>
                          {gatewayStatus.deviceName && gatewayStatus.deviceName !== 'N/A'
                            ? gatewayStatus.deviceName
                            : `Android Gateway (${gatewayStatus.deviceId})`}
                        </div>
                        {gatewayStatus.status !== 'ONLINE' && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Last seen: {gatewayStatus.lastSeen ? getRelativeTime(gatewayStatus.lastSeen) : 'Never'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {isProfessional && (
                  <>
                    <div className="card kpi-card" style={{ borderLeft: '4px solid var(--success)' }}>
                      <div className="kpi-label">Today's Payments</div>
                      <div className="kpi-value kpi-payment-amount">{formatAmount(revenueData.today)}</div>
                    </div>
                    <div className="card kpi-card" style={{ borderLeft: '4px solid var(--primary-blue)' }}>
                      <div className="kpi-label">This Week's Payments</div>
                      <div className="kpi-value kpi-payment-amount">{formatAmount(revenueData.week)}</div>
                    </div>
                    <div className="card kpi-card" style={{ borderLeft: '4px solid var(--primary-orange)' }}>
                      <div className="kpi-label">This Month's Payments</div>
                      <div className="kpi-value kpi-payment-amount">{formatAmount(revenueData.month)}</div>
                    </div>
                  </>
                )}
              </div>

              <div className="activity-section">
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h3>Customer Engagement Activity</h3>
                    {selectedSms.length > 0 && (
                      <div className="bulk-selection-bar">
                        <span className="selection-count">{selectedSms.length} items selected</span>
                        <button className="btn-delete bulk-delete-btn" onClick={() => handleBulkDelete('sms', selectedSms)}>Delete Selected</button>
                      </div>
                    )}
                  </div>
                  <div className="table-container" style={{ marginTop: '16px' }}>
                    <table className="activity-table" style={{ width: '100%', tableLayout: 'fixed', minWidth: '950px' }}>
                      <colgroup>
                        <col style={{ width: '50px' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '12%' }} />
                        {isProfessional && <col style={{ width: '15%' }} />}
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '100px' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              className="custom-checkbox"
                              checked={smsHistory.length > 0 && selectedSms.length === smsHistory.slice(0, 100).length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSms(smsHistory.slice(0, 100).map(s => s.id));
                                } else {
                                  setSelectedSms([]);
                                }
                              }}
                            />
                          </th>
                          <th>Created Date</th>
                          <th className="customer-name-cell">Customer Name</th>
                          <th>Phone Number</th>
                          {isProfessional && <th>Amount Paid</th>}
                          <th>SMS Sent Time</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {smsHistory.slice(0, 100).map(msg => (
                          <tr key={msg.id} className={selectedSms.includes(msg.id) ? 'row-selected' : ''}>
                            <td>
                              <input
                                type="checkbox"
                                className="custom-checkbox"
                                checked={selectedSms.includes(msg.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedSms(prev => [...prev, msg.id]);
                                  } else {
                                    setSelectedSms(prev => prev.filter(id => id !== msg.id));
                                  }
                                }}
                              />
                            </td>
                            <td className="date-cell" title={formatDateTime(msg.createdAt || msg.id)}>{formatDateTime(msg.createdAt || msg.id)}</td>
                            <td className="customer-name-cell" style={{ fontWeight: 700 }} title={msg.customerName}>{msg.customerName}</td>
                            <td title={msg.phone}>{msg.phone}</td>
                            {isProfessional && <td style={{ color: 'var(--success)', fontWeight: 600 }}>{formatAmount(msg.amountPaidSnapshot)}</td>}
                            <td className="date-cell" title={msg.sentAt ? formatDateTime(msg.sentAt) : 'Pending'}>
                              {msg.sentAt ? formatDateTime(msg.sentAt) : <span className="badge badge-pending">Pending</span>}
                            </td>
                            <td title={msg.status}><StatusBadge status={msg.status} /></td>
                            <td>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {msg.status === 'Failed' && (
                                  <button className="resend-btn" onClick={() => handleResend(msg.id)}>Resend</button>
                                )}
                                <button
                                  className="btn-delete"
                                  onClick={async () => {
                                    try {
                                      await fetchWithAuth(`/sms-queue/${msg.id}`, { method: 'DELETE' });
                                      setSmsHistory(prev => prev.filter(s => s.id !== msg.id));
                                      setSelectedSms(prev => prev.filter(id => id !== msg.id));
                                      showToast('Deleted successfully');
                                      refreshData(true);
                                    } catch (err) { showToast(err.message, 'error'); }
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {smsHistory.length === 0 && (
                          <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>No recent activity</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {
            activeTab === 'customers' && (
              <div className="section">
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Manual Appreciation Entry</h3>
                    {formData.phone.length >= 9 && customers.find(c => normalizePhone(c.phone) === normalizePhone(formData.phone)) && (
                      <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>✓ Recognized Customer</span>
                    )}
                  </div>
                  <form onSubmit={async e => {
                    e.preventDefault();
                    if (isCustomerSubmitting) return;

                    const normalized = normalizePhone(formData.phone);
                    const existing = customers.find(c => normalizePhone(c.phone) === normalized);
                    const finalData = {
                      ...formData,
                      phone: normalized
                    };

                    try {
                      setIsCustomerSubmitting(true);
                      const data = await fetchWithAuth('/customers', {
                        method: 'POST',
                        body: JSON.stringify(finalData)
                      });

                      if (data.success) {
                        setFormData({ name: '', phone: '', amount: '' });
                        const customerData = data.customer;
                        setCustomers(prev => {
                          const exists = prev.find(c => c.id === customerData.id);
                          if (exists) return prev.map(c => c.id === customerData.id ? customerData : c);
                          return [...prev, customerData];
                        });
                        setMetrics(prev => {
                          const customerExists = customers.find(c => c.id === customerData.id);
                          if (customerExists) return prev;
                          return { ...prev, totalCustomers: prev.totalCustomers + 1 };
                        });
                        showToast(data.message || 'Customer entry submitted successfully.');
                        refreshData(true);

                        // Return focus to the first input field
                        const firstInput = document.getElementById('manual-entry-phone');
                        if (firstInput) firstInput.focus();
                      } else {
                        showToast(data.message || 'Unable to submit customer entry. Please try again.', 'error');
                      }
                    } catch (err) {
                      showToast(err.message || 'Unable to submit customer entry. Please try again.', 'error');
                    } finally {
                      setIsCustomerSubmitting(false);
                    }
                  }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
                    <div className="form-group">
                      <label>Phone Number</label>
                      <input
                        id="manual-entry-phone"
                        className="form-control"
                        placeholder="e.g. 0712345678"
                        value={formData.phone}
                        onChange={e => {
                          const val = e.target.value;
                          const normalized = normalizePhone(val);
                          const existing = customers.find(c => normalizePhone(c.phone) === normalized);
                          setFormData({
                            ...formData,
                            phone: val,
                            name: existing ? existing.name : (formData.name === existing?.name ? '' : formData.name)
                          });
                        }}
                        disabled={isCustomerSubmitting}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Customer Name</label>
                      <input
                        className="form-control"
                        placeholder="Full Name"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        disabled={isCustomerSubmitting}
                        required
                      />
                      {formData.phone.length >= 9 && customers.find(c => normalizePhone(c.phone) === normalizePhone(formData.phone)) && (
                        <p style={{ fontSize: '0.7rem', color: 'var(--success)', marginTop: '4px' }}>✓ Recognized Customer (Name will be updated if changed)</p>
                      )}
                    </div>
                    {isProfessional && (
                      <div className="form-group">
                        <label>Amount Paid (KSh)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-control"
                          placeholder="Optional amount"
                          value={formData.amount || ''}
                          onChange={e => setFormData({ ...formData, amount: e.target.value })}
                          disabled={isCustomerSubmitting}
                        />
                      </div>
                    )}
                    <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                      <button
                        className="login-btn"
                        style={{ width: '100%', marginTop: 0 }}
                        type="submit"
                        disabled={isCustomerSubmitting}
                      >
                        {isCustomerSubmitting ? 'Submitting...' : 'Submit Entry'}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="card" style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <h3>Customer Directory</h3>
                      {selectedCustomers.length > 0 && (
                        <div className="bulk-selection-bar">
                          <span className="selection-count">{selectedCustomers.length} items selected</span>
                          <button className="btn-delete bulk-delete-btn" onClick={() => handleBulkDelete('customer', selectedCustomers)}>Delete Selected</button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input className="form-control" placeholder="Search customers..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: '250px' }} />
                    </div>
                  </div>
                  <div className="table-container">
                    <table className="activity-table" style={{ tableLayout: 'fixed', minWidth: '950px' }}>
                      <colgroup>
                        <col style={{ width: '50px' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '35%' }} />
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '15%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              className="custom-checkbox"
                              checked={customers.length > 0 && selectedCustomers.length === customers.filter(c => (c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm))).length}
                              onChange={(e) => {
                                const filteredIds = customers
                                  .filter(c => (c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm)))
                                  .map(c => c.id);
                                if (e.target.checked) {
                                  setSelectedCustomers(filteredIds);
                                } else {
                                  setSelectedCustomers([]);
                                }
                              }}
                            />
                          </th>
                          <th>Created Date</th>
                          <th className="customer-name-cell">Customer Name</th>
                          <th>Phone Number</th>
                          <th>Visit Count</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customers
                          .filter(c => (c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm)))
                          .map(customer => (
                            <tr key={customer.id} className={selectedCustomers.includes(customer.id) ? 'row-selected' : ''}>
                              <td>
                                <input
                                  type="checkbox"
                                  className="custom-checkbox"
                                  checked={selectedCustomers.includes(customer.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedCustomers(prev => [...prev, customer.id]);
                                    } else {
                                      setSelectedCustomers(prev => prev.filter(id => id !== customer.id));
                                    }
                                  }}
                                />
                              </td>
                              <td className="date-cell" title={formatDateTime(customer.createdAt || customer.created_at || customer.timestamp || customer.id)}>{formatDateTime(customer.createdAt || customer.created_at || customer.timestamp || customer.id)}</td>
                              <td className="customer-name-cell" style={{ fontWeight: 700 }} title={customer.name}>{customer.name}</td>
                              <td title={customer.phone}>{customer.phone}</td>
                              <td>{customer.visitCount || 1}</td>
                              <td className="actions">
                                <button
                                  className="btn-delete"
                                  onClick={async () => {
                                    try {
                                      await fetchWithAuth(`/customers/${customer.id}`, { method: 'DELETE' });
                                      setCustomers(prev => prev.filter(c => c.id !== customer.id));
                                      setSelectedCustomers(prev => prev.filter(id => id !== customer.id));
                                      showToast('Deleted successfully');
                                      refreshData(true);
                                    } catch (err) { showToast(err.message, 'error'); }
                                  }}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        {customers.filter(c => (c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm))).length === 0 && (
                          <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>No customers found</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          }

          {
            activeTab === 'templates' && (
              <div className="section card">
                <h3>Manage appreciation messages</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Configure your customer appreciation templates and personalize outgoing messages.
                </p>
                <div className="form-group">
                  <div className="placeholder-buttons" style={{ marginBottom: '8px', display: 'flex', gap: '8px' }}>
                    <button type="button" className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => setTemplates({ ...templates, thankYou: templates.thankYou + '{name}' })}>+ {`{name}`}</button>
                    <button type="button" className="secondary-btn" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => setTemplates({ ...templates, thankYou: templates.thankYou + '{business_name}' })}>+ {`{business_name}`}</button>
                  </div>
                  <textarea
                    className="form-control"
                    style={{ height: '150px', fontFamily: 'monospace' }}
                    value={templates.thankYou?.trim() ? templates.thankYou : DEFAULT_TEMPLATE}
                    onChange={e => setTemplates({ ...templates, thankYou: e.target.value })}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Supported placeholders: <code>{`{name}`}</code>, <code>{`{business_name}`}</code>.
                  </p>
                </div>

                <div className="preview-box" style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'block', marginBottom: '8px' }}>Real-time Preview</span>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#1e293b', fontStyle: templates.thankYou?.trim() ? 'normal' : 'italic' }}>
                    {templates.thankYou?.trim() ? renderPreview(templates.thankYou, { name: 'Jane' }, { business_name: settings.business_name || restaurant?.business_name || 'Business Account' }) : renderPreview(DEFAULT_TEMPLATE, { name: 'Jane' }, { business_name: settings.business_name || restaurant?.business_name || 'Business Account' })}
                  </p>
                </div>

                <button
                  className="login-btn"
                  style={{ width: '200px' }}
                  disabled={isTemplateSaving}
                  onClick={async () => {
                    setIsTemplateSaving(true);
                    setTemplateSaveStatus('idle');
                    try {
                      // Normalize all templates before save
                      const normalizedTemplates = { ...templates };
                      for (const key in normalizedTemplates) {
                        if (typeof normalizedTemplates[key] === 'string') {
                          normalizedTemplates[key] = normalizeTemplate(normalizedTemplates[key]);
                        }
                      }

                      const data = await fetchWithAuth('/templates', { method: 'POST', body: JSON.stringify(normalizedTemplates) });
                      if (!data?.success) throw new Error('Save failed');

                      showToast('Templates saved successfully.');
                      setTemplateSaveStatus('success');

                      setTimeout(() => {
                        refreshData(true);
                        setTemplateSaveStatus('idle');
                      }, 3000);
                    } catch (err) {
                      setTemplateSaveStatus('error');
                      showToast('Unable to save templates. Please try again.', 'danger');
                    } finally {
                      setIsTemplateSaving(false);
                    }
                  }}
                >
                  {isTemplateSaving ? 'Saving...' : templateSaveStatus === 'success' ? 'Saved ✓' : 'Save Changes'}
                </button>
              </div>
            )
          }

          {
            activeTab === 'subscription' && (
              <div className="section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 180px)', padding: '20px' }}>
                <div className="subscription-status-header" style={{
                  background: '#fff',
                  padding: '12px 20px',
                  borderRadius: '16px',
                  border: '1px solid var(--border)',
                  width: '100%',
                  maxWidth: '440px',
                  marginBottom: '16px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Subscription:</span>
                    <StatusBadge status={restaurant?.subscriptionStatus} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Time Left:</span>
                    <span style={{
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: calculateDaysRemaining(restaurant?.subscriptionExpiry) > 0 ? 'var(--primary-blue)' : 'var(--danger)'
                    }}>
                      {(() => {
                        const days = calculateDaysRemaining(restaurant?.subscriptionExpiry);
                        if (days <= 0) return 'Expired';
                        return `${days} days remaining`;
                      })()}
                    </span>
                  </div>
                </div>
                <div
                  className="pricing-card selected"
                  style={{
                    maxWidth: '440px',
                    width: '100%',
                    padding: '32px 24px',
                    textAlign: 'center',
                    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.12)',
                    border: '2px solid var(--primary-blue)',
                    background: '#fff',
                    borderRadius: '24px',
                    marginBottom: '32px'
                  }}
                >
                  <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0px', color: 'var(--text-main)' }}>MikrodCAP Standard</h2>
                  <div className="price-display" style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--primary-blue)', margin: '4px 0 0' }}>KES 2,000</div>
                  <div className="subscription-helper-text" style={{ fontSize: '0.7rem', marginBottom: '12px', opacity: 0.8 }}>per month</div>

                  <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '20px' }}>
                    A complete toolkit to manage customers, track revenue, and grow your business with automated appreciation.
                  </p>

                  <div style={{ textAlign: 'left', display: 'inline-block', width: '100%', maxWidth: '320px', marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '12px', textAlign: 'center' }}>Features:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                      {[
                        'Customer Database',
                        'Revenue Tracking',
                        'Daily, Weekly & Monthly Reports',
                        'Appreciation SMS Integration',
                        'Customer Analytics',
                        'Transaction History',
                        'Future Updates Included'
                      ].map(feature => (
                        <div key={feature} style={{ display: 'flex', gap: '8px', fontSize: '0.9rem', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: 'var(--success)', fontWeight: 'bold', fontSize: '1rem' }}>✓</span>
                          <span style={{ fontWeight: 500 }}>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.3', margin: 0 }}>
                      SMS credits are separate and purchased from your provider.
                    </p>
                  </div>

                  <button
                    className="btn-security-primary"
                    style={{ width: 'auto', minWidth: '220px', padding: '10px 24px', fontSize: '1rem', borderRadius: '12px', fontWeight: 800, boxShadow: '0 8px 16px -3px rgba(0, 114, 206, 0.4)', margin: '0 auto' }}
                    onClick={() => {
                      setSelectedPlan('Standard');
                      setMpesaPhone(restaurant?.phone || '');
                      setShowMpesaModal(true);
                    }}
                  >
                    Activate Subscription
                  </button>
                </div>

                <div className="card" style={{ maxWidth: '800px', width: '100%', textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginBottom: '16px' }}>
                    <div>
                      <div className="subscription-helper-text" style={{ fontSize: '0.8rem' }}>Account Status</div>
                      <div className={`subscription-badge ${restaurant?.subscriptionStatus === 'Active' ? 'badge-sent' : 'badge-pending'}`} style={{ marginTop: '4px', fontSize: '0.85rem', padding: '3px 12px' }}>
                        {restaurant?.subscriptionStatus || 'Inactive'}
                      </div>
                    </div>
                    {restaurant?.subscriptionStatus === 'Active' && (
                      <div>
                        <div className="subscription-helper-text" style={{ fontSize: '0.85rem' }}>Expires On</div>
                        <div style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: '4px', fontSize: '1rem' }}>
                          {restaurant?.subscriptionExpiry ? formatActivityDate(restaurant.subscriptionExpiry) : 'N/A'}
                        </div>
                      </div>
                    )}
                  </div>

                  <h3 className="subscription-section-title" style={{ textAlign: 'left', marginTop: '24px', fontSize: '1.1rem' }}>Payment History</h3>
                  <div className="table-container">
                    <table className="activity-table">
                      <colgroup>
                        <col style={{ width: '30%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '15%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Receipt #</th>
                          <th>Plan Purchased</th>
                          <th>Amount</th>
                          <th>Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subscriptionHistory.map(pay => (
                          <tr key={pay.id}>
                            <td className="subscription-table-text" style={{ fontWeight: 700 }}>{pay.transactionCode}</td>
                            <td className="subscription-table-text">{pay.plan === 'Standard' ? 'MikrodCAP Standard' : pay.plan}</td>
                            <td className="subscription-table-text">KSh {pay.amount?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                            <td className="subscription-table-text">{formatActivityDate(pay.date)}</td>
                            <td><span className="subscription-badge badge-sent">Processed</span></td>
                          </tr>
                        ))}
                        {subscriptionHistory.length === 0 && (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '60px' }}>
                              <p className="subscription-body">No subscription history found.</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          {showMpesaModal && (
            <Modal title="Lipa Na M-Pesa Online" onClose={() => !isProcessingMpesa && setShowMpesaModal(false)}>
              <div style={{ padding: '20px' }}>
                <div className="modal-payment-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span className="subscription-body">Purchasing:</span>
                    <span className="subscription-table-text" style={{ fontWeight: 700 }}>{selectedPlan} Plan</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="subscription-body">Amount Due:</span>
                    <span className="subscription-table-text" style={{ color: 'var(--primary-blue)', fontWeight: 800 }}>
                      KSh 2,000
                    </span>
                  </div>
                </div>

                <div className="form-group">
                  <label className="subscription-card-title">M-Pesa Phone Number</label>
                  <input
                    className="form-control"
                    placeholder="e.g. 0712345678"
                    value={mpesaPhone}
                    onChange={e => setMpesaPhone(e.target.value)}
                    disabled={isProcessingMpesa}
                  />
                  <p className="subscription-helper-text" style={{ marginTop: '8px' }}>You will receive an STK Push prompt on this phone.</p>
                </div>

                <button
                  className="btn-security-primary"
                  style={{ width: '100%', marginTop: '24px', padding: '14px' }}
                  disabled={isProcessingMpesa || mpesaPhone.length < 10}
                  onClick={async () => {
                    setIsProcessingMpesa(true);
                    try {
                      const amount = 2000;
                      const res = await fetchWithAuth('/subscriptions/mpesa/initiate', {
                        method: 'POST',
                        body: JSON.stringify({ plan: 'Standard', phone: mpesaPhone, amount })
                      });

                      showToast('STK Push sent! Please enter your PIN on your phone.');

                      setTimeout(() => {
                        showToast('Payment processing... Please wait.');
                        setTimeout(() => {
                          refreshData(true);
                          setShowMpesaModal(false);
                          setIsProcessingMpesa(false);
                          showToast('Subscription activated successfully!', 'success');
                        }, 5000);
                      }, 5000);

                    } catch (err) {
                      showToast(err.message, 'error');
                      setIsProcessingMpesa(false);
                    }
                  }}
                >
                  {isProcessingMpesa ? 'Awaiting M-Pesa PIN...' : 'Pay with M-Pesa'}
                </button>
              </div>
            </Modal>
          )}


          {
            activeTab === 'settings' && (
              <div className="section">
                <div className="card">
                  <h3>Application and account configuration</h3>
                  <p className="tagline">Manage your business profile, contact details, and system security.</p>
                  <form onSubmit={e => {
                    e.preventDefault();
                    setIsSaving(true);
                    setSaveStatus('idle');

                    const normalizedSettings = {
                      ...settings
                    };

                    fetchWithAuth('/settings', { method: 'POST', body: JSON.stringify(normalizedSettings) })
                      .then((data) => {
                        showToast('Settings saved successfully.');
                        setSaveStatus('success');
                        if (data.restaurant) {
                          localStorage.setItem('restaurant', JSON.stringify(data.restaurant));
                          setRestaurant(data.restaurant);
                        }
                        setTimeout(() => {
                          setSaveStatus('idle');
                        }, 3000);
                        refreshData(true);
                      })
                      .catch(err => {
                        setSaveStatus('error');
                        showToast('Unable to save settings. Please try again.', 'danger');
                      })
                      .finally(() => {
                        setIsSaving(false);
                      });
                  }} style={{ marginTop: '16px' }}>
                    <div className="form-group"><label>Business Name</label><input className="form-control" value={settings.business_name} onChange={e => setSettings({ ...settings, business_name: e.target.value })} required /></div>
                    <div className="form-group"><label>Contact Phone</label><input className="form-control" type="tel" value={settings.phone} onChange={e => setSettings({ ...settings, phone: e.target.value })} /></div>
                    <div className="form-group"><label>Official Email</label><input className="form-control" type="email" value={settings.email} onChange={e => setSettings({ ...settings, email: e.target.value })} /></div>
                    <div className="form-group"><label>Operating Address</label><input className="form-control" value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} /></div>

                    <button className="login-btn" style={{ width: '200px' }} type="submit" disabled={isSaving}>
                      {isSaving ? 'Saving...' : saveStatus === 'success' ? 'Saved ✓' : 'Save Changes'}
                    </button>
                  </form>
                </div>


                <div className="card" style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>System Settings</h3>
                    <button className="admin-action-btn" onClick={() => setShowAdvanced(!showAdvanced)}>
                      {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
                    </button>
                  </div>

                  {showAdvanced ? (
                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                      <div className="settings-section">
                        <h4>Advanced Configuration</h4>

                        <div className="form-group">
                          <label>Gateway Backend URL</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input className="form-control" value={API_URL} readOnly style={{ background: '#f1f5f9' }} />
                            <button
                              className="admin-action-btn"
                              type="button"
                              onClick={() => { navigator.clipboard.writeText(API_URL); showToast('URL copied to clipboard'); }}
                              title="Copy to clipboard"
                            >
                              <CopyIcon />
                            </button>
                          </div>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Use this URL in your Android Gateway app settings.</p>
                        </div>
                      </div>

                      <div className="settings-section" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                        <h4>Account Information</h4>
                        <div className="form-group">
                          <label>Logged-in Email</label>
                          <input className="form-control" value={user?.email || 'N/A'} readOnly style={{ background: '#f1f5f9' }} />
                        </div>
                      </div>

                      <div className="settings-section" style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                        <h4>Security Management</h4>

                        {!passwordOtpSent ? (
                          <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
                            <button
                              className="btn-security-primary"
                              type="button"
                              onClick={() => handleRequestOTP(user.email, 'password')}
                              disabled={passwordOtpCooldown > 0 || requestingOTP}
                            >
                              {requestingOTP ? 'Sending Verification Code...' : passwordOtpCooldown > 0 ? `Resend code in ${passwordOtpCooldown}s` : 'Send Verification Code'}
                            </button>
                          </div>
                        ) : (
                          <div className="card" style={{ padding: '20px', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                              <h5 style={{ margin: 0, color: 'var(--primary-blue)' }}>Security Verification</h5>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Expires: <span style={{ fontWeight: 600 }}>{Math.floor(passwordOtpExpiry / 60)}:{(passwordOtpExpiry % 60).toString().padStart(2, '0')}</span>
                              </div>
                            </div>
                            <p style={{ fontSize: '0.85rem', marginBottom: '20px' }}>Enter the 6-digit verification code sent to your email address.</p>
                            <div className="form-group">
                              <label>Verification Code</label>
                              <input
                                className="form-control"
                                value={passwordOTP}
                                onChange={e => setPasswordOTP(e.target.value)}
                                placeholder="Enter 6-digit code"
                                maxLength={6}
                                style={{ letterSpacing: '4px', fontWeight: 'bold', textAlign: 'center', fontSize: '1.1rem' }}
                              />
                            </div>
                            <div className="modal-grid" style={{ marginTop: '16px' }}>
                              <div className="form-group">
                                <label>New Password</label>
                                <div className="password-input-wrapper">
                                  <input
                                    className="form-control"
                                    type={showNewPassword ? 'text' : 'password'}
                                    value={passwordData.new}
                                    onChange={e => setPasswordData({ ...passwordData, new: e.target.value })}
                                    autoComplete="new-password"
                                  />
                                  <button type="button" className="password-toggle" onClick={() => setShowNewPassword(!showNewPassword)} aria-label={showNewPassword ? 'Hide password' : 'Show password'}>
                                    {showNewPassword ? <EyeSlashIcon /> : <EyeIcon />}
                                  </button>
                                </div>
                              </div>
                              <div className="form-group">
                                <label>Confirm New Password</label>
                                <div className="password-input-wrapper">
                                  <input
                                    className="form-control"
                                    type={showConfirmNewPassword ? 'text' : 'password'}
                                    value={passwordData.confirm}
                                    onChange={e => setPasswordData({ ...passwordData, confirm: e.target.value })}
                                    autoComplete="new-password"
                                  />
                                  <button type="button" className="password-toggle" onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)} aria-label={showConfirmNewPassword ? 'Hide password' : 'Show password'}>
                                    {showConfirmNewPassword ? <EyeSlashIcon /> : <EyeIcon />}
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                              <button
                                className="btn-security-primary"
                                type="button"
                                onClick={handlePasswordChangeOTP}
                                disabled={passwordOTP.length < 6 || !passwordData.new}
                              >
                                {requestingOTP ? 'Changing...' : 'Change Password'}
                              </button>
                              <button className="admin-action-btn" style={{ background: 'white' }} type="button" onClick={() => { setPasswordOtpSent(false); setPasswordOTP(''); setPasswordData({ current: '', new: '', confirm: '' }); }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="settings-section" style={{ marginTop: '48px', paddingTop: '32px', borderTop: '2px solid var(--danger-light)' }}>
                        <h4 style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--danger)', borderRadius: '50%' }}></span>
                          Danger Zone
                        </h4>
                        <div className="form-group" style={{ marginTop: '16px' }}>
                          <label>Perform Factory Reset</label>

                          {!showResetConfirm ? (
                            <button className="btn-delete" type="button" onClick={() => setShowResetConfirm(true)}>
                              Reset All Business Data
                            </button>
                          ) : (
                            <div className="card" style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', padding: '24px' }}>
                              <p style={{ fontWeight: 700, color: 'var(--danger)', marginBottom: '16px' }}>Ownership Verification Required</p>

                              {!factoryResetOtpSent ? (
                                <button
                                  className="btn-security-primary"
                                  onClick={() => handleRequestOTP(user.email, 'factory-reset')}
                                  disabled={factoryResetOtpCooldown > 0 || requestingOTP}
                                >
                                  {requestingOTP ? 'Sending code...' : factoryResetOtpCooldown > 0 ? `Resend in ${factoryResetOtpCooldown}s` : 'Send Verification Code'}
                                </button>
                              ) : (
                                <>
                                  <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: 'var(--danger)', fontWeight: 600 }}>
                                    Verification code expires in: {Math.floor(factoryResetOtpExpiry / 60)}:{(factoryResetOtpExpiry % 60).toString().padStart(2, '0')}
                                  </div>
                                  <div className="form-group">
                                    <label>Enter 6-Digit Code</label>
                                    <input
                                      className="form-control"
                                      value={factoryResetOTP}
                                      onChange={e => setFactoryResetOTP(e.target.value)}
                                      placeholder="XXXXXX"
                                      maxLength={6}
                                      style={{ letterSpacing: '4px', fontWeight: 'bold', textAlign: 'center' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                    <button
                                      className="btn-security-primary"
                                      type="button"
                                      style={{ background: 'var(--danger)', border: '1px solid var(--danger)' }}
                                      onClick={handleAccountReset}
                                      disabled={factoryResetOTP.length < 6}
                                    >
                                      Confirm Factory Reset
                                    </button>
                                    <button className="admin-action-btn" type="button" onClick={() => { setShowResetConfirm(false); setFactoryResetOtpSent(false); setFactoryResetOTP(''); }}>
                                      Cancel
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: '16px', padding: '16px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      Advanced technical settings are hidden to keep your experience simple. Tap "Show Advanced" if you need to configure gateway nodes or API integrations.
                    </div>
                  )}
                </div>
              </div>
            )
          }

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

                  <div className="table-container" style={{ overflowX: 'auto' }}>
                    <table className="activity-table" style={{ tableLayout: 'auto', minWidth: '1300px', width: '100%' }}>
                      <colgroup>
                        <col style={{ width: '220px' }} />
                        <col style={{ width: '150px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '120px' }} />
                        <col style={{ width: '180px' }} />
                        <col style={{ width: '180px' }} />
                        <col style={{ width: '380px' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Business Name</th>
                          <th>Business ID</th>
                          <th>Plan</th>
                          <th>Status</th>
                          <th>Expiry Date</th>
                          <th>Created Date</th>
                          <th>Actions</th>
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
                                <td className="date-cell">{res.subscriptionExpiryDate ? formatDateTime(res.subscriptionExpiryDate) : 'N/A'}</td>
                                <td className="date-cell" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDateTime(res.createdAt)}</td>
                                <td className="actions">
                                  <div style={{ display: 'flex', gap: '8px' }}>
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
                    {selectedRes.gateway && (
                      <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                        <h4 style={{ marginBottom: '16px' }}>Connected Gateway</h4>
                        <div className="modal-grid">
                          <div className="modal-field"><label>Device Name</label><p>{selectedRes.gateway.deviceName}</p></div>
                          <div className="modal-field"><label>Device ID</label><p style={{ fontSize: '0.8rem' }}>{selectedRes.gateway.deviceId}</p></div>
                          <div className="modal-field"><label>Battery</label><p>{selectedRes.gateway.batteryLevel}% {selectedRes.gateway.isCharging ? '(Charging)' : ''}</p></div>
                          <div className="modal-field"><label>App Version</label><p>{selectedRes.gateway.appVersion}</p></div>
                          <div className="modal-field"><label>Last Seen</label><p>{getRelativeTime(selectedRes.gateway.lastSeen)}</p></div>
                        </div>
                      </div>
                    )}
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
        </main>

        <footer style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
          © 2026 MikrodCAP | MikrodTech Customer Appreciation Platform
        </footer>
      </div>
    </ErrorBoundary>
  )
}

export default App
