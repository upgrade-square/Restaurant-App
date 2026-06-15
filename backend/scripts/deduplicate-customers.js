const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const SMS_QUEUE_FILE = path.join(DATA_DIR, 'sms_queue.json');
const ACTIVITY_LOG_FILE = path.join(DATA_DIR, 'activity_log.json');

/**
 * Normalizes phone numbers to standard format (07XXXXXXXX or 01XXXXXXXX)
 */
const normalizePhone = (phone) => {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('254') && cleaned.length === 12) {
        return '0' + cleaned.slice(3);
    }
    if ((cleaned.startsWith('7') || cleaned.startsWith('1')) && cleaned.length === 9) {
        return '0' + cleaned;
    }
    if (cleaned.startsWith('0') && cleaned.length === 10) {
        return cleaned;
    }
    return cleaned;
};

function runMigration() {
    console.log('--- GLOBAL Customer Deduplication Migration ---');

    if (!fs.existsSync(CUSTOMERS_FILE)) {
        console.log('No customers.json found. Skipping.');
        return;
    }

    const customers = JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8'));
    const smsQueue = fs.existsSync(SMS_QUEUE_FILE) ? JSON.parse(fs.readFileSync(SMS_QUEUE_FILE, 'utf8')) : [];
    const activityLog = fs.existsSync(ACTIVITY_LOG_FILE) ? JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8')) : [];

    const uniqueCustomers = [];
    const customerMap = {}; // Key: normalizedPhone -> primaryCustomer
    const idMap = {}; // Key: oldCustomerId -> newCustomerId

    // Sort by createdAt or id (if createdAt missing) to find the oldest record
    const sortedCustomers = customers.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.created_at || a.timestamp || a.id);
        const dateB = new Date(b.createdAt || b.created_at || b.timestamp || b.id);
        return dateA - dateB;
    });

    console.log(`Analyzing ${customers.length} records for GLOBAL uniqueness...`);

    for (const c of sortedCustomers) {
        const restaurantId = c.restaurantId || 'default';
        const normPhone = normalizePhone(c.phone);
        const key = normPhone; // SOLE UNIQUE IDENTIFIER

        if (!customerMap[key]) {
            // First time seeing this phone - this is the primary record
            const primaryRecord = {
                ...c,
                phone: normPhone,
                servedBy: [restaurantId]
            };
            customerMap[key] = primaryRecord;
            uniqueCustomers.push(primaryRecord);
            idMap[c.id] = c.id;
        } else {
            // Duplicate found (Globally)!
            const primaryRecord = customerMap[key];
            console.log(`Global Duplicate: ${c.name} (${c.phone}) [from ${restaurantId}] -> Merging into ${primaryRecord.name} [from ${primaryRecord.restaurantId}]`);

            // Merge rules:
            // 1. Keep oldest record (already handled by sorting)
            // 2. Retain original name (already handled by sorting)
            // 3. Sum visit counts
            primaryRecord.visitCount = (primaryRecord.visitCount || 1) + (c.visitCount || 1);

            // 4. Track all restaurants that have served this customer
            if (!primaryRecord.servedBy.includes(restaurantId)) {
                primaryRecord.servedBy.push(restaurantId);
            }

            // 5. Most recent interaction date
            const lastSeenA = new Date(primaryRecord.lastSeen || primaryRecord.createdAt || primaryRecord.id);
            const lastSeenB = new Date(c.lastSeen || c.createdAt || c.id);

            if (!primaryRecord.lastSeen || (lastSeenB > lastSeenA)) {
                primaryRecord.lastSeen = c.lastSeen || c.createdAt || c.id;
            }

            // Map old ID to primary ID for history consolidation
            idMap[c.id] = primaryRecord.id;
        }
    }

    console.log(`Merged down to ${uniqueCustomers.length} unique global customers.`);

    // Update SMS Queue
    let smsUpdates = 0;
    smsQueue.forEach(sms => {
        if (idMap[sms.customerId] && idMap[sms.customerId] !== sms.customerId) {
            sms.customerId = idMap[sms.customerId];
            smsUpdates++;
        }
    });

    // Update Activity Log
    let logUpdates = 0;
    activityLog.forEach(log => {
        if (idMap[log.customerId] && idMap[log.customerId] !== log.customerId) {
            log.customerId = idMap[log.customerId];
            logUpdates++;
        }
    });

    // Write back
    fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(uniqueCustomers, null, 2));
    if (smsQueue.length > 0) fs.writeFileSync(SMS_QUEUE_FILE, JSON.stringify(smsQueue, null, 2));
    if (activityLog.length > 0) fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(activityLog, null, 2));

    console.log(`Updated ${smsUpdates} SMS records and ${logUpdates} activity logs.`);
    console.log('--- GLOBAL Migration Complete ---');
}

runMigration();
