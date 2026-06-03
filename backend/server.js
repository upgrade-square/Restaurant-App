const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'customers.json');
const SMS_DATA_FILE = path.join(DATA_DIR, 'sms_queue.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const RESTAURANTS_FILE = path.join(DATA_DIR, 'restaurants.json');
const GATEWAY_FILE = path.join(DATA_DIR, 'gateway.json');

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

/**
 * @api {get} /health Health Check
 * @apiDescription Check the status of the server
 * @apiSuccess {String} status "ok"
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

/**
 * @api {get} /customers Get All Customers
 * @apiDescription Retrieves a list of all submitted customer entries
 * @apiSuccess {Array} customers List of customer objects
 */
app.get('/customers', (req, res) => {
    try {
        const restaurantId = req.query.restaurantId || DEFAULT_RESTAURANT_ID;
        const customers = readData(DATA_FILE);
        const filtered = customers.filter(c => {
            const isMatch = c.restaurantId === restaurantId || (!c.restaurantId && restaurantId === DEFAULT_RESTAURANT_ID);
            const isActive = c.active !== false; // Backward compatibility: treat missing as active
            return isMatch && isActive;
        });
        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read data' });
    }
});

/**
 * @api {post} /customers Create Customer
 * @apiDescription Adds a new customer and automatically creates a pending SMS record
 * @apiParam {String} name Customer's full name
 * @apiParam {String} phone Phone number for SMS notifications
 * @apiParam {Number} amount Purchase/Bill amount
 * @apiSuccess {Object} newCustomer The created customer object
 */
app.post('/customers', (req, res) => {
    try {
        const { name, phone, amount, timestamp, restaurantId = DEFAULT_RESTAURANT_ID } = req.body;
        if (!name || !phone || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const customers = readData(DATA_FILE);
        const smsQueue = readData(SMS_DATA_FILE);
        const allSettings = readData(SETTINGS_FILE);
        const allTemplates = readData(TEMPLATES_FILE);

        // Legacy Fallback: check if file is old format (object) or new format (keyed by restaurantId)
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
app.get('/sms-queue', (req, res) => {
    try {
        const restaurantId = req.query.restaurantId || DEFAULT_RESTAURANT_ID;
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
 * @apiDescription Helper endpoint to fetch only SMS records that are yet to be sent
 * @apiSuccess {Array} pendingSms List of pending SMS entries
 */
app.get('/sms-queue/pending', (req, res) => {
    try {
        const smsQueue = readData(SMS_DATA_FILE);
        const pendingSms = smsQueue.filter(sms => sms.status === 'Pending');
        res.json(pendingSms);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read pending SMS records' });
    }
});

/**
 * @api {put} /sms-queue/:id Update SMS Status
 * @apiDescription Updates the status of an SMS record and synced customer status
 * @apiParam {String} id SMS record ID
 * @apiBody {String} status New status: "Pending", "Sent", "Failed"
 * @apiSuccess {Object} updatedRecord The modified SMS record
 */
app.put('/sms-queue/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['Pending', 'Sent', 'Failed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be Pending, Sent, or Failed.' });
        }

        const smsQueue = readData(SMS_DATA_FILE);
        const smsIndex = smsQueue.findIndex(sms => sms.id === parseInt(id));

        if (smsIndex === -1) {
            return res.status(404).json({ error: 'SMS record not found' });
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
app.delete('/sms-queue/:id', (req, res) => {
    try {
        const { id } = req.params;
        let smsQueue = readData(SMS_DATA_FILE);
        const initialLength = smsQueue.length;
        smsQueue = smsQueue.filter(s => s.id !== parseInt(id));

        if (smsQueue.length === initialLength) {
            return res.json({ message: 'Record already removed' });
        }

        writeData(SMS_DATA_FILE, smsQueue);
        res.json({ message: 'SMS record deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete SMS record' });
    }
});

/**
 * @api {delete} /customers/:id Archive Customer
 * @apiDescription Soft-deletes a customer by setting active=false
 * @apiParam {String} id Customer ID
 * @apiSuccess {Object} message Success confirmation
 */
app.delete('/customers/:id', (req, res) => {
    try {
        const { id } = req.params;
        let customers = readData(DATA_FILE);
        const index = customers.findIndex(c => c.id === parseInt(id));

        if (index === -1) {
            return res.json({ message: 'Customer already archived or not found' });
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
app.get('/sms-queue/history', (req, res) => {
    try {
        const restaurantId = req.query.restaurantId || DEFAULT_RESTAURANT_ID;
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
app.get('/settings', (req, res) => {
    try {
        const restaurantId = req.query.restaurantId || DEFAULT_RESTAURANT_ID;
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
app.post('/settings', (req, res) => {
    try {
        const { restaurantId = DEFAULT_RESTAURANT_ID, ...settings } = req.body;
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
app.get('/templates', (req, res) => {
    try {
        const restaurantId = req.query.restaurantId || DEFAULT_RESTAURANT_ID;
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
app.post('/templates', (req, res) => {
    try {
        const { restaurantId = DEFAULT_RESTAURANT_ID, ...templates } = req.body;
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
app.get('/metrics', (req, res) => {
    try {
        const restaurantId = req.query.restaurantId || DEFAULT_RESTAURANT_ID;
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

/**
 * @api {post} /gateway/register Register Gateway Device
 */
app.post('/gateway/register', (req, res) => {
    try {
        const { deviceId, deviceName, appVersion } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

        const devices = readData(GATEWAY_FILE);
        const index = devices.findIndex(d => d.deviceId === deviceId);

        const deviceData = {
            deviceId,
            deviceName: deviceName || 'Android Gateway',
            appVersion: appVersion || '1.0.0',
            lastSeen: new Date().toISOString(),
            batteryLevel: req.body.batteryLevel || 100,
            status: 'Online'
        };

        if (index > -1) {
            devices[index] = { ...devices[index], ...deviceData };
        } else {
            devices.push(deviceData);
        }

        writeData(GATEWAY_FILE, devices);
        res.json({ message: 'Device registered', device: deviceData });
    } catch (error) {
        res.status(500).json({ error: 'Failed to register device' });
    }
});

/**
 * @api {post} /gateway/heartbeat Receive Gateway Heartbeat
 */
app.post('/gateway/heartbeat', (req, res) => {
    try {
        const { deviceId, batteryLevel, appVersion } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

        const devices = readData(GATEWAY_FILE);
        const index = devices.findIndex(d => d.deviceId === deviceId);

        if (index === -1) return res.status(404).json({ error: 'Device not found' });

        devices[index].lastSeen = new Date().toISOString();
        if (batteryLevel !== undefined) devices[index].batteryLevel = batteryLevel;
        if (appVersion !== undefined) devices[index].appVersion = appVersion;

        writeData(GATEWAY_FILE, devices);
        res.json({ message: 'Heartbeat received' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process heartbeat' });
    }
});

/**
 * @api {get} /gateway/status Get Gateway Status
 */
app.get('/gateway/status', (req, res) => {
    try {
        const devices = readData(GATEWAY_FILE);
        if (devices.length === 0) return res.json({ status: 'Offline', message: 'No devices registered' });

        // Calculate status dynamically for all devices
        const now = new Date();
        const updatedDevices = devices.map(d => {
            const lastSeenDate = new Date(d.lastSeen);
            const diffSeconds = Math.floor((now - lastSeenDate) / 1000);
            return {
                ...d,
                status: diffSeconds <= 120 ? 'Online' : 'Offline'
            };
        });

        // For the single dashboard card, we return the primary (first) device
        res.json(updatedDevices[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});

app.get('/restaurants', (req, res) => {
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
