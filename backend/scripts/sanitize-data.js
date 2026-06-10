const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const CLEAN_DATA_DIR = path.join(__dirname, '../data-clean');
const DEFAULT_RESTAURANT_ID = 'default';

if (!fs.existsSync(CLEAN_DATA_DIR)) {
    fs.mkdirSync(CLEAN_DATA_DIR);
}

const files = [
    'customers.json',
    'restaurants.json',
    'users.json',
    'sms_queue.json',
    'templates.json',
    'payments.json'
];

function sanitize() {
    console.log('--- Data Sanitization Phase ---');

    const data = {};
    files.forEach(file => {
        const filePath = path.join(DATA_DIR, file);
        if (fs.existsSync(filePath)) {
            data[file] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } else {
            data[file] = file === 'templates.json' ? {} : [];
        }
    });

    const restaurantIds = new Set(data['restaurants.json'].map(r => r.id));

    // 1. Sanitize Restaurants
    const cleanRestaurants = data['restaurants.json'].map(r => ({
        ...r,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        subscriptionExpiry: r.subscriptionExpiry ? new Date(r.subscriptionExpiry).toISOString() : null
    }));

    // 2. Sanitize Users
    const cleanUsers = [];
    const seenEmails = new Set();
    data['users.json'].forEach(user => {
        if (seenEmails.has(user.email)) return; // Skip duplicates
        seenEmails.add(user.email);
        cleanUsers.push({
            ...user,
            restaurantId: user.restaurantId || DEFAULT_RESTAURANT_ID,
            createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString()
        });
    });

    // 3. Sanitize Customers
    const cleanCustomers = data['customers.json'].map(c => {
        let amount = 0;
        if (c.amount === 'M-Pesa') {
            amount = 0;
        } else {
            amount = parseFloat(String(c.amount).replace(/[^0-9.]/g, '')) || 0;
        }

        return {
            ...c,
            restaurantId: c.restaurantId || DEFAULT_RESTAURANT_ID,
            amount: amount,
            createdAt: c.createdAt || c.timestamp || c.created_at ? new Date(c.createdAt || c.timestamp || c.created_at).toISOString() : new Date().toISOString(),
            active: c.active !== false
        };
    });
    const cleanCustomerIds = new Set(cleanCustomers.map(c => c.id));

    // 4. Sanitize SMS Queue
    const cleanSmsQueue = data['sms_queue.json'].map(sms => ({
        ...sms,
        restaurantId: sms.restaurantId || DEFAULT_RESTAURANT_ID,
        createdAt: sms.createdAt ? new Date(sms.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: sms.updatedAt ? new Date(sms.updatedAt).toISOString() : new Date().toISOString(),
        sentAt: sms.sentAt ? new Date(sms.sentAt).toISOString() : null,
        isOrphaned: !cleanCustomerIds.has(sms.customerId)
    }));

    // 5. Sanitize Payments
    const cleanPayments = [];
    const seenTxCodes = new Set();
    data['payments.json'].forEach(pay => {
        if (seenTxCodes.has(pay.transactionCode)) return; // Skip duplicates
        seenTxCodes.add(pay.transactionCode);

        let amount = 0;
        if (pay.amount && pay.amount !== 'M-Pesa') {
            amount = parseFloat(String(pay.amount).replace(/[^0-9.]/g, '')) || 0;
        }

        cleanPayments.push({
            ...pay,
            restaurantId: pay.restaurantId || DEFAULT_RESTAURANT_ID,
            amount: amount,
            createdAt: pay.createdAt ? new Date(pay.createdAt).toISOString() : new Date().toISOString()
        });
    });

    // 6. Templates (Pass-through for now, transformation happens in import script)
    const cleanTemplates = data['templates.json'];

    // Write Clean Files
    fs.writeFileSync(path.join(CLEAN_DATA_DIR, 'restaurants.json'), JSON.stringify(cleanRestaurants, null, 2));
    fs.writeFileSync(path.join(CLEAN_DATA_DIR, 'users.json'), JSON.stringify(cleanUsers, null, 2));
    fs.writeFileSync(path.join(CLEAN_DATA_DIR, 'customers.json'), JSON.stringify(cleanCustomers, null, 2));
    fs.writeFileSync(path.join(CLEAN_DATA_DIR, 'sms_queue.json'), JSON.stringify(cleanSmsQueue, null, 2));
    fs.writeFileSync(path.join(CLEAN_DATA_DIR, 'payments.json'), JSON.stringify(cleanPayments, null, 2));
    fs.writeFileSync(path.join(CLEAN_DATA_DIR, 'templates.json'), JSON.stringify(cleanTemplates, null, 2));

    console.log('--- Sanitization Complete ---');
    console.log(`Clean data saved to: ${CLEAN_DATA_DIR}`);
}

sanitize();
