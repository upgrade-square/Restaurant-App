const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'restaurant-sms-saas-secret-key-2026';

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path.join(__dirname, 'data');

// Timezone Utility: Force UTC ISO-8601 for all storage
const nowUTC = () => new Date().toISOString();
const DATA_FILE = path.join(DATA_DIR, 'customers.json');
const SMS_DATA_FILE = path.join(DATA_DIR, 'sms_queue.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const RESTAURANTS_FILE = path.join(DATA_DIR, 'restaurants.json');
const GATEWAY_FILE = path.join(DATA_DIR, 'gateway.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const DEFAULT_RESTAURANT_ID = 'default';

app.use(cors());
app.use(bodyParser.json());

// 1. Global Request Logger
app.use((req, res, next) => {
    console.log(`[REQUEST] ${new Date().toISOString()} - ${req.ip} - ${req.method} ${req.originalUrl}`);
    next();
});

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}
if (!fs.existsSync(SMS_DATA_FILE)) {
    fs.writeFileSync(SMS_DATA_FILE, JSON.stringify([]));
}
if (!fs.existsSync(GATEWAY_FILE)) {
    fs.writeFileSync(GATEWAY_FILE, JSON.stringify([]));
}
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(RESTAURANTS_FILE)) {
    const defaultRestaurant = {
        id: DEFAULT_RESTAURANT_ID,
        name: 'Demo Business',
        plan: 'Professional',
        subscriptionStatus: 'Active',
        subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        phone: '',
        address: '',
        createdAt: nowUTC(),
        updatedAt: nowUTC()
    };
    fs.writeFileSync(RESTAURANTS_FILE, JSON.stringify([defaultRestaurant]));
}
if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
        [DEFAULT_RESTAURANT_ID]: {
            restaurantName: 'MikrodTech Business',
            phone: '',
            address: '',
            defaultThanks: 'Thank you for your payment. We appreciate your support and look forward to serving you again.',
            email: ''
        }
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings));
}
if (!fs.existsSync(TEMPLATES_FILE)) {
    const defaultTemplates = {
        [DEFAULT_RESTAURANT_ID]: {
            thankYou: 'Hi {{name}}, thank you for your payment at {{restaurantName}}. We appreciate your support and look forward to serving you again!',
            reservation: 'Hi {{name}}, your appointment at {{restaurantName}} is confirmed.',
            promotional: 'Hi {{name}}, we have a special offer for you at {{restaurantName}}! Show this message to get 10% off.'
        }
    };
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(defaultTemplates));
}

// Helper to read data
const readData = (file) => {
    try {
        const data = fs.readFileSync(file);
        return JSON.parse(data);
    } catch (e) {
        if (file.includes('settings.json') || file.includes('templates.json')) return {};
        return [];
    }
};

// Helper to write data
const writeData = (file, data) => {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
};

// Admin Role Migration
const migrateAdmin = () => {
    try {
        const users = readData(USERS_FILE);
        const admin = users.find(u => u.email === 'admin@test.com');
        if (admin && admin.role !== 'admin') {
            admin.role = 'admin';
            writeData(USERS_FILE, users);
            console.log("Admin account migrated successfully");
        }
    } catch (err) {
        console.error("Migration failed:", err);
    }
};
migrateAdmin();

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        console.log(`[AUTH_SUCCESS] User: ${verified.userId} | Restaurant: ${verified.restaurantId || 'N/A'}`);
        next();
    } catch (err) {
        console.log(`[AUTH_FAILED] Reason: Invalid token`);
        res.status(403).json({ error: 'Invalid token' });
    }
};

// Subscription Enforcement Middleware
const checkSubscription = (req, res, next) => {
    const restaurantId = req.user.restaurantId;
    const restaurants = readData(RESTAURANTS_FILE);
    const restaurant = restaurants.find(r => r.id === restaurantId);

    if (!restaurant) {
        return res.status(404).json({ error: 'Business account not found' });
    }

    const now = new Date();
    const expiry = new Date(restaurant.subscriptionExpiry);
    const status = restaurant.subscriptionStatus;

    if (status === 'Suspended' || status === 'Inactive' || status === 'inactive') {
        return res.status(403).json({ error: 'Your business account has been deactivated. Please contact MikrodTech support.' });
    }

    if (status === 'Expired' || (expiry < now && status !== 'Active' && status !== 'Trial')) {
        return res.status(403).json({ error: 'Your subscription has expired. Please renew to continue.' });
    }

    // Auto-update status to Expired if time passed but status still Active/Trial?
    // The requirement says "Maintenance should happen but business operations must remain blocked"
    if (expiry < now && (status === 'Active' || status === 'Trial')) {
        restaurant.subscriptionStatus = 'Expired';
        writeData(RESTAURANTS_FILE, restaurants);
        return res.status(403).json({ error: 'Your subscription has expired. Please renew to continue.' });
    }

    next();
};
/**
 * @api {get} /health Health Check
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

/**
 * @api {get} /customers Get All Customers
 * @apiDescription Retrieves a list of all submitted customer entries
 * @apiSuccess {Array} customers List of customer objects
 */
app.get('/customers', authenticateToken, checkSubscription, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const customers = readData(DATA_FILE);
        const filtered = customers.filter(c => {
            const isMatch = c.restaurantId === restaurantId || (!c.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID);
            const isActive = c.active !== false;
            return isMatch && isActive;
        });
        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read data' });
    }
});

/**
 * @api {post} /customers Create Customer
 */
app.post('/customers', authenticateToken, checkSubscription, (req, res) => {
    try {
        const { name, phone, amount, timestamp } = req.body;
        const restaurantId = req.user.restaurantId;
        if (!name || !phone || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const customers = readData(DATA_FILE);
        const smsQueue = readData(SMS_DATA_FILE);
        const allSettings = readData(SETTINGS_FILE);
        const allTemplates = readData(TEMPLATES_FILE);

        // Security Enforcement: ALWAYS use restaurantId from token
        const settings = allSettings[restaurantId] || (allSettings.restaurantName ? allSettings : allSettings[DEFAULT_RESTAURANT_ID]);
        const templates = allTemplates[restaurantId] || (allTemplates.thankYou ? allTemplates : allTemplates[DEFAULT_RESTAURANT_ID]);

        const customerId = Date.now();
        const createdAt = nowUTC();
        const newCustomer = {
            id: customerId,
            restaurantId,
            name,
            phone,
            amount,
            sms_status: 'Pending',
            active: true,
            timestamp: timestamp || createdAt,
            created_at: createdAt
        };

        // Prepare message using template (use first name for greeting)
        const firstName = name.split(' ')[0];
        let message = templates.thankYou || settings.defaultThanks;
        message = message.replace('{{name}}', firstName);
        message = message.replace('{{restaurantName}}', settings.restaurantName);

        const newSmsEntry = {
            id: Date.now() + 1,
            restaurantId,
            customerId: customerId,
            customerName: name,
            phone: phone,
            amount: amount,
            message: message,
            status: 'Pending',
            retryCount: 0,
            createdAt: nowUTC(),
            sentAt: null
        };

        customers.push(newCustomer);
        smsQueue.push(newSmsEntry);

        writeData(DATA_FILE, customers);
        writeData(SMS_DATA_FILE, smsQueue);

        res.status(201).json(newCustomer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save data' });
    }
});

/**
 * @api {post} /payments/incoming Automated Payment Upload (M-Pesa)
 * @apiDescription Receives payment data from Android Gateway and automates customer appreciation.
 */
app.post('/payments/incoming', authenticateToken, (req, res) => {
    const transactionCode = req.body.transactionCode;
    const customerName = req.body.customerName || req.body.name;
    const customerPhone = req.body.customerPhone || req.body.phone;
    const amount = req.body.amount || req.body.billAmount || 'M-Pesa';
    const restaurantId = req.user.restaurantId;

    if (req.body.name || req.body.phone) {
        console.log(`[PAYMENT_FORMAT] legacy_android_payload=true`);
    }

    console.log(`[PAYMENT_RECEIVED] Trace: ${transactionCode} | Name: ${customerName} | Phone: ${customerPhone} | Restaurant: ${restaurantId}`);

    try {
        if (!transactionCode || !customerName || !customerPhone) {
            console.log(`[PAYMENT_REJECTED] Reason: Missing required fields`);
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const paymentsPath = path.join(DATA_DIR, 'payments.json');
        const payments = readData(paymentsPath);

        // 1. Duplicate Check
        if (payments.find(p => p.transactionCode === transactionCode)) {
            console.log(`[PAYMENT_DUPLICATE] ${transactionCode}`);
            return res.json({ success: true, duplicate: true });
        }

        // 2. Normalize Phone (254... -> 07...)
        let normalizedPhone = customerPhone;
        if (normalizedPhone.startsWith('254')) {
            normalizedPhone = '0' + normalizedPhone.slice(3);
        }

        // 3. First Name Logic
        const firstName = customerName.split(' ')[0];

        // 4. Create/Update Customer
        const customers = readData(DATA_FILE);
        let customerCreated = false;
        let customer = customers.find(c => c.phone === normalizedPhone && (c.restaurantId === restaurantId || !c.restaurantId));

        if (!customer) {
            customer = {
                id: Date.now(),
                restaurantId,
                name: customerName,
                phone: normalizedPhone,
                amount: amount,
                sms_status: 'Pending',
                active: true,
                createdAt: nowUTC()
            };
            customers.push(customer);
            writeData(DATA_FILE, customers);
            customerCreated = true;
            console.log(`[PAYMENT_CUSTOMER_CREATED] ${customer.id}`);
        }

        // 5. Generate SMS using Template
        const allTemplates = readData(TEMPLATES_FILE);
        const allSettings = readData(SETTINGS_FILE);
        const settings = allSettings[restaurantId] || allSettings[DEFAULT_RESTAURANT_ID] || {};
        const templates = allTemplates[restaurantId] || allTemplates[DEFAULT_RESTAURANT_ID] || {};

        let message = templates.thankYou || settings.defaultThanks || "Thank you for your payment!";
        message = message.replace('{{name}}', firstName);
        message = message.replace('{{restaurantName}}', settings.restaurantName || "our business");

        // 6. Add to SMS Queue
        console.log(`[PAYMENT] Queuing SMS for ${normalizedPhone}`);
        const smsQueue = readData(SMS_DATA_FILE);
        const newSmsEntry = {
            id: Date.now() + 1,
            restaurantId,
            customerId: customer.id,
            customerName: customerName, // Store FULL name in records
            phone: normalizedPhone,
            amount: amount,
            message: message,
            status: 'Pending',
            retryCount: 0,
            createdAt: nowUTC(),
            sentAt: null
        };
        smsQueue.push(newSmsEntry);
        writeData(SMS_DATA_FILE, smsQueue);
        console.log(`[PAYMENT_SMS_QUEUED] ${newSmsEntry.id}`);

        // 7. Save Payment Record
        console.log(`[PAYMENT] Saving audit record: ${transactionCode}`);
        payments.push({
            id: Date.now(),
            restaurantId,
            transactionCode,
            name: customerName,
            phone: normalizedPhone,
            smsSent: false,
            createdAt: nowUTC()
        });
        writeData(paymentsPath, payments);
        console.log(`[PAYMENT_SUCCESS] ${transactionCode}`);

        res.json({
            success: true,
            customerCreated,
            queued: true
        });
    } catch (error) {
        console.error('Payment processing failed', error);
        console.log(`[PAYMENT_REJECTED] Reason: Internal server error`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @api {get} /sms-queue Get SMS Queue
 * @apiDescription Get all SMS records or filter by status
 * @apiQuery {String} [status] Optional filter: "Pending", "Sent", "Failed"
 * @apiSuccess {Array} smsRecords List of SMS entries
 */
app.get('/sms-queue', authenticateToken, checkSubscription, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const smsQueue = readData(SMS_DATA_FILE);
        const { status } = req.query;

        let filtered = smsQueue.filter(sms => sms.restaurantId === restaurantId || (!sms.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID));

        if (status) {
            filtered = filtered.filter(sms => sms.status.toLowerCase() === status.toLowerCase());
        }

        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read SMS queue' });
    }
});

/**
 * @api {get} /sms-queue/pending Get Pending SMS
 */
app.get('/sms-queue/pending', authenticateToken, checkSubscription, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const smsQueue = readData(SMS_DATA_FILE);
        const pendingSms = smsQueue.filter(sms => sms.status === 'Pending' && (sms.restaurantId === restaurantId || (!sms.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID)));
        res.json(pendingSms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read pending SMS records' });
    }
});

/**
 * @api {put} /sms-queue/:id Update SMS Status
 */
app.put('/sms-queue/:id', authenticateToken, checkSubscription, (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const restaurantId = req.user.restaurantId;

        // Expanded validation to allow "Processing"
        if (!['Pending', 'Processing', 'Sent', 'Failed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const smsQueue = readData(SMS_DATA_FILE);
        const smsIndex = smsQueue.findIndex(sms => sms.id === parseInt(id) && (sms.restaurantId === restaurantId || (!sms.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID)));

        if (smsIndex === -1) {
            return res.status(404).json({ error: 'Message record not found or access denied' });
        }

        const sms = smsQueue[smsIndex];
        sms.status = status;
        sms.updatedAt = nowUTC();

        if (status === 'Sent') {
            sms.sentAt = nowUTC();
        } else if (status === 'Failed') {
            sms.retryCount = (sms.retryCount || 0) + 1;
            // If retry limit not reached, set back to Pending for automatic retry
            if (sms.retryCount < 3) {
                sms.status = 'Pending';
            }
        } else if (status === 'Pending') {
            // Manual reset to Pending
            sms.retryCount = 0;
            sms.sentAt = null;
        }

        // Also update the customer record
        const customers = readData(DATA_FILE);
        const customerIndex = customers.findIndex(c => c.id === sms.customerId);
        if (customerIndex !== -1) {
            customers[customerIndex].sms_status = sms.status;
            customers[customerIndex].sent_at = sms.sentAt; // Add/Update sent_at
            writeData(DATA_FILE, customers);
        }

        writeData(SMS_DATA_FILE, smsQueue);
        res.json(sms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update SMS record' });
    }
});

/**
 * @api {delete} /sms-queue/:id Delete SMS Record
 * @apiDescription Physically removes an SMS record from the history
 * @apiParam {String} id SMS record ID
 * @apiSuccess {Object} message Success confirmation
 */
app.delete('/sms-queue/:id', authenticateToken, checkSubscription, (req, res) => {
    try {
        const { id } = req.params;
        const restaurantId = req.user.restaurantId;
        let smsQueue = readData(SMS_DATA_FILE);
        const initialLength = smsQueue.length;
        smsQueue = smsQueue.filter(s => s.id !== parseInt(id) || (s.restaurantId !== restaurantId && s.restaurantId));

        if (smsQueue.length === initialLength) {
            return res.json({ message: 'Record already removed or access denied' });
        }

        writeData(SMS_DATA_FILE, smsQueue);
        res.json({ message: 'SMS record deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete SMS record' });
    }
});

/**
 * @api {delete} /customers/:id Archive Customer
 */
app.delete('/customers/:id', authenticateToken, checkSubscription, (req, res) => {
    try {
        const { id } = req.params;
        const restaurantId = req.user.restaurantId;
        let customers = readData(DATA_FILE);
        const initialLength = customers.length;
        customers = customers.filter(c => !(c.id === parseInt(id) && (c.restaurantId === restaurantId || (!c.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID))));

        if (customers.length === initialLength) {
            return res.json({ message: 'Customer already removed or not found or access denied' });
        }

        writeData(DATA_FILE, customers);
        res.json({ message: 'Customer deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

/**
 * @api {get} /sms-queue/history Get SMS History
 */
app.get('/sms-queue/history', authenticateToken, checkSubscription, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const smsQueue = readData(SMS_DATA_FILE);
        const customers = readData(DATA_FILE);
        const filtered = smsQueue.filter(sms => sms.restaurantId === restaurantId || (!sms.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID));

        // Extend response with amount from customer records if not present in SMS record
        const enriched = filtered.map(sms => {
            if (sms.amount) return sms;
            const customer = customers.find(c => c.id === sms.customerId);
            return { ...sms, amount: customer ? customer.amount : '-' };
        });

        res.json(enriched.reverse());
    } catch (error) {
        res.status(500).json({ error: 'Failed to read history' });
    }
});

/**
 * @api {get} /settings Get Business Settings
 */
app.get('/settings', authenticateToken, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const allSettings = readData(SETTINGS_FILE);
        const settings = allSettings[restaurantId] || (allSettings.restaurantName ? allSettings : allSettings[DEFAULT_RESTAURANT_ID]);
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read settings' });
    }
});

/**
 * @api {post} /settings Update Business Settings
 */
app.post('/settings', authenticateToken, checkSubscription, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const settings = req.body;
        const allSettings = readData(SETTINGS_FILE);
        allSettings[restaurantId] = settings;
        writeData(SETTINGS_FILE, allSettings);
        res.json({ message: 'Settings updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

/**
 * @api {get} /templates Get Message Templates
 */
app.get('/templates', authenticateToken, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const allTemplates = readData(TEMPLATES_FILE);
        const templates = allTemplates[restaurantId] || (allTemplates.thankYou ? allTemplates : allTemplates[DEFAULT_RESTAURANT_ID]);
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read templates' });
    }
});

/**
 * @api {post} /templates Update Message Templates
 */
app.post('/templates', authenticateToken, checkSubscription, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const templates = req.body;
        const allTemplates = readData(TEMPLATES_FILE);
        allTemplates[restaurantId] = templates;
        writeData(TEMPLATES_FILE, allTemplates);
        res.json({ message: 'Templates updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save templates' });
    }
});

/**
 * @api {get} /metrics Get Dashboard Metrics
 */
app.get('/metrics', authenticateToken, checkSubscription, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const customers = readData(DATA_FILE).filter(c => {
            const isMatch = c.restaurantId === restaurantId || (!c.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID);
            return isMatch && c.active !== false;
        });
        const smsQueue = readData(SMS_DATA_FILE).filter(s => s.restaurantId === restaurantId || (!s.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID));

        const todayStr = nowUTC().split('T')[0];

        const metrics = {
            totalCustomers: customers.length,
            totalSent: smsQueue.filter(s => s.status === 'Sent').length,
            sentToday: smsQueue.filter(s => s.status === 'Sent' && s.sentAt && s.sentAt.startsWith(todayStr)).length,
            failed: smsQueue.filter(s => s.status === 'Failed').length,
            pending: smsQueue.filter(s => s.status === 'Pending').length
        };

        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to calculate metrics' });
    }
});

// --- AUTH ENDPOINTS ---
const authRouter = express.Router();

// Auth Health Check
authRouter.get('/status', (req, res) => res.json({ status: 'auth system online' }));

/**
 * @api {post} /auth/register Register User (Testing Only)
 */
authRouter.post('/register', async (req, res) => {
    try {
        const { name, email, password, restaurantId = DEFAULT_RESTAURANT_ID, role = 'owner' } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const users = readData(USERS_FILE);
        if (users.find(u => u.email === email)) return res.status(400).json({ error: 'User already exists' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = {
            id: Date.now(),
            name,
            email,
            passwordHash,
            restaurantId,
            role,
            createdAt: nowUTC()
        };

        users.push(newUser);
        writeData(USERS_FILE, users);

        res.status(201).json({ message: 'User registered successfully', userId: newUser.id });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * @api {post} /auth/login Login User
 */
authRouter.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const users = readData(USERS_FILE);
        const user = users.find(u => u.email === email);

        if (!user) return res.status(400).json({ error: 'Invalid email or password' });

        const validPass = await bcrypt.compare(password, user.passwordHash);
        if (!validPass) return res.status(400).json({ error: 'Invalid email or password' });

        const restaurants = readData(RESTAURANTS_FILE);
        const restaurant = restaurants.find(r => r.id === user.restaurantId);

        const token = jwt.sign(
            { userId: user.id, restaurantId: user.restaurantId, role: user.role, email: user.email },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                restaurantId: user.restaurantId,
                role: user.role
            },
            restaurant: restaurant ? {
                id: restaurant.id,
                name: restaurant.name
            } : null
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// Explicitly handle other methods to /login to prevent 405 conflicts
authRouter.all('/login', (req, res) => {
    console.warn(`[AUTH_405] Method ${req.method} not allowed on /login`);
    res.status(405).json({
        error: 'Method Not Allowed',
        message: `Authentication requires POST. Received ${req.method}. Check that you are using HTTPS and no redirects are occurring.`
    });
});

/**
 * @api {get} /auth/me Get Current User Info
 */
authRouter.get('/me', authenticateToken, (req, res) => {
    try {
        const users = readData(USERS_FILE);
        const user = users.find(u => u.id === req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            restaurantId: user.restaurantId,
            role: user.role
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// Mount Auth Router
app.use('/auth', authRouter);

/**
 * @api {post} /onboarding/register Professional SaaS Onboarding
 */
app.post('/onboarding/register', async (req, res) => {
    try {
        const { restaurantName, ownerName, email, password, plan = null, duration = 'Trial' } = req.body;
        if (!restaurantName || !ownerName || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        let users = readData(USERS_FILE);
        if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already registered' });

        // Generate Domain-safe Restaurant ID
        const restaurantId = restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);

        // 1. Create Restaurant
        const restaurants = readData(RESTAURANTS_FILE);
        const newRestaurant = {
            id: restaurantId,
            name: restaurantName,
            plan: plan, // Initially null
            duration: duration,
            subscriptionStatus: 'Trial',
            subscriptionExpiry: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14-day trial
            createdAt: nowUTC(),
            onboardingStatus: 'demo_active',
            demoDataLoaded: true
        };
        restaurants.push(newRestaurant);
        writeData(RESTAURANTS_FILE, restaurants);


        // 2. Create Owner User
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const newUser = {
            id: Date.now(),
            name: ownerName,
            email,
            passwordHash,
            restaurantId,
            role: 'owner',
            createdAt: nowUTC()
        };
        users = readData(USERS_FILE);
        users.push(newUser);
        writeData(USERS_FILE, users);

        // 3. Bootstrap Default Settings
        const allSettings = readData(SETTINGS_FILE);
        allSettings[restaurantId] = {
            restaurantName,
            defaultThanks: 'Thank you for dining with us! We appreciate your support and look forward to serving you again.',
            address: '123 Tech Avenue',
            phone: '+254 700 000 000'
        };
        writeData(SETTINGS_FILE, allSettings);

        // 4. Bootstrap Default Templates
        const allTemplates = readData(TEMPLATES_FILE);
        allTemplates[restaurantId] = {
            thankYou: 'Hi {{name}}, thank you for your payment at ' + restaurantName + '. We appreciate your support and look forward to serving you again!',
            reservation: 'Hi {{name}}, your appointment at ' + restaurantName + ' is confirmed.',
            promotional: 'Hi {{name}}, we have a special offer for you at ' + restaurantName + '! Use code WELCOME for 10% off.'
        };
        writeData(TEMPLATES_FILE, allTemplates);

        // 5. Generate Demo Data
        console.log(`[ONBOARDING] Generating Demo Data for ${restaurantId}`);
        const customers = readData(DATA_FILE);
        const smsQueue = readData(SMS_DATA_FILE);
        const paymentsPath = path.join(DATA_DIR, 'payments.json');
        const payments = readData(paymentsPath);

        const demoCustomers = [
            { name: 'John Doe', phone: '0711222333', amount: 1500 },
            { name: 'Jane Smith', phone: '0722333444', amount: 2800 },
            { name: 'David Wilson', phone: '0733444555', amount: 950 }
        ];

        demoCustomers.forEach((dc, index) => {
            const customerId = Date.now() - (index * 1000);
            const createdAt = new Date(Date.now() - (index * 3600000)).toISOString();

            const newCustomer = {
                id: customerId,
                restaurantId,
                name: dc.name,
                phone: dc.phone,
                amount: dc.amount,
                sms_status: index === 0 ? 'Sent' : index === 1 ? 'Pending' : 'Sent',
                active: true,
                timestamp: createdAt,
                created_at: createdAt
            };
            customers.push(newCustomer);

            const firstName = dc.name.split(' ')[0];
            const message = allTemplates[restaurantId].thankYou
                .replace('{{name}}', firstName)
                .replace('{{restaurantName}}', restaurantName);

            const newSmsEntry = {
                id: customerId + 1,
                restaurantId,
                customerId: customerId,
                customerName: dc.name,
                phone: dc.phone,
                amount: dc.amount,
                message: message,
                status: index === 0 ? 'Sent' : index === 1 ? 'Pending' : 'Sent',
                retryCount: 0,
                createdAt: createdAt,
                sentAt: index === 0 || index === 2 ? new Date(Date.now() - (index * 3000000)).toISOString() : null
            };
            smsQueue.push(newSmsEntry);

            if (index === 0 || index === 2) {
                payments.push({
                    id: customerId + 2,
                    restaurantId,
                    transactionCode: 'DEMO' + Math.random().toString(36).substring(2, 8).toUpperCase(),
                    name: dc.name,
                    phone: dc.phone,
                    smsSent: true,
                    createdAt: createdAt
                });
            }
        });

        writeData(DATA_FILE, customers);
        writeData(SMS_DATA_FILE, smsQueue);
        writeData(paymentsPath, payments);

        // 6. Generate Instant Token
        const token = jwt.sign(
            { userId: newUser.id, restaurantId, role: 'owner', email: newUser.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            token,
            restaurant: newRestaurant,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: 'owner'
            },
            setupComplete: true
        });

    } catch (error) {
        console.error('Onboarding failed', error);
        res.status(500).json({ error: 'Onboarding failed' });
    }
});


/**
 * @api {get} /admin/metrics Get Platform-wide Metrics
 */
app.get('/admin/metrics', authenticateToken, (req, res) => {
    try {
        const isAuthorized = req.user.role === 'admin' || req.user.email === 'admin@test.com';
        console.log(`Admin Access Attempt - Email: ${req.user.email}, Role: ${req.user.role}, Result: ${isAuthorized}`);

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const restaurants = readData(RESTAURANTS_FILE);
        const paymentsPath = path.join(DATA_DIR, 'subscription_payments.json');
        const payments = readData(paymentsPath);
        const devices = readData(GATEWAY_FILE);

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const monthlyRevenue = payments
            .filter(p => new Date(p.date) >= thirtyDaysAgo)
            .reduce((sum, p) => sum + (p.amount || 0), 0);

        const onlineGateways = devices.filter(d => {
            const diffSeconds = Math.floor((now - new Date(d.lastSeen)) / 1000);
            return diffSeconds <= 120 && d.restaurantId;
        }).length;

        const metrics = {
            totalRevenue,
            monthlyRevenue,
            activeRestaurants: restaurants.filter(r => r.subscriptionStatus?.toLowerCase() === 'active').length,
            trialRestaurants: restaurants.filter(r => r.subscriptionStatus?.toLowerCase() === 'trial').length,
            expiredRestaurants: restaurants.filter(r => r.subscriptionStatus?.toLowerCase() === 'expired').length,
            inactiveRestaurants: restaurants.filter(r => r.subscriptionStatus?.toLowerCase() === 'inactive' || r.subscriptionStatus?.toLowerCase() === 'suspended').length,
            totalRestaurants: restaurants.length,
            onlineGateways,
            offlineGateways: devices.filter(d => d.restaurantId).length - onlineGateways
        };

        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch admin metrics' });
    }
});

/**
 * @api {get} /admin/restaurants Get All Restaurants (Admin)
 */
app.get("/admin/restaurants", authenticateToken, (req, res) => {
    try {
        const isAuthorized = req.user.role === 'admin' || req.user.email === 'admin@test.com';
        console.log(`Admin Access Attempt - Email: ${req.user.email}, Role: ${req.user.role}, Result: ${isAuthorized}`);

        if (!isAuthorized) {
            return res.status(403).json({ error: "Admin access required" });
        }
        const restaurants = readData(RESTAURANTS_FILE);
        const users = readData(USERS_FILE);

        const mapped = restaurants.map(res => {
            return {
                id: res.id,
                name: res.name,
                createdAt: res.createdAt,
                subscriptionPlan: res.plan,
                subscriptionStatus: res.subscriptionStatus,
                subscriptionExpiryDate: res.subscriptionExpiry
            };
        });

        res.json(mapped);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch restaurants" });
    }
});

/**
 * @api {get} /admin/restaurants/:id Get Restaurant Details (Admin)
 */
app.get('/admin/restaurants/:id', authenticateToken, (req, res) => {
    try {
        const isAuthorized = req.user.role === 'admin' || req.user.email === 'admin@test.com';
        console.log(`Admin Access Attempt - Email: ${req.user.email}, Role: ${req.user.role}, Result: ${isAuthorized}`);

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { id } = req.params;
        const restaurants = readData(RESTAURANTS_FILE);
        const restaurant = restaurants.find(r => r.id === id);

        if (!restaurant) return res.status(404).json({ error: 'Restaurant not found' });

        res.json({
            id: restaurant.id,
            name: restaurant.name,
            createdAt: restaurant.createdAt,
            subscriptionPlan: restaurant.plan,
            subscriptionStatus: restaurant.subscriptionStatus,
            subscriptionExpiryDate: restaurant.subscriptionExpiry
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch restaurant details' });
    }
});

/**
 * @api {post} /admin/restaurants/:id/activate Activate Subscription
 */
app.post('/admin/restaurants/:id/activate', authenticateToken, (req, res) => {
    try {
        const isAuthorized = req.user.role === 'admin' || req.user.email === 'admin@test.com';
        console.log(`Admin Access Attempt - Email: ${req.user.email}, Role: ${req.user.role}, Result: ${isAuthorized}`);

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { id } = req.params;
        const restaurants = readData(RESTAURANTS_FILE);
        const index = restaurants.findIndex(r => r.id === id);
        if (index === -1) return res.status(404).json({ error: 'Restaurant not found' });

        const now = new Date();
        let currentExpiry = new Date(restaurants[index].subscriptionExpiry);
        if (isNaN(currentExpiry.getTime()) || currentExpiry < now) {
            currentExpiry = now;
        }

        const newExpiry = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);

        restaurants[index].subscriptionStatus = 'active';
        restaurants[index].subscriptionExpiry = newExpiry.toISOString();
        writeData(RESTAURANTS_FILE, restaurants);

        res.json({ message: 'Subscription activated', restaurant: restaurants[index] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to activate subscription' });
    }
});

/**
 * @api {post} /admin/restaurants/:id/trial Grant Trial
 */
app.post('/admin/restaurants/:id/trial', authenticateToken, (req, res) => {
    try {
        const isAuthorized = req.user.role === 'admin' || req.user.email === 'admin@test.com';
        console.log(`Admin Access Attempt - Email: ${req.user.email}, Role: ${req.user.role}, Result: ${isAuthorized}`);

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { id } = req.params;
        const { days } = req.body;

        const restaurants = readData(RESTAURANTS_FILE);
        const index = restaurants.findIndex(r => r.id === id);
        if (index === -1) return res.status(404).json({ error: 'Restaurant not found' });

        const now = new Date();
        const newExpiry = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        restaurants[index].subscriptionStatus = 'trial';
        restaurants[index].subscriptionExpiry = newExpiry.toISOString();
        writeData(RESTAURANTS_FILE, restaurants);

        res.json({ message: 'Trial granted', restaurant: restaurants[index] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to grant trial' });
    }
});

/**
 * @api {post} /admin/restaurants/:id/suspend Suspend Restaurant
 */
app.post('/admin/restaurants/:id/suspend', authenticateToken, (req, res) => {
    try {
        const isAuthorized = req.user.role === 'admin' || req.user.email === 'admin@test.com';
        console.log(`Admin Access Attempt - Email: ${req.user.email}, Role: ${req.user.role}, Result: ${isAuthorized}`);

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { id } = req.params;
        const restaurants = readData(RESTAURANTS_FILE);
        const index = restaurants.findIndex(r => r.id === id);
        if (index === -1) return res.status(404).json({ error: 'Restaurant not found' });

        restaurants[index].subscriptionStatus = 'inactive';
        writeData(RESTAURANTS_FILE, restaurants);

        res.json({ message: 'Restaurant deactivated', restaurant: restaurants[index] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to suspend restaurant' });
    }
});

/**
 * @api {post} /admin/restaurants/:id/reactivate Reactivate Business
 */
app.post('/admin/restaurants/:id/reactivate', authenticateToken, (req, res) => {
    try {
        const isAuthorized = req.user.role === 'admin' || req.user.email === 'admin@test.com';
        console.log(`Admin Access Attempt - Email: ${req.user.email}, Role: ${req.user.role}, Result: ${isAuthorized}`);

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { id } = req.params;
        const restaurants = readData(RESTAURANTS_FILE);
        const index = restaurants.findIndex(r => r.id === id);
        if (index === -1) return res.status(404).json({ error: 'Restaurant not found' });

        const now = new Date();
        const expiry = new Date(restaurants[index].subscriptionExpiry);

        if (expiry > now) {
            // Restore based on expiry
            restaurants[index].subscriptionStatus = (restaurants[index].plan === 'Starter' && expiry > new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)) ? 'Trial' : 'Active';
            if (restaurants[index].subscriptionStatus === 'Inactive' || restaurants[index].subscriptionStatus === 'Suspended') {
                restaurants[index].subscriptionStatus = restaurants[index].plan === 'Starter' ? 'Trial' : 'Active';
            }
        } else {
            // Expired, but we can reset to a short trial or just let them stay expired but "Not Suspended"
            // The prompt says reactivate expired/trial/suspended.
            // If reactivating an expired one, maybe we should just set it to Active with a 1 day grace or similar?
            // "Admin can reactivate... accounts."
            // I'll set a 3-day grace period if reactivating an expired one.
            restaurants[index].subscriptionStatus = 'Trial';
            restaurants[index].subscriptionExpiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        }

        writeData(RESTAURANTS_FILE, restaurants);
        res.json({ message: 'Restaurant reactivated', restaurant: restaurants[index] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reactivate restaurant' });
    }
});

/**
 * @api {get} /admin/restaurants/:id/payments Get Restaurant Payment History
 */
app.get('/admin/restaurants/:id/payments', authenticateToken, (req, res) => {
    try {
        const isAuthorized = req.user.role === 'admin' || req.user.email === 'admin@test.com';
        console.log(`Admin Access Attempt - Email: ${req.user.email}, Role: ${req.user.role}, Result: ${isAuthorized}`);

        if (!isAuthorized) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { id } = req.params;
        const paymentsPath = path.join(DATA_DIR, 'subscription_payments.json');
        const payments = readData(paymentsPath);
        const filtered = payments.filter(p => p.restaurantId === id);
        res.json(filtered.reverse());
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch payment history' });
    }
});


/**
 * @api {post} /subscription/verify Verify M-Pesa Transaction
 */
app.post('/subscription/verify', authenticateToken, (req, res) => {
    try {
        const { transactionCode, plan } = req.body;
        if (!transactionCode || !plan) {
            return res.status(400).json({ error: 'Transaction code and plan required' });
        }

        const restaurants = readData(RESTAURANTS_FILE);
        const restaurantIndex = restaurants.findIndex(r => r.id === req.user.restaurantId);

        if (restaurantIndex === -1) return res.status(404).json({ error: 'Restaurant not found' });

        // Logic for tiered pricing
        const pricing = {
            'Starter': 2500,
            'Professional': 5000,
            'Enterprise': 10000
        };

        const amount = pricing[plan] || 0;

        // In a real app, you would verify this code via M-Pesa API here
        // For demonstration, we'll accept any 10-character code
        if (transactionCode.length < 8) {
            return res.status(400).json({ error: 'Invalid transaction code format' });
        }

        // Update Restaurant Plan
        restaurants[restaurantIndex].plan = plan;
        restaurants[restaurantIndex].subscriptionStatus = 'Active';

        // Extend expiry by 30 days from now or current expiry
        const currentExpiry = new Date(restaurants[restaurantIndex].subscriptionExpiry);
        const now = new Date();
        const baseDate = (currentExpiry > now) ? currentExpiry : now;
        const newExpiry = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

        restaurants[restaurantIndex].subscriptionExpiry = newExpiry.toISOString();
        writeData(RESTAURANTS_FILE, restaurants);

        // Log Payment
        const paymentsPath = path.join(DATA_DIR, 'subscription_payments.json');
        const payments = readData(paymentsPath);
        payments.push({
            id: Date.now(),
            restaurantId: req.user.restaurantId,
            transactionCode,
            plan,
            amount,
            date: nowUTC()
        });
        writeData(paymentsPath, payments);

        res.json({
            message: 'Business subscription updated successfully!',
            restaurant: restaurants[restaurantIndex]
        });
    } catch (error) {
        console.error('Subscription verification failed', error);
        res.status(500).json({ error: 'Failed to verify subscription' });
    }
});

/**
 * @api {get} /subscription/history Get Payment History
 */
app.get('/subscription/history', authenticateToken, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const paymentsPath = path.join(DATA_DIR, 'subscription_payments.json');
        const payments = readData(paymentsPath);
        const filtered = payments.filter(p => p.restaurantId === restaurantId);
        res.json(filtered.reverse()); // Latest first
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch payment history' });
    }
});

// Route moved to authRouter

/**
 * @api {post} /gateway/register Register Gateway Device
 */
app.post('/gateway/register', authenticateToken, (req, res) => {
    try {
        const { deviceId, deviceName, appVersion } = req.body;
        const restaurantId = req.user.restaurantId;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

        const devices = readData(GATEWAY_FILE);
        const index = devices.findIndex(d => d.deviceId === deviceId);

        const deviceData = {
            deviceId,
            restaurantId,
            deviceName: deviceName || 'Android Gateway',
            appVersion: appVersion || '1.0.0',
            lastSeen: nowUTC(),
            batteryLevel: req.body.batteryLevel || 100,
            status: 'Online',
            isPrimary: true
        };

        if (index > -1) {
            // Requirement: Device ownership follows current login session.
            // If device was previously owned by another restaurant, it now belongs to the current one.
            const oldOwner = devices[index].restaurantId;
            if (oldOwner && oldOwner !== restaurantId) {
                console.log(`[Registration] Ownership Transfer: Device ${deviceId} moved from ${oldOwner} to ${restaurantId}`);
            } else {
                console.log(`[Registration] Device ${deviceId} re-registered for ${restaurantId}`);
            }
            devices[index] = { ...devices[index], ...deviceData };
        } else {
            console.log(`[Registration] New Device ${deviceId} registered for ${restaurantId}`);
            devices.push(deviceData);
        }

        writeData(GATEWAY_FILE, devices);
        res.json({ message: 'Device registered and paired', device: deviceData });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to register device' });
    }
});

/**
 * @api {post} /gateway/heartbeat Receive Gateway Heartbeat
 */
app.post('/gateway/heartbeat', authenticateToken, (req, res) => {
    try {
        const { deviceId, batteryLevel, appVersion, isCharging } = req.body;
        const restaurantId = req.user.restaurantId;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

        const devices = readData(GATEWAY_FILE);
        const index = devices.findIndex(d => d.deviceId === deviceId && d.restaurantId === restaurantId);

        if (index === -1) {
            console.log(`[Heartbeat Rejected] Device ${deviceId} not found or not owned by ${restaurantId}`);
            return res.status(404).json({ error: 'Device not found or access denied' });
        }

        console.log(`[Heartbeat] Received from device ${deviceId} (Restaurant: ${restaurantId}) Battery: ${batteryLevel}% Charging: ${isCharging}`);
        devices[index].lastSeen = nowUTC();
        if (batteryLevel !== undefined) devices[index].batteryLevel = batteryLevel;
        if (appVersion !== undefined) devices[index].appVersion = appVersion;
        if (isCharging !== undefined) devices[index].isCharging = isCharging;

        writeData(GATEWAY_FILE, devices);
        res.json({ message: 'Heartbeat received' });
    } catch (error) {
        console.error('Heartbeat processing error:', error);
        res.status(500).json({ error: 'Failed to process heartbeat' });
    }
});

/**
 * @api {post} /gateway/unregister Release Gateway Device
 * @apiDescription Sets restaurantId to null to allow ownership transfer
 */
app.post('/gateway/unregister', authenticateToken, (req, res) => {
    try {
        const { deviceId } = req.body;
        const restaurantId = req.user.restaurantId;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

        console.log(`[Unregister Request] Device ${deviceId} from restaurant ${restaurantId}`);
        const devices = readData(GATEWAY_FILE);
        const index = devices.findIndex(d => d.deviceId === deviceId && d.restaurantId === restaurantId);

        if (index === -1) {
            console.log(`[Unregister Rejected] Device ${deviceId} not owned by ${restaurantId}`);
            return res.status(404).json({ error: 'Device not found or not owned by you' });
        }

        devices[index].restaurantId = null;
        devices[index].status = 'Offline';
        devices[index].lastSeen = nowUTC();

        writeData(GATEWAY_FILE, devices);
        console.log(`[Unregister Success] Device ${deviceId} released`);
        res.json({ message: 'Device released successfully' });
    } catch (error) {
        console.error('Failed to unregister device:', error);
        res.status(500).json({ error: 'Failed to unregister device' });
    }
});

/**
 * @api {get} /gateway/status Get Gateway Status
 */
app.get('/gateway/status', authenticateToken, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const allDevices = readData(GATEWAY_FILE);
        const now = new Date();

        console.log(`[Status Request] restaurantId: ${restaurantId}`);

        // 1. Try to find the device specifically owned by this restaurant
        let selectedDevice = allDevices.find(d => d.restaurantId === restaurantId);
        let reason = "Owned device found";

        // 2. If no owned device, look for an unowned/available device
        if (!selectedDevice) {
            selectedDevice = allDevices.find(d => d.restaurantId === null);
            reason = selectedDevice ? "Available (unowned) device found" : "No matching device found";
        }

        if (!selectedDevice) {
            console.log(`[Status Result] Result: No Gateway, Reason: ${reason}`);
            return res.json({ status: 'No Gateway', message: 'No devices available' });
        }

        console.log(`[Status Result] Device: ${selectedDevice.deviceId}, Reason: ${reason}`);

        // Calculate actual status based on ownership and time
        const lastSeenDate = new Date(selectedDevice.lastSeen);
        const diffSeconds = Math.floor((now - lastSeenDate) / 1000);
        let status = diffSeconds <= 120 ? 'Online' : 'Offline';

        if (selectedDevice.restaurantId === null) {
            status = 'Unregistered';
        }

        res.json({
            ...selectedDevice,
            status: status
        });
    } catch (error) {
        console.error('Failed to fetch status', error);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

app.get('/restaurants', authenticateToken, (req, res) => {
    try {
        const restaurants = readData(RESTAURANTS_FILE);
        res.json(restaurants);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read restaurants' });
    }
});

// --- STATIC FRONTEND SERVING (For Render/Production) ---
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
    console.log(`[Static] Serving frontend from: ${distPath}`);
    app.use(express.static(distPath));

}

// Global handler for SPA Fallback and API 404s (Express 5 Compatible)
app.use((req, res) => {
    // API Prefixes to exclude from SPA fallback
    const apiPrefixes = ['/auth', '/customers', '/sms-queue', '/subscription', '/settings', '/templates', '/metrics', '/admin', '/health', '/onboarding', '/gateway', '/restaurants', '/payments'];
    const isApiRoute = apiPrefixes.some(prefix => req.url.startsWith(prefix));

    if (isApiRoute) {
        console.log(`[404_API] ${req.method} ${req.url}`);
        return res.status(404).json({ error: 'API route not found' });
    }

    // For all other routes, serve index.html if it exists
    const distPath = path.join(__dirname, '../dist');
    if (fs.existsSync(distPath)) {
        return res.sendFile(path.join(distPath, 'index.html'));
    }

    res.status(404).send('Not Found');
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Startup Health Check
    try {
        const customers = readData(DATA_FILE);
        const payments = readData(path.join(DATA_DIR, 'payments.json'));
        const smsQueue = readData(SMS_DATA_FILE);
        const pendingCount = smsQueue.filter(s => s.status === 'Pending').length;

        console.log('--- STARTUP HEALTH CHECK ---');
        console.log(`Total Customers: ${customers.length}`);
        console.log(`Total Payments: ${payments.length}`);
        console.log(`Total SMS Queue Records: ${smsQueue.length}`);
        console.log(`Pending SMS Count: ${pendingCount}`);
        console.log('-----------------------------');
    } catch (err) {
        console.error('Health check failed', err);
    }
}).on('error', (err) => {
    console.error('Server failed to start:', err);
});
