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
        name: 'Demo Restaurant',
        phone: '',
        address: '',
        createdAt: new Date().toLocaleString(),
        updatedAt: new Date().toLocaleString()
    };
    fs.writeFileSync(RESTAURANTS_FILE, JSON.stringify([defaultRestaurant]));
}
if (!fs.existsSync(SETTINGS_FILE)) {
    const defaultSettings = {
        [DEFAULT_RESTAURANT_ID]: {
            restaurantName: 'MikrodTech Restaurant',
            phone: '',
            address: '',
            defaultThanks: 'Thank you for dining with us. We appreciate your visit.',
            email: ''
        }
    };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings));
}
if (!fs.existsSync(TEMPLATES_FILE)) {
    const defaultTemplates = {
        [DEFAULT_RESTAURANT_ID]: {
            thankYou: 'Hi {{name}}, thank you for dining at {{restaurantName}}. We hope to see you again soon!',
            reservation: 'Hi {{name}}, this is a reminder for your reservation at {{restaurantName}}.',
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
        next();
    } catch (err) {
        res.status(403).json({ error: 'Invalid token' });
    }
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
app.get('/customers', authenticateToken, (req, res) => {
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
app.post('/customers', authenticateToken, (req, res) => {
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
        const createdAt = new Date().toLocaleString();
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

        // Prepare message using template
        let message = templates.thankYou || settings.defaultThanks;
        message = message.replace('{{name}}', name);
        message = message.replace('{{restaurantName}}', settings.restaurantName);

        const newSmsEntry = {
            id: Date.now() + 1,
            restaurantId,
            customerId: customerId,
            customerName: name,
            phone: phone,
            message: message,
            status: 'Pending',
            retryCount: 0,
            createdAt: new Date().toLocaleString(),
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
 * @api {get} /sms-queue Get SMS Queue
 * @apiDescription Get all SMS records or filter by status
 * @apiQuery {String} [status] Optional filter: "Pending", "Sent", "Failed"
 * @apiSuccess {Array} smsRecords List of SMS entries
 */
app.get('/sms-queue', authenticateToken, (req, res) => {
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
app.get('/sms-queue/pending', authenticateToken, (req, res) => {
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
app.put('/sms-queue/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const restaurantId = req.user.restaurantId;

        if (!['Pending', 'Sent', 'Failed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const smsQueue = readData(SMS_DATA_FILE);
        const smsIndex = smsQueue.findIndex(sms => sms.id === parseInt(id) && (sms.restaurantId === restaurantId || (!sms.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID)));

        if (smsIndex === -1) {
            return res.status(404).json({ error: 'SMS record not found or access denied' });
        }

        const sms = smsQueue[smsIndex];
        sms.status = status;
        sms.updatedAt = new Date().toLocaleString();

        if (status === 'Sent') {
            sms.sentAt = new Date().toLocaleString();
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
app.delete('/sms-queue/:id', authenticateToken, (req, res) => {
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
app.delete('/customers/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const restaurantId = req.user.restaurantId;
        let customers = readData(DATA_FILE);
        const index = customers.findIndex(c => c.id === parseInt(id) && (c.restaurantId === restaurantId || (!c.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID)));

        if (index === -1) {
            return res.json({ message: 'Customer already archived or not found or access denied' });
        }

        customers[index].active = false;
        customers[index].archivedAt = new Date().toLocaleString();

        writeData(DATA_FILE, customers);
        res.json({ message: 'Customer archived' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to archive customer' });
    }
});

/**
 * @api {get} /sms-queue/history Get SMS History
 */
app.get('/sms-queue/history', authenticateToken, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const smsQueue = readData(SMS_DATA_FILE);
        const filtered = smsQueue.filter(sms => sms.restaurantId === restaurantId || (!sms.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID));
        res.json(filtered.reverse());
    } catch (error) {
        res.status(500).json({ error: 'Failed to read history' });
    }
});

/**
 * @api {get} /settings Get Restaurant Settings
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
 * @api {post} /settings Update Restaurant Settings
 */
app.post('/settings', authenticateToken, (req, res) => {
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
app.post('/templates', authenticateToken, (req, res) => {
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
app.get('/metrics', authenticateToken, (req, res) => {
    try {
        const restaurantId = req.user.restaurantId;
        const customers = readData(DATA_FILE).filter(c => {
            const isMatch = c.restaurantId === restaurantId || (!c.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID);
            return isMatch && c.active !== false;
        });
        const smsQueue = readData(SMS_DATA_FILE).filter(s => s.restaurantId === restaurantId || (!s.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID));

        const today = new Date().toLocaleDateString();

        const metrics = {
            totalCustomers: customers.length,
            totalSent: smsQueue.filter(s => s.status === 'Sent').length,
            sentToday: smsQueue.filter(s => s.status === 'Sent' && new Date(s.sentAt).toLocaleDateString() === today).length,
            failed: smsQueue.filter(s => s.status === 'Failed').length,
            pending: smsQueue.filter(s => s.status === 'Pending').length
        };

        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to calculate metrics' });
    }
});

// --- AUTH ENDPOINTS ---

/**
 * @api {post} /auth/register Register User (Testing Only)
 */
app.post('/auth/register', async (req, res) => {
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
            createdAt: new Date().toISOString()
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
app.post('/auth/login', async (req, res) => {
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
            { userId: user.id, restaurantId: user.restaurantId, role: user.role },
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

/**
 * @api {post} /onboarding/register Professional SaaS Onboarding
 */
app.post('/onboarding/register', async (req, res) => {
    try {
        const { restaurantName, ownerName, email, password } = req.body;
        if (!restaurantName || !ownerName || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const users = readData(USERS_FILE);
        if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already registered' });

        // Generate Domain-safe Restaurant ID
        const restaurantId = restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(Math.random() * 1000);

        // 1. Create Restaurant
        const restaurants = readData(RESTAURANTS_FILE);
        const newRestaurant = {
            id: restaurantId,
            name: restaurantName,
            createdAt: new Date().toISOString()
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
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        writeData(USERS_FILE, users);

        // 3. Bootstrap Default Settings
        const allSettings = readData(SETTINGS_FILE);
        allSettings[restaurantId] = {
            restaurantName,
            defaultThanks: 'Thank you for your visit!',
            address: '',
            phone: ''
        };
        writeData(SETTINGS_FILE, allSettings);

        // 4. Bootstrap Default Templates
        const allTemplates = readData(TEMPLATES_FILE);
        allTemplates[restaurantId] = {
            thankYou: 'Hi {{name}}, thank you for dining at ' + restaurantName + '. We hope to see you again soon!',
            reservation: 'Hi {{name}}, your reservation at ' + restaurantName + ' is confirmed.',
            promotional: 'Special offer from ' + restaurantName + '! Use code WELCOME for 10% off.'
        };
        writeData(TEMPLATES_FILE, allTemplates);

        // 5. Generate Instant Token
        const token = jwt.sign(
            { userId: newUser.id, restaurantId, role: 'owner' },
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
 * @api {get} /auth/me Get Current User Info
 */
app.get('/auth/me', authenticateToken, (req, res) => {
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
            lastSeen: new Date().toISOString(),
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
        const { deviceId, batteryLevel, appVersion } = req.body;
        const restaurantId = req.user.restaurantId;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

        const devices = readData(GATEWAY_FILE);
        const index = devices.findIndex(d => d.deviceId === deviceId && d.restaurantId === restaurantId);

        if (index === -1) {
            console.log(`[Heartbeat Rejected] Device ${deviceId} not found or not owned by ${restaurantId}`);
            return res.status(404).json({ error: 'Device not found or access denied' });
        }

        console.log(`[Heartbeat] Received from device ${deviceId} (Restaurant: ${restaurantId})`);
        devices[index].lastSeen = new Date().toISOString();
        if (batteryLevel !== undefined) devices[index].batteryLevel = batteryLevel;
        if (appVersion !== undefined) devices[index].appVersion = appVersion;

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
        devices[index].lastSeen = new Date().toISOString();

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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
    console.error('Server failed to start:', err);
});
