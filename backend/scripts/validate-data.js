const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const DEFAULT_RESTAURANT_ID = 'default';

const files = [
    'customers.json',
    'restaurants.json',
    'users.json',
    'sms_queue.json',
    'templates.json',
    'payments.json'
];

function validate() {
    console.log('--- Data Validation Report ---');
    const report = {
        missingRestaurantId: [],
        invalidDates: [],
        duplicateEmails: new Set(),
        duplicateTransactionCodes: new Set(),
        invalidAmounts: [],
        orphanedReferences: []
    };

    const data = {};
    files.forEach(file => {
        const filePath = path.join(DATA_DIR, file);
        if (fs.existsSync(filePath)) {
            data[file] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } else {
            data[file] = file === 'templates.json' ? {} : [];
        }
    });

    // 1. Validate Restaurants
    console.log(`Checking ${data['restaurants.json'].length} restaurants...`);
    const restaurantIds = new Set(data['restaurants.json'].map(r => r.id));

    // 2. Validate Users
    console.log(`Checking ${data['users.json'].length} users...`);
    const emails = new Set();
    data['users.json'].forEach(user => {
        if (emails.has(user.email)) {
            report.duplicateEmails.add(user.email);
        }
        emails.add(user.email);
        if (!user.restaurantId) {
            report.missingRestaurantId.push(`User ${user.id} (${user.email})`);
        } else if (!restaurantIds.has(user.restaurantId)) {
            report.orphanedReferences.push(`User ${user.id} -> Restaurant ${user.restaurantId}`);
        }
    });

    // 3. Validate Customers
    console.log(`Checking ${data['customers.json'].length} customers...`);
    const customerIds = new Set(data['customers.json'].map(c => c.id));
    data['customers.json'].forEach(customer => {
        if (!customer.restaurantId) {
            report.missingRestaurantId.push(`Customer ${customer.id} (${customer.name})`);
        } else if (!restaurantIds.has(customer.restaurantId)) {
            report.orphanedReferences.push(`Customer ${customer.id} -> Restaurant ${customer.restaurantId}`);
        }

        if (isNaN(parseFloat(customer.amount)) && customer.amount !== 'M-Pesa') {
            report.invalidAmounts.push(`Customer ${customer.id}: amount='${customer.amount}'`);
        }

        const date = new Date(customer.timestamp || customer.created_at || customer.createdAt);
        if (isNaN(date.getTime())) {
            report.invalidDates.push(`Customer ${customer.id} date`);
        }
    });

    // 4. Validate SMS Queue
    console.log(`Checking ${data['sms_queue.json'].length} SMS records...`);
    data['sms_queue.json'].forEach(sms => {
        if (!sms.restaurantId) {
            report.missingRestaurantId.push(`SMS ${sms.id}`);
        } else if (!restaurantIds.has(sms.restaurantId)) {
            report.orphanedReferences.push(`SMS ${sms.id} -> Restaurant ${sms.restaurantId}`);
        }

        if (!customerIds.has(sms.customerId)) {
            report.orphanedReferences.push(`SMS ${sms.id} -> Customer ${sms.customerId}`);
        }
    });

    // 5. Validate Payments
    console.log(`Checking ${data['payments.json'].length} payments...`);
    const txCodes = new Set();
    data['payments.json'].forEach(pay => {
        if (txCodes.has(pay.transactionCode)) {
            report.duplicateTransactionCodes.add(pay.transactionCode);
        }
        txCodes.add(pay.transactionCode);

        if (!restaurantIds.has(pay.restaurantId)) {
            report.orphanedReferences.push(`Payment ${pay.id} -> Restaurant ${pay.restaurantId}`);
        }
    });

    console.log('\n--- RESULTS ---');
    console.log(`Missing restaurantId: ${report.missingRestaurantId.length}`);
    console.log(`Invalid Dates: ${report.invalidDates.length}`);
    console.log(`Duplicate Emails: ${report.duplicateEmails.size}`);
    console.log(`Duplicate Tx Codes: ${report.duplicateTransactionCodes.size}`);
    console.log(`Invalid Amounts: ${report.invalidAmounts.length}`);
    console.log(`Orphaned References: ${report.orphanedReferences.length}`);

    if (report.duplicateEmails.size > 0) console.log('Duplicate Emails:', Array.from(report.duplicateEmails));
    if (report.duplicateTransactionCodes.size > 0) console.log('Duplicate Tx Codes:', Array.from(report.duplicateTransactionCodes));

    if (report.orphanedReferences.length > 0) {
        console.log('\nSample Orphans:');
        report.orphanedReferences.slice(0, 5).forEach(o => console.log(o));
    }
}

validate();
